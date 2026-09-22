import { App, BasesView, Component, FuzzySuggestModal, MarkdownRenderer, Menu, Modal, Notice, Plugin, PluginSettingTab, QueryController, Setting, TAbstractFile, TFile, TFolder, debounce, normalizePath, parseYaml, setIcon } from 'obsidian';
import { BASE, CONFIG, VIEW, FolderConfig, Layout, Resource, Section, ancestors, baseDocument, defaults, inherited, join, parseConfig, resource, safeName, select, within } from './model';

type Companion = { openVaultVoice?: (context: {folder: string; note: string}) => void };
type InternalApp = App & {plugins: {getPlugin(id:string): Companion | undefined}; internalPlugins: {getPluginById(id:string): {enabled?:boolean;instance?:any} | undefined}};
const LABELS: Record<Section,string> = {featured:'Featured',pinned:'Pinned',folders:'Explore folders',overview:'Program overview',resources:'All resources',recent:'Recently updated'};
function button(parent: HTMLElement, text: string, icon: string, action: () => unknown, cls=''): HTMLButtonElement {
 const b=parent.createEl('button',{cls:`uud-button ${cls}`,attr:{type:'button','aria-label':text}});
 if(icon) setIcon(b.createSpan(),icon); b.createSpan({text});
 b.addEventListener('click',()=>{try{Promise.resolve(action()).catch(showError);}catch(e){showError(e);}}); return b;
}
function showError(e: unknown): void {new Notice(e instanceof Error ? e.message : String(e)); console.error('FJG Universal Dashboard:',e);}

