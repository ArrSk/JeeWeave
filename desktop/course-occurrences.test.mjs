import test from 'node:test';
import assert from 'node:assert/strict';
import { courseOccurs, projectCourseOccurrences, changeOccurrence, restoreOccurrence, todayCourseState } from './course-occurrences.mjs';
import { createTimetableStore } from './timetable-store.mjs';
import { validateWorkspace, emptyWorkspace, workspaceFromStorage, workspaceStorageValue, readWorkspaceBackup } from './workspace-format.mjs';
import { readingKey, normalizeReading } from './reading.mjs';
const schedule=Array.from({length:4},(_,i)=>({index:i+1,start:['08:00','08:55','10:00','10:55'][i],end:['08:45','09:40','10:45','11:40'][i]}));
const table=()=>({id:'t',name:'秋季',startDate:'2026-10-19',totalWeeks:8,schedule,courses:[{id:'a',title:'高数',teacher:'甲',location:'101',weekday:1,periodStart:1,periodEnd:2,weeks:[1,3],weekText:'1,3',createdAt:'keep'},{id:'b',title:'物理',weekday:2,periodStart:3,periodEnd:4,weeks:[],weekText:'每周'}]});
test('单次调课保留原位与调入位，逻辑课次身份不随调入日期变化，其他周不受影响',()=>{
 const t=table(),before=JSON.stringify(t);t.adjustments=changeOccurrence(t,'a','2026-10-19',{action:'move',date:'2026-10-21',periodStart:3,periodEnd:4,location:'202'});
 const entries=projectCourseOccurrences(t),source=entries.find(e=>e.courseId==='a'&&e.status==='moved'),target=entries.find(e=>e.isMovedIn);
 assert.equal(source.originalDate,'2026-10-19');assert.equal(target.date,'2026-10-21');assert.equal(target.weekday,3);assert.equal(target.location,'202');assert.equal(target.logicalId,source.logicalId);assert.notEqual(target.occurrenceId,source.occurrenceId);
 assert.equal(entries.find(e=>e.courseId==='a'&&e.date==='2026-11-02').status,'normal');assert.equal(JSON.stringify({...t,adjustments:undefined}),before);
 const old=t.adjustments[0];t.adjustments=changeOccurrence(t,'a','2026-10-19',{action:'cancel'});assert.equal(t.adjustments[0].id,old.id);assert.equal(t.adjustments[0].createdAt,old.createdAt);assert.equal(t.adjustments[0].target,undefined);
 assert.equal(projectCourseOccurrences(t).some(e=>e.isMovedIn),false);t.adjustments=restoreOccurrence(t,'a','2026-10-19');assert.equal(projectCourseOccurrences(t).filter(e=>e.courseId==='a'&&e.status==='normal').length,2);
});
test('来源周次、学期、目标节次严格校验；改课程或作息不得悬空调整，失败不写入',()=>{
 const t=table();assert.equal(courseOccurs(t,t.courses[0],'2026-10-26'),false);
 assert.throws(()=>changeOccurrence(t,'a','2026-10-26',{action:'cancel'}),/原始课次/);
 assert.throws(()=>changeOccurrence(t,'a','2026-10-19',{action:'move',date:'2027-02-01',periodStart:1,periodEnd:2,location:''}),/学期/);
 assert.throws(()=>changeOccurrence(t,'a','2026-10-19',{action:'move',date:'2026-10-21',periodStart:1,periodEnd:5,location:''}),/作息/);
 const values=new Map([['jiwei-desktop-timetables-v1',JSON.stringify({activeId:'t',tables:[t]})]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},store=createTimetableStore(storage);
 store.update({adjustments:changeOccurrence(t,'a','2026-10-19',{action:'cancel'})});const before=storage.getItem('jiwei-desktop-timetables-v1');
 assert.throws(()=>store.update({courses:t.courses.map(c=>({...c,weekday:5}))}),/不一致/);assert.equal(storage.getItem('jiwei-desktop-timetables-v1'),before);
 const file=emptyWorkspace();file.data.timetables=store.snapshot();const restored=readWorkspaceBackup(file);assert.equal(restored.data.timetables.tables[0].adjustments.length,1);
 const broken=structuredClone(file);broken.data.timetables.tables[0].courses=[];assert.throws(()=>validateWorkspace(broken),/不一致/);
});
test('今天状态使用调整后的有效课次，结束时刻不算上课中，停课和调出不算下一节',()=>{
 const t=table();assert.equal(todayCourseState(t,'2026-10-19','07:59').next.courseId,'a');assert.equal(todayCourseState(t,'2026-10-19','08:00').ongoing.length,1);assert.equal(todayCourseState(t,'2026-10-19','09:40').ongoing.length,0);
 t.adjustments=changeOccurrence(t,'a','2026-10-19',{action:'move',date:'2026-10-21',periodStart:3,periodEnd:4,location:'202'});
 assert.equal(todayCourseState(t,'2026-10-19','07:00').next,null);assert.equal(todayCourseState(t,'2026-10-21','10:00').ongoing[0].isMovedIn,true);
 assert.equal(todayCourseState({...t,startDate:''},'2026-10-19','08:00').entries.length,0);
});
test('阅读字号与密度随同一工作区备份迁移，非法和未来值拒绝，不进入扩展键',()=>{
 const values=new Map([[readingKey,JSON.stringify({schemaVersion:1,size:'large',density:'comfortable'})]]),storage={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null};
 const file=workspaceFromStorage(storage);assert.equal(file.data.preferences.reading.size,'large');assert.equal(file.data.extensions[readingKey],undefined);assert.equal(JSON.parse(workspaceStorageValue(readWorkspaceBackup(file),readingKey)).density,'comfortable');assert.equal(normalizeReading().size,'standard');assert.throws(()=>normalizeReading({schemaVersion:2,size:'large',density:'compact'}),/格式/);
});

test('课程日历投影保留稳定原课次，调出/停课为独立标记，调入仍是有效时段',async()=>{
 const {projectCourseCalendar}=await import('./calendar.mjs');
 const t=table();t.adjustments=changeOccurrence(t,'a','2026-10-19',{action:'move',date:'2026-10-21',periodStart:3,periodEnd:4,location:'202'});
 const entries=projectCourseCalendar(t,{start:'2026-10-19',end:'2026-10-25'}),source=entries.find(e=>e.course.status==='moved'),target=entries.find(e=>e.course.isMovedIn);
 assert.equal(target.kind,'course');assert.equal(target.startTime,'10:00');assert.equal(target.course.logicalId,source.course.logicalId);assert.notEqual(target.id,source.id);assert.equal(target.allDay,false);
});
