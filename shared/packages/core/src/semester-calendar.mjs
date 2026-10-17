// Pure calendar primitives shared by the TypeScript client and the desktop renderer.
  const dayMs = 86400000;
  function timestamp(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期格式应为 YYYY-MM-DD');
    const result = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 10) !== value) throw new Error('日期不存在');
    return result;
  }
  function dateForWeek(semester, week, weekday) {
    return new Date(timestamp(semester.startDate) + ((week - 1) * 7 + weekday - 1) * dayMs).toISOString().slice(0, 10);
  }
  function currentWeek(semester, date) {
    const days = Math.round((timestamp(date) - timestamp(semester.startDate)) / dayMs);
    if (days < 0) return 0;
    return Math.min(Math.floor(days / 7) + 1, semester.totalWeeks + 1);
  }
  function today() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${fields.year}-${fields.month}-${fields.day}`;
  }
  function weekdayOf(date) { return new Date(timestamp(date)).getUTCDay() || 7; }
  function mondayOf(date) { return dateForWeek({ startDate: date }, 1, 2 - weekdayOf(date)); }
export { dateForWeek, currentWeek, today, weekdayOf, mondayOf };