export default class UniversalDashboard extends Plugin {
 settings = {accent:'fjg', pageSize:48};
 views = new Set<DashboardView>();
 actions = new Map<string,{label:string;icon:string;run:(context:{folder:string})=>unknown}>();
 registerDashboardAction(id:string,action:{label:string;icon:string;run:(context:{folder:string})=>unknown}){this.actions.set(id,action);for(const v of this.views)v.invalidate();return ()=>{this.actions.delete(id);for(const v of this.views)v.invalidate();};}
 private writes = new Map<string, Promise<void>>();
 async onload() {
  this.settings = {...this.settings,...await this.loadData()};
  this.registerBasesView(VIEW,{name:'FJG Dashboard',icon:'layout-dashboard',factory:(controller,parent)=>new DashboardView(controller,parent,this),options:()=>[{type:'text',key:'folder',displayName:'Folder path',default:'/'}]});
  this.addSettingTab(new GlobalSettings(this.app,this));
  this.app.workspace.onLayoutReady(()=>{void this.restoreOpenDashboards().catch(showError);});
  this.addCommand({id:'open-dashboard',name:'Open folder dashboard',callback:()=>new FolderPicker(this.app,f=>this.openDashboard(f)).open()});
  this.addCommand({id:'current-folder-dashboard',name:'Open current note’s folder dashboard',callback:()=>this.openDashboard(this.app.workspace.getActiveFile()?.parent || this.app.vault.getRoot())});
  this.addCommand({id:'dashboard-settings',name:'Configure a folder dashboard',callback:()=>new FolderPicker(this.app,f=>this.editSettings(f)).open()});
  this.addRibbonIcon('layout-dashboard','Open folder dashboard',()=>new FolderPicker(this.app,f=>this.openDashboard(f)).open());
  const addMenu=(menu:Menu,file:TAbstractFile)=>{if(file instanceof TFolder) this.menu(menu,file);};
  this.registerEvent(this.app.workspace.on('file-menu',addMenu));
  // File Focus emits a dedicated root menu; ordinary folders emit file-menu.
  this.registerEvent((this.app.workspace as any).on('root-folder-menu',addMenu));
  this.registerDomEvent(document,'click',(e:MouseEvent)=>{
   if(!e.shiftKey || !(e.target instanceof Element)) return;
   const node=e.target.closest('.nav-folder-title[data-path], .oz-folder-element [data-path], [data-path]');
   const path=node?.getAttribute('data-path'); const folder=path?this.app.vault.getAbstractFileByPath(path):null;
   if(!(folder instanceof TFolder)) return;
   // Only configured folders are intercepted; do not change the normal click behavior.
   void this.resolve(folder.path).then(res=>{if(res?.config.enabled) return this.openDashboard(folder);}).catch(showError);
  },true);
  const refresh=debounce(()=>this.refresh(),180,true);
  this.registerEvent(this.app.vault.on('modify',f=>{if(f.name===CONFIG) refresh();}));
  this.registerEvent(this.app.vault.on('create',refresh));
  this.registerEvent(this.app.vault.on('delete',refresh));
  this.registerEvent(this.app.vault.on('rename',(file,old)=>{void this.repairRename(file,old).catch(showError);}));
  this.registerObsidianProtocolHandler('fjg-dashboard',params=>{const f=this.app.vault.getAbstractFileByPath(params.folder || '/');if(f instanceof TFolder) void this.openDashboard(f).catch(showError);else new Notice('Dashboard folder was not found.');});
 }
 async restoreOpenDashboards(){
  for(const leaf of this.app.workspace.getLeavesOfType('bases')){
   const state=leaf.getViewState();const file=(leaf.view as any).file as TFile|undefined;
   if(file?.name!==BASE)continue;
   const doc=parseYaml(await this.app.vault.read(file));if(!doc?.views?.some((v:any)=>v.type===VIEW))continue;
   await leaf.setViewState({type:'empty'});await leaf.setViewState(state);
  }
 }
 onunload(){for(const v of this.views) v.dispose();this.views.clear();}
 refresh(){for(const v of this.views) v.onDataUpdated();}
 async resolve(folder: string): Promise<{config:FolderConfig; source:string}|null> {
  for(const path of ancestors(folder)){
   const f=this.app.vault.getAbstractFileByPath(join(path,CONFIG));
   if(!(f instanceof TFile)) continue;
   let c:FolderConfig; try{c=parseConfig(await this.app.vault.read(f));}catch(e){throw new Error(`${f.path}: ${e instanceof Error?e.message:e}`);}
   if(path===folder) return {config:c,source:path};
   if(!c.enabled) return {config:{...inherited(c),enabled:false},source:path};
   if(!c.inherit) return null;
   return {config:inherited(c),source:path};
  }
  return null;
 }
 async save(folder:string,config:FolderConfig, expected?:string|null) {
  const path=join(folder,CONFIG);
  const previous=this.writes.get(path)||Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   const f=this.app.vault.getAbstractFileByPath(path); const text=JSON.stringify(config,null,2)+'\n';
   if(f instanceof TFile){await this.app.vault.process(f,current=>{parseConfig(current);if(expected!==undefined && current!==expected) throw new Error('Settings changed elsewhere. Reopen Dashboard settings before saving.');return text;});}
   else {if(expected!==undefined && expected!==null) throw new Error('Configuration moved or disappeared. Reopen settings.'); await this.app.vault.create(path,text);}
   if(config.enabled) await this.ensureBase(folder,config);
   for(const base of this.app.vault.getFiles().filter(f=>f.name===BASE&&f.parent?.path!==folder&&within(f.path,folder))){const child=base.parent?.path||'/';const res=await this.resolve(child);if(res?.config.enabled)await this.ensureBase(child,res.config);}
  });
  this.writes.set(path,task);try{await task;}finally{if(this.writes.get(path)===task)this.writes.delete(path);}this.refresh();
 }
 async ensureBase(folder:string,c:FolderConfig):Promise<TFile> {
  const path=join(folder,BASE);const content=baseDocument(folder,c.descendants);const existing=this.app.vault.getAbstractFileByPath(path);
  if(existing instanceof TFile){const old=await this.app.vault.read(existing);let doc:any;try{doc=parseYaml(old);}catch{throw new Error(`${path} already exists and is not a dashboard Base.`);}
   if(!doc?.views?.some((v:any)=>v.type===VIEW)) throw new Error(`${path} is reserved by another Base. Rename it before enabling a dashboard.`);
   // Preserve extra user-authored Base views, formulas, and filters. Update only our folder scope and generated view.
   const generated=JSON.parse(content);const view=doc.views.find((v:any)=>v.type===VIEW);view.folder=folder;
   if(Array.isArray(doc.filters?.and)) doc.filters.and[0]=generated.filters.and[0];else doc.filters=generated.filters;
   const next=JSON.stringify(doc,null,2)+'\n';if(next!==old) await this.app.vault.modify(existing,next);return existing;
  }
  return this.app.vault.create(path,content);
 }
 async openDashboard(folder:TFolder|string) {
  const f=typeof folder==='string'?this.app.vault.getAbstractFileByPath(folder):folder;
  if(!(f instanceof TFolder)) throw new Error('The dashboard folder is unavailable.');
  if(!(this.app as InternalApp).internalPlugins.getPluginById('bases')?.enabled) throw new Error('Enable the Bases core plugin in Obsidian Settings to open dashboards.');
  const resolved=await this.resolve(f.path);
  if(!resolved?.config.enabled){await this.editSettings(f);return;}
  const base=await this.ensureBase(f.path,resolved.config);
  const existing=this.app.workspace.getLeavesOfType('bases').find(l=>(l.view as any).file?.path===base.path);
  if(existing){await this.app.workspace.revealLeaf(existing);this.app.workspace.setActiveLeaf(existing,{focus:true});return;}
  const leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(base,{active:true});await this.app.workspace.revealLeaf(leaf);this.app.workspace.setActiveLeaf(leaf,{focus:true});
 }
 async editSettings(folder:TFolder){const resolved=await this.resolve(folder.path);new FolderSettings(this,folder,resolved?.config||defaults(),resolved?.source).open();}
 menu(menu:Menu,folder:TFolder){
  menu.addSeparator();
  menu.addItem(i=>i.setTitle('Open as Dashboard').setIcon('layout-dashboard').onClick(()=>this.openDashboard(folder).catch(showError)));
  menu.addItem(i=>i.setTitle('Enable Dashboard for Folder').setIcon('layout-grid').onClick(async()=>{try{const r=await this.resolve(folder.path);new FolderSettings(this,folder,{...(r?.config||defaults()),enabled:true},r?.source).open();}catch(e){showError(e);}}));
  menu.addItem(i=>i.setTitle('Dashboard Settings').setIcon('settings-2').onClick(()=>this.editSettings(folder).catch(showError)));
 }
 async pin(folder:string,path:string,key:'pinned'|'featured'){
  const resolved=await this.resolve(folder);if(!resolved) return;
  const config=resolved.config;const relative=path.slice(folder==='/'?0:folder.length+1);
  config[key]=config[key].includes(relative)?config[key].filter(x=>x!==relative):[...config[key],relative];
  await this.save(folder,config);
 }
 talk(folder:string,note=''){
  const companion=(this.app as InternalApp).plugins.getPlugin('fjg-file-focus');
  if(!companion?.openVaultVoice) throw new Error('Enable FJG File Focus v0.3.3 or newer to use your existing live voice connection.');
  companion.openVaultVoice({folder:folder==='/'?'':folder,note});
 }
 async openFolder(folder:TFolder){
  const explorer=this.app.workspace.getLeavesOfType('file-explorer')[0];
  if(!explorer) throw new Error('Enable the Files core plugin to reveal folders.');
  await this.app.workspace.revealLeaf(explorer);const view=explorer.view as any;
  if(typeof view.revealInFolder==='function') await view.revealInFolder(folder);
 }
 async repairRename(file:TAbstractFile,old:string){
  // Portable selections use relative paths. Only existing dashboard configs are updated.
  for(const cfg of this.app.vault.getFiles().filter(f=>f.name===CONFIG)){
   const folder=cfg.parent?.path||'/';const original=await this.app.vault.read(cfg);const c=parseConfig(original);let changed=false;
   const oldFolder=file instanceof TFolder && (folder===file.path||folder.startsWith(file.path+'/'))?old+folder.slice(file.path.length):folder;
   for(const key of ['pinned','featured'] as const)c[key]=c[key].map(p=>{const absolute=join(oldFolder,p);if(absolute===old||absolute.startsWith(old+'/')){const next=file.path+absolute.slice(old.length);if(within(next,folder)){changed=true;return next.slice(folder==='/'?0:folder.length+1);}}return p;});
   if(changed) await this.save(folder,c,original);
  }
  if(file instanceof TFolder){for(const base of this.app.vault.getFiles().filter(f=>f.name===BASE&&within(f.path,file.path))){const folder=base.parent?.path||'/';const r=await this.resolve(folder);if(r?.config.enabled) await this.ensureBase(folder,r.config);}}
  this.refresh();
 }
}

