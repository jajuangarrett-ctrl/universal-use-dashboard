import { App, TFile, loadPdfJs } from 'obsidian';
export interface DocumentText { text: string; pages: string[]; error?: string }
/** In-memory, revision-keyed cache; never uploads or persists document bodies. */
export class ContentIndex {
 private cache = new Map<string, {revision:string; value:Promise<DocumentText>}>();
 constructor(private app:App) {}
 clear(){this.cache.clear();}
 async read(file:TFile):Promise<DocumentText> {
  const revision=`${file.stat.mtime}:${file.stat.size}`;const old=this.cache.get(file.path);
  if(old?.revision===revision)return old.value;
  const value=this.extract(file).catch(()=>({text:'',pages:[],error:'Could not read document text'}));
  this.cache.set(file.path,{revision,value});if(this.cache.size>1500)this.cache.delete(this.cache.keys().next().value!);return value;
 }
 private async extract(file:TFile):Promise<DocumentText>{
  if(['md','txt','csv','json','html','base'].includes(file.extension.toLowerCase()))return {text:await this.app.vault.cachedRead(file),pages:[]};
  if(file.extension.toLowerCase()!=='pdf')return {text:'',pages:[]};
  const pdfjs=await loadPdfJs();const task=pdfjs.getDocument({data:new Uint8Array(await this.app.vault.readBinary(file))});const doc=await task.promise;
  try{const pages:string[]=[];for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n);const content=await page.getTextContent();const lines:{y:number;items:{x:number;text:string}[]}[]=[];
   for(const item of content.items){if(!('str' in item)||!item.str.trim())continue;const y=item.transform[5];let line=lines.find(l=>Math.abs(l.y-y)<2);if(!line){line={y,items:[]};lines.push(line);}line.items.push({x:item.transform[4],text:item.str});}
   pages.push(lines.sort((a,b)=>b.y-a.y).map(l=>l.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' ')).join('\n'));page.cleanup();
  }return {text:pages.join('\n'),pages,...(!pages.some(p=>p.trim())?{error:'No selectable text; this PDF needs OCR'}:{})};}finally{await task.destroy();}
 }
 async searchable(file:TFile):Promise<DocumentText>{
  const base=await this.read(file);if(file.extension!=='md')return base;
  const seen=new Set([file.path]);const parts=[base.text];const errors:string[]=[];
  const visit=async(f:TFile,depth:number)=>{if(depth>8){errors.push('Embedded document nesting exceeds 8 levels');return;}
   for(const embed of this.app.metadataCache.getFileCache(f)?.embeds||[]){const target=this.app.metadataCache.getFirstLinkpathDest(embed.link.split('#')[0],f.path);if(!target||seen.has(target.path))continue;seen.add(target.path);const text=await this.read(target);parts.push(`\nEmbedded document: ${target.path}\n${text.text}`);if(text.error)errors.push(`${target.name}: ${text.error}`);if(target.extension==='md')await visit(target,depth+1);}
  };await visit(file,0);return {...base,text:parts.join('\n'),error:[base.error,...errors].filter(Boolean).join('; ')||undefined};
 }
}
