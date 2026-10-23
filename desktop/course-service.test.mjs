import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourseService } from './course-service.mjs';
import { createTimetableStore } from './timetable-store.mjs';
import { developerKey } from './examples.mjs';
import { setModuleEnabled } from './modules.mjs';
import { changeOccurrence } from './course-occurrences.mjs';

const key = 'jiwei-desktop-timetables-v1';
const ref = (containerId, id = 'same') => ({ collection: 'courseEntry', containerId, id });
const memory = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), snapshot: () => JSON.stringify([...map]) };
};
const seed = storage => {
  const store = createTimetableStore(storage), first = store.current().id;
  store.update({ name: '主修', startDate: '2026-10-19', courses: [{ id:'same', title:'课程甲', weeks:[1,3], weekText:'1-3单', teacher:'教师甲', location:'A101', extra:'保留', createdAt:'旧时间' }], unplacedCourses:[{id:'unplaced',title:'待安排实践',raw:'学校未安排时间',weekText:'1-3'}] });
  const second = store.create({ name:'辅修', startDate:'2026-10-19', totalWeeks:20 });
  store.update({ courses:[{id:'same',title:'课程乙'}] });
  return {store,first,second};
};

test('课程查询不会初始化或切换课表，跨表同编号与未排课保留原身份和完整快照',()=>{
  const storage=memory(),service=createCourseService(storage),empty=storage.snapshot();
  assert.deepEqual(service.listEntries(),[]);assert.deepEqual(service.inspect(ref('absent')),{status:'missing'});assert.equal(storage.snapshot(),empty);
  const {first,second}=seed(storage),before=storage.snapshot(),entries=service.listEntries();
  assert.equal(entries.length,3);assert.deepEqual(entries.map(e=>e.ref),[ref(first),ref(first,'unplaced'),ref(second)]);
  assert.equal(service.inspect(ref(first)).record.title,'课程甲');assert.equal(service.inspect(ref(second)).record.title,'课程乙');
  assert.equal(service.inspect(ref(first,'unplaced')).record.raw,'学校未安排时间');
  assert.equal(entries[0].record.createdAt,'旧时间');assert.equal(entries[0].record.extra,'保留');assert.deepEqual(entries[0].record.weeks,[1,3]);
  entries[0].record.title='外部修改';entries[0].table.schedule[0].start='00:00';entries[0].table.courses.push({id:'外部'});
  const snapshot=service.inspect(ref(first));snapshot.record.weeks.push(9);snapshot.table.name='外部修改';
  assert.equal(service.inspect(ref(first)).record.title,'课程甲');assert.equal(storage.snapshot(),before);
  assert.equal(JSON.parse(storage.getItem(key)).activeId,second);
});

test('课程提供者守卫功能开关和表内示例，隐藏状态不携带资料，恢复不改写选择',()=>{
  const storage=memory(),{first,store}=seed(storage),service=createCourseService(storage);
  store.select(first);store.update({courses:[...store.current().courses,{id:'sample-entry',example:true,title:'表内示例',raw:'示例正文'}]});
  storage.setItem(developerKey,'true');store.loadExample({name:'示例课表',totalWeeks:20},[{id:'sample',title:'示例课程'}]);
  const sample=store.current().id;storage.setItem(developerKey,'false');const before=storage.snapshot();
  assert.deepEqual(service.inspect(ref(first,'sample-entry')),{status:'hidden'});
  assert.deepEqual(service.inspect(ref(sample,'sample')),{status:'hidden'});assert.equal(service.listEntries().length,3);
  assert.equal(service.inspect(ref(first)).table.courses.some(record=>record.example),false,'visible context must not expose another hidden record');
  assert.ok(service.listEntries().every(entry=>!entry.table.courses.some(record=>record.example)));
  assert.equal(storage.snapshot(),before,'queries never normalize the active hidden table');
  setModuleEnabled(storage,'courses',false);const disabled=storage.snapshot();
  assert.throws(()=>service.listEntries(),/关闭/);assert.throws(()=>service.inspect(ref(first)),/关闭/);assert.equal(storage.snapshot(),disabled);
  setModuleEnabled(storage,'courses',true);storage.setItem(developerKey,'true');assert.equal(service.listEntries().length,5);
  assert.equal(service.inspect(ref(sample,'sample')).record.title,'示例课程');
});

