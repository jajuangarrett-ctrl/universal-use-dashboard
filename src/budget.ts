export interface BudgetRow {object:string;label:string;values:number[];page:number}
export interface BudgetFund {title:string;rows:BudgetRow[];total:number[];page:number}
export interface BudgetReport {title:string;subtitle:string;note:string;notes:string[];rollup:number[];funds:BudgetFund[];warnings:string[]}
const money=/-?\$[\d,]+(?:\.\d{1,2})?/g;
export function amounts(line:string):number[]{return (line.match(money)||[]).map(s=>Math.round(Number(s.replace(/[$,]/g,''))*100));}
export function parseBudget(pages:string[]):BudgetReport {
 const lines=pages.flatMap((p,i)=>p.split('\n').map(text=>({text:text.trim(),page:i+1}))).filter(l=>l.text);
 const report:BudgetReport={title:lines[0]?.text||'Budget',subtitle:lines.find(l=>l.text.includes('Fiscal Year'))?.text||'',note:lines.find(l=>l.text.startsWith('Encumbered'))?.text||'',notes:lines.filter(l=>/^Fund \d+ (?![—–-])/.test(l.text)).map(l=>l.text),rollup:[],funds:[],warnings:[]};
 let current:BudgetFund|undefined;let rollup=false;let heading=false;
 for(const {text,page} of lines){
  if(text.startsWith('Collective rollup')){rollup=true;continue;}
  if(rollup&&amounts(text).length===7){report.rollup=amounts(text);rollup=false;continue;}
  if(/^Fund \d+\s*[—–-]/.test(text)){current={title:text,rows:[],total:[],page};report.funds.push(current);heading=true;continue;}
  if(!current)continue;
  if(heading&&/^[\d,\s]+$/.test(text)){current.title+=' '+text;continue;}
  const values=amounts(text);
  if(/^\d{4}\s/.test(text)){heading=false;if(values.length!==6){report.warnings.push(`Page ${page}: could not read all amounts for ${text.slice(0,60)}`);continue;}current.rows.push({object:text.slice(0,4),label:text.slice(4,text.search(/-?\$/)).trim(),values,page});}
  if(text.startsWith('FUND TOTAL')){current.total=values;if(values.length!==6)report.warnings.push(`Page ${page}: incomplete fund total`);}
 }
 const expected=Number(lines.find(l=>l.text.startsWith('Collective rollup'))?.text.match(/\((\d+) fund/)?.[1]);if(expected&&expected!==report.funds.length)report.warnings.push('The number of imported funds differs from the source rollup.');
 if(!report.rollup.length||!report.funds.length)report.warnings.push('This PDF does not match the supported Remaining by Line Item report format.');
 for(const f of report.funds){if(!f.rows.length||f.total.length!==6){report.warnings.push(`${f.title}: missing rows or total`);continue;}for(let c=0;c<6;c++)if(Math.abs(f.rows.reduce((s,r)=>s+r.values[c],0)-f.total[c])>1)report.warnings.push(`${f.title}: line items differ from the reported total (column ${c+1}).`);}
 if(report.rollup.length===7&&report.funds.every(f=>f.total.length===6))for(const [i,c] of [0,1,2,4,5,6].entries())if(Math.abs(report.funds.reduce((s,f)=>s+f.total[i],0)-report.rollup[c])>1)report.warnings.push('Fund totals differ from the collective rollup.');
 return report;
}
export const currency=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100);
