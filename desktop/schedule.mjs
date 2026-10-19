const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = time => { if (!timePattern.test(time || '')) throw new Error('请完整填写有效的开始与结束时间。'); return Number(time.slice(0, 2)) * 60 + Number(time.slice(3)); };
const clock = value => { if (value < 0 || value >= 1440) throw new Error('课程时间不能跨过午夜，请减少节数或提前开始时间。'); return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; };
const integer = (value, min, max, label) => { const next = Number(value); if (!Number.isInteger(next) || next < min || next > max) throw new Error(`${label}需为 ${min}–${max} 的整数。`); return next; };
export function defaultScheduleBatch() {
  return { schemaVersion: 1, duration: 45, gap: 10, longBreakEvery: 2, longBreak: 20, groups: [{ id: 'morning', label: '上午', start: '08:00', count: 4 }, { id: 'afternoon', label: '午后', start: '14:00', count: 4 }, { id: 'evening', label: '晚间', start: '18:30', count: 4 }] };
}
export function validateSchedule(schedule, minimumPeriods = 0) {
  if (!Array.isArray(schedule) || !schedule.length || schedule.length > 20) throw new Error('作息需要保留 1–20 节课。');
  if (schedule.length < minimumPeriods) throw new Error(`现有课程使用到第 ${minimumPeriods} 节，不能把作息缩减到 ${schedule.length} 节。`);
  let previous = -1;
  for (const [i, period] of schedule.entries()) {
    const start = minutes(period.start), end = minutes(period.end);
    if (period.index !== i + 1 || end <= start) throw new Error(`第 ${i + 1} 节的结束时间必须晚于开始时间，节次必须连续。`);
    if (start < previous) throw new Error(`第 ${i + 1} 节与前一节重叠，请检查课间隔或午后/晚间开始时间。`);
    previous = end;
  }
  return schedule.map(period => ({ index: period.index, start: period.start, end: period.end }));
}
export function generateSchedule(input, minimumPeriods = 0) {
  if (input.schemaVersion !== 1 || !Array.isArray(input.groups) || input.groups.length !== 3) throw new Error('不支持的批量作息设置。');
  const duration = integer(input.duration, 1, 180, '每节课时长'), gap = integer(input.gap, 0, 120, '普通课间隔');
  const every = integer(input.longBreakEvery, 0, 20, '大课间频次'), rest = integer(input.longBreak, 0, 180, '大课间隔');
  const periods = [];
  for (const group of input.groups) {
    const count = integer(group.count, 0, 20, `${group.label || '时段'}节数`);
    if (!count) continue;
    let start = minutes(group.start);
    for (let i = 0; i < count; i++) {
      periods.push({ index: periods.length + 1, start: clock(start), end: clock(start + duration) });
      start += duration + (every && (i + 1) % every === 0 ? rest : gap);
    }
  }
  return validateSchedule(periods, minimumPeriods);
}
export function inferScheduleBatch(schedule) {
  const config = defaultScheduleBatch();
  if (!schedule?.length) return config;
  config.duration = minutes(schedule[0].end) - minutes(schedule[0].start);
  const gaps = [];
  for (const group of config.groups) {
    const rows = schedule.filter(period => { const hour = Number(period.start.slice(0, 2)); return group.id === 'morning' ? hour < 12 : group.id === 'afternoon' ? hour >= 12 && hour < 18 : hour >= 18; });
    group.count = rows.length;
    if (rows.length) group.start = rows[0].start;
    for (let i = 1; i < rows.length; i++) gaps.push(minutes(rows[i].start) - minutes(rows[i - 1].end));
  }
  if (gaps.length) { config.gap = Math.max(0, Math.min(...gaps)); config.longBreak = Math.max(config.gap, ...gaps); }
  return config;
}
