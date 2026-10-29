import { dateForWeek, mondayOf, weekdayOf } from '../shared/packages/core/src/semester-calendar.mjs';
import { normalizeItem, isComplete, itemTimeParts } from './planning.mjs';
import { validDate } from './web-extract.mjs';
import { projectCourseOccurrences, courseTimes } from './course-occurrences.mjs';

export const calendarPreferenceKey = 'jiwei-desktop-calendar-v1';
export function normalizeCalendarPreferences(value) {
  const fallback = { schemaVersion: 1, view: 'month', filters: { plans: true, tasks: true, phases: true, completed: false, courses: true } };
  if (value == null) return fallback;
  if (value.schemaVersion !== 1 || !['month', 'week', 'day'].includes(value.view) || !value.filters || ['plans','tasks','phases','completed'].some(key => typeof value.filters[key] !== 'boolean') || value.filters.courses !== undefined && typeof value.filters.courses !== 'boolean') throw Error('日历显示设置无效，请保留原数据并检查版本。');
  return { ...value, filters: { ...fallback.filters, ...value.filters } };
}
export function projectCourseCalendar(table, range) {
  if (!table) return [];
  return projectCourseOccurrences(table, range).flatMap(entry => {
    const times = courseTimes(table, entry); if (!times) return [];
    return [{ id: JSON.stringify(['course',table.id,entry.occurrenceId]), itemId:entry.courseId, kind:'course', type:'schedule', title:entry.title, start:entry.date, end:entry.date, endDate:entry.date, startTime:times.start, endTime:times.end, allDay:false, done:false, course:entry }];
  });
}
export function addDays(date, amount) {
  if (!validDate(date) || !Number.isInteger(amount)) throw Error('日历日期无效。');
  const result = dateForWeek({ startDate: date }, 1, amount + 1);
  if (!validDate(result)) throw Error('日历日期超出支持范围。'); return result;
}
const padded = number => String(number).padStart(2, '0');
export function shiftCalendar(date, amount, view) {
  if (!['month', 'week', 'day'].includes(view)) throw Error('无效日历视图。');
  if (view !== 'month') return addDays(date, amount * (view === 'week' ? 7 : 1));
  if (!validDate(date) || !Number.isInteger(amount)) throw Error('日历日期无效。');
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
  const target = new Date(0); target.setUTCFullYear(year, month - 1 + amount, 1);
  const y = target.getUTCFullYear(), m = target.getUTCMonth() + 1;
  const next = new Date(0); next.setUTCFullYear(y, m, 0);
  const day = Math.min(Number(date.slice(8)), next.getUTCDate());
  const result = `${String(y).padStart(4, '0')}-${padded(m)}-${padded(day)}`;
  if (!validDate(result)) throw Error('日历日期超出支持范围。'); return result;
}
export function calendarRange(date, view = 'month') {
  if (!validDate(date)) throw Error('日历日期无效。');
  if (!['month', 'week', 'day'].includes(view)) throw Error('无效日历视图。');
  const start = view === 'month' ? mondayOf(`${date.slice(0, 7)}-01`) : view === 'week' ? mondayOf(date) : date;
  const count = view === 'month' ? 42 : view === 'week' ? 7 : 1;
  const days = Array.from({ length: count }, (_, i) => addDays(start, i));
  return { start, end: days.at(-1), days };
}
const intersects = (start, end, range) => start <= range.end && end >= range.start;
// Calendar entries are projections, never a second stored copy of tasks/plans.
export function projectCalendar(items, range, { phases = true, completed = false } = {}) {
  if (!validDate(range.start) || !validDate(range.end) || range.end < range.start) throw Error('日历范围无效。');
  const days = []; for (let date = range.start; date <= range.end; date = addDays(date, 1)) { if (days.length >= 366) throw Error('一次最多显示一年。'); days.push(date); }
  const entries = [], floating = [];
  for (const raw of items) {
    const item = normalizeItem(raw, raw.kind || 'task'), a = item.anchor;
    const entry = (type, start, end, extra = {}) => {
      const date = extra.occurrenceDate || start;
      const done = extra.phase ? item.done === true || extra.phase.done === true : isComplete(item, date);
      if ((!completed && done) || !intersects(start, end, range)) return;
      entries.push({ id: JSON.stringify([item.kind, item.id, type, extra.slotId || extra.phase?.id || '', extra.occurrenceDate || '']), itemId: item.id, kind: item.kind, type, title: extra.phase?.title || item.title, eventType: item.eventType || '', start, end, allDay: true, done, ...extra });
    };
    const deadline = due => entry('deadline', due.date, due.date, { dueTime: due.time || '', ...(due.time ? { allDay: false, point: true, startTime: due.time, endTime: due.time, endDate: due.date } : {}) });
    if (a.type === 'floating' && (completed || !item.done) && !item.executionSlots?.length) floating.push(item);
    else if (a.type === 'deadline') deadline(a);
    else if (a.type === 'allDay') entry('schedule', a.date, a.date);
    else if (a.type === 'absolute') {
      const start = itemTimeParts(a.start), end = itemTimeParts(a.end);
      // Timed intervals exclude their end; midnight belongs to the preceding day.
      const last = end.time === '00:00' ? addDays(end.date, -1) : end.date;
      entry('schedule', start.date, last, { allDay: false, startTime: start.time, endTime: end.time, endDate: end.date });
    } else if (a.type === 'range') entry('schedule', a.start, a.startTime && a.endTime === '00:00' ? addDays(a.end, -1) : a.end, a.startTime ? { allDay: false, startTime: a.startTime, endTime: a.endTime, endDate: a.end } : {});
    else if (a.type === 'weekly') for (const date of days) {
      if (date >= a.startDate && (!a.until || date <= a.until) && a.weekdays.includes(weekdayOf(date))) entry('schedule', date, date, { occurrenceDate: date, ...(a.startTime ? { allDay: false, startTime: a.startTime, endTime: a.endTime, endDate: date } : {}) });
    }
    if (item.deadline && a.type !== 'deadline') deadline(item.deadline);
    for (const slot of item.executionSlots || []) {
      const start = itemTimeParts(slot.start), end = itemTimeParts(slot.end);
      const phase = item.phases.find(phase => phase.id === slot.phaseId);
      entry('execution', start.date, end.time === '00:00' ? addDays(end.date, -1) : end.date, { slotId: slot.id, slotLabel: slot.label || '', ...(phase ? { phase } : {}), ...(slot.occurrenceDate ? { occurrenceDate: slot.occurrenceDate } : {}), allDay: false, startTime: start.time, endTime: end.time, endDate: end.date });
    }
    if (phases && a.type === 'range') for (const phase of item.phases) {
      if (phase.startDate && phase.endDate) entry('phase', phase.startDate, phase.endDate, { phase, parentTitle: item.title });
    }
  }
  return { entries: entries.sort((a, b) => a.start.localeCompare(b.start) || Number(b.allDay) - Number(a.allDay) || (a.startTime || '').localeCompare(b.startTime || '') || a.type.localeCompare(b.type) || a.title.localeCompare(b.title, 'zh-CN')), floating };
}
export function calendarWeekLanes(entries, start, count = 7) {
  const end = addDays(start, count - 1), lanes = [];
  return entries.filter(entry => intersects(entry.start, entry.end, { start, end })).map(entry => ({ entry, start: entry.start < start ? start : entry.start, end: entry.end > end ? end : entry.end })).sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.entry.id.localeCompare(b.entry.id)).map(segment => {
    const column = Math.round((Date.parse(segment.start) - Date.parse(start)) / 86400000);
    const last = Math.round((Date.parse(segment.end) - Date.parse(start)) / 86400000);
    let lane = lanes.findIndex(end => end < column); if (lane < 0) lane = lanes.length; lanes[lane] = last;
    return { ...segment, column, span: last - column + 1, lane, continuesBefore: segment.entry.start < start, continuesAfter: segment.entry.end > end };
  });
}
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
export function timedCalendarSegments(entries, date) {
  const segments = entries.filter(e => !e.allDay && e.start <= date && e.end >= date).map(entry => {
    const start = entry.start === date ? minutes(entry.startTime) : 0;
    const end = entry.endDate === date ? minutes(entry.endTime) : 1440;
    // Near midnight the visual minimum moves upward, never into the next day.
    const displayStart = Math.min(start, 1440 - 45);
    return { entry, start, end, displayStart, displayEnd: Math.min(1440, Math.max(end, displayStart + 45)) };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  const groups = [];
  for (const segment of segments) {
    let group = groups.at(-1);
    if (!group || segment.displayStart >= group.end) { group = { end: segment.displayEnd, lanes: [], segments: [] }; groups.push(group); }
    let lane = group.lanes.findIndex(end => end <= segment.displayStart); if (lane < 0) lane = group.lanes.length;
    group.lanes[lane] = segment.displayEnd; group.end = Math.max(group.end, segment.displayEnd); group.segments.push({ ...segment, lane });
  }
  return groups.flatMap(group => group.segments.map(segment => ({ ...segment, laneCount: group.lanes.length })));
}
