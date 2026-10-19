// Overlapping courses share lanes; each group's rows follow the parent CSS grid.
export function groupCourseIntervals(courses) {
  const ordered = courses.map(course => ({ course, start: Math.max(1, Number(course.periodStart) || 1), end: Math.max(Number(course.periodStart) || 1, Number(course.periodEnd) || 1) })).sort((a, b) => a.start - b.start || a.end - b.end);
  const groups = [];
  for (const item of ordered) {
    let group = groups.at(-1);
    if (!group || item.start > group.end) { group = { start: item.start, end: item.end, lanes: [], items: [] }; groups.push(group); }
    let lane = group.lanes.findIndex(end => end < item.start); if (lane < 0) lane = group.lanes.length;
    group.lanes[lane] = item.end; group.end = Math.max(group.end, item.end); group.items.push({ ...item, lane });
  }
  return groups.map(({ lanes, ...group }) => ({ ...group, laneCount: lanes.length }));
}
