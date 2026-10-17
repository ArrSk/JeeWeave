import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimetableStore } from './timetable-store.mjs';
import { currentWeek, dateForWeek, mondayOf } from '../shared/packages/core/src/semester-calendar.mjs';
import { buildDemoTimetable } from './demo-timetable.mjs';

function memoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
test('旧课程、课表信息和作息迁移一次，删除原课表后不会迁入新课表', () => {
  const storage = memoryStorage({
    'jiwei-desktop-courses': JSON.stringify([{ id: 'legacy', title: '高等数学' }]),
    'jiwei-desktop-semester': JSON.stringify({ name: '秋季', startDate: '2026-09-07', totalWeeks: 25 }),
    'jiwei-desktop-schedule': JSON.stringify([{ index: 1, start: '09:00', end: '09:45' }]),
  });
  const store = createTimetableStore(storage);
  const original = store.current().id;
  assert.equal(store.current().name, '秋季');
  assert.equal(store.current().courses[0].id, 'legacy');
  const next = store.create({ name: '新学期', startDate: '2027-02-22', totalWeeks: 20 });
  assert.deepEqual(store.current().courses, []);
  assert.equal(store.current().schedule[0].start, '09:00');
  store.remove(original);
  const reopened = createTimetableStore(storage);
  assert.equal(reopened.current().id, next);
  assert.deepEqual(reopened.current().courses, []);
});
test('切换课表同时切换课程和作息，重开仍保留当前选择', () => {
  const storage = memoryStorage();
  const store = createTimetableStore(storage);
  const first = store.current().id;
  store.update({ courses: [{ id: 'course-a' }] });
  const second = store.create({ name: '辅修', startDate: '2026-09-07', totalWeeks: 18 });
  store.update({ courses: [{ id: 'course-b' }], schedule: [{ index: 1, start: '10:00', end: '10:50' }] });
  store.select(first);
  assert.equal(store.current().courses[0].id, 'course-a');
  assert.equal(store.current().schedule[0].start, '08:00');
  store.select(second);
  assert.equal(createTimetableStore(storage).current().courses[0].id, 'course-b');
  assert.equal(store.current().schedule[0].start, '10:00');
});
test('保存失败不会留下只在内存中生效的课表切换', () => {
  const storage = memoryStorage();
  const store = createTimetableStore(storage);
  const original = store.current();
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => store.create({ name: '无法写入', totalWeeks: 20 }), /quota/);
  assert.deepEqual(store.current(), original);
});
test('本周按开学日计算，首尾边界和跨月日期保持正确', () => {
  const semester = { startDate: '2026-09-07', totalWeeks: 20 };
  assert.equal(currentWeek(semester, '2026-10-16'), 6);
  assert.equal(currentWeek(semester, '2026-09-06'), 0);
  assert.equal(currentWeek(semester, '2027-05-01'), 21);
  assert.equal(dateForWeek(semester, 6, 5), '2026-10-16');
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.throws(() => currentWeek(semester, '2026-02-30'), /日期不存在/);
});

test('载入示例独立保存，不覆盖真实课表且重复点击不复制', () => {
  const storage = memoryStorage();
  const store = createTimetableStore(storage);
  store.update({ courses: [{ id: 'real', title: '真实课程' }] });
  const original = store.current().id;
  const metadata = { name: '示例课表', startDate: '2026-10-12', totalWeeks: 20 };
  store.loadExample(metadata, buildDemoTimetable());
  const exampleId = store.current().id;
  assert.equal(store.current().courses.length, 9);
  store.loadExample(metadata, buildDemoTimetable());
  assert.equal(store.current().id, exampleId);
  assert.equal(store.list().length, 2);
  assert.equal(store.current().courses.length, 9);
  store.select(original);
  assert.deepEqual(store.current().courses, [{ id: 'real', title: '真实课程' }]);
  store.remove(exampleId);
  store.loadExample(metadata, buildDemoTimetable());
  assert.equal(store.current().courses.length, 9);
});

test('示例含单双周、间隔周和连堂，载入失败时不会切走原课表', () => {
  const demo = buildDemoTimetable();
  assert.deepEqual(demo.find(course => course.weekText === '1-16单').weeks, [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(demo.find(course => course.weekText === '1-16双').weeks, [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.deepEqual(demo.find(course => course.title === '数据结构上机').weeks, [3, 6, 9, 12, 15, 18]);
  assert.equal(demo.find(course => course.title === '数据结构上机').periodEnd, 9);
  const storage = memoryStorage();
  const store = createTimetableStore(storage);
  const original = store.snapshot();
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => store.loadExample({ name: '示例' }, demo), /quota/);
  assert.deepEqual(store.snapshot(), original);
});
