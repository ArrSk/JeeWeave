import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectStore, objectDetail, objectSources, normalizeObjects, objectKey, readObjects, refKey, nextObjectCourse } from './object-view.mjs';
import { createTimetableStore } from './timetable-store.mjs';
import { loadWorkbenchExamples, approveWebDraft, dataKeys } from './workbench-data.mjs';
import { developerKey, visibleRecords } from './examples.mjs';
import { createWorkspaceStorage, workspaceFromStorage, validateWorkspace, emptyWorkspace } from './workspace-format.mjs';
const memory=()=>{const m=new Map();return {get length(){return m.size;},key:i=>[...m.keys()][i],getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),snapshot:()=>JSON.stringify([...m])};};
const seed=()=>{const s=memory();createTimetableStore(s);s.setItem(dataKeys.tasks,JSON.stringify([{id:'same',title:'同名作业',date:'2026-10-23',done:false,createdAt:'old',sourceUrl:'https://example.org/requirement',extra:'keep'}]));s.setItem(dataKeys.plans,JSON.stringify([{id:'same',title:'同名作业',date:'',done:false}]));return s;};
test('对象中的下一课保留正在进行的课，跳过已结束与停课的课次',()=>{
  const table=createTimetableStore(memory()).current();Object.assign(table,{startDate:'2026-10-19',totalWeeks:3,courses:[{id:'c',title:'课程',weekday:2,periodStart:1,periodEnd:2,weeks:[1,2]}]});
  assert.equal(nextObjectCourse(table,'c','2026-10-20','08:10').date,'2026-10-20');
  assert.equal(nextObjectCourse(table,'c','2026-10-20','09:40').date,'2026-10-27');
  table.adjustments=[{id:'cancel',courseId:'c',originalDate:'2026-10-20',action:'cancel',originalPeriodStart:1,originalPeriodEnd:2}];
  assert.equal(nextObjectCourse(table,'c','2026-10-20','08:10').date,'2026-10-27');
  assert.equal(nextObjectCourse(table,'c','2026-11-01','08:00'),null);
});
test('未开启开发者模式时服务拒绝所有示例导入，关闭只隐藏而不删除',()=>{
  const s=seed(),before=s.snapshot();
  for(const scope of ['all','courses','items','web','calendar','objects'])assert.throws(()=>loadWorkbenchExamples(s,scope),/开发者模式/);
  assert.throws(()=>createTimetableStore(s).loadExample({},[]),/开发者模式/);assert.equal(s.snapshot(),before);
  s.setItem(developerKey,'true');loadWorkbenchExamples(s,'all','2026-10-20');
  const record=JSON.parse(s.getItem(dataKeys.captures))[0],draft=record.drafts[0];
  approveWebDraft(s,record.id,draft.id,{title:'示例要求',date:'2026-10-24'});
  const samples=JSON.parse(s.getItem(dataKeys.tasks));assert.equal(samples.find(t=>t.title==='示例要求').example,true);
  s.setItem(developerKey,'false');const count=samples.length;
  assert.equal(visibleRecords(s,samples).length,1);assert.equal(JSON.parse(s.getItem(dataKeys.tasks)).length,count);
  assert.throws(()=>approveWebDraft(s,record.id,record.drafts[1].id,{title:'不允许导入'}),/开发者模式/);
  const store=createTimetableStore(s);assert.equal(store.current().example,undefined);assert.equal(store.list().length,1);
  assert.equal(store.snapshot().tables.length,2);assert.equal(visibleRecords(s,readObjects(s).objects).length,0);
  s.setItem(developerKey,'true');assert.equal(visibleRecords(s,samples).length,count);
});
test('旧示例确认任务按原始来源关联隐藏，不按标题猜测',()=>{
  const s=seed();s.setItem(dataKeys.captures,JSON.stringify([{id:'c',example:true,url:'https://example.org/demo',drafts:[{taskId:'old'}]}]));
  const records=[{id:'old',sourceUrl:'https://example.org/demo'},{id:'real',title:'示例：真实用户标题'}];
  assert.deepEqual(visibleRecords(s,records),[records[1]]);
});
test('同名对象不自动合并，跨集合与跨课表同编号引用保持独立',()=>{
  const s=seed(),store=createObjectStore(s),a=store.save({title:'同名课',type:'course',purpose:'目标甲'}),b=store.save({title:'同名课',type:'course'});
  const tables=JSON.parse(s.getItem(dataKeys.tables));tables.tables[0].courses=[{id:'same',title:'同名课'}];tables.tables.push({...tables.tables[0],id:'other'});s.setItem(dataKeys.tables,JSON.stringify(tables));
  for(const ref of [{collection:'task',id:'same'},{collection:'plan',id:'same'},{collection:'courseEntry',id:'same',containerId:tables.tables[0].id},{collection:'courseEntry',id:'same',containerId:'other'}])store.assign(a.id,ref);
  const detail=objectDetail(s,a.id);assert.equal(detail.entries.length,4);assert.equal(new Set(detail.entries.map(e=>refKey(e.ref))).size,4);
  assert.equal(objectDetail(s,b.id).entries.length,0);
  const before=s.getItem(dataKeys.tasks);assert.throws(()=>store.assign(b.id,{collection:'task',id:'same'}),/主归属/);assert.equal(s.getItem(dataKeys.tasks),before);
  store.unassign(a.id,{collection:'task',id:'same'});store.assign(b.id,{collection:'task',id:'same'});assert.equal(objectDetail(s,a.id).entries.length,3);assert.equal(objectDetail(s,b.id).entries.length,1);
});
test('归档、改名、取消关联不更改原记录；删除来源保留可解除的上下文',()=>{
  const s=seed(),store=createObjectStore(s),o=store.save({title:'课程',type:'course'}),original=s.getItem(dataKeys.tasks),ref={collection:'task',id:'same'};
  store.assign(o.id,ref);store.save({title:'课程改名',type:'course',purpose:'完成报告'},o.id);store.archive(o.id);
  assert.equal(s.getItem(dataKeys.tasks),original);assert.equal(objectDetail(s,o.id).object.status,'archived');
  s.setItem(dataKeys.tasks,'[]');assert.equal(objectDetail(s,o.id).entries[0].source,undefined);store.unassign(o.id,ref);assert.equal(objectDetail(s,o.id).entries.length,0);
});
test('坏对象、悬空对象关系、重复主归属与未来版本在写入前拒绝',()=>{
  const s=seed(),store=createObjectStore(s),o=store.save({title:'课程',type:'course'});store.assign(o.id,{collection:'task',id:'same'});
  const state=store.read(),before=s.snapshot();
  for(const bad of [{...state,schemaVersion:2},{...state,objects:[...state.objects,state.objects[0]]},{...state,links:[...state.links,state.links[0]]},{...state,links:[{objectId:'missing',ref:{collection:'task',id:'same'}}]}])assert.throws(()=>normalizeObjects(bad));
  assert.throws(()=>store.assign(o.id,{collection:'task',id:'absent'}),/不存在/);assert.equal(s.snapshot(),before);
  const write=s.setItem;s.setItem=()=>{throw Error('disk full');};assert.throws(()=>store.archive(o.id),/disk full/);s.setItem=write;assert.equal(store.read().objects[0].status,'active');
});
test('对象与关系加入版本化工作区、备份恢复及旧文件默认，无独立散落存储',async()=>{
  const s=seed(),store=createObjectStore(s),o=store.save({title:'课程',type:'course'});store.assign(o.id,{collection:'task',id:'same'});
  const file=workspaceFromStorage(s);assert.equal(file.data.objectView.links.length,1);assert.equal(file.data.extensions[objectKey],undefined);
  const target=memory(),adapter=await createWorkspaceStorage(target);adapter.restore(file);
  assert.equal(readObjects(target).objects[0].id,o.id);assert.equal(objectSources(target).find(r=>r.ref.collection==='task').record.extra,'keep');
  assert.deepEqual(validateWorkspace(emptyWorkspace()).data.objectView,{schemaVersion:1,objects:[],links:[]});
  const bad=structuredClone(file);bad.data.objectView.links[0].objectId='gone';const before=target.snapshot();assert.throws(()=>adapter.restore(bad));assert.equal(target.snapshot(),before);
});
