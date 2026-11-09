import test from 'node:test';
import assert from 'node:assert/strict';
import { homeworkWindow, homeworkKeyOf, readHomework, markHomework, homeworkCandidate } from './homework.mjs';

const memory = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
};
const table = {
  id: 'table_main',
  schedule: [
    { index: 1, start: '08:00', end: '08:45' },
    { index: 2, start: '08:55', end: '09:40' },
    { index: 3, start: '14:00', end: '14:45' }
  ]
};
const entry = (id, periodEnd, more = {}) => ({ occurrenceId: `${id}:source`, courseId: id, originalDate: '2026-11-08', title: id === 'a' ? '高数' : '英语', periodStart: 1, periodEnd, status: 'normal', ...more });
const courses = { table, entries: [entry('a', 1), entry('b', 3)] };

test('只问六小时内上完、状态正常的课，按最近下课优先', () => {
  assert.equal(homeworkWindow, 360);
  assert.equal(homeworkCandidate(courses, 8 * 60 + 44), null, '还没下课不问');
  assert.equal(homeworkCandidate(courses, 9 * 60 + 40).title, '高数');
  assert.equal(homeworkCandidate(courses, 11 * 60 + 40).title, '高数', '下课后六小时内仍在窗口里');
  assert.equal(homeworkCandidate({ table, entries: [entry('a', 1)] }, 16 * 60), null, '下课超过六小时就不再问');
  assert.equal(homeworkCandidate({ table, entries: [entry('a', 1, { status: 'cancelled' }), entry('b', 3)] }, 15 * 60).title, '英语', '停课不问');
  assert.equal(homeworkCandidate({ table, entries: [entry('a', 1, { status: 'moved' })] }, 10 * 60), null, '调出的课次不问');
  assert.equal(homeworkCandidate({ table, entries: [entry('a', 2, { status: 'normal', isMovedIn: true })] }, 10 * 60).title, '高数', '调入的课次照常问');
  assert.equal(homeworkCandidate(courses, 14 * 60 + 45).title, '英语', '两节都在窗口里时先问最近下课的');
  assert.equal(homeworkCandidate(null, 600), null);
});

test('问过或已经记过东西的课次跳过，接着看下一节', () => {
  const aKey = homeworkKeyOf('table_main', 'a:source');
  assert.equal(homeworkCandidate(courses, 14 * 60, key => key === aKey), null, '问过的高数跳过，英语还没下课');
  assert.equal(homeworkCandidate(courses, 14 * 60, () => true), null);
  assert.equal(homeworkCandidate({ table, entries: [entry('a', 1)] }, 14 * 60, () => false, () => true), null, '已经记过东西就不再问');
  assert.equal(homeworkCandidate({ table, entries: [entry('b', 3)] }, 15 * 60, key => key === homeworkKeyOf('table_main', 'b:source')), null, '问过的英语不再问');
});

test('已问记录只在本机追加，去重且不会无限增长', () => {
  const storage = memory();
  assert.deepEqual(readHomework(storage), []);
  storage.setItem('jiwei-desktop-homework-v1', '{坏数据');
  assert.deepEqual(readHomework(storage), []);
  assert.deepEqual(markHomework(storage, 't:s'), ['t:s']);
  assert.deepEqual(markHomework(storage, 't:s'), ['t:s']);
  assert.deepEqual(readHomework(storage), ['t:s']);
  for (let i = 0; i < 305; i++) markHomework(storage, `t:${i}`);
  const keys = readHomework(storage);
  assert.equal(keys.length, 300);
  assert.equal(keys.includes('t:s'), false, '超过上限时先忘掉最早的');
  assert.equal(keys.at(-1), 't:304');
  assert.throws(() => markHomework(storage, ''), /编号无效/);
  assert.throws(() => homeworkKeyOf('', 'x'), /缺少课次身份/);
});
