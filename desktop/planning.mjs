import { validDate } from './web-extract.mjs';
import { weekdayOf } from '../shared/packages/core/src/semester-calendar.mjs';

export const planTypes = { deadline: '截止事项', longterm: '长期 / 无期限', range: '区间计划', event: '定时 / 全天事项', weekly: '每周重复' };
const stamp = () => new Date().toISOString();
const newId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const timeValid = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function normalizeItem(item, kind = 'task') {
  if (item.schemaVersion !== undefined && item.schemaVersion !== 1) throw new Error('事项格式版本不兼容，请使用支持该数据的版本。');
  const anchor = item.anchor || (item.date ? { type: kind === 'plan' ? 'allDay' : 'deadline', date: item.date } : { type: 'floating' });
  return { ...item, schemaVersion: 1, kind, anchor, phases: item.phases || [], completedDates: item.completedDates || [], createdAt: item.createdAt || '', updatedAt: item.updatedAt || '' };
}
export function typeOf(item) {
  const type = normalizeItem(item).anchor.type;
  return ({ floating: 'longterm', deadline: 'deadline', range: 'range', weekly: 'weekly', absolute: 'event', allDay: 'event' })[type];
}
function checkDate(value) { if (!validDate(value || '')) throw new Error('请填写有效日期。'); }
function checkTimes(start, end) { if (!timeValid(start) || !timeValid(end)) throw new Error('请完整填写开始与结束时间。'); }
export function validateItem(input) {
  const item = normalizeItem(input, input.kind || 'task'), a = item.anchor;
  if (!item.id || !String(item.title || '').trim()) throw new Error('请填写事项名称。');
  if (!['task', 'plan'].includes(item.kind) || !typeOf(item)) throw new Error('不支持的事项类型。');
  if (item.kind === 'task' && !['floating', 'deadline'].includes(a.type)) throw new Error('区间和重复事项请在计划中管理。');
  if (['deadline', 'allDay'].includes(a.type)) checkDate(a.date);
  if (a.type === 'deadline' && a.time && !timeValid(a.time)) throw new Error('截止时间无效。');
  if (a.type === 'range') {
    checkDate(a.start); checkDate(a.end);
    if (a.end < a.start) throw new Error('结束日期不能早于开始日期。');
    if (a.startTime || a.endTime) {
      checkTimes(a.startTime, a.endTime);
      if (`${a.end}T${a.endTime}` <= `${a.start}T${a.startTime}`) throw new Error('结束时间必须晚于开始时间。');
    }
  }
  if (a.type === 'absolute') {
    checkDate(a.start?.slice(0, 10)); checkDate(a.end?.slice(0, 10));
    checkTimes(a.start.slice(11, 16), a.end.slice(11, 16));
    if (!Number.isFinite(Date.parse(a.start)) || Date.parse(a.end) <= Date.parse(a.start)) throw new Error('结束时间必须晚于开始时间。');
  }
  if (a.type === 'weekly') {
    checkDate(a.startDate);
    if (a.until) { checkDate(a.until); if (a.until < a.startDate) throw new Error('重复结束日期不能早于开始日期。'); }
    if (!Array.isArray(a.weekdays) || !a.weekdays.length || new Set(a.weekdays).size !== a.weekdays.length || a.weekdays.some(d => !Number.isInteger(d) || d < 1 || d > 7)) throw new Error('请选择有效的重复星期。');
    if (a.startTime || a.endTime) { checkTimes(a.startTime, a.endTime); if (a.endTime <= a.startTime) throw new Error('结束时间必须晚于开始时间。'); }
  }
  if (item.deadline) {
    checkDate(item.deadline.date);
    if (item.deadline.time && !timeValid(item.deadline.time)) throw new Error('截止时间无效。');
  }
  if (!Array.isArray(item.completedDates) || item.completedDates.some(d => !validDate(d))) throw new Error('完成记录日期无效。');
  if (!Array.isArray(item.phases) || new Set(item.phases.map(p => p.id)).size !== item.phases.length) throw new Error('阶段编号重复。');
  for (const phase of item.phases) {
    if (a.type !== 'range') throw new Error('阶段任务只能添加到区间计划中。');
    if (!phase.id || !String(phase.title || '').trim()) throw new Error('请填写阶段任务名称。');
    if (phase.startDate || phase.endDate) {
      checkDate(phase.startDate); checkDate(phase.endDate);
      if (phase.startDate < a.start || phase.endDate > a.end || phase.endDate < phase.startDate) throw new Error('阶段日期必须位于计划区间内，结束不能早于开始。');
    }
  }
  return item;
}
export function buildItem(fields, existing, kind = 'task') {
  const type = kind === 'task' ? (fields.date ? 'deadline' : 'longterm') : fields.type;
  let anchor;
  if (type === 'longterm') anchor = { type: 'floating' };
  else if (type === 'deadline') anchor = { type: 'deadline', date: fields.date, ...(fields.startTime ? { time: fields.startTime } : {}) };
  else if (type === 'range') anchor = { type: 'range', start: fields.date, end: fields.endDate, ...(fields.timed ? { startTime: fields.startTime, endTime: fields.endTime } : {}) };
  else if (type === 'weekly') anchor = { type: 'weekly', startDate: fields.date, weekdays: fields.weekdays, ...(fields.until ? { until: fields.until } : {}), ...(fields.timed ? { startTime: fields.startTime, endTime: fields.endTime } : {}) };
  else if (type === 'event') anchor = fields.timed ? { type: 'absolute', start: `${fields.date}T${fields.startTime}:00+08:00`, end: `${fields.date}T${fields.endTime}:00+08:00` } : { type: 'allDay', date: fields.date };
  else throw new Error('请选择事项类型。');
  const at = stamp();
  const item = { ...existing, schemaVersion: 1, id: existing?.id || newId(kind), kind, title: String(fields.title || '').trim(), note: String(fields.note || '').trim(), anchor, date: anchor.date || anchor.start?.slice(0, 10) || anchor.startDate || '', done: existing?.done || false, createdAt: existing?.createdAt || at, updatedAt: at, completedDates: anchor.type === 'weekly' ? existing?.completedDates || [] : [], deadline: fields.deadlineDate && type !== 'deadline' ? { date: fields.deadlineDate, ...(fields.deadlineTime ? { time: fields.deadlineTime } : {}) } : null, phases: type === 'range' ? (fields.phases || []).map(phase => ({ ...phase, id: phase.id || newId('phase'), title: String(phase.title || '').trim(), done: phase.done || false, createdAt: phase.createdAt || at, updatedAt: at })) : [] };
  return validateItem(item);
}
export function isComplete(input, date) {
  const item = normalizeItem(input);
  return item.anchor.type === 'weekly' ? item.completedDates.includes(date) : item.done === true;
}
export function toggleItem(input, date) {
  const item = normalizeItem(input, input.kind || 'task');
  return { ...item, ...(item.anchor.type === 'weekly' ? { completedDates: isComplete(item, date) ? item.completedDates.filter(d => d !== date) : [...item.completedDates, date] } : { done: !item.done }), updatedAt: stamp() };
}
export function isOnDate(input, date) {
  const item = normalizeItem(input), a = item.anchor;
  if (isComplete(item, date)) return false;
  if (a.type === 'floating') return false;
  if (a.type === 'deadline') return a.date <= date;
  if (a.type === 'allDay') return a.date === date;
  if (a.type === 'absolute') return a.start.slice(0, 10) <= date && a.end.slice(0, 10) >= date;
  if (a.type === 'range') return a.start <= date && a.end >= date;
  return a.startDate <= date && (!a.until || a.until >= date) && a.weekdays.includes(weekdayOf(date));
}
export function deadlineOf(input) { const item = normalizeItem(input); return item.anchor.type === 'deadline' ? item.anchor : item.deadline; }
export function isOverdue(item, date, time = '00:00') {
  const due = deadlineOf(item);
  return !isComplete(item, date) && !!due && `${due.date}T${due.time || '23:59'}` < `${date}T${time}`;
}
export function describeItem(input) {
  const item = normalizeItem(input), a = item.anchor;
  let text;
  if (a.type === 'floating') text = '无期限 · 按自己的节奏推进';
  if (a.type === 'deadline') text = `${a.date}${a.time ? ` ${a.time}` : ''} 截止`;
  if (a.type === 'allDay') text = `${a.date} · 全天`;
  if (a.type === 'absolute') text = `${a.start.slice(0, 10)} · ${a.start.slice(11, 16)}–${a.end.slice(11, 16)}`;
  if (a.type === 'range') text = `${a.start}${a.startTime ? ` ${a.startTime}` : ''} — ${a.end}${a.endTime ? ` ${a.endTime}` : ''}`;
  if (a.type === 'weekly') text = `每周${[...a.weekdays].sort().map(d => '一二三四五六日'[d - 1]).join('、')}${a.startTime ? ` · ${a.startTime}–${a.endTime}` : ' · 不限时段'} · ${a.startDate} 起${a.until ? `，至 ${a.until}` : ''}`;
  if (item.deadline && a.type !== 'deadline') text += ` · 截止 ${item.deadline.date}${item.deadline.time ? ` ${item.deadline.time}` : ''}`;
  return text;
}
export function sortItems(items, date) {
  const key = input => { const item = normalizeItem(input), a = item.anchor; return deadlineOf(item)?.date || a.date || a.start || a.startDate || '9999'; };
  return [...items].sort((a, b) => Number(isComplete(a, date)) - Number(isComplete(b, date)) || key(a).localeCompare(key(b)) || a.title.localeCompare(b.title, 'zh-CN'));
}
