const weekdays = '一二三四五六日';

export function parseCourseWeeks(value, totalWeeks = 60) {
  const raw = String(value || '').trim();
  if (/^(?:每周|全周|全部周次)$/.test(raw)) return Array.from({ length: totalWeeks }, (_, index) => index + 1);
  const text = raw.replace(/[第周次\s]/g, '').replace(/（/g, '(').replace(/）/g, ')');
  const markers = text.match(/[单双]/g) || [];
  const common = markers.length === 1 ? markers[0] : '';
  const result = new Set();
  for (const part of text.split(/[,，、;；]/)) {
    const match = part.match(/^(\d{1,2})(?:[-~至到](\d{1,2}))?(?:\(?([单双])\)?)?$/);
    if (!match) continue;
    const parity = match[3] || common;
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (end < start || start < 1 || end > totalWeeks) continue;
    for (let week = start; week <= end; week += 1) if (parity === '单' ? week % 2 === 1 : parity === '双' ? week % 2 === 0 : true) result.add(week);
  }
  return [...result].sort((a, b) => a - b);
}

export function parseCourseListText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const sections = /(?:星期|周)([一二三四五六日天])\s+([\s\S]*?)(?=\s+(?:星期|周)[一二三四五六日天]\s+|\s+其它课程[:：]|\s+导出\b|$)/g;
  const pattern = /(\d{1,2})\s*[-~至到]\s*(\d{1,2})\s+(.+?)\s+周数[:：]\s*([^\s]+周(?:\s*[单双])?(?:\s*[（(][单双][）)])?)\s+.*?上课地点[:：]\s*(.*?)\s+教师\s*[:：]\s*(.*?)(?=\s+学分[:：]|\s+课程性质[:：]|$)/g;
  const courses = [];
  for (const section of normalized.matchAll(sections)) {
    pattern.lastIndex = 0;
    for (const match of section[2].matchAll(pattern)) courses.push({
      title: match[3].trim(), teacher: match[6].trim(), location: match[5].trim(),
      weekday: section[1] === '天' ? 7 : weekdays.indexOf(section[1]) + 1,
      periodStart: Number(match[1]), periodEnd: Number(match[2]), weekText: match[4].trim(),
    });
  }
  return courses;
}

export function prepareCapturedCourses(capture, existing = []) {
  const list = parseCourseListText(capture.text);
  const rows = list.length ? list : capture.cards || [];
  if (!rows.length) throw new Error('没有识别出课程。请在教务窗口打开“学生课表查询”，选择有课程的学期；也可切换列表视图后重试。');
  const courses = rows.map((row, index) => {
    const title = String(row.title || '').trim();
    const weekday = Number(row.weekday), periodStart = Number(row.periodStart), periodEnd = Number(row.periodEnd);
    const weekText = String(row.weekText || '').trim();
    const weeks = parseCourseWeeks(weekText);
    if (!title || !Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !Number.isInteger(periodStart) || !Number.isInteger(periodEnd) || periodStart < 1 || periodEnd < periodStart || periodEnd > 30 || !weeks.length) {
      throw new Error(`第 ${index + 1} 条课程「${title || '未命名'}」的星期、节次或周次不完整，本次未导入。请切换到列表视图重试。`);
    }
    return { id: `course_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`, title, weekday, periodStart, periodEnd, weekText, weeks, teacher: String(row.teacher || '').trim(), location: String(row.location || '').trim() };
  });
  const key = course => JSON.stringify([course.title.trim(), course.teacher?.trim() || '', course.location?.trim() || '', Number(course.weekday), Number(course.periodStart), Number(course.periodEnd), [...new Set(course.weeks || [])].sort((a, b) => a - b)]);
  const keys = new Set(existing.map(key));
  const additions = courses.filter(course => { const value = key(course); if (keys.has(value)) return false; keys.add(value); return true; });
  return { courses, additions, skipped: courses.length - additions.length };
}
