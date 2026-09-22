import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ancestors, defaults, inherited, parseConfig, baseDocument, within, resource, select, safeName } from './model';
test('scope boundaries distinguish sibling prefixes and direct children', () => {
 assert.equal(within('HR2/a.md','HR'),false); assert.equal(within('HR/deep/a.md','HR',false),false);
 assert.equal(within('HR/a.md','HR',false),true); assert.equal(within('a.md','/',false),true);
 assert.deepEqual(ancestors('A/B'),['A/B','A','/']);
});
test('inheritance keeps design without copying parent title or selections', () => {
 const d=defaults(); d.title='Parent'; d.pinned=['a.md']; d.template='program-area';
 const child=inherited(d); assert.equal(child.title,''); assert.deepEqual(child.pinned,[]); assert.equal(child.template,'program-area'); child.sections.reverse(); assert.notDeepEqual(child.sections,d.sections);
});
test('configuration rejects corruption and unsupported schemas', () => {
 assert.throws(()=>parseConfig('{')); assert.throws(()=>parseConfig('{"schema":2}'));
 assert.throws(()=>parseConfig('{"schema":1,"enabled":"false"}'));
 assert.equal(parseConfig('{"schema":1,"enabled":false}').enabled,false);
});
test('Base expressions quote arbitrary folder names and serialize portable paths', () => {
 const folder='HR/"Training"'; const doc=JSON.parse(baseDocument(folder,true));
 assert.equal(doc.filters.and[0],`file.inFolder(${JSON.stringify(folder)})`);
 assert.equal(JSON.parse(baseDocument('/',false)).filters.and[0],'file.folder == ""');
});
test('metadata fallback, exact facets and multiword search agree', () => {
 const a=resource('A/a.md','Alpha','md',1,{tags:['#guide'],status:'active',summary:'Payroll guide'});
 const b=resource('A/b.pdf','Beta','pdf',5,{});
 assert.equal(b.type[0],'PDF'); assert.equal(select([a,b],'payroll alpha',{tags:'guide'},'title').length,1);
 assert.equal(select([a,b],'',{status:'act'},'title').length,0);
 assert.equal(select([a,b],'',{},'modified')[0].title,'Beta');
});
test('new notes cannot escape folder or overwrite reserved dot paths', () => {
 for (const name of ['../x','a/b','.hidden','a\\b','','a:b']) assert.throws(()=>safeName(name));
 assert.equal(safeName('Meeting.md'),'Meeting.md');
});
