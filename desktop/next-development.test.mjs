import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildItem, toggleItem, executionSlotsOnDate } from './planning.mjs';
import { projectCalendar } from './calendar.mjs';
import { splitTodayItems, createSearchService } from './workbench-views.mjs';
import { createItemService } from './item-service.mjs';
import { createCourseService, emptyCourseTable } from './course-service.mjs';
import { workspaceFromStorage, readWorkspaceBackup, workspaceStorageValue } from './workspace-format.mjs';

const slot = (id, start, extra = {}) => ({ id, start: `${start}T19:00:00+08:00`, end: `${start}T20:00:00+08:00`, ...extra });
function memory(seed = {}) { const data = new Map(Object.entries(seed)); return { get length() { return data.size; }, key: index => [...data.keys()][index], getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; }

test('重复执行安排跟随原定那次完成；挪到别日不改变重复规则或其他完成记录', () => {
  const item = buildItem({ type: 'weekly', title: '读书', date: '2026-10-19', weekdays: [1], executionSlots: [slot('s', '2026-10-21', { occurrenceDate: '2026-10-19' }), slot('next', '2026-10-28', { occurrenceDate: '2026-10-26' })] });
  assert.equal(splitTodayItems([item], '2026-10-21').scheduled.length, 1);
  const projection = projectCalendar([item], { start: '2026-10-19', end: '2026-10-28' });
  const moved = projection.entries.find(entry => entry.slotId === 's');
  assert.equal(moved.occurrenceDate, '2026-10-19');
  const done = toggleItem(item, moved.occurrenceDate);
  assert.deepEqual(done.completedDates, ['2026-10-19']); assert.deepEqual(done.anchor, item.anchor);
  assert.equal(executionSlotsOnDate(done, '2026-10-21').length, 0);
  assert.equal(projectCalendar([done], { start: '2026-10-19', end: '2026-10-28' }).entries.some(entry => entry.slotId === 's'), false);
  assert.equal(executionSlotsOnDate(done, '2026-10-28').length, 1);
  assert.throws(() => toggleItem(item, '2026-10-21'), /原定/);
  assert.throws(() => buildItem({ type: 'weekly', title: '错误本次', date: '2026-10-19', weekdays: [1], executionSlots: [slot('s', '2026-10-21', { occurrenceDate: '2026-10-20' })] }), /原定/);
});

test('阶段执行安排受阶段日期约束；完成阶段隐藏其时段，不完成整件事', () => {
  const fields = { type: 'range', title: '项目', date: '2026-10-19', endDate: '2026-10-30', deadlineDate: '2026-10-31', phases: [{ id: 'p', title: '准备', startDate: '2026-10-19', endDate: '2026-10-22' }], executionSlots: [slot('s', '2026-10-21', { phaseId: 'p' })] };
  const item = buildItem(fields), range = { start: '2026-10-19', end: '2026-10-31' };
  assert.equal(projectCalendar([item], range).entries.find(entry => entry.slotId === 's').phase.id, 'p');
  const done = { ...item, phases: [{ ...item.phases[0], done: true }] };
  assert.equal(done.done, false); assert.equal(executionSlotsOnDate(done, '2026-10-21').length, 0);
  assert.equal(projectCalendar([done], range).entries.some(entry => entry.slotId === 's'), false);
  assert.equal(projectCalendar([done], range).entries.some(entry => entry.type === 'deadline'), true);
  assert.throws(() => buildItem({ ...fields, executionSlots: [slot('s', '2026-10-23', { phaseId: 'p' })] }), /阶段.*范围/);
  assert.throws(() => buildItem({ ...fields, phases: [] }), /阶段不存在/);
  assert.equal(splitTodayItems([{ ...item, done: true }], '2026-10-21').scheduled.length, 0);
});

test('一次课来源与目标进入同一原子保存；调课停课删除及旧备份恢复不串改作业', () => {
  const storage = memory(), table = { ...emptyCourseTable(), id: 't', name: '学期', startDate: '2026-10-19', totalWeeks: 3, courses: [{ id: 'c', title: '高数', weekday: 1, periodStart: 1, periodEnd: 2, weeks: [1, 2, 3] }] };
  storage.setItem('jiwei-desktop-timetables-v1', JSON.stringify({ schemaVersion: 1, activeId: 't', tables: [table] }));
  const courses = createCourseService(storage), items = createItemService(storage, { courses: () => courses });
  const origin = { tableId: 't', courseId: 'c', originalDate: '2026-10-19', title: '高数' };
  const item = items.save({ type: 'deadline', title: '作业', date: '2026-10-25', goal: '掌握积分', completionCriteria: '交 PDF' }, { courseOrigin: origin });
  assert.deepEqual(item.courseOrigin, origin);
  assert.equal(items.courseContext(origin).status, 'found');
  courses.adjust('c', '2026-10-19', { action: 'move', date: '2026-10-20', periodStart: 3, periodEnd: 4, location: '新教室' });
  assert.equal(items.courseContext(origin).entries.some(entry => entry.isMovedIn), true);
  assert.equal(items.get({ collection: item.kind, id: item.id }).anchor.date, '2026-10-25');
  courses.adjust('c', '2026-10-19', { action: 'cancel' });
  assert.equal(items.courseContext(origin).entries[0].status, 'cancelled');
  const changedTable = structuredClone(table); changedTable.courses = [];
  storage.setItem('jiwei-desktop-timetables-v1', JSON.stringify({ schemaVersion: 1, activeId: 't', tables: [changedTable] }));
  assert.equal(items.courseContext(origin).status, 'missing');
  const edited = items.save({ type: 'deadline', title: '作业更新', date: '2026-10-25' }, { ref: { collection: item.kind, id: item.id } });
  assert.equal(edited.goal, item.goal); assert.deepEqual(edited.courseOrigin, origin); assert.equal(edited.id, item.id);
  const snapshot = workspaceFromStorage(storage), restored = readWorkspaceBackup(snapshot, snapshot);
  const records = JSON.parse(workspaceStorageValue(restored, 'jiwei-desktop-tasks'));
  assert.equal(records[0].completionCriteria, '交 PDF'); assert.deepEqual(records[0].courseOrigin, origin);
  const before = storage.getItem('jiwei-desktop-tasks');
  assert.throws(() => items.save({ type: 'longterm', title: '坏来源' }, { courseOrigin: origin }), /课次/);
  assert.equal(storage.getItem('jiwei-desktop-tasks'), before);
});

test('统一搜索涵盖原文、目标与归属；禁用/失败来源不泄露缓存，也不拖垮其他结果', () => {
  const storage = memory(), itemService = createItemService(storage);
  itemService.save({ type: 'longterm', title: '作业', goal: '积分复习' });
  let notesEnabled = true;
  const host = { use: name => ({
    items: itemService,
    journal: { list: () => [{ id: 'n', body: '积分方法的感受', title: '心得' }] },
    objects: { read: () => ({ objects: [{ id: 'o', title: '高数', purpose: '积分' }], links: [{ objectId: 'o', ref: { collection: 'journalEntry', id: 'n' } }] }) },
    courses: { listEntries: () => [] },
    'web-captures': { list: () => { throw Error('unavailable'); } },
  })[name] };
  const search = createSearchService(host, { enabled: id => id !== 'notes' || notesEnabled });
  assert.equal(search.query({ text: '积分' }).total, 3);
  assert.equal(search.query({ text: '积分', collection: 'items' }).total, 1);
  assert.equal(search.query({ text: '积分', objectId: 'o' }).total, 2);
  notesEnabled = false;
  const result = search.query({ text: '积分' });
  assert.equal(result.results.some(entry => entry.ref.collection === 'journalEntry'), false);
  assert.deepEqual(result.errors, ['网页']); assert.equal(result.total, 2);
});
