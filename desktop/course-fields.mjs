import { parseCourseWeeks } from './course-import.mjs';

export function editorWeeks(value, totalWeeks) {
  const raw = String(value || '').trim();
  if (!raw || /^(每周|全周|全部周次)$/.test(raw)) return Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const parts = raw.replace(/[第周次\s]/g, '').replace(/（/g, '(').replace(/）/g, ')').split(/[,，、;；]/);
  for (const part of parts) {
    const match = part.match(/^(\d{1,2})(?:[-~至到](\d{1,2}))?(?:\(?[单双]\)?)?$/);
    if (!match) throw Error('周次格式无效，请填写如 1-16、1-16单 或 1,3,5。');
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end > totalWeeks) throw Error(`周次需在 1–${totalWeeks} 周内；原课程超出时请先调整课表总周数。`);
  }
  const weeks = parseCourseWeeks(raw, totalWeeks); if (!weeks.length) throw Error('课程至少需要选择一周。'); return weeks;
}
export function toggleEditorWeek(value, week, totalWeeks) {
  if (!Number.isInteger(week) || week < 1 || week > totalWeeks) throw Error('无效的周次选择。');
  const selected = new Set(editorWeeks(value, totalWeeks));
  if (selected.has(week)) selected.delete(week); else selected.add(week);
  if (!selected.size) throw Error('至少保留一周。如不再上课，请使用删除课程。');
  return selected.size === totalWeeks ? '' : [...selected].sort((a, b) => a - b).join(',');
}
export function buildCourseFields(fields, table) {
  const title = String(fields.title || '').trim(), weekday = Number(fields.weekday), periodStart = Number(fields.periodStart), periodEnd = Number(fields.periodEnd);
  const max = Math.max(table.schedule.length, ...table.courses.map(course => Number(course.periodEnd) || 0));
  if (!title) throw Error('请填写课程名称。');
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !Number.isInteger(periodStart) || !Number.isInteger(periodEnd) || periodStart < 1 || periodEnd < periodStart || periodEnd > max) throw Error(`请选择有效节次，结束节次需不早于开始节次，当前最多 ${max} 节。`);
  const weekText = String(fields.weeksText || '').trim(), weeks = editorWeeks(weekText, table.totalWeeks);
  return { title, teacher: String(fields.teacher || '').trim(), location: String(fields.location || '').trim(), weekday, periodStart, periodEnd, weeks: weekText ? weeks : [], weekText: weekText || '每周', color: String(fields.color || '').trim() };
}
