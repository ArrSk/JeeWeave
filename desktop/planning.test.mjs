import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItem, normalizeItem, validateItem, isOnDate, isOverdue, isComplete, toggleItem, describeItem, sortItems } from './planning.mjs';
const day = '2026-10-19';
test('旧待办和计划保持 ID、完成状态与来源；无日期不伪造截止日期', () => {
  const item = normalizeItem({ id: 'old', title: '旧待办', date: day, done: true, sourceUrl: 'https://example.com' });
  const next = buildItem({ title: '修改', date: '' }, item);
  assert.equal(next.id, 'old'); assert.equal(next.done, true); assert.equal(next.sourceUrl, item.sourceUrl);
  assert.deepEqual(next.anchor, { type: 'floating' }); assert.equal(isOnDate(next, day), false);
  assert.deepEqual(normalizeItem({ id: 'old-plan', title: '旧计划日期', date: day }, 'plan').anchor, { type: 'allDay', date: day });
  assert.throws(() => normalizeItem({ ...item, schemaVersion: 2 }), /版本/);
});
test('当天全天截止到 23:59；安排区间与最后完成期限分别保留', () => {
  const task = buildItem({ title: '提交', date: day });
  assert.equal(isOverdue(task, day, '12:00'), false); assert.equal(isOverdue(task, '2026-10-20'), true);
  const plan = buildItem({ type: 'range', title: '项目', date: day, endDate: '2026-10-25', deadlineDate: '2026-10-24' }, null, 'plan');
  assert.equal(isOnDate(plan, day), true); assert.equal(isOnDate(plan, '2026-10-26'), false);
  assert.equal(isOverdue(plan, '2026-10-25'), true); assert.match(describeItem(plan), /截止 2026-10-24/);
  assert.throws(() => buildItem({ type: 'range', title: '错序', date: day, endDate: '2026-10-18' }, null, 'plan'), /早于/);
});
test('区间阶段只能位于父区间，编辑保留阶段完成与编号；不默改为其他类型', () => {
  const fields = { type: 'range', title: '分阶段项目', date: day, endDate: '2026-10-25', phases: [{ id: 'phase-1', title: '准备', startDate: day, endDate: '2026-10-20', done: true }] };
  const plan = buildItem(fields, null, 'plan'); const edited = buildItem({ ...fields, title: '编辑后' }, plan, 'plan');
  assert.equal(edited.id, plan.id); assert.equal(edited.createdAt, plan.createdAt); assert.equal(edited.phases[0].done, true); assert.equal(edited.phases[0].id, 'phase-1');
  assert.throws(() => buildItem({ ...fields, endDate: day }, plan, 'plan'), /阶段日期/);
  assert.throws(() => validateItem({ ...plan, anchor: { type: 'floating' } }), /阶段任务/);
});
test('每周重复按星期和有效区间出现，只完成本次，不结束后续重复', () => {
  const plan = buildItem({ type: 'weekly', title: '阅读', date: day, until: '2026-10-30', weekdays: [1, 3], timed: false }, null, 'plan');
  assert.equal(isOnDate(plan, day), true); assert.equal(isOnDate(plan, '2026-10-20'), false);
  const done = toggleItem(plan, day); assert.equal(isComplete(done, day), true); assert.equal(isOnDate(done, '2026-10-21'), true);
  assert.equal(isOnDate(done, '2026-11-02'), false); assert.equal(isComplete(toggleItem(done, day), day), false);
  assert.throws(() => buildItem({ type: 'weekly', title: '缺星期', date: day, weekdays: [] }, null, 'plan'), /星期/);
});
test('固定时段与全天分别保存，拒绝半个时段和非法日期；排序不丢掉无期限项', () => {
  const event = buildItem({ type: 'event', title: '讨论', date: day, timed: true, startTime: '14:00', endTime: '15:00' }, null, 'plan');
  assert.equal(event.anchor.type, 'absolute'); assert.match(describeItem(event), /14:00–15:00/);
  assert.equal(buildItem({ type: 'event', title: '全天', date: day, timed: false }, null, 'plan').anchor.type, 'allDay');
  assert.throws(() => buildItem({ type: 'weekly', title: '半时段', date: day, weekdays: [1], timed: true, startTime: '14:00', endTime: '' }, null, 'plan'), /完整/);
  assert.throws(() => buildItem({ title: '坏日期', date: '2026-02-30' }), /有效日期/);
  const loose = buildItem({ title: '无期限', date: '' }), due = buildItem({ title: '有期限', date: day });
  assert.deepEqual(sortItems([loose, due], day).map(i => i.title), ['有期限', '无期限']);
});