test('课程查询实时反映编辑和删除，非法引用与损坏快照不冒充来源删除',()=>{
  const storage=memory(),{store,first,second}=seed(storage),service=createCourseService(storage);
  store.select(first);store.update({courses:[{id:'same',title:'更新课程',note:'新备注'}]});
  assert.equal(service.inspect(ref(first)).record.note,'新备注');
  assert.deepEqual(service.inspect(ref(second,'unplaced')),{status:'missing'});
  for(const invalid of [null,{id:'same'},{...ref(first),containerId:''},{...ref(first),collection:'task'}])assert.throws(()=>service.inspect(invalid),/引用无效/);
  store.update({courses:[]});assert.deepEqual(service.inspect(ref(first)),{status:'missing'});
  assert.equal(service.inspect(ref(second)).record.title,'课程乙');store.remove(first);assert.deepEqual(service.inspect(ref(first,'unplaced')),{status:'missing'});
  const before=storage.snapshot();assert.equal(service.listEntries().length,1);assert.equal(storage.snapshot(),before);
  storage.setItem(key,JSON.stringify({tables:'bad'}));assert.throws(()=>service.listEntries(),/资料无效/);
  storage.setItem(key,JSON.stringify({tables:[{id:second,courses:null}]}));assert.throws(()=>service.inspect(ref(second)),/资料无效/);
});

const todaySeed = storage => {
  const store=createTimetableStore(storage);
  store.update({startDate:'2026-10-19',totalWeeks:4,courses:[
    {id:'a',title:'周次课程',weekday:1,periodStart:1,periodEnd:2,weeks:[1,3],teacher:'教师甲',location:'A101',createdAt:'keep'},
    {id:'b',title:'每周课程',weekday:1,periodStart:3,periodEnd:4,weeks:[],location:'B201'},
  ],unplacedCourses:[{id:'unplaced',title:'未排课',raw:'无时间'}]});
  return store;
};

test('按日查询沿用正在上课/下一节边界、周次与调停课身份，投影不另存副本',()=>{
  const storage=memory(),store=todaySeed(storage),service=createCourseService(storage),day='2026-10-19';
  const before=storage.snapshot();
  assert.equal(service.onDate(day,'07:59').next.courseId,'a');
  assert.equal(service.onDate(day,'08:00').ongoing[0].courseId,'a');
  assert.equal(service.onDate(day,'09:40').ongoing.length,0);assert.equal(service.onDate(day,'09:40').next.courseId,'b');
  assert.equal(service.onDate(day,'10:00').ongoing[0].courseId,'b');assert.equal(service.onDate(day,'11:40').next,null);
  assert.deepEqual(service.onDate('2026-10-26','08:00').entries.map(e=>e.courseId),['b']);
  assert.equal(service.onDate('2026-11-16','08:00').entries.length,0);
  const snapshot=service.onDate(day,'08:00');snapshot.ongoing[0].title='外部修改';snapshot.table.courses.length=0;assert.equal(storage.snapshot(),before);
  store.update({adjustments:changeOccurrence(store.current(),'a',day,{action:'move',date:'2026-10-21',periodStart:3,periodEnd:4,location:'调入教室'})});
  store.update({adjustments:changeOccurrence(store.current(),'b',day,{action:'cancel'})});
  const changed=storage.snapshot(),source=service.onDate(day,'07:00'),target=service.onDate('2026-10-21','10:00');
  assert.deepEqual(source.entries.map(e=>e.status),['moved','cancelled']);assert.equal(source.next,null);assert.equal(source.ongoing.length,0);
  assert.equal(target.ongoing[0].isMovedIn,true);assert.equal(target.ongoing[0].originalDate,day);assert.equal(target.ongoing[0].logicalId,source.entries[0].logicalId);assert.equal(target.ongoing[0].location,'调入教室');
  assert.equal(service.onDate('2026-10-21','11:40').ongoing.length,0);assert.equal(storage.snapshot(),changed);
});

