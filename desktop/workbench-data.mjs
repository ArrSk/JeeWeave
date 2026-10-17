import * as calendar from '../shared/packages/core/src/semester-calendar.mjs';
import { buildDemoTimetable } from './demo-timetable.mjs';
import { organizeWebText, validDate } from './web-extract.mjs';

export const dataKeys = { tables:'jiwei-desktop-timetables-v1', plans:'jiwei-desktop-plans', tasks:'jiwei-desktop-tasks', captures:'jiwei-desktop-web-collections-v1' };
export const readRecords = (storage,key) => JSON.parse(storage.getItem(key) || '[]');
export function writeTogether(storage, changes) {
  const old = Object.fromEntries(Object.keys(changes).map(key => [key,storage.getItem(key)]));
  const encoded = Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,JSON.stringify(value)]));
  try { for (const [key,value] of Object.entries(encoded)) storage.setItem(key,value); }
  catch (error) {
    for (const [key,value] of Object.entries(old)) {
      if (storage.getItem(key) === value) continue;
      if (value === null) storage.removeItem(key); else storage.setItem(key,value);
    }
    throw error;
  }
}
export function saveWebCapture(storage, source, today) {
  const url = new URL(source.url);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('来源网址必须是 HTTP 或 HTTPS。');
  const text = String(source.text || '').trim();
  if (!text) throw new Error('网页没有可整理的正文。');
  const records = readRecords(storage,dataKeys.captures);
  const existing = records.find(record => record.url === url.href && record.text === text);
  if (existing) return existing;
  const record = { id:`web-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, url:url.href, title:String(source.title || url.hostname), text, links:source.links || [], directory:source.directory || '', capturedAt:source.capturedAt || new Date().toISOString(), ...organizeWebText({text},today) };
  storage.setItem(dataKeys.captures,JSON.stringify([record,...records]));
  return record;
}
export function approveWebDraft(storage,captureId,draftId,fields) {
  const records = readRecords(storage,dataKeys.captures), tasks = readRecords(storage,dataKeys.tasks);
  const record = records.find(item=>item.id===captureId), draft = record?.drafts.find(item=>item.id===draftId);
  if (!draft) throw new Error('草稿已不存在，请重新打开网页记录。');
  if (draft.status === 'added') return { added:false };
  const title = String(fields.title || '').trim(), date = String(fields.date || '').trim();
  if (!title) throw new Error('请填写待办名称。');
  if (date && !validDate(date)) throw new Error('请填写有效日期。');
  const duplicate = tasks.find(item=>item.sourceUrl===record.url && item.title===title && item.date===date);
  const taskId = duplicate?.id || `web-task-${captureId}-${draftId}`;
  if (!duplicate) tasks.push({id:taskId,title,date,done:false,sourceUrl:record.url,sourceTitle:record.title,evidence:draft.evidence});
  Object.assign(draft,{title,date,status:'added',taskId});
  writeTogether(storage,{[dataKeys.tasks]:tasks,[dataKeys.captures]:records});
  return {added:!duplicate};
}
const mergeExamples = (old,examples) => [...old,...examples.filter(sample=>!old.some(item=>item.id===sample.id))];
export function loadWorkbenchExamples(storage,scope,today=calendar.today()) {
  if (!['all','overview','today','courses','plans','tasks','web'].includes(scope)) throw new Error('未知示例类型');
  const all = scope === 'all' || scope === 'overview';
  const nextDay = offset=>calendar.dateForWeek({startDate:today},1,offset+1);
  const changes = {};
  if (all || ['today','courses'].includes(scope)) {
    const snapshot = JSON.parse(storage.getItem(dataKeys.tables));
    if (!snapshot?.tables?.length) throw new Error('请先初始化课表。');
    let table = snapshot.tables.find(item=>item.example);
    if (!table) { table={id:`example_${Date.now()}`,example:true,name:'示例课表（可编辑）',startDate:calendar.mondayOf(today),totalWeeks:20,courses:[],schedule:snapshot.tables[0].schedule.map(item=>({...item}))}; snapshot.tables.push(table); }
    const samples = buildDemoTimetable();
    if (scope !== 'courses') samples.push({id:'demo-course-today',title:'示例：今日学习讨论',weekday:calendar.weekdayOf(today),periodStart:9,periodEnd:10,teacher:'示例教师',location:'图书馆研讨室',weeks:Array.from({length:20},(_,i)=>i+1),weekText:'每周',color:'cyan'});
    table.courses=mergeExamples(table.courses,samples); snapshot.activeId=table.id;
    changes[dataKeys.tables]=snapshot;
  }
  if (all || scope==='plans' || scope==='today') changes[dataKeys.plans]=mergeExamples(readRecords(storage,dataKeys.plans),[
    {id:'demo-plan-1',title:'示例：整理本周复习计划',date:today,done:false,example:true},
    {id:'demo-plan-2',title:'示例：准备课程小组展示',date:nextDay(3),done:false,example:true},
    {id:'demo-plan-3',title:'示例：建立学习资料目录',date:'',done:true,example:true},
  ]);
  if (all || scope==='tasks' || scope==='today') changes[dataKeys.tasks]=mergeExamples(readRecords(storage,dataKeys.tasks),[
    {id:'demo-task-1',title:'示例：完成课后练习',date:today,done:false,example:true},
    {id:'demo-task-2',title:'示例：预约图书馆讨论室',date:nextDay(1),done:false,example:true},
    {id:'demo-task-3',title:'示例：提交小组分工表',date:today,done:true,example:true},
  ]);
  if (all || scope==='web') {
    const text=`校园学习活动示例通知\n请于 ${nextDay(2)} 前完成活动报名并提交报名表。\n请于 ${nextDay(3)} 前上传小组展示材料。\n活动地点：图书馆研讨室。\n重要提示：本通知为虚构示例，无需实际报名。`;
    const sample={id:'demo-web-notice',example:true,title:'示例：校园学习活动通知',url:'https://example.com/jiwei-demo-notice',capturedAt:new Date().toISOString(),text,links:[],directory:'',...organizeWebText({text},today)};
    changes[dataKeys.captures]=mergeExamples(readRecords(storage,dataKeys.captures),[sample]);
  }
  writeTogether(storage,changes);
  return Object.fromEntries(Object.entries(changes).map(([key,value])=>[key,Array.isArray(value)?value.length:value.tables.length]));
}
