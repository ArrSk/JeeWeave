import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarService } from './calendar-service.mjs';
import { normalizeItem } from './planning.mjs';
import { changeOccurrence } from './course-occurrences.mjs';

test('object calendar keeps task/plan and table identities, floating work and moved lessons without writes', () => {
  const table={id:'table',name:'秋季',startDate:'2026-10-19',totalWeeks:8,schedule:[{index:1,start:'08:00',end:'08:45'}],courses:[{id:'same',title:'高数',weekday:1,periodStart:1,periodEnd:1,weeks:[1]}]};
  table.adjustments=changeOccurrence(table,'same','2026-10-19',{action:'move',date:'2026-10-21',periodStart:1,periodEnd:1});
  const records=[normalizeItem({id:'same',title:'作业',anchor:{type:'deadline',date:'2026-10-20'}},'task'),normalizeItem({id:'same',title:'其他计划',anchor:{type:'allDay',date:'2026-10-20'}},'plan'),normalizeItem({id:'free',title:'无日期作业',anchor:{type:'floating'}},'task')];
  const scope={object:{id:'o',title:'高数'},entries:[{ref:{collection:'task',id:'same'}},{ref:{collection:'task',id:'free'}},{ref:{collection:'courseEntry',containerId:'table',id:'same'},source:{table}}]};
  const before=JSON.stringify({records,scope});let writes=0,enabled=true;
  const api=createCalendarService({setItem(){writes++;}}, {enabled:id=>id!=='objects'||enabled,items:()=>({list:k=>records.filter(r=>r.kind===k)}),courses:()=>({current:()=>({...table,id:'other-table'})}),objects:()=>({detail:()=>scope})});
  const filters={tasks:true,plans:true,courses:true,completed:false,phases:true},range={start:'2026-10-19',end:'2026-10-25'};
  const model=api.query(range,filters,{objectId:'o'});
  assert.ok(model.entries.some(e=>e.title==='作业'));assert.ok(!model.entries.some(e=>e.title==='其他计划'));
  assert.deepEqual(model.floating.map(r=>r.id),['free']);
  assert.ok(model.entries.some(e=>e.course?.isMovedIn&&e.start==='2026-10-21'&&e.containerId==='table'));
  assert.ok(model.entries.filter(e=>e.course).every(e=>e.containerId==='table'));
  assert.equal(writes,0);assert.equal(JSON.stringify({records,scope}),before);
  enabled=false;assert.throws(()=>api.query(range,filters,{objectId:'o'}),/对象筛选暂不可用/);
  assert.ok(api.query(range,filters).entries.some(e=>e.title==='其他计划'),'clear scope still works after objects is disabled');
});