class FolderPicker extends FuzzySuggestModal<TFolder>{
 constructor(app:App,private choose:(f:TFolder)=>unknown){super(app);this.setPlaceholder('Choose a folder for its dashboard…');}
 getItems(){return [this.app.vault.getRoot(),...this.app.vault.getAllLoadedFiles().filter((f):f is TFolder=>f instanceof TFolder&&!f.isRoot())];}
 getItemText(f:TFolder){return f.isRoot()?'/ — Vault root':f.path;}
 onChooseItem(f:TFolder){Promise.resolve(this.choose(f)).catch(showError);}
}
class GlobalSettings extends PluginSettingTab{
 constructor(app:App,private plugin:UniversalDashboard){super(app,plugin);}
 display(){this.containerEl.empty();this.containerEl.createEl('h2',{text:'FJG Universal Dashboard'});
  new Setting(this.containerEl).setName('Appearance').setDesc('Both styles follow Obsidian light and dark mode.').addDropdown(d=>d.addOptions({fjg:'FJG blue and gold',native:'Obsidian accent'}).setValue(this.plugin.settings.accent).onChange(async v=>{this.plugin.settings.accent=v;await this.plugin.saveData(this.plugin.settings);this.plugin.refresh();}));
  new Setting(this.containerEl).setName('Resources per page').addDropdown(d=>d.addOptions({'24':'24','48':'48','96':'96'}).setValue(String(this.plugin.settings.pageSize)).onChange(async v=>{this.plugin.settings.pageSize=Number(v);await this.plugin.saveData(this.plugin.settings);this.plugin.refresh();}));
  new Setting(this.containerEl).setName('Folder dashboards').setDesc('Enable folders, choose a template, and change their sections.').addButton(b=>b.setButtonText('Choose folder').onClick(()=>new FolderPicker(this.app,f=>this.plugin.editSettings(f)).open()));
  this.containerEl.createEl('p',{text:'Live voice uses FJG File Focus and its existing API-key setup. No additional credential is saved by this plugin.'});
 }
}
class FolderSettings extends Modal {
 private draft:FolderConfig; private baseline:string|null=null; private ready=false;
 constructor(private plugin:UniversalDashboard,private folder:TFolder,config:FolderConfig,private source?:string){super(plugin.app);this.draft=structuredClone(config);}
 async onOpen(){const f=this.app.vault.getAbstractFileByPath(join(this.folder.path,CONFIG));this.baseline=f instanceof TFile?await this.app.vault.read(f):null;this.ready=true;this.render();}
 render(){const el=this.contentEl;el.empty();this.titleEl.setText('Dashboard settings');el.createEl('p',{cls:'uud-muted',text:this.folder.path});
  if(this.source&&this.source!==this.folder.path)el.createEl('p',{text:`Inherited from ${this.source}. Saving creates an override for this folder.`});
  const c=this.draft;
  new Setting(el).setName('Enable dashboard').addToggle(t=>t.setValue(c.enabled).onChange(v=>c.enabled=v));
  new Setting(el).setName('Template').addDropdown(d=>d.addOptions({'resource-hub':'Resource Hub','program-area':'Program / Area'}).setValue(c.template).onChange(v=>{c.template=v as FolderConfig['template'];c.hidden=c.hidden.filter(x=>x!=='overview');if(v==='resource-hub')c.hidden.push('overview');this.render();}));
  new Setting(el).setName('Title').setDesc('Leave blank to use the folder name.').addText(t=>t.setValue(c.title).onChange(v=>c.title=v));
  new Setting(el).setName('Description').addTextArea(t=>t.setValue(c.description).onChange(v=>c.description=v));
  new Setting(el).setName('Child folders inherit this design').addToggle(t=>t.setValue(c.inherit).onChange(v=>c.inherit=v));
  new Setting(el).setName('Include descendants').addToggle(t=>t.setValue(c.descendants).onChange(v=>c.descendants=v));
  new Setting(el).setName('Default view').addDropdown(d=>d.addOptions({cards:'Cards',list:'List',compact:'Compact',table:'Table'}).setValue(c.layout).onChange(v=>c.layout=v as Layout));
  new Setting(el).setName('Card size').addDropdown(d=>d.addOptions({small:'Small',medium:'Medium',large:'Large'}).setValue(c.cardSize).onChange(v=>c.cardSize=v as FolderConfig['cardSize']));
  new Setting(el).setName('Sort').addDropdown(d=>d.addOptions({title:'Title',modified:'Last updated',status:'Status'}).setValue(c.sort).onChange(v=>c.sort=v as FolderConfig['sort']));
  el.createEl('h3',{text:'Sections'});
  c.sections.forEach((s,index)=>{const row=new Setting(el).setName(LABELS[s]).addToggle(t=>t.setValue(!c.hidden.includes(s)).onChange(v=>{c.hidden=v?c.hidden.filter(x=>x!==s):[...c.hidden,s];}));
   row.addExtraButton(b=>b.setIcon('arrow-up').setTooltip('Move up').setDisabled(index===0).onClick(()=>{[c.sections[index-1],c.sections[index]]=[c.sections[index],c.sections[index-1]];this.render();}));
   row.addExtraButton(b=>b.setIcon('arrow-down').setTooltip('Move down').setDisabled(index===c.sections.length-1).onClick(()=>{[c.sections[index+1],c.sections[index]]=[c.sections[index],c.sections[index+1]];this.render();}));
  });
  el.createEl('h3',{text:'Default filters'});
  for(const k of ['type','status','program','tags'])new Setting(el).setName(k==='tags'?'Tag':k.charAt(0).toUpperCase()+k.slice(1)).setDesc('Exact property value; leave blank for all.').addText(t=>t.setValue(c.filters[k]||'').onChange(v=>c.filters[k]=v));
  const actions=el.createDiv('uud-actions');button(actions,'Cancel','x',()=>this.close());
  const save=button(actions,'Save dashboard','check',async()=>{if(!this.ready)return;save.disabled=true;try{await this.plugin.save(this.folder.path,c,this.baseline);this.close();if(c.enabled)await this.plugin.openDashboard(this.folder);}finally{save.disabled=false;}},'mod-cta');
 }
}

