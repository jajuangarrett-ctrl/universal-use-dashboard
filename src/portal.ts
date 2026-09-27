import { excerpt } from './model';
import { setIcon } from 'obsidian';
import type { FolderConfig, Resource } from './model';
import { select } from './model';

export interface PortalData {
 title: string; folder: string; description: string; items: Resource[];
 folders: { name: string; path: string }[]; config: FolderConfig; pageSize: number;
}
export interface PortalActions {
 classic(): void; settings(): unknown; refresh(): unknown; newNote(): unknown;
 talk(): unknown; open(resource: Resource): unknown; menu(anchor: HTMLElement, resource: Resource): unknown;
 openFolder(path: string): unknown; error(error: unknown): void;
}
type Route = 'overview' | 'library' | 'topics';
function areaFor(item: Resource, folder: string): string {
 const relative = item.path.slice(folder === '/' ? 0 : folder.length + 1);
 return relative.includes('/') ? relative.split('/')[0] : 'General resources';
}
/** Website-style presentation of the same live Bases records; no HTML snapshot or remote content. */
export class Portal {
 private route: Route = 'overview';
 private query = '';
 private area = '';
 private type = '';
 private page = 0;
 private main!: HTMLElement;
 private status!: HTMLElement;
 private nav!: HTMLElement;
 private resultEl?: HTMLElement;
 private statusFilter = '';
 private defaultFilters: Record<string,string> = {};
 constructor(private host: HTMLElement, private data: PortalData, private actions: PortalActions) { this.defaultFilters={...data.config.filters};this.type=this.defaultFilters.type||'';this.statusFilter=this.defaultFilters.status||'';this.shell(); }
 update(data: PortalData): void {
  this.data = data;
  this.status.setText(`${data.items.length} resources · ${data.folders.length} folders · Updates live from your vault`);
  // Keep search controls and keyboard focus in place during metadata updates.
  if (this.route === 'library' && this.resultEl) { this.refreshOptions(); this.results(); }
  else this.render();
 }
 private btn(parent: HTMLElement, label: string, action: () => unknown, cls = '', icon = ''): HTMLButtonElement {
  const b = parent.createEl('button', {cls: `uud-web-button ${cls}`, attr: {type:'button', 'aria-label':label}});
  if (icon) setIcon(b.createSpan(), icon);
  b.createSpan({text:label});
  b.onclick = () => {try {Promise.resolve(action()).catch(this.actions.error);} catch(e) {this.actions.error(e);}};
  return b;
 }
 private shell(): void {
  const header = this.host.createEl('header', {cls:'uud-web-header'});
  const brand = header.createDiv('uud-web-brand');
  brand.createSpan({cls:'uud-web-mark', text:'FJG'});
  const name = brand.createDiv();name.createEl('strong',{text:'Resource library'});name.createEl('small',{text:this.data.title});
  const actions = header.createDiv('uud-web-actions');
  this.btn(actions,'Talk to dashboard',this.actions.talk,'','mic');
  this.btn(actions,'Refresh',this.actions.refresh,'uud-web-primary','refresh-cw');
  const strip = this.host.createDiv('uud-web-source');this.status = strip.createSpan();
  this.btn(strip,'Classic views',this.actions.classic,'uud-web-link','layout-grid');
  this.nav = this.host.createEl('nav',{cls:'uud-web-nav',attr:{'aria-label':'Portal navigation'}});
  for (const [route,label] of [['overview','Overview'],['library','Find a resource'],['topics','Work areas']] as const) {
   const b=this.btn(this.nav,label,()=>this.go(route));b.dataset.route=route;
  }
  this.btn(this.nav,'New note',this.actions.newNote,'','plus');
  this.btn(this.nav,'Dashboard settings',this.actions.settings,'','settings-2');
  this.main = this.host.createEl('main',{cls:'uud-web-main'});
  const footer=this.host.createEl('footer',{cls:'uud-web-footer'});
  footer.createSpan({text:'Your live collection'});footer.createSpan({text:'Open any resource to read or edit the original.'});
  this.update(this.data);
 }
 private go(route:Route, area?:string):void {
  this.route=route;this.page=0;if(area!==undefined)this.area=area;this.render();
 }
 private groups(): Map<string,Resource[]> {
  const groups=new Map<string,Resource[]>();
  for(const folder of this.data.folders)groups.set(folder.name,[]);
  for(const r of this.data.items){const name=areaFor(r,this.data.folder);if(!groups.has(name))groups.set(name,[]);groups.get(name)!.push(r);}
  return new Map([...groups].sort(([a],[b])=>a.localeCompare(b)));
 }
 private render():void {
  for(const b of Array.from(this.nav.querySelectorAll<HTMLButtonElement>('[data-route]'))) {
   const current=b.dataset.route===this.route;b.classList.toggle('is-active',current);
   if(current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  }
  this.main.empty();this.resultEl=undefined;
  if(this.route==='overview')this.overview();else if(this.route==='topics')this.topics();else this.library();
 }
 private heading(parent:HTMLElement,eyebrow:string,title:string,description=''):void {
  parent.createDiv({cls:'uud-web-eyebrow',text:eyebrow});parent.createEl('h1',{text:title});
  if(description)parent.createEl('p',{cls:'uud-web-lead',text:description});
 }
 private overview():void {
  const hero=this.main.createEl('section',{cls:'uud-web-hero'});
  const finder=hero.createDiv('uud-web-finder');
  this.heading(finder,this.data.title,'What do you need to find?',this.data.description||'Find the right reference, plan, or resource for your next step.');
  const form=finder.createEl('form');const input=form.createEl('input',{type:'search',attr:{placeholder:'Search resources, topics, or keywords…','aria-label':'Search portal resources'}});input.value=this.query;
  const search=this.btn(form,'Find a resource →',()=>{this.query=input.value;this.go('library','');},'uud-web-primary');search.type='submit';search.onclick=null;
  form.onsubmit=e=>{e.preventDefault();this.query=input.value;this.go('library','');};
  const quick=finder.createDiv('uud-web-quick');for(const [name] of [...this.groups()].slice(0,4))this.btn(quick,name+' ↗',()=>{this.query='';this.go('library',name);},'uud-web-chip');
  const aside=hero.createEl('aside',{cls:'uud-web-snapshot'});aside.createDiv({cls:'uud-web-eyebrow',text:'Collection at a glance'});
  const stats=aside.createDiv('uud-web-stats');for(const [value,label] of [[this.data.items.length,'Resources'],[this.groups().size,'Work areas'],[this.data.items.filter(x=>x.featured||x.pinned).length,'Starting points']]){const stat=stats.createDiv();stat.createEl('strong',{text:String(value)});stat.createSpan({text:String(label)});}
  aside.createEl('p',{text:'Notes, references, and working documents in one place.'});
  const note=aside.createDiv('uud-web-note');note.createEl('strong',{text:'Always connected to your notes'});note.createEl('p',{text:'Changes in your folder appear here automatically. Use a resource’s menu to pin, feature, or edit it.'});
  if(!this.data.config.hidden.includes('folders')){const head=this.main.createDiv('uud-web-section-head');head.createEl('h2',{text:'Browse by work area'});this.btn(head,'View directory →',()=>this.go('topics'),'uud-web-link');this.topicCards(this.main,6);}
  const split=this.main.createEl('section',{cls:'uud-web-split'});
  if(!this.data.config.hidden.includes('featured')||!this.data.config.hidden.includes('pinned')){const start=split.createDiv();start.createEl('h2',{text:'Useful starting points'});const picks=this.data.items.filter(r=>(r.featured&&!this.data.config.hidden.includes('featured'))||(r.pinned&&!this.data.config.hidden.includes('pinned'))).slice(0,6);if(picks.length)for(const r of picks)this.row(start,r);else start.createEl('p',{cls:'uud-web-muted',text:'Feature or pin a resource from its menu to give it a place here.'});}
  if(!this.data.config.hidden.includes('recent')){const recent=split.createEl('aside');recent.createEl('h2',{text:'Recently updated'});const items=[...this.data.items].sort((a,b)=>b.mtime-a.mtime).slice(0,4);for(const r of items)this.row(recent,r);if(!items.length)recent.createEl('p',{cls:'uud-web-muted',text:'Add a note to start your collection.'});}
 }
 private topicCards(parent:HTMLElement,limit=Infinity):void {
  const groups=[...this.groups()].slice(0,limit);const grid=parent.createDiv('uud-web-topics');
  if(!groups.length){this.empty(grid,'Your collection starts here','Create a note or add a folder to begin.');return;}
  for(const [name,items] of groups){const card=this.btn(grid,'Browse '+name,()=>{this.query='';this.go('library',name);},'uud-web-topic');card.empty();const top=card.createDiv('uud-web-topic-top');top.createSpan({text:`${items.length} resource${items.length===1?'':'s'}`});top.createSpan({text:'↗',attr:{'aria-hidden':'true'}});card.createEl('h3',{text:name});const types=[...new Set(items.flatMap(r=>r.type))].slice(0,3);card.createEl('p',{text:types.length?types.join(' · '):'A place for new resources.'});}
 }
 private topics():void {this.heading(this.main,'Collection directory','Browse by work area','Choose an area to explore its resources.');this.topicCards(this.main);}
 private library():void {
  this.heading(this.main,'Resource finder','Find a resource','Search titles, note bodies, PDFs, embedded documents, and properties.');
  const filters=this.main.createDiv('uud-web-filters');
  const label=filters.createEl('label');label.createSpan({text:'Search resources'});const input=label.createEl('input',{type:'search',attr:{'aria-label':'Search portal resources',placeholder:'Enter a title, topic, or keyword'}});input.value=this.query;input.oninput=()=>{this.query=input.value;this.page=0;this.results();};
  for(const [key,labelText] of [['area','Work area'],['type','Type'],['status','Status']] as const){const label=filters.createEl('label');label.createSpan({text:labelText});const field=label.createEl('select',{attr:{'aria-label':`Portal ${labelText.toLowerCase()}`}});field.dataset.facet=key;field.onchange=()=>{if(key==='area')this.area=field.value;else if(key==='type')this.type=field.value;else this.statusFilter=field.value;this.page=0;this.results();};}
  this.btn(filters,'Clear filters',()=>{this.query='';this.area='';this.type='';this.statusFilter='';this.defaultFilters={};this.page=0;this.libraryReset();},'uud-web-link');
  this.resultEl=this.main.createDiv('uud-web-results');this.refreshOptions();this.results();
 }
 private libraryReset(){this.main.empty();this.library();}
 private refreshOptions():void {
  for(const key of ['area','type','status'] as const){const el=this.main.querySelector<HTMLSelectElement>(`[data-facet="${key}"]`);if(!el)continue;const current=key==='area'?this.area:key==='type'?this.type:this.statusFilter;const values=key==='area'?[...this.groups().keys()]:[...new Set(this.data.items.flatMap(r=>r[key]))].sort();if(current&&!values.includes(current))values.push(current);el.empty();el.createEl('option',{value:'',text:'All'});for(const value of values)el.createEl('option',{value,text:value});el.value=current;}
 }
 private results():void {
  if(!this.resultEl)return;this.resultEl.empty();const filters={...this.defaultFilters,type:this.type,status:this.statusFilter};
  const items=select(this.data.items,this.query,filters,this.data.config.sort).filter(r=>!this.area||areaFor(r,this.data.folder)===this.area);
  this.resultEl.createDiv({cls:'uud-web-count',text:`${items.length} matching resource${items.length===1?'':'s'}${this.data.items.some(r=>r.content===undefined)?' · Reading document contents…':''}${this.data.items.some(r=>r.contentError)?' · Some document text is unavailable':''}`,attr:{role:'status','aria-live':'polite'}});
  const folder=this.data.folders.find(f=>f.name===this.area);if(folder)this.btn(this.resultEl,'Open '+folder.name+' dashboard',()=>this.actions.openFolder(folder.path),'uud-web-link');
  if(!items.length){this.empty(this.resultEl,'No matching resources','Try a broader keyword, choose another work area, or clear the filters.');return;}
  const size=this.data.pageSize;const pages=Math.max(1,Math.ceil(items.length/size));this.page=Math.min(this.page,pages-1);
  const grid=this.resultEl.createDiv('uud-web-library');for(const r of items.slice(this.page*size,(this.page+1)*size)){const card=grid.createEl('article',{cls:'uud-web-resource'});const top=card.createDiv('uud-web-topic-top');top.createSpan({text:areaFor(r,this.data.folder)});top.createSpan({text:r.type.join(' · ')});const h=card.createEl('h3');this.btn(h,r.title,()=>this.actions.open(r),'uud-web-title');if(r.description)card.createEl('p',{text:r.description});const match=excerpt(r,this.query);if(match)card.createEl('p',{cls:'uud-match',text:match});card.createDiv({cls:'uud-web-meta',text:[...r.status,`Updated ${new Date(r.mtime).toLocaleDateString()}`].join(' · ')});const actions=card.createDiv('uud-web-actions');this.btn(actions,'View resource →',()=>this.actions.open(r));const more=this.btn(actions,'Resource actions',()=>this.actions.menu(more,r),'','ellipsis');}
  if(pages>1){const pager=this.resultEl.createDiv('uud-web-pagination');this.btn(pager,'Previous',()=>{this.page--;this.results();}).disabled=this.page===0;pager.createSpan({text:`Page ${this.page+1} of ${pages}`});this.btn(pager,'Next',()=>{this.page++;this.results();}).disabled=this.page===pages-1;}
 }
 private row(parent:HTMLElement,r:Resource):void {const row=parent.createDiv('uud-web-row');const text=row.createDiv();this.btn(text,r.title+' →',()=>this.actions.open(r),'uud-web-title');text.createEl('p',{text:`${areaFor(r,this.data.folder)} · ${new Date(r.mtime).toLocaleDateString()}`});row.createSpan({cls:'uud-web-badge',text:r.type[0]||'Note'});}
 private empty(parent:HTMLElement,title:string,description:string):void {const empty=parent.createDiv('uud-web-empty');empty.createEl('h3',{text:title});empty.createEl('p',{text:description});}
}
