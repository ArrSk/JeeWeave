import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, calendarRange, shiftCalendar, projectCalendar, calendarWeekLanes, timedCalendarSegments, normalizeCalendarPreferences, calendarPreferenceKey } from './calendar.mjs';
import { normalizeItem, toggleItem } from './planning.mjs';
import { emptyWorkspace, validateWorkspace, workspaceFromStorage, workspaceStorageValue, createWorkspaceStorage } from './workspace-format.mjs';
import { availableModules, isModuleAvailable, normalizeModules } from './modules.mjs';
import { loadWorkbenchExamples, dataKeys } from './workbench-data.mjs';
const plan=(id,anchor,extra={})=>normalizeItem({id,title:id,anchor,...extra},'plan');
const range={start:'2026-10-01',end:'2026-10-31'};
test('calendar defaults to month and includes six Monday-first weeks across year boundaries',()=>{
  assert.equal(normalizeCalendarPreferences().view,'month');
  assert.equal(calendarRange('2026-10-18').start,'2026-09-28');
  assert.equal(calendarRange('2026-10-18').days.length,42);
  assert.equal(calendarRange('2027-01-01','week').start,'2026-12-28');
  assert.deepEqual(calendarRange('2026-10-18','day').days,['2026-10-18']);
  assert.equal(shiftCalendar('2024-01-31',1,'month'),'2024-02-29');
  assert.equal(shiftCalendar('2026-12-31',1,'month'),'2027-01-31');
  assert.equal(addDays('2026-01-01',-1),'2025-12-31');
  assert.throws(()=>calendarRange('invalid')); assert.throws(()=>normalizeCalendarPreferences({schemaVersion:2}));
});
test('duration, phase, independent deadline and floating records remain distinct projections',()=>{
  const items=[plan('project',{type:'range',start:'2026-09-29',end:'2026-10-05'},{deadline:{date:'2026-10-08',time:'18:00'},phases:[{id:'p',title:'research',startDate:'2026-10-01',endDate:'2026-10-02'},{id:'no-date',title:'undated phase'}]}),plan('floating',{type:'floating'}),normalizeItem({id:'task',title:'due',date:'2026-10-04'},'task')];
  const before=JSON.stringify(items),result=projectCalendar(items,range);
  assert.equal(result.entries.length,4);assert.equal(result.floating.length,1);
  assert.equal(result.entries.filter(e=>e.type==='deadline').length,2);
  assert.equal(result.entries.find(e=>e.type==='phase').parentTitle,'project');
  assert.equal(projectCalendar(items,{start:'2026-10-09',end:'2026-10-09'}).entries.length,0,'overdue deadlines do not repeat across the calendar');
  assert.equal(JSON.stringify(items),before,'projections never modify business records');
});
test('midnight end is exclusive for timed events and timed ranges; whole-day ranges remain inclusive',()=>{
  const items=[plan('absolute',{type:'absolute',start:'2026-10-01T23:00:00+08:00',end:'2026-10-02T00:00:00+08:00'}),plan('timed-range',{type:'range',start:'2026-10-01',end:'2026-10-02',startTime:'23:00',endTime:'00:00'}),plan('all-day',{type:'range',start:'2026-10-01',end:'2026-10-02'})];
  const {entries}=projectCalendar(items,range);
  assert.equal(entries.find(e=>e.itemId==='all-day').end,'2026-10-02');
  assert.equal(timedCalendarSegments(entries,'2026-10-02').length,0);
  assert.equal(timedCalendarSegments(entries,'2026-10-01')[0].end,1440);
  const utc=projectCalendar([plan('utc',{type:'absolute',start:'2026-09-30T23:30:00Z',end:'2026-10-01T00:30:00Z'})],range).entries[0];
  assert.equal(utc.start,'2026-10-01');assert.equal(utc.startTime,'07:30');
});
test('weekly recurrence honors bounds and completes only the chosen occurrence',()=>{
  let item=plan('weekly',{type:'weekly',startDate:'2026-10-05',until:'2026-10-19',weekdays:[1],startTime:'09:00',endTime:'10:00'});
  assert.deepEqual(projectCalendar([item],range).entries.map(e=>e.occurrenceDate),['2026-10-05','2026-10-12','2026-10-19']);
  item=toggleItem(item,'2026-10-12');
  assert.deepEqual(projectCalendar([item],range).entries.map(e=>e.occurrenceDate),['2026-10-05','2026-10-19']);
  assert.equal(projectCalendar([item],range,{completed:true}).entries.find(e=>e.occurrenceDate==='2026-10-12').done,true);
});
test('completed phases filter independently, and plan completion hides its phases',()=>{
  const item=plan('project',{type:'range',start:'2026-10-01',end:'2026-10-10'},{phases:[{id:'a',title:'done',startDate:'2026-10-02',endDate:'2026-10-03',done:true},{id:'b',title:'active',startDate:'2026-10-04',endDate:'2026-10-05',done:false}]});
  assert.equal(projectCalendar([item],range).entries.length,2);
  assert.equal(projectCalendar([item],range,{phases:false}).entries.length,1);
  assert.equal(projectCalendar([{...item,done:true}],range).entries.length,0);
  assert.equal(projectCalendar([{...item,done:true}],range,{completed:true}).entries.length,3);
});
test('month lanes clip spans at week boundaries without overlapping cells',()=>{
  const entries=projectCalendar([plan('long',{type:'range',start:'2026-09-25',end:'2026-10-10'}),plan('short',{type:'range',start:'2026-10-01',end:'2026-10-02'}),plan('later',{type:'allDay',date:'2026-10-03'})],range).entries;
  const segments=calendarWeekLanes(entries,'2026-09-28');
  assert.equal(segments[0].span,7);assert.equal(segments[0].continuesBefore,true);assert.equal(segments[0].continuesAfter,true);
  for(const a of segments)for(const b of segments)if(a!==b&&a.lane===b.lane)assert.ok(a.end<b.start||b.end<a.start);
  assert.equal(segments.find(s=>s.entry.itemId==='later').lane,1);
});
test('timed overlaps share columns while adjacent appointments reclaim full width',()=>{
  const {entries}=projectCalendar([plan('a',{type:'range',start:'2026-10-01',end:'2026-10-01',startTime:'09:00',endTime:'10:00'}),plan('b',{type:'range',start:'2026-10-01',end:'2026-10-01',startTime:'09:30',endTime:'10:30'}),plan('c',{type:'range',start:'2026-10-01',end:'2026-10-01',startTime:'11:00',endTime:'11:05'})],range);
  const segments=timedCalendarSegments(entries,'2026-10-01');
  assert.equal(segments[0].laneCount,2);assert.equal(segments[1].lane,1);assert.equal(segments[2].laneCount,1);
  assert.equal(segments[2].end,665);assert.equal(segments[2].displayEnd,705,'display height never rewrites precise time');
});
test('calendar preferences migrate and restore in the same versioned workspace',async()=>{
  const values=new Map(),cache={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const prefs={...normalizeCalendarPreferences(),view:'week'};cache.setItem(calendarPreferenceKey,JSON.stringify(prefs));
  const file=workspaceFromStorage(cache);assert.equal(file.data.preferences.calendar.view,'week');assert.equal(file.data.extensions[calendarPreferenceKey],undefined);
  const adapter=await createWorkspaceStorage(cache);adapter.restore(validateWorkspace(emptyWorkspace()));
  assert.equal(JSON.parse(cache.getItem(calendarPreferenceKey)).view,'month');
  assert.equal(JSON.parse(workspaceStorageValue(file,calendarPreferenceKey)).view,'week');
});
test('suspended chat keeps its saved switch while only calendar is exposed; calendar examples are isolated',()=>{
  assert.equal(isModuleAvailable('chat-monitor'),false);assert.equal(availableModules.some(i=>i.id==='chat-monitor'),false);
  assert.equal(normalizeModules({schemaVersion:1,enabled:{'chat-monitor':true}}).enabled['chat-monitor'],true);
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  storage.setItem('jiwei-desktop-developer-mode','true');loadWorkbenchExamples(storage,'calendar','2026-10-18');const snapshot=JSON.stringify([...values]);loadWorkbenchExamples(storage,'calendar','2026-10-18');
  assert.equal(JSON.stringify([...values]),snapshot);assert.ok(values.has(dataKeys.plans));assert.ok(values.has(dataKeys.tasks));assert.equal(values.has(dataKeys.tables),false);assert.equal(values.has(dataKeys.captures),false);
});

test('具体截止时间投影为时间点，考试和旧待办时段均进入时间轴，午夜附近仍完整可点', () => {
  const items = [normalizeItem({ id: 'due', title: '提交作业', anchor: { type: 'deadline', date: '2026-10-01', time: '23:59' } }, 'task'), plan('exam', { type: 'absolute', start: '2026-10-01T09:00:00+08:00', end: '2026-10-01T11:00:00+08:00' }, { eventType: 'exam', deadline: { date: '2026-10-01', time: '08:30' } }), normalizeItem({ id: 'due', title: '同编号原计划', anchor: { type: 'allDay', date: '2026-10-01' } }, 'plan')];
  const before = JSON.stringify(items), { entries } = projectCalendar(items, range), segments = timedCalendarSegments(entries, '2026-10-01');
  assert.equal(entries.length, 4); assert.equal(new Set(entries.map(e => e.id)).size, 4, '不同旧集合的同名编号不能碰撞');
  assert.equal(entries.find(e => e.itemId === 'exam' && e.type === 'schedule').eventType, 'exam');
  assert.equal(segments.length, 3); assert.equal(segments.find(s => s.entry.itemId === 'exam' && !s.entry.point).start, 540);
  const due = segments.find(s => s.entry.itemId === 'due'); assert.equal(due.start, 1439); assert.equal(due.end, 1439); assert.equal(due.entry.point, true); assert.equal(due.displayEnd, 1440); assert.equal(due.displayEnd - due.displayStart, 45);
  assert.equal(entries.filter(e => e.allDay).length, 1); assert.equal(JSON.stringify(items), before);
});

test('旧单边功能开关与日历过滤保持原值，合并读取不静默启用或删除另一边', () => {
  const state = normalizeModules({ schemaVersion: 1, enabled: { plans: false, tasks: true } });
  assert.equal(state.enabled.plans, false); assert.equal(state.enabled.tasks, true);
  const old = { schemaVersion: 1, view: 'day', filters: { plans: false, tasks: true, phases: true, completed: false } };
  assert.deepEqual(normalizeCalendarPreferences(old), {...old,filters:{...old.filters,courses:true}});
});
