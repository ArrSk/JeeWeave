import { validDate } from './web-extract.mjs';
import { weekdayOf } from '../shared/packages/core/src/semester-calendar.mjs';

export const planTypes = { deadline: '待办 · 有截止时间', longterm: '待办 · 无期限', event: '事件 / 考试 · 当天时段', allDay: '全天事项', range: '跨日 / 阶段计划', weekly: '每周重复' };
const stamp = () => new Date().toISOString();
const newId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const timeValid = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const supportsExecutionSlots = () => true;
export function executionSlotsOnDate(item, date) {
  if (item.anchor.type !== 'weekly' && item.done) return [];
  return (item.executionSlots || []).filter(slot => {
    if (item.anchor.type === 'weekly' && isComplete(item, slot.occurrenceDate)) return false;
    if (slot.phaseId && item.phases?.find(phase => phase.id === slot.phaseId)?.done) return false;
    const start = itemTimeParts(slot.start), end = itemTimeParts(slot.end);
    return start.date <= date && (end.date > date || end.date === date && end.time !== '00:00');
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
export function describeExecutionSlot(slot) {
  const start = itemTimeParts(slot.start), end = itemTimeParts(slot.end);
  return `${start.date} ${start.time}–${end.date === start.date ? '' : end.date + ' '}${end.time}${slot.label ? ' · ' + slot.label : ''}${slot.occurrenceDate ? ' · 属于 ' + slot.occurrenceDate + ' 这次' : ''}`;
}
export function normalizeItem(item, kind = 'task') {
  if (item.schemaVersion !== undefined && item.schemaVersion !== 1) throw new Error('事项格式版本不兼容，请使用支持该数据的版本。');
  const anchor = item.anchor || (item.date ? { type: kind === 'plan' ? 'allDay' : 'deadline', date: item.date } : { type: 'floating' });
  return { ...item, schemaVersion: 1, kind, anchor, phases: item.phases || [], completedDates: item.completedDates || [], createdAt: item.createdAt || '', updatedAt: item.updatedAt || '' };
}
export function typeOf(item) {
  const type = normalizeItem(item).anchor.type;
  return ({ floating: 'longterm', deadline: 'deadline', range: 'range', weekly: 'weekly', absolute: 'event', allDay: 'allDay' })[type];
}
export function itemTimeParts(stamp) {
  const fields = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
  return { date: `${fields.year}-${fields.month}-${fields.day}`, time: `${fields.hour}:${fields.minute}` };
}
function checkDate(value) { if (!validDate(value || '')) throw new Error('请填写有效日期。'); }
function checkTimes(start, end) { if (!timeValid(start) || !timeValid(end)) throw new Error('请完整填写开始与结束时间。'); }
export function validateItem(input) {
  const item = normalizeItem(input, input.kind || 'task'), a = item.anchor;
  if (!item.id || !String(item.title || '').trim()) throw new Error('请填写事项名称。');
  if (!['task', 'plan'].includes(item.kind) || !typeOf(item)) throw new Error('不支持的事项类型。');
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
  if (item.executionSlots !== undefined) {
    const slots = item.executionSlots;
    if (!Array.isArray(slots) || slots.length > 100 || new Set(slots.map(s => s?.id)).size !== slots.length) throw Error('执行时段格式无效或编号重复，最多安排 100 段。');
    for (const slot of slots) {
      if (!slot || typeof slot.id !== 'string' || !slot.id || slot.id.length > 200 || slot.label !== undefined && (typeof slot.label !== 'string' || slot.label.length > 160)) throw Error('执行时段编号或说明无效。');
      for (const value of [slot.start, slot.end]) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:\+08:00|Z)$/.test(value) || !validDate(value.slice(0, 10)) || !timeValid(value.slice(11, 16)) || !Number.isFinite(Date.parse(value))) throw Error('请完整填写执行时段的日期与时间。');
      }
      if (Date.parse(slot.end) <= Date.parse(slot.start)) throw Error('执行时段的结束必须晚于开始。');
      if (slot.phaseId !== undefined && (a.type !== 'range' || !item.phases.some(phase => phase.id === slot.phaseId))) throw Error('执行时段关联的阶段不存在，请重新选择阶段。');
      if (a.type === 'range') {
        const phase = item.phases.find(phase => phase.id === slot.phaseId), start = itemTimeParts(slot.start), end = itemTimeParts(slot.end);
        const lastDate = end.time === '00:00' ? new Date(Date.parse(`${end.date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10) : end.date;
        if (start.date < (phase?.startDate || a.start) || lastDate > (phase?.endDate || a.end)) throw Error('执行时段必须位于计划或所属阶段的日期范围内。');
      }
      if (a.type === 'weekly') {
        checkDate(slot.occurrenceDate);
        if (slot.occurrenceDate < a.startDate || a.until && slot.occurrenceDate > a.until || !a.weekdays.includes(weekdayOf(slot.occurrenceDate))) throw Error('请选择重复规则内的原定日期，这段安排只属于该次事项。');
      } else if (slot.occurrenceDate !== undefined) throw Error('本次重复日期仅适用于重复事项，请先核对执行安排。');
    }
  }
  for (const key of ['goal', 'completionCriteria']) if (item[key] !== undefined && (typeof item[key] !== 'string' || item[key].length > 4000)) throw Error('目标或完成标准过长，最多 4000 字。');
  if (item.courseOrigin !== undefined) {
    const origin = item.courseOrigin;
    if (!origin || ['tableId', 'courseId', 'title'].some(key => typeof origin[key] !== 'string' || !origin[key] || origin[key].length > 200)) throw Error('课次来源信息无效。');
    checkDate(origin.originalDate);
  }
  if (item.sourceRef !== undefined && (item.sourceRef?.collection !== 'journalEntry' || typeof item.sourceRef.id !== 'string' || !item.sourceRef.id || item.sourceRef.id.length > 200 || item.sourceRef.containerId !== undefined || typeof item.sourceActionId !== 'string' || !item.sourceActionId || item.sourceActionId.length > 200)) throw Error('笔记来源引用无效。');
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
  const type = fields.type || (kind === 'task' ? (fields.date ? 'deadline' : 'longterm') : undefined);
  let anchor;
  if (type === 'longterm') anchor = { type: 'floating' };
  else if (type === 'deadline') anchor = { type: 'deadline', date: fields.date, ...(fields.startTime ? { time: fields.startTime } : {}) };
  else if (type === 'range') anchor = { type: 'range', start: fields.date, end: fields.endDate, ...(fields.timed ? { startTime: fields.startTime, endTime: fields.endTime } : {}) };
  else if (type === 'weekly') anchor = { type: 'weekly', startDate: fields.date, weekdays: fields.weekdays, ...(fields.until ? { until: fields.until } : {}), ...(fields.timed ? { startTime: fields.startTime, endTime: fields.endTime } : {}) };
  else if (type === 'event' || type === 'exam') anchor = fields.timed || type === 'exam' ? { type: 'absolute', start: `${fields.date}T${fields.startTime}:00+08:00`, end: `${fields.endDate || fields.date}T${fields.endTime}:00+08:00` } : { type: 'allDay', date: fields.date };
  else if (type === 'allDay') anchor = { type: 'allDay', date: fields.date };
  else throw new Error('请选择事项类型。');
  const at = stamp();
  const item = { ...existing, schemaVersion: 1, id: existing?.id || newId(kind), kind, title: String(fields.title || '').trim(), note: String(fields.note || '').trim(), anchor, date: anchor.date || anchor.start?.slice(0, 10) || anchor.startDate || '', done: existing?.done || false, createdAt: existing?.createdAt || at, updatedAt: at, completedDates: anchor.type === 'weekly' ? existing?.completedDates || [] : [], deadline: fields.deadlineDate && type !== 'deadline' ? { date: fields.deadlineDate, ...(fields.deadlineTime ? { time: fields.deadlineTime } : {}) } : null, phases: type === 'range' ? (fields.phases || []).map(phase => ({ ...phase, id: phase.id || newId('phase'), title: String(phase.title || '').trim(), done: phase.done || false, createdAt: phase.createdAt || at, updatedAt: at })) : [] };
  for (const key of ['goal', 'completionCriteria']) if (fields[key] !== undefined) item[key] = String(fields[key]).trim();
  // The UI has one event/exam option; keep the old exam annotation when editing
  // such a record. Legacy callers using type=exam remain readable/writeable.
  if (type === 'exam' || type === 'event' && existing?.eventType === 'exam' && anchor.type === 'absolute') item.eventType = 'exam'; else delete item.eventType;
  if (fields.executionSlots !== undefined) {
    if (!Array.isArray(fields.executionSlots)) throw Error('执行时段格式无效。');
    item.executionSlots = fields.executionSlots.map(slot => {
      const previous = existing?.executionSlots?.find(old => old.id === slot.id);
      return { ...slot, id: slot.id || newId('slot'), createdAt: previous?.createdAt || at, updatedAt: at };
    });
  }
  return validateItem(item);
}
export function isComplete(input, date) {
  const item = normalizeItem(input);
  return item.anchor.type === 'weekly' ? item.completedDates.includes(date) : item.done === true;
}
export function toggleItem(input, date) {
  const item = normalizeItem(input, input.kind || 'task');
  if (item.anchor.type === 'weekly' && (!validDate(date || '') || date < item.anchor.startDate || item.anchor.until && date > item.anchor.until || !item.anchor.weekdays.includes(weekdayOf(date)))) throw Error('请在原定重复日期记录本次完成状态。');
  return { ...item, ...(item.anchor.type === 'weekly' ? { completedDates: isComplete(item, date) ? item.completedDates.filter(d => d !== date) : [...item.completedDates, date] } : { done: !item.done }), updatedAt: stamp() };
}
export function isOnDate(input, date) {
  const item = normalizeItem(input), a = item.anchor;
  if (isComplete(item, date)) return false;
  if (a.type === 'floating') return false;
  if (a.type === 'deadline') return a.date <= date;
  if (a.type === 'allDay') return a.date === date;
  if (a.type === 'absolute') { const start = itemTimeParts(a.start), end = itemTimeParts(a.end); return start.date <= date && (end.date > date || end.date === date && end.time !== '00:00'); }
  if (a.type === 'range') return a.start <= date && (a.end > date || a.end === date && !(a.startTime && a.endTime === '00:00'));
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
  if (a.type === 'absolute') { const start = itemTimeParts(a.start), end = itemTimeParts(a.end); text = `${start.date} · ${start.time}–${end.date !== start.date ? `${end.date} ` : ''}${end.time}${item.eventType === 'exam' ? ' · 考试' : ''}`; }
  if (a.type === 'range') text = `${a.start}${a.startTime ? ` ${a.startTime}` : ''} — ${a.end}${a.endTime ? ` ${a.endTime}` : ''}`;
  if (a.type === 'weekly') text = `每周${[...a.weekdays].sort().map(d => '一二三四五六日'[d - 1]).join('、')}${a.startTime ? ` · ${a.startTime}–${a.endTime}` : ' · 不限时段'} · ${a.startDate} 起${a.until ? `，至 ${a.until}` : ''}`;
  if (item.deadline && a.type !== 'deadline') text += ` · 截止 ${item.deadline.date}${item.deadline.time ? ` ${item.deadline.time}` : ''}`;
  return text;
}
export function sortItems(items, date) {
  const key = input => {
    const item = normalizeItem(input), a = item.anchor, due = deadlineOf(item);
    if (due) return `${due.date}T${due.time || '23:59'}`;
    if (a.type === 'absolute') { const start = itemTimeParts(a.start); return `${start.date}T${start.time}`; }
    return `${a.date || a.start || a.startDate || '9999'}T${a.startTime || '00:00'}`;
  };
  return [...items].sort((a, b) => Number(isComplete(a, date)) - Number(isComplete(b, date)) || key(a).localeCompare(key(b)) || a.title.localeCompare(b.title, 'zh-CN'));
}
