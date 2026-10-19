import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultScheduleBatch, generateSchedule, validateSchedule, inferScheduleBatch } from './schedule.mjs';
test('按上午午后晚间、课长与两种课间隔生成连续节次，大课间不叠加普通间隔', () => {
  const result = generateSchedule(defaultScheduleBatch());
  assert.equal(result.length, 12); assert.deepEqual(result[0], { index: 1, start: '08:00', end: '08:45' });
  assert.equal(result[2].start, '10:00'); assert.equal(result[4].start, '14:00'); assert.equal(result[8].start, '18:30');
  assert.deepEqual(result.map(p => p.index), Array.from({ length: 12 }, (_, i) => i + 1));
});
test('可关闭晚课和大课间，自定义午后起点；推断设置不会修改已有作息', () => {
  const config = defaultScheduleBatch(); config.duration = 40; config.gap = 5; config.longBreakEvery = 0; config.groups[1].start = '13:30'; config.groups[2].count = 0;
  const result = generateSchedule(config); assert.equal(result.length, 8); assert.equal(result[2].start, '09:30'); assert.equal(result[4].start, '13:30');
  const snapshot = JSON.stringify(result); const inferred = inferScheduleBatch(result); assert.equal(inferred.groups[2].count, 0); assert.equal(inferred.duration, 40); assert.equal(JSON.stringify(result), snapshot);
});
test('拒绝午后重叠、跨午夜、非法节数与全空；旧作息参数不被修改', () => {
  const config = defaultScheduleBatch(); const original = JSON.stringify(config);
  assert.throws(() => generateSchedule({ ...config, duration: 0 }), /时长/);
  const overlap = structuredClone(config); overlap.groups[1].start = '10:00'; assert.throws(() => generateSchedule(overlap), /重叠/);
  const overnight = structuredClone(config); overnight.groups[2].start = '23:30'; assert.throws(() => generateSchedule(overnight), /午夜/);
  const empty = structuredClone(config); empty.groups.forEach(g => g.count = 0); assert.throws(() => generateSchedule(empty), /1–20/);
  assert.equal(JSON.stringify(config), original);
});
test('减少节次不得悬空已有课程，逐节编辑也检查重叠与倒序', () => {
  assert.throws(() => generateSchedule(defaultScheduleBatch(), 14), /第 14 节/);
  assert.throws(() => validateSchedule([{ index: 1, start: '08:00', end: '09:00' }, { index: 2, start: '08:50', end: '09:40' }]), /重叠/);
  assert.throws(() => validateSchedule([{ index: 1, start: '09:00', end: '08:00' }]), /晚于/);
  assert.throws(() => validateSchedule([{ index: 2, start: '08:00', end: '08:45' }]), /连续/);
});