class DashboardView extends BasesView {
 readonly type=VIEW;
 private root:HTMLElement; private results!:HTMLElement; private stats!:HTMLElement;
 private query=''; private filters:Record<string,string>={}; private layout:Layout='cards'; private sort:FolderConfig['sort']='title';
 private cfg:FolderConfig=defaults(); private folder='/'; private source=''; private page=0; private generation=0; private signature='';private dead=false;
 private items:Resource[]=[];private preview:NotePreview|null=null;
 constructor(controller:QueryController,parent:HTMLElement,private plugin:UniversalDashboard){super(controller);this.root=parent.createDiv('uud-dashboard');plugin.views.add(this);}
 dispose(){this.dead=true;this.generation++;this.preview?.close();this.root.remove();}
 onunload(){this.plugin.views.delete(this);this.dispose();}
 invalidate(){this.signature='';this.onDataUpdated();}
 onDataUpdated(){void this.update().catch(e=>{if(this.dead)return;this.root.empty();this.root.createEl('h2',{text:'Dashboard needs attention'});this.root.createEl('p',{text:e instanceof Error?e.message:String(e)});button(this.root,'Retry','refresh-cw',()=>this.onDataUpdated());});}
 private async update(){
  const gen=++this.generation;const path=String(this.config.get('folder')||'/');
  const resolved=await this.plugin.resolve(path);if(gen!==this.generation||this.dead)return;
  this.folder=path;
  if(!resolved?.config.enabled){this.root.empty();this.root.createEl('h2',{text:'Enable this folder dashboard'});this.root.createEl('p',{text:'Choose a design and configure this folder to start browsing.'});button(this.root,'Dashboard settings','settings-2',()=>{const f=this.app.vault.getAbstractFileByPath(path);if(f instanceof TFolder)return this.plugin.editSettings(f);throw new Error('Folder no longer exists. Open the dashboard from its new folder.');});return;}
  this.cfg=resolved.config;this.source=resolved.source;
  // Bases is the source of membership. Recheck folder boundaries as a defensive guard for manually edited Base filters.
  const seen=new Set<string>();this.items=[];
  for(const group of this.data?.groupedData||[])for(const entry of group.entries){const f=entry.file;
   if(seen.has(f.path)||[BASE,CONFIG].includes(f.name)||!within(f.path,path,this.cfg.descendants))continue;
   seen.add(f.path);const fm=this.app.metadataCache.getFileCache(f)?.frontmatter||{};
   const r=resource(f.path,f.basename,f.extension,f.stat.mtime,fm);
   const inline=this.app.metadataCache.getFileCache(f)?.tags?.map(x=>x.tag.replace(/^#/,''))||[];r.tags=[...new Set([...r.tags,...inline])];
   const relative=f.path.slice(path==='/'?0:path.length+1);r.pinned ||= this.cfg.pinned.includes(relative);r.featured ||= this.cfg.featured.includes(relative);this.items.push(r);
  }
  const signature=JSON.stringify([path,this.cfg,this.plugin.settings]);
  if(signature!==this.signature){this.signature=signature;this.filters={...this.cfg.filters};this.layout=this.cfg.layout;this.sort=this.cfg.sort;this.page=0;this.build();}
  this.refreshFacets();this.renderResults();
 }
 private refreshFacets(){for(const key of ['type','status','program','tags'] as const){const el=this.root.querySelector<HTMLSelectElement>(`select[aria-label="Filter by ${key}"]`);if(!el)continue;const values=[...new Set(this.items.flatMap(r=>r[key]).concat(this.filters[key]?[this.filters[key]]:[]))].sort();el.empty();el.createEl('option',{value:'',text:'All'});for(const value of values)el.createEl('option',{value,text:value});el.value=this.filters[key]||'';}}
 private build(){
  const el=this.root;el.empty();el.setAttribute('data-accent',this.plugin.settings.accent);el.setAttribute('data-size',this.cfg.cardSize);
  const crumbs=el.createEl('nav',{cls:'uud-breadcrumbs',attr:{'aria-label':'Dashboard folder navigation'}});
  button(crumbs,'Folders','folder-tree',()=>new FolderPicker(this.app,f=>this.plugin.openDashboard(f)).open());
  const segments=this.folder==='/'?[]:this.folder.split('/');segments.forEach((name,i)=>{crumbs.createSpan({text:' / ',cls:'uud-muted'});button(crumbs,name,'',()=>this.plugin.openDashboard(segments.slice(0,i+1).join('/')));});
  const hero=el.createEl('header',{cls:'uud-hero'});const intro=hero.createDiv('uud-intro');
  intro.createDiv({cls:'uud-eyebrow',text:this.cfg.template==='program-area'?'PROGRAM / AREA':'RESOURCE HUB'});
  intro.createEl('h1',{text:this.cfg.title||(segments.at(-1)||this.app.vault.getName())});
  intro.createEl('p',{cls:'uud-description',text:this.cfg.description||(this.cfg.template==='program-area'?'A live overview of your program, its work, and resources.':'Everything you need, organized in one place.')});
  this.stats=intro.createDiv('uud-stats');
  const actions=hero.createDiv('uud-actions');
  button(actions,'New note','plus',()=>new NewNote(this.plugin,this.folder).open(),'mod-cta');
  button(actions,'Talk to dashboard','mic',()=>this.plugin.talk(this.folder));
  button(actions,'Settings','settings-2',()=>{const f=this.app.vault.getAbstractFileByPath(this.folder);if(f instanceof TFolder)return this.plugin.editSettings(f);});
  for(const action of this.plugin.actions.values())button(actions,action.label,action.icon,()=>action.run({folder:this.folder}));
  const toolbar=el.createDiv('uud-toolbar');const search=toolbar.createEl('input',{cls:'uud-search',type:'search',attr:{placeholder:'Search resources…','aria-label':'Search dashboard resources'}});search.value=this.query;
  search.addEventListener('input',()=>{this.query=search.value;this.page=0;this.renderResults();});
  const views=toolbar.createDiv('uud-view-switch');for(const [key,icon] of [['cards','layout-grid'],['list','list'],['compact','rows-3'],['table','table']] as const){const b=button(views,key[0].toUpperCase()+key.slice(1),icon,()=>{this.layout=key;for(const child of Array.from(views.children))child.setAttribute('aria-pressed',String(child===b));this.renderResults();});b.setAttribute('aria-pressed',String(this.layout===key));}
  const sorting=toolbar.createEl('select',{attr:{'aria-label':'Sort resources'}});for(const [value,text] of [['title','Title A–Z'],['modified','Recently updated'],['status','Status']])sorting.createEl('option',{value,text});sorting.value=this.sort;sorting.onchange=()=>{this.sort=sorting.value as FolderConfig['sort'];this.page=0;this.renderResults();};
  const filters=el.createDiv('uud-filters');
  for(const key of ['type','status','program','tags'] as const){const label=filters.createEl('label',{cls:'uud-filter'});label.createSpan({text:key==='tags'?'Tag':key[0].toUpperCase()+key.slice(1)});const sel=label.createEl('select',{attr:{'aria-label':`Filter by ${key}`}});sel.createEl('option',{value:'',text:'All'});const options=[...new Set(this.items.flatMap(r=>r[key]).concat(this.filters[key]?[this.filters[key]]:[]))].sort();for(const v of options)sel.createEl('option',{value:v,text:v});sel.value=this.filters[key]||'';sel.onchange=()=>{this.filters[key]=sel.value;this.page=0;this.renderResults();};}
  const deep=filters.createEl('label',{cls:'uud-scope'});const toggle=deep.createEl('input',{type:'checkbox'});toggle.checked=this.cfg.descendants;deep.createSpan({text:'Include subfolders'});toggle.onchange=async()=>{toggle.disabled=true;try{const c=structuredClone(this.cfg);c.descendants=toggle.checked;await this.plugin.save(this.folder,c);}catch(e){showError(e);toggle.checked=this.cfg.descendants;}finally{toggle.disabled=false;}};
  button(filters,'Clear filters','filter-x',()=>{this.filters={};this.query='';this.page=0;this.build();this.renderResults();});
  this.results=el.createDiv('uud-results');
  const footer=el.createEl('footer',{cls:'uud-footer'});
  button(footer,'Open folder','folder-open',()=>{const f=this.app.vault.getAbstractFileByPath(this.folder);if(f instanceof TFolder)return this.plugin.openFolder(f);});
  button(footer,'Refresh','refresh-cw',()=>this.onDataUpdated());
  button(footer,'Copy dashboard link','link',()=>navigator.clipboard.writeText(`obsidian://fjg-dashboard?vault=${encodeURIComponent(this.app.vault.getName())}&folder=${encodeURIComponent(this.folder)}`).then(()=>new Notice('Dashboard link copied.')));
  button(footer,'Create launcher note','file-plus',()=>this.launcher());
  if(this.source!==this.folder)footer.createSpan({cls:'uud-muted',text:`Design inherited from ${this.source.split('/').at(-1)||'vault root'}`});
 }
 private renderResults(){
  if(!this.results)return;this.results.empty();const items=select(this.items,this.query,this.filters,this.sort);this.stats.setText(`${this.items.length} resources · ${new Set(this.items.flatMap(x=>x.tags)).size} categories · Live from your vault`);
  const resultLabel=this.results.createDiv({cls:'uud-result-count',attr:{role:'status','aria-live':'polite'},text:`${items.length} of ${this.items.length} resources`});
  if(!items.length){const empty=this.results.createDiv('uud-empty');setIcon(empty.createDiv(),'search');empty.createEl('h3',{text:this.items.length?'No matching resources':'This folder is ready for its first resource'});empty.createEl('p',{text:this.items.length?'Try a different search or clear your filters.':'Create a note or add files to this folder. They will appear here automatically.'});}
  for(const section of this.cfg.sections){if(this.cfg.hidden.includes(section))continue;
   if(section==='folders'){this.renderFolders();continue;}
   if(section==='overview'){this.renderOverview(items);continue;}
   const list=section==='featured'?items.filter(x=>x.featured):section==='pinned'?items.filter(x=>x.pinned):section==='recent'?[...items].sort((a,b)=>b.mtime-a.mtime).slice(0,6):items;
   if(!list.length&&section!=='resources'){const block=this.results.createEl('section',{cls:'uud-section uud-empty-section'});block.createEl('h2',{text:LABELS[section]});block.createEl('p',{text:section==='featured'?'Use a resource’s menu to feature it here.':'Pin frequently used resources from their menu.'});continue;}
   if(!list.length)continue;
   const block=this.results.createEl('section',{cls:'uud-section',attr:{'data-section':section}});const heading=block.createDiv('uud-section-heading');heading.createEl('h2',{text:LABELS[section]});heading.createSpan({cls:'uud-count',text:String(list.length)});
   const size=this.plugin.settings.pageSize;const pages=Math.max(1,Math.ceil(list.length/size));if(section==='resources')this.page=Math.min(this.page,pages-1);
   const visible=section==='resources'?list.slice(this.page*size,(this.page+1)*size):list.slice(0,section==='recent'?6:size);
   const grid=block.createDiv(`uud-grid uud-${this.layout}`);if(this.layout==='table'){const table=grid.createEl('table');const head=table.createEl('thead').createEl('tr');for(const t of ['Resource','Type','Status','Updated','Actions'])head.createEl('th',{text:t,attr:{scope:'col'}});const body=table.createEl('tbody');for(const r of visible)this.renderRow(body,r);}else for(const r of visible)this.renderCard(grid,r);
   if(section==='resources'&&pages>1){const pager=block.createDiv('uud-pagination');button(pager,'Previous','chevron-left',()=>{this.page--;this.renderResults();this.results.scrollIntoView({block:'start'});}).disabled=this.page===0;pager.createSpan({text:`Page ${this.page+1} of ${pages}`});button(pager,'Next','chevron-right',()=>{this.page++;this.renderResults();this.results.scrollIntoView({block:'start'});}).disabled=this.page===pages-1;}
  }
 }
 private renderFolders(){const folder=this.app.vault.getAbstractFileByPath(this.folder);if(!(folder instanceof TFolder))return;
  const children=folder.children.filter((f):f is TFolder=>f instanceof TFolder).sort((a,b)=>a.name.localeCompare(b.name));if(!children.length)return;
  const section=this.results.createEl('section',{cls:'uud-section',attr:{'data-section':'folders'}});section.createEl('h2',{text:'Explore folders'});const grid=section.createDiv('uud-folder-grid');for(const f of children){const b=button(grid,f.name,'folder',()=>this.plugin.openDashboard(f),'uud-folder');b.createSpan({cls:'uud-muted',text:String(f.children.filter(x=>![CONFIG,BASE].includes(x.name)).length)});}
 }
 private renderOverview(items:Resource[]){const el=this.results.createEl('section',{cls:'uud-section'});el.createEl('h2',{text:'Program overview'});const grid=el.createDiv('uud-overview');for(const [label,value] of [['Resources',items.length],['Featured',items.filter(x=>x.featured).length],['Active',items.filter(x=>x.status.some(s=>['active','in-progress','in progress'].includes(s.toLowerCase()))).length],['Updated this week',items.filter(x=>Date.now()-x.mtime<7*86400000).length]]){const stat=grid.createDiv('uud-stat');stat.createEl('strong',{text:String(value)});stat.createSpan({text:String(label)});}
  const groups=new Map<string,number>();for(const r of items)for(const s of r.status)groups.set(s,(groups.get(s)||0)+1);if(groups.size){const statuses=el.createDiv('uud-statuses');for(const [status,n] of groups)button(statuses,`${status} · ${n}`,'circle',()=>{this.filters.status=status;this.build();this.renderResults();},'uud-chip');}
 }
 private renderCard(grid:HTMLElement,r:Resource){
  const card=grid.createEl('article',{cls:'uud-card'});
  if(r.image&&this.layout==='cards'){const link=r.image.replace(/^!?\[\[/,'').replace(/\]\]$/,'').split('|')[0];const file=this.app.metadataCache.getFirstLinkpathDest(link,r.path);if(file&&['png','jpg','jpeg','webp','gif','avif'].includes(file.extension.toLowerCase()))card.createEl('img',{cls:'uud-banner',attr:{src:this.app.vault.getResourcePath(file),alt:'',loading:'lazy'}});}
  const body=card.createDiv('uud-card-body');const top=body.createDiv('uud-card-top');const icon=top.createDiv('uud-resource-icon');if(r.icon&&/[^\x00-\x7f]/.test(r.icon))icon.setText(r.icon);else setIcon(icon,r.icon||'file-text');const menu=button(top,'Resource actions','ellipsis',()=>this.resourceMenu(menu,r),'uud-icon-button');
  const title=body.createEl('button',{cls:'uud-resource-title',text:r.title,attr:{type:'button'}});title.onclick=()=>this.openResource(r);
  if(r.description)body.createEl('p',{cls:'uud-summary',text:r.description});
  const badges=body.createDiv('uud-badges');for(const text of [...r.type,...r.status].slice(0,4))badges.createSpan({cls:'uud-badge',text});
  for(const t of r.tags.slice(0,3))button(badges,'#'+t,'',()=>{this.filters.tags=t;this.build();this.renderResults();},'uud-tag');
  const foot=body.createDiv('uud-card-footer');foot.createSpan({text:new Date(r.mtime).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})});if(r.pinned)foot.createSpan({text:'Pinned'});if(r.featured)foot.createSpan({text:'Featured'});
 }
 private renderRow(body:HTMLElement,r:Resource){const row=body.createEl('tr');button(row.createEl('td'),r.title,'file-text',()=>this.openResource(r));row.createEl('td',{text:r.type.join(', ')});row.createEl('td',{text:r.status.join(', ')||'—'});row.createEl('td',{text:new Date(r.mtime).toLocaleDateString()});const cell=row.createEl('td');const b=button(cell,'Resource actions','ellipsis',()=>this.resourceMenu(b,r),'uud-icon-button');}
 private resourceMenu(anchor:HTMLElement,r:Resource){const menu=new Menu();menu.addItem(i=>i.setTitle('Preview').setIcon('eye').onClick(()=>this.openResource(r)));
  menu.addItem(i=>i.setTitle('Edit note').setIcon('pencil').setDisabled(!r.path.endsWith('.md')).onClick(()=>this.openResource(r,true)));
  menu.addItem(i=>i.setTitle('Open in tab').setIcon('external-link').onClick(()=>this.app.workspace.openLinkText(r.path,'',true)));
  for(const key of ['pinned','featured'] as const){const fromProperty=this.app.metadataCache.getFileCache(this.app.vault.getAbstractFileByPath(r.path) as TFile)?.frontmatter?.[key]===true;menu.addItem(i=>i.setTitle(fromProperty?`${key==='pinned'?'Pinned':'Featured'} in note properties`:r[key]?`Remove ${key==='pinned'?'pin':'feature'}`:key==='pinned'?'Pin resource':'Feature resource').setIcon(key==='pinned'?'pin':'star').setDisabled(fromProperty).onClick(()=>this.plugin.pin(this.folder,r.path,key).catch(showError)));}
  menu.addItem(i=>i.setTitle('Talk about this note').setIcon('mic').onClick(()=>this.plugin.talk(this.folder,r.path)));
  const rect=anchor.getBoundingClientRect();menu.showAtPosition({x:rect.left,y:rect.bottom});
 }
 private openResource(r:Resource,edit=false){const f=this.app.vault.getAbstractFileByPath(r.path);if(!(f instanceof TFile)){new Notice('This resource moved or was removed. Refresh the dashboard.');return;}this.preview?.close();this.preview=new NotePreview(this.plugin,f,edit);this.preview.open();}
 private async launcher(){const path=join(this.folder,'Dashboard.md');if(this.app.vault.getAbstractFileByPath(path))throw new Error('Dashboard.md already exists. It has been left unchanged.');const url=`obsidian://fjg-dashboard?vault=${encodeURIComponent(this.app.vault.getName())}&folder=${encodeURIComponent(this.folder)}`;const file=await this.app.vault.create(path,`# ${this.cfg.title||'Folder dashboard'}\n\n[Open dashboard](${url})\n\n![[${join(this.folder,BASE)}]]\n`);await this.app.workspace.getLeaf('tab').openFile(file);}
}

