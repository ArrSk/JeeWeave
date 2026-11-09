import { itemTimeParts } from './planning.mjs';

// 一格一刻钟：拖动、Alt↑↓ 与落点提示共用一个步长。
export const moveStep = 15;

// 执行时段与事件锚点都存成 +08:00 的整分钟字符串；这里只平移时间戳，不换日期口径。
export function moveStamp(stamp, minutes) {
  if (!Number.isInteger(minutes)) throw Error('挪动步长必须是整分钟。');
  const at = Date.parse(stamp);
  if (!Number.isFinite(at)) throw Error('时间格式无效，无法挪动。');
  const parts = itemTimeParts(new Date(at + minutes * 60000).toISOString());
  return `${parts.date}T${parts.time}:00+08:00`;
}

// 像素位移换算成 15 分钟的步数；读不到小时高度就不挪，避免按错误刻度写数据。
export function snapDelta(dy, hourHeight) {
  const hour = Number(hourHeight);
  if (!Number.isFinite(hour) || hour <= 0 || !Number.isFinite(Number(dy))) return 0;
  return Math.round((Number(dy) * 60 / hour) / moveStep) * moveStep;
}

// 落点先夹在今天的窗口里，再返回真正生效的位移，拖出边界时不会把事项挪到昨天或明天。
export function clampDelta(minute, delta, floor, ceiling) {
  const target = Math.max(floor, Math.min(ceiling, Number(minute) + Number(delta)));
  return target - Number(minute);
}
