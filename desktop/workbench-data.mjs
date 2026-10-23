import * as calendar from '../shared/packages/core/src/semester-calendar.mjs';
import { buildDemoTimetable } from './demo-timetable.mjs';
import { organizeWebText } from './web-extract.mjs';
import { normalizeItem } from './planning.mjs';
import { readModules, isModuleEnabled } from './modules.mjs';
import { requireDeveloperMode } from './examples.mjs';
import { objectKey, readObjects, refKey } from './object-view.mjs';
import { writeTogether } from './workspace-transaction.mjs';
export { writeTogether } from './workspace-transaction.mjs';
import { journalKey, readJournal, withJournalExamples } from './journal.mjs';
import { webCaptureKey, createWebCaptureService } from './web-capture-service.mjs';
import { createItemService } from './item-service.mjs';
export { saveWebCapture } from './web-capture-service.mjs';

// Compatibility composition for old callers without a host registry.
export function approveWebDraft(storage, captureId, draftId, fields) {
  const items = createItemService(storage, { enabled: id => isModuleEnabled(readModules(storage), id) });
  return createWebCaptureService(storage, { items: () => items }).approve(captureId, draftId, fields);
}

export const dataKeys = { tables:'jiwei-desktop-timetables-v1', plans:'jiwei-desktop-plans', tasks:'jiwei-desktop-tasks', captures:webCaptureKey };
export const readRecords = (storage,key) => JSON.parse(storage.getItem(key) || '[]');
const mergeExamples = (old,examples) => [...old,...examples.filter(sample=>!old.some(item=>item.id===sample.id))];
export function loadWorkbenchExamples(storage,scope,today=calendar.today()) {
  requireDeveloperMode(storage);
  if (!['all','overview','today','courses','plans','tasks','items','web','calendar','objects','notes'].includes(scope)) throw new Error('未知示例类型');
  const all = scope === 'all' || scope === 'overview' || scope === 'objects';
  const enabled = id => isModuleEnabled(readModules(storage), id);
  const requested = { notes:'notes', objects:'objects', calendar: 'calendar', today: 'today', courses: 'courses', plans: 'plans', tasks: 'tasks', web: 'web-capture' }[scope];
  if (requested && !enabled(requested)) throw new Error('该功能已关闭，请先在插件管理中开启。');
  const nextDay = offset=>calendar.dateForWeek({startDate:today},1,offset+1);
  const changes = {};
  if (enabled('notes') && (all || scope === 'notes')) changes[journalKey] = withJournalExamples(readJournal(storage), today);
  if (enabled('courses') && (all || ['today','courses'].includes(scope))) {
    const snapshot = JSON.parse(storage.getItem(dataKeys.tables));
    if (!snapshot?.tables?.length) throw new Error('请先初始化课表。');
    let table = snapshot.tables.find(item=>item.example);
    if (!table) { table={id:`example_${Date.now()}`,example:true,name:'示例课表（可编辑）',startDate:calendar.mondayOf(today),totalWeeks:20,courses:[],schedule:snapshot.tables[0].schedule.map(item=>({...item}))}; snapshot.tables.push(table); }
    const samples = buildDemoTimetable();
    if (scope !== 'courses') samples.push({id:'demo-course-today',title:'示例：今日学习讨论',weekday:calendar.weekdayOf(today),periodStart:9,periodEnd:10,teacher:'示例教师',location:'图书馆研讨室',weeks:Array.from({length:20},(_,i)=>i+1),weekText:'每周',color:'cyan'});
    table.courses=mergeExamples(table.courses,samples); snapshot.activeId=table.id;
    changes[dataKeys.tables]=snapshot;
  }
  if (enabled('plans') && (all || scope==='items' || scope==='plans' || scope==='today' || scope==='calendar')) changes[dataKeys.plans]=mergeExamples(readRecords(storage,dataKeys.plans),[
    {id:'demo-plan-range-v1',title:'示例：整理本周复习计划',anchor:{type:'range',start:today,end:nextDay(6)},phases:[{id:'demo-phase-1',title:'梳理课程知识点',startDate:today,endDate:nextDay(1),done:false},{id:'demo-phase-2',title:'整理错题与练习',startDate:nextDay(2),endDate:nextDay(4),done:false},{id:'demo-phase-3',title:'模拟复习与回顾',startDate:nextDay(5),endDate:nextDay(6),done:false}],date:today,done:false,example:true},
    {id:'demo-plan-event-v1',title:'示例：准备课程小组展示',anchor:{type:'absolute',start:`${nextDay(3)}T14:00:00+08:00`,end:`${nextDay(3)}T15:00:00+08:00`},date:nextDay(3),done:false,example:true},
    {id:'demo-plan-exam-v1',title:'示例：高等数学阶段考试',eventType:'exam',anchor:{type:'absolute',start:`${nextDay(1)}T09:00:00+08:00`,end:`${nextDay(1)}T11:00:00+08:00`},note:'虚构示例 · 教学楼 201，准备学生证和文具。',done:false,example:true},
    {id:'demo-plan-3',title:'示例：建立学习资料目录',date:'',done:true,example:true},
    {id:'demo-plan-4',anchor:{type:'deadline',date:nextDay(6)},title:'示例：课程项目提交期限',date:nextDay(6),done:false,example:true},
    {id:'demo-plan-5',title:'示例：每周阅读',anchor:{type:'weekly',startDate:today,weekdays:[1,3,5],startTime:'19:00',endTime:'19:30'},done:false,example:true},
    {id:'demo-plan-6',title:'示例：建立长期阅读习惯',date:'',done:false,example:true},
  ].map(item=>normalizeItem(item,'plan')));
  if (enabled('tasks') && (all || scope==='items' || scope==='tasks' || scope==='today' || scope==='calendar')) changes[dataKeys.tasks]=mergeExamples(readRecords(storage,dataKeys.tasks),[
    {id:'demo-task-1',title:'示例：完成课后练习',anchor:{type:'deadline',date:today,time:'18:30'},date:today,done:false,example:true},
    {id:'demo-task-2',title:'示例：预约图书馆讨论室',date:nextDay(1),done:false,example:true},
    {id:'demo-task-3',title:'示例：提交小组分工表',date:today,done:true,example:true},
    {id:'demo-task-4',title:'示例：整理学习桌',date:'',done:false,example:true},
  ].map(item=>normalizeItem(item,'task')));
  if (enabled('web-capture') && (all || scope==='web')) {
    const text=`校园学习活动示例通知\n请于 ${nextDay(2)} 前完成活动报名并提交报名表。\n请于 ${nextDay(3)} 前上传小组展示材料。\n活动地点：图书馆研讨室。\n重要提示：本通知为虚构示例，无需实际报名。`;
    const sample={id:'demo-web-notice',example:true,title:'示例：校园学习活动通知',url:'https://example.com/jiwei-demo-notice',capturedAt:new Date().toISOString(),text,links:[],directory:'',...organizeWebText({text},today)};
    changes[dataKeys.captures]=mergeExamples(readRecords(storage,dataKeys.captures),[sample]);
  }
  if (all && enabled('objects')) {
    const state=readObjects(storage),id='demo-object-course-v1';
    if(!state.objects.some(o=>o.id===id))state.objects.push({id,type:'course',title:'示例：高等数学学习',purpose:'围绕一门课程查看上课、作业、复习安排与原始要求。这里的内容均为虚构示例。',status:'active',example:true,createdAt:new Date().toISOString()});
    const table=(changes[dataKeys.tables]||JSON.parse(storage.getItem(dataKeys.tables)||'null'))?.tables.find(t=>t.example);
    const refs=[...(table?.courses.some(c=>c.id==='demo-course-1')?[{collection:'courseEntry',containerId:table.id,id:'demo-course-1'}]:[]),...['task','plan','capture'].flatMap(collection=>{const key={task:dataKeys.tasks,plan:dataKeys.plans,capture:dataKeys.captures}[collection],id={task:'demo-task-1',plan:'demo-plan-range-v1',capture:'demo-web-notice'}[collection];return (changes[key]||readRecords(storage,key)).some(r=>r.id===id)?[{collection,id}]:[];})];
    for(const ref of refs)if(!state.links.some(l=>refKey(l.ref)===refKey(ref)))state.links.push({objectId:id,ref,title:'虚构示例记录',example:true});
    changes[objectKey]=state;
  }
  if (!Object.keys(changes).length) throw new Error('没有已开启的示例功能，请先在插件管理中选择。');
  writeTogether(storage,changes);
  return Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,Array.isArray(value)?value.length:key===objectKey?value.objects.length:key===journalKey?value.entries.length:value.tables.length]));
}
