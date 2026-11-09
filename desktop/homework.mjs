import { courseTimes } from './course-occurrences.mjs';

// 下课后六小时内问一次；再晚就不打扰，第二天也不补问昨天。
export const homeworkWindow = 360;
export const homeworkPreferenceKey = 'jiwei-desktop-homework-v1';

const minuteOf = time => /^\d{2}:\d{2}$/.test(time || '') ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;

// 一次课的身份由课表和课次共同决定：调课后的“调入”与“调出”各问各的。
export function homeworkKeyOf(tableId, occurrenceId) {
  if (typeof tableId !== 'string' || !tableId || typeof occurrenceId !== 'string' || !occurrenceId) throw Error('作业提示缺少课次身份。');
  return `${tableId}:${occurrenceId}`;
}

const validKeys = value => Array.isArray(value) ? value.filter(key => typeof key === 'string' && key) : [];

export function readHomework(storage) {
  try { return validKeys(JSON.parse(storage.getItem(homeworkPreferenceKey) || '[]')); }
  catch { return []; }
}

// 只保留最近 300 条，问过的记录不会无限增长；同一条重复标记保持原位。
export function markHomework(storage, key) {
  if (typeof key !== 'string' || !key) throw Error('作业提示编号无效。');
  const keys = readHomework(storage);
  if (keys.includes(key)) return keys;
  const next = [...keys, key].slice(-300);
  storage.setItem(homeworkPreferenceKey, JSON.stringify(next));
  return next;
}

// 候选只读已经上完、仍是正常状态的课；停课、调出和还没下课的都不问。
// handled 与 hasWork 由调用处提供：一个读本机“问过没有”，一个查这节课是否已经记过东西。
export function homeworkCandidate(courses, nowMin, handled = () => false, hasWork = () => false) {
  const table = courses?.table;
  if (!table || !Array.isArray(courses.entries)) return null;
  const ended = courses.entries
    .filter(entry => entry.status === 'normal')
    .map(entry => {
      const times = courseTimes(table, entry), endMinutes = minuteOf(times?.end);
      return times && endMinutes !== null ? { entry, endMinutes } : null;
    })
    .filter(item => item && item.endMinutes <= nowMin && nowMin - item.endMinutes <= homeworkWindow)
    .sort((a, b) => b.endMinutes - a.endMinutes);
  for (const { entry, endMinutes } of ended) {
    const key = homeworkKeyOf(table.id, entry.occurrenceId);
    if (handled(key)) continue;
    const candidate = {
      key, tableId: table.id, courseId: entry.courseId, originalDate: entry.originalDate,
      title: entry.title, end: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`,
      location: entry.location || '', teacher: entry.teacher || ''
    };
    if (hasWork(candidate)) continue;
    return candidate;
  }
  return null;
}