class NewNote extends Modal{
 constructor(private plugin:UniversalDashboard,private folder:string){super(plugin.app);}
 onOpen(){this.titleEl.setText('New note');let name='';new Setting(this.contentEl).setName('Note name').addText(t=>{t.setPlaceholder('Untitled resource').onChange(v=>name=v);setTimeout(()=>t.inputEl.focus(),50);});const b=button(this.contentEl,'Create note','plus',async()=>{b.disabled=true;try{const path=join(this.folder,safeName(name));if(this.app.vault.getAbstractFileByPath(path))throw new Error('A note with that name already exists. Choose another name.');const f=await this.app.vault.create(path,`# ${name.trim().replace(/\.md$/i,'')}\n\n`);this.close();new NotePreview(this.plugin,f,true).open();}finally{b.disabled=false;}},'mod-cta');}
}
class NotePreview extends Modal{
 private component=new Component();private baseline='';private text='';private dirty=false;private epoch=0;private saving=false;
 constructor(private plugin:UniversalDashboard,private file:TFile,private editing=false){super(plugin.app);}
 async onOpen(){this.modalEl.addClass('uud-preview-modal');this.component.load();try{if(['md','txt','csv','json','html','base'].includes(this.file.extension)){if(this.file.stat.size>2*1024*1024)throw new Error('File is too large for embedded preview.');this.baseline=await this.app.vault.read(this.file);this.text=this.baseline;}await this.render();}catch(e){this.contentEl.setText('This resource could not be read. Open it in a tab to use its native viewer.');button(this.contentEl,'Open in tab','external-link',()=>this.app.workspace.getLeaf('tab').openFile(this.file));}}
 private async render(){const epoch=++this.epoch;this.titleEl.setText(this.file.basename);const el=this.contentEl;el.empty();const toolbar=el.createDiv('uud-preview-toolbar');
  button(toolbar,'Open in tab','external-link',()=>this.app.workspace.getLeaf('tab').openFile(this.file));
  if(this.file.extension==='md')button(toolbar,this.editing?'Preview':'Edit',this.editing?'eye':'pencil',()=>{this.editing=!this.editing;return this.render();});
  button(toolbar,'Talk about note','mic',()=>this.plugin.talk(this.file.parent?.path||'/',this.file.path));
  if(this.dirty||this.editing){const save=button(toolbar,'Save changes','save',()=>this.save(),'mod-cta');save.disabled=this.saving;}
  const body=el.createDiv('uud-preview-body');
  if(this.file.extension==='md'&&this.editing){const area=body.createEl('textarea',{cls:'uud-editor',attr:{'aria-label':'Edit note Markdown',spellcheck:'true'}});area.value=this.text;area.oninput=()=>{this.text=area.value;this.dirty=this.text!==this.baseline;};area.focus();}
  else if(this.file.extension==='md')await MarkdownRenderer.render(this.app,this.text,body,this.file.path,this.component);
  else if(['png','jpg','jpeg','gif','webp','svg','avif'].includes(this.file.extension))body.createEl('img',{cls:'uud-preview-image',attr:{src:this.app.vault.getResourcePath(this.file),alt:this.file.basename}});
  else if(this.file.extension==='pdf')body.createEl('iframe',{cls:'uud-preview-frame',attr:{src:this.app.vault.getResourcePath(this.file),title:this.file.basename}});
  else if(['mp3','m4a','wav','ogg','mp4','webm'].includes(this.file.extension))body.createEl(['mp4','webm'].includes(this.file.extension)?'video':'audio',{attr:{src:this.app.vault.getResourcePath(this.file),controls:true}});
  else if(['txt','csv','json','html','base'].includes(this.file.extension))body.createEl('pre',{text:this.baseline.slice(0,200000)});
  else body.createEl('p',{text:'Open in tab to view this file with its native application.'});
  if(epoch!==this.epoch)return;
 }
 private async save(){if(this.saving)return;this.saving=true;try{const draft=this.text;await this.app.vault.process(this.file,current=>{if(current!==this.baseline)throw new Error('This note changed elsewhere. Your draft is still here. Copy it before reopening the current file.');return draft;});this.baseline=draft;this.dirty=this.text!==draft;new Notice('Note saved.');this.plugin.refresh();}finally{this.saving=false;}await this.render();}
 close(){if(this.dirty){new DiscardDialog(this.app,()=>{this.dirty=false;super.close();}).open();return;}super.close();}
 onClose(){this.epoch++;this.component.unload();}
}
class DiscardDialog extends Modal{
 constructor(app:App,private discard:()=>void){super(app);}
 onOpen(){this.titleEl.setText('Unsaved changes');this.contentEl.createEl('p',{text:'Keep editing to save your changes, or discard this draft.'});const actions=this.contentEl.createDiv('uud-actions');button(actions,'Keep editing','pencil',()=>this.close(),'mod-cta');button(actions,'Discard draft','x',()=>{this.close();this.discard();});}
}
