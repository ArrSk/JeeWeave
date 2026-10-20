const weekdays = '一二三四五六日';

// NJUPT 2026–2027 semester 1 teaching notice, checked 2026-10-19:
// https://jwc.njupt.edu.cn/2026/0917/c1594a308644/page.htm
export function capturedSchoolSchedule(capture, current, genericDefault, customConfigured = false) {
  if (customConfigured) return null;
  let hostname;
  try { hostname = new URL(capture.url).hostname; } catch { return null; }
  if (hostname !== 'njupt.edu.cn' && !hostname.endsWith('.njupt.edu.cn')) return null;
  const same = Array.isArray(current) && current.length === genericDefault.length && current.every((period, i) => period.index === genericDefault[i].index && period.start === genericDefault[i].start && period.end === genericDefault[i].end);
  if (!same) return null;
  return ['08:00-08:45', '08:50-09:35', '09:50-10:35', '10:40-11:25', '11:30-12:15', '13:45-14:30', '14:35-15:20', '15:35-16:20', '16:25-17:10', '18:30-19:15', '19:25-20:10', '20:20-21:05'].map((time, i) => {
    const [start, end] = time.split('-'); return { index: i + 1, start, end };
  });
}

export function parseCourseWeeks(value, totalWeeks = 60) {
  const raw = String(value || '').trim();
  if (/^(?:每周|全周|全部周次)$/.test(raw)) return Array.from({ length: totalWeeks }, (_, index) => index + 1);
  const text = raw.replace(/[第周次\s]/g, '').replace(/（/g, '(').replace(/）/g, ')');
  const markers = text.match(/[单双]/g) || [];
  const common = markers.length === 1 ? markers[0] : '';
  const result = new Set();
  for (const part of text.split(/[,，、;；]/)) {
    const match = part.match(/^(\d{1,2})(?:[-~至到](\d{1,2}))?(?:\(?([单双])\)?)?$/);
    if (!match) return [];
    const parity = match[3] || common;
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (end < start || start < 1 || end > totalWeeks) return [];
    for (let week = start; week <= end; week += 1) if (parity === '单' ? week % 2 === 1 : parity === '双' ? week % 2 === 0 : true) result.add(week);
  }
  return [...result].sort((a, b) => a - b);
}

export function parseCourseListText(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const sections = /(?:星期|周)([一二三四五六日天])\s+([\s\S]*?)(?=\s+(?:星期|周)[一二三四五六日天]\s+|\s+其它课程[:：]|\s+导出\b|$)/g;
  const pattern = /周数[:：]\s*([\s\S]*?)\s+上课地点[:：]\s*(.*?)\s+教师\s*[:：]\s*(.*?)(?=\s+学分[:：]|\s+课程性质[:：]|$)/g;
  const courses = [];
  for (const section of normalized.matchAll(sections)) {
    pattern.lastIndex = 0; let cursor = 0, periodStart = 0, periodEnd = 0;
    for (const match of section[2].matchAll(pattern)) {
      const prefix = section[2].slice(cursor, match.index).trim()
        .replace(/^(?:学分[:：]\s*\S+\s*)?(?:课程性质[:：]\s*\S+\s*)?/, '');
      const heading = prefix.match(/^(?:(\d{1,2})(?:\s*[-~至到]\s*(\d{1,2}))?\s+)?(.+)$/);
      if (heading?.[1]) { periodStart = Number(heading[1]); periodEnd = Number(heading[2] || heading[1]); }
      courses.push({
        title: heading?.[3]?.trim() || '', teacher: match[3].trim(), location: match[2].trim(),
        weekday: section[1] === '天' ? 7 : weekdays.indexOf(section[1]) + 1,
        periodStart, periodEnd, weekText: match[1].split(/\s+校区\s*[:：]/)[0].trim(),
      });
      cursor = match.index + match[0].length;
    }
  }
  return courses;
}

export function parseUnplacedCourses(text) {
  const records = new Map();
  for (const tail of String(text || '').replace(/\s+/g, ' ').split(/其[它他]课程[:：]/).slice(1)) {
    const section = tail.split(/\s+(?:\d{4}-\d{4}学年|星期[一二三四五六日天]|导出(?:\s|$)|正在请求数据|实验课表)/)[0].trim();
    if (!section || /^(?:无|暂无|无其它课程|无其他课程)[。；;]?$/.test(section)) continue;
    const pattern = /\s*([^;；]+?)[（(]共\s*\d{1,2}\s*周[）)]\s*\/\s*([^/;；]+)\s*\/\s*([^;；]*?)(?:[;；]|$)/y;
    let match;
    while (pattern.lastIndex < section.length) {
      match = pattern.exec(section);
      if (!match) throw new Error('其它课程的格式未能完整识别，本次未导入。请保留原文并重新查询课表。');
      const raw = match[0].trim().replace(/[;；]$/, '');
      const weekText = match[2].trim(), weeks = parseCourseWeeks(weekText);
      if (!weeks.length) throw new Error('其它课程的周次不完整，本次未导入。');
      records.set(raw, { title: match[1].trim(), weekText, weeks, raw });
    }
  }
  return [...records.values()];
}

export function prepareCapturedCourses(capture, existing = [], existingUnplaced = []) {
  const list = capture.listCards?.length ? capture.listCards : parseCourseListText(capture.text);
  const expected = Math.max(Number(capture.listRecordCount) || 0, (String(capture.text || '').match(/周数[:：]/g) || []).length);
  // A nonempty partial match is not a successful batch. Never silently discard
  // records just because another view happened to parse a few valid courses.
  if (expected && list.length !== expected) throw new Error(`识别不完整：原表 ${expected} 条安排，解析出 ${list.length} 条，本次未导入。请重新查询课表后重试。`);
  const rows = list.length ? list : capture.cards || [];
  const unplaced = parseUnplacedCourses(capture.text);
  if (!rows.length && !unplaced.length) throw new Error('没有识别出课程。请在教务窗口打开“学生课表查询”，选择有课程的学期；也可切换列表视图后重试。');
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
  const arrangement = course => JSON.stringify([course.title.trim(), Number(course.weekday), Number(course.periodStart), Number(course.periodEnd), course.weeks]);
  const arrangements = new Set(courses.map(arrangement));
  if (list.length && (capture.cards || []).some(card => {
    const weeks = parseCourseWeeks(card.weekText);
    return card.title && card.weekday >= 1 && card.weekday <= 7 && card.periodStart >= 1 && card.periodEnd >= card.periodStart && weeks.length && !arrangements.has(arrangement({ ...card, weeks }));
  })) throw new Error('列表与网格的课程安排不一致，本次未导入。请重新查询课表后重试。');
  const key = course => JSON.stringify([course.title.trim(), course.teacher?.trim() || '', course.location?.trim() || '', Number(course.weekday), Number(course.periodStart), Number(course.periodEnd), [...new Set(course.weeks || [])].sort((a, b) => a - b)]);
  const keys = new Set(existing.map(key));
  const additions = courses.filter(course => { const value = key(course); if (keys.has(value)) return false; keys.add(value); return true; });
  const unplacedKeys = new Set(existingUnplaced.map(course => course.raw));
  const unplacedCourses = unplaced.map((course, index) => ({ ...course, id: `unplaced_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}` }));
  const unplacedAdditions = unplacedCourses.filter(course => !unplacedKeys.has(course.raw));
  return { courses, additions, skipped: courses.length - additions.length, unplacedCourses, unplacedAdditions, unplacedSkipped: unplacedCourses.length - unplacedAdditions.length };
}
