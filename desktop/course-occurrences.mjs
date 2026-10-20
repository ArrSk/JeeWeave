import { dateForWeek, currentWeek, weekdayOf } from '../shared/packages/core/src/semester-calendar.mjs';
import { validDate } from './web-extract.mjs';

const fail = message => { throw Error(message); };
const termWeek = (table, date) => { if (!validDate(date) || !table.startDate) return 0; return currentWeek(table, date); };
export const occurrenceKey = (courseId, originalDate) => JSON.stringify([courseId, originalDate]);
export function courseOccurs(table, course, date) {
  const week = termWeek(table, date);
  return week >= 1 && week <= table.totalWeeks && weekdayOf(date) === Number(course.weekday) && (!(course.weeks || []).length || course.weeks.includes(week));
}
export function validateAdjustments(table) {
  const all = table.adjustments === undefined ? [] : table.adjustments;
  if (!Array.isArray(all) || all.length > 5000) fail('课次调整格式无效或数量过多。');
  if(all.length&&new Set(table.courses.map(c=>c.id)).size!==table.courses.length)fail('课程编号重复，请先修复再调整课次。');
  const keys = new Set(), ids = new Set();
  for (const change of all) {
    if(!change || typeof change !== 'object')fail('课次调整记录无效。');
    const course = table.courses.find(c => c.id === change.courseId), key = occurrenceKey(change.courseId, change.originalDate);
    if (!change || typeof change.id !== 'string' || !change.id.trim() || change.reason !== undefined && typeof change.reason !== 'string' || ids.has(change.id) || keys.has(key) || !course || !courseOccurs(table, course, change.originalDate) || change.originalPeriodStart !== course.periodStart || change.originalPeriodEnd !== course.periodEnd) fail('已有课次调整与课程或学期不一致，请先恢复相关调整再修改日期、周次或节次。');
    if (!['move', 'cancel'].includes(change.action)) fail('不支持的调停课类型。');
    if (change.action === 'move') {
      const target = change.target, week = termWeek(table, target?.date);
      if (!target || week < 1 || week > table.totalWeeks || !Number.isInteger(target.periodStart) || !Number.isInteger(target.periodEnd) || target.periodStart < 1 || target.periodEnd < target.periodStart || target.periodEnd > table.schedule.length || typeof target.location !== 'string') fail('调入日期必须在当前学期内，节次必须在当前作息范围内。');
      if (target.date === change.originalDate && target.periodStart === course.periodStart && target.periodEnd === course.periodEnd && target.location === (course.location || '')) fail('调课内容没有变化，可直接取消或恢复调整。');
    }
    keys.add(key); ids.add(change.id);
  }
  return all;
}
export function changeOccurrence(table, courseId, originalDate, fields) {
  const course = table.courses.find(c => c.id === courseId);
  if (!course || !courseOccurs(table, course, originalDate)) fail('这一天没有该课程的原始课次，请选择具体教学周。');
  const old = (table.adjustments || []).find(c => c.courseId === courseId && c.originalDate === originalDate), at = new Date().toISOString();
  const change = { ...old, id: old?.id || `adjust_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`, courseId, originalDate, originalPeriodStart: course.periodStart, originalPeriodEnd: course.periodEnd, action: fields.action, reason: String(fields.reason || '').trim(), createdAt: old?.createdAt || at, updatedAt: at };
  if (fields.action === 'move') change.target = { date: fields.date, periodStart: Number(fields.periodStart), periodEnd: Number(fields.periodEnd), location: String(fields.location || '').trim() }; else delete change.target;
  const adjustments = [...(table.adjustments || []).filter(c => c !== old), change];
  validateAdjustments({ ...table, adjustments }); return adjustments;
}
export function restoreOccurrence(table, courseId, originalDate) { return (table.adjustments || []).filter(c => c.courseId !== courseId || c.originalDate !== originalDate); }
export function projectCourseOccurrences(table, range) {
  if (!table.startDate) return [];
  validateAdjustments(table);
  const entries = [], changes = new Map((table.adjustments || []).map(c => [occurrenceKey(c.courseId, c.originalDate), c]));
  const add = entry => { if ((!range || entry.date >= range.start && entry.date <= range.end)) entries.push(entry); };
  for (const course of table.courses) for (let week = 1; week <= table.totalWeeks; week++) {
    if ((course.weeks || []).length && !course.weeks.includes(week)) continue;
    const originalDate = dateForWeek(table, week, Number(course.weekday)), logicalId = occurrenceKey(course.id, originalDate), adjustment = changes.get(logicalId);
    const base = { ...course, courseId: course.id, originalDate, date: originalDate, weekday: Number(course.weekday), logicalId, occurrenceId: `${logicalId}:source`, status: 'normal', adjustment: adjustment || null };
    if (!adjustment) add(base);
    else {
      add({ ...base, status: adjustment.action === 'cancel' ? 'cancelled' : 'moved' });
      if (adjustment.action === 'move') add({ ...base, ...adjustment.target, weekday: weekdayOf(adjustment.target.date), status: 'normal', isMovedIn: true, occurrenceId: `${logicalId}:target` });
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.periodStart - b.periodStart || a.title.localeCompare(b.title, 'zh-CN'));
}
export function courseTimes(table, entry) {
  const first = table.schedule.find(p => p.index === entry.periodStart), last = table.schedule.find(p => p.index === entry.periodEnd);
  return first && last ? { start: first.start, end: last.end } : null;
}
export function todayCourseState(table, date, time) {
  const entries = projectCourseOccurrences(table, { start: date, end: date }), active = entries.filter(e => e.status === 'normal');
  return { entries, ongoing: active.filter(e => { const t = courseTimes(table, e); return t && t.start <= time && time < t.end; }), next: active.find(e => courseTimes(table, e)?.start > time) || null };
}
