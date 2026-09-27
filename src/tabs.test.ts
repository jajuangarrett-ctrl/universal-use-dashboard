import test from 'node:test';
import assert from 'node:assert/strict';
import {resource,inNotionTab,isAttachmentPath,select} from './model';
const item=(path:string,fm:Record<string,unknown>={})=>resource(path,'Meeting task example',path.split('.').at(-1)!,1,fm);
test('Tasks matches named folders and descendants, not titles or metadata or ancestors outside scope',()=>{
 assert.equal(inNotionTab(item('Area/Admin leadership Tasks/Project/Brief.md'),'Tasks','Area'),true);
 assert.equal(inNotionTab(item('Area/Task planning/a.pdf'),'Tasks','Area'),true);
 assert.equal(inNotionTab(item('Area/Brief.md',{type:'Task'}),'Tasks','Area'),false);
 assert.equal(inNotionTab(item('08 Tasks/Area/Brief.md'),'Tasks','08 Tasks/Area'),false);
 assert.equal(inNotionTab(item('Area/Tasks/Brief.md'),'Tasks','Area/Tasks'),true);
 assert.equal(inNotionTab(item('Area2/Tasks/Brief.md'),'Tasks','Area'),false);
});
test('Meetings uses only Meeting Notes folders at any depth',()=>{
 assert.equal(inNotionTab(item('Area/Event/Meeting Notes/Brief.md'),'Meetings','Area'),true);
 assert.equal(inNotionTab(item('Area/meeting notes/Subfolder/Brief.md'),'Meetings','Area'),true);
 assert.equal(inNotionTab(item('Area/Leadership Meetings/Brief.md',{type:'Meeting'}),'Meetings','Area'),false);
 assert.equal(inNotionTab(item('Area/Meeting Notes.md'),'Meetings','Area'),false);
});
test('Attachments includes files and notes with resolved attachments; HTML is its own view',()=>{
 for(const ext of ['pdf','png','docx','xlsx','mp3'])assert.equal(inNotionTab(item('Area/file.'+ext),'Attachments','Area'),true);
 assert.equal(inNotionTab({...item('Area/note.md'),hasAttachments:true},'Attachments','Area'),true);
 assert.equal(inNotionTab(item('Area/note.md'),'Attachments','Area'),false);
 for(const ext of ['html','HTM']){assert.equal(inNotionTab(item('Area/report.'+ext),'HTML','Area'),true);assert.equal(isAttachmentPath('Area/report.'+ext),false);}
});
test('Content includes all scoped items and tab membership still composes with search',()=>{
 const items=[item('Area/Tasks/a.md'),item('Area/b.pdf'),item('Area/c.html')];
 assert.equal(items.filter(r=>inNotionTab(r,'Content','Area')).length,3);
 assert.equal(select(items,'b.pdf',{},'title').filter(r=>inNotionTab(r,'Attachments','Area')).length,1);
 assert.equal(select(items,'missing',{},'title').filter(r=>inNotionTab(r,'Tasks','Area')).length,0);
});