test('按日查询遵循当前可见课表并过滤示例调整，无课表/未设开学日时只返回空投影',()=>{
  const storage=memory(),service=createCourseService(storage),empty=storage.snapshot(),day='2026-10-19';
  assert.deepEqual(service.onDate(day,'08:00'),{table:null,entries:[],ongoing:[],next:null});assert.equal(storage.snapshot(),empty);
  const store=todaySeed(storage),first=store.current().id;
  store.update({courses:[...store.current().courses,{id:'hidden',example:true,title:'隐藏课程',weekday:1,periodStart:1,periodEnd:2,weeks:[]}]});
  store.update({adjustments:changeOccurrence(store.current(),'hidden',day,{action:'cancel'})});
  const original=storage.snapshot(),result=service.onDate(day,'08:00');
  assert.equal(result.entries.some(e=>e.courseId==='hidden'),false);assert.deepEqual(result.table.adjustments,[]);assert.equal(storage.snapshot(),original);
  storage.setItem(developerKey,'true');assert.equal(service.onDate(day,'08:00').entries.find(e=>e.courseId==='hidden').status,'cancelled');
  const second=store.create({name:'另一课表',startDate:day,totalWeeks:4});
  store.update({courses:[{id:'a',title:'另一表同编号课程',weekday:1,periodStart:1,periodEnd:2,weeks:[]}]});
  assert.equal(service.onDate(day,'08:00').ongoing[0].title,'另一表同编号课程');
  store.update({startDate:''});assert.equal(service.onDate(day,'08:00').entries.length,0);assert.equal(service.onDate(day,'08:00').table.id,second);
  store.loadExample({name:'示例表',startDate:day,totalWeeks:4},[{id:'example',title:'示例课',weekday:1,periodStart:1,periodEnd:2,weeks:[]}]);
  const sample=store.current().id;assert.equal(service.onDate(day,'08:00').table.id,sample);
  storage.setItem(developerKey,'false');const fallback=storage.snapshot();
  assert.equal(service.onDate(day,'08:00').table.id,first);assert.equal(storage.snapshot(),fallback);
  const state=JSON.parse(storage.getItem(key));state.tables=state.tables.filter(t=>t.example);storage.setItem(key,JSON.stringify(state));const allHidden=storage.snapshot();
  assert.equal(service.onDate(day,'08:00').table,null);assert.equal(storage.snapshot(),allHidden);
});

test('按日查询拒绝关闭来源、非法日期/时间与损坏调整，失败不写入或回退选择',()=>{
  const storage=memory(),store=todaySeed(storage),service=createCourseService(storage),day='2026-10-19',before=storage.snapshot();
  for(const time of ['24:00','8:00','12:60','00:00:00',null])assert.throws(()=>service.onDate(day,time),/查询时间/);
  assert.throws(()=>service.onDate('2026-02-30','08:00'));assert.equal(storage.snapshot(),before);
  setModuleEnabled(storage,'courses',false);const disabled=storage.snapshot();assert.throws(()=>service.onDate(day,'08:00'),/关闭/);assert.equal(storage.snapshot(),disabled);
  setModuleEnabled(storage,'courses',true);const state=store.snapshot();state.tables[0].adjustments=[{id:'broken',courseId:'missing',originalDate:day,action:'cancel'}];storage.setItem(key,JSON.stringify(state));const broken=storage.snapshot();
  assert.throws(()=>service.onDate(day,'08:00'),/不一致/);assert.equal(storage.snapshot(),broken);
});
