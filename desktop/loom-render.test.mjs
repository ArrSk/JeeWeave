import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loomWindowStart, loomY, loomTodayRows, loomOmen } from './loom-render.mjs';
import { normalizeItem } from './planning.mjs';

test('经纬时窗沿用小样的五点边界与真实时间换算', () => {
  assert.equal(loomWindowStart(300), 0);
  assert.equal(loomWindowStart(301), 360);
  assert.equal(loomY(480, 840), 176);
  assert.equal(loomY(480, 840, 80), 160);
});
test('经纬纸条一事项一条，跨日时段和未定时不虚构截止钟点，保持集合身份', () => {
  const date='2026-11-02';
  const items=[normalizeItem({id:'same',title:'未定时截止',anchor:{type:'deadline',date}}),normalizeItem({id:'same',title:'执行时段',anchor:{type:'floating'},executionSlots:[]},'plan')];
  const model={date,scheduledItems:items,work:[{ref:{collection:'plan',id:'same'},object:{title:'项目'},slots:[{start:'2026-11-01T23:00:00+08:00',end:'2026-11-02T08:00:00+08:00'}]}],courses:{entries:[]}};
  const before=JSON.stringify(model),rows=loomTodayRows(model);
  assert.equal(rows.length,2);
  assert.equal(rows[0].at,0);assert.equal(rows[0].object,'项目');assert.equal(rows[0].ref.collection,'plan');
  assert.equal(rows[1].at,null);assert.match(rows[1].time,/^截止 \d{2}:\d{2}$/);
  assert.equal(JSON.stringify(model),before);
});

test('先兆句按“还有多久”分档，且不编造钟点', () => {
  const rows=[{at:600,title:'组会'},{at:null,title:'未定时'}];
  assert.match(loomOmen(rows,540).html,/还有 <b>60<\/b> 分钟/);
  assert.match(loomOmen(rows,599).html,/还有 <b>1<\/b> 分钟/);
  // 刚好到点：说“正在”，不再说“还有 0 分钟”。
  assert.match(loomOmen(rows,600).html,/正在 <em>组会<\/em>/);
  assert.match(loomOmen(rows,400).html,/到 <b>10:00<\/b> 之前还空着/);
  assert.match(loomOmen(rows,700).html,/余下的都走完了/);
  assert.equal(loomOmen(rows,700).quiet,true);
});
