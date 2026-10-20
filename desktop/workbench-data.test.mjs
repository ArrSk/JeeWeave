import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimetableStore} from './timetable-store.mjs';
import {loadWorkbenchExamples,dataKeys,readRecords,saveWebCapture,approveWebDraft} from './workbench-data.mjs';
import {organizeWebText,extractActionDate} from './web-extract.mjs';
function storage() {
  const values=new Map([['jiwei-desktop-developer-mode','true']]); let fail;
  return {getItem:key=>values.get(key)??null,setItem(key,value){if(key===fail){fail=null;throw Error('storage full');}values.set(key,value);},removeItem:key=>values.delete(key),failOnce:key=>{fail=key;},snapshot:()=>Object.fromEntries(values)};
}
const today='2026-10-17';
const source={url:'https://example.com/notice',title:'虚构通知',text:'活动通知\n请于 2026-10-20 前提交报名表。\n请于明天完成材料上传。\n重要：无需重复报名。\n活动地点：图书馆。'};
test('正文提取行动与证据，跳过无需执行的说明，不因发布日期创建待办',()=>{
  const result=organizeWebText({...source,text:`发布日期：2026-10-17\n${source.text}`},today);
  assert.equal(result.drafts.length,2);assert.equal(result.drafts[0].date,'2026-10-20');assert.equal(result.drafts[1].date,'2026-10-18');
  assert.match(result.drafts[0].evidence,/报名表/);assert.equal(result.drafts[1].dateInferred,true);
  assert.equal(extractActionDate('请于 2026-02-30 前提交',today).date,'');
  assert.equal(extractActionDate('请于 10月21日提交',today).date,'2026-10-21');
  assert.equal(extractActionDate('请于 2028-02-29 提交',today).date,'2028-02-29');
});
test('所有示例幂等合并，保留真实课表、计划、待办以及示例的完成状态',()=>{
  const s=storage(), tables=createTimetableStore(s);tables.update({name:'真实课表',courses:[{id:'real-course',title:'真实课程'}]});
  s.setItem(dataKeys.tasks,JSON.stringify([{id:'real-task',title:'真实待办',done:false}]));
  s.setItem(dataKeys.plans,JSON.stringify([{id:'real-plan',title:'真实计划',done:true}]));
  loadWorkbenchExamples(s,'all',today);
  const first=tables.snapshot();assert.equal(first.tables.length,2);assert.equal(first.tables[0].name,'真实课表');assert.equal(first.tables[0].courses.length,1);
  assert.equal(tables.current().example,true);assert.equal(tables.current().courses.length,10);
  assert.equal(tables.current().courses.find(c=>c.id==='demo-course-today').weekday,6);
  const tasks=readRecords(s,dataKeys.tasks);tasks.find(item=>item.id==='demo-task-1').done=true;s.setItem(dataKeys.tasks,JSON.stringify(tasks));
  const before=s.snapshot();loadWorkbenchExamples(s,'all',today);assert.deepEqual(s.snapshot(),before);
  assert.equal(readRecords(s,dataKeys.plans).find(p=>p.id==='real-plan').done,true);
});
test('单功能示例只影响对应数据，课表示例仍为独立九门课程',()=>{
  const s=storage(),tables=createTimetableStore(s),before=s.getItem(dataKeys.tables);
  loadWorkbenchExamples(s,'tasks',today);assert.equal(s.getItem(dataKeys.tables),before);assert.equal(s.getItem(dataKeys.plans),null);
  loadWorkbenchExamples(s,'courses',today);assert.equal(tables.current().courses.length,9);
  assert.equal(s.getItem(dataKeys.captures),null);
});
test('示例多键写入失败时回滚，真实内容和当前课表不变化',()=>{
  const s=storage();createTimetableStore(s);const before=s.snapshot();s.failOnce(dataKeys.captures);
  assert.throws(()=>loadWorkbenchExamples(s,'all',today),/storage full/);assert.deepEqual(s.snapshot(),before);
});
test('抓取整理只生成草稿，确认时允许修改；重复抓取与确认不复制待办',()=>{
  const s=storage(),record=saveWebCapture(s,source,today);
  assert.equal(s.getItem(dataKeys.tasks),null);
  assert.deepEqual(approveWebDraft(s,record.id,'draft-1',{title:'提交报名表（已核对）',date:'2026-10-19'}),{added:true});
  const task=readRecords(s,dataKeys.tasks)[0];assert.equal(task.sourceUrl,source.url);assert.equal(task.date,'2026-10-19');assert.match(task.evidence,/报名表/);
  assert.deepEqual(approveWebDraft(s,record.id,'draft-1',{title:'提交报名表',date:''}),{added:false});
  assert.equal(saveWebCapture(s,source,today).drafts[0].status,'added');assert.equal(readRecords(s,dataKeys.captures).length,1);assert.equal(readRecords(s,dataKeys.tasks).length,1);
});
test('草稿校验与批准写入失败均不产生半条待办，不重置原状态',()=>{
  const s=storage(),record=saveWebCapture(s,source,today);const before=s.snapshot();
  assert.throws(()=>approveWebDraft(s,record.id,'draft-1',{title:'',date:''}),/名称/);
  assert.throws(()=>approveWebDraft(s,record.id,'draft-1',{title:'任务',date:'2026-02-30'}),/有效日期/);
  s.failOnce(dataKeys.captures);assert.throws(()=>approveWebDraft(s,record.id,'draft-1',{title:'任务',date:''}),/storage full/);
  assert.deepEqual(s.snapshot(),before);
});
