import test from 'node:test';
import assert from 'node:assert/strict';
import { moveStep, moveStamp, snapDelta, clampDelta } from './item-move.mjs';

test('挪动以一刻钟为步长，时间戳保留 +08:00 口径', () => {
  assert.equal(moveStep, 15);
  assert.equal(moveStamp('2026-11-08T09:00:00+08:00', 15), '2026-11-08T09:15:00+08:00');
  assert.equal(moveStamp('2026-11-08T09:00:00+08:00', -15), '2026-11-08T08:45:00+08:00');
  assert.equal(moveStamp('2026-11-08T23:50:00+08:00', 15), '2026-11-09T00:05:00+08:00', '跨过午夜时日期跟着变，由调用处夹回窗口');
  assert.throws(() => moveStamp('不是时间', 15), /时间格式无效/);
  assert.throws(() => moveStamp('2026-11-08T09:00:00+08:00', 7.5), /整分钟/);
});

test('像素位移按小时高度换算，并按一刻钟取整', () => {
  assert.equal(snapDelta(0, 88), 0);
  assert.equal(snapDelta(22, 88), 15, '88px 一小时时，22px 正好是一刻钟');
  assert.equal(snapDelta(21, 88), 15);
  assert.equal(snapDelta(20, 88), 15, '0.25 小时四舍五入到一刻钟');
  assert.equal(snapDelta(-22, 88), -15);
  assert.equal(snapDelta(352, 88), 240);
  assert.equal(snapDelta(10, 0), 0, '量不到刻度就不挪');
  assert.equal(snapDelta(10, NaN), 0);
  assert.equal(snapDelta('x', 88), 0);
});

test('落点先夹在当天窗口里，返回真正生效的位移', () => {
  assert.equal(clampDelta(600, 15, 360, 1440), 15);
  assert.equal(clampDelta(600, -300, 360, 1440), -240);
  assert.equal(clampDelta(600, 900, 360, 1440), 840);
  assert.equal(clampDelta(360, -15, 360, 1440), 0, '顶到窗口上沿就不动');
  assert.equal(clampDelta(1440, 15, 360, 1440), 0);
});
