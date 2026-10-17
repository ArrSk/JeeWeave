// Deliberately separate from real courses; matches the Web example's teaching slots.
export function buildDemoTimetable(totalWeeks = 20) {
  const weeks = Array.from({ length: totalWeeks }, (_, index) => index + 1);
  const specs = [
    ['高等数学 A', 1, 1, 2, '张建国', '教三 201', 'blue', '1-16'],
    ['大学英语', 1, 3, 4, '李梅', '外语楼 305', 'red', '1-16'],
    ['线性代数', 2, 1, 2, '王强', '教二 108', 'cyan', '1-16'],
    ['大学物理', 3, 3, 4, '陈志远', '理科楼 402', 'purple', '1-16'],
    ['数据结构', 3, 5, 6, '刘伟', '计算机楼 501', 'green', '每周'],
    ['体育（篮球）', 4, 5, 6, '', '东操场', 'orange', '1-16单'],
    ['大学物理实验', 4, 7, 8, '陈志远', '物理实验中心 B203', 'yellow', '1-16双'],
    ['毛泽东思想概论', 5, 1, 2, '赵敏', '文科楼 210', 'yellow', '1-16'],
    ['数据结构上机', 5, 7, 9, '刘伟', '机房 A', 'green', '3,6,9,12,15,18'],
  ];
  return specs.map(([title, weekday, periodStart, periodEnd, teacher, location, color, weekText], index) => ({
    id: `demo-course-${index + 1}`, title, weekday, periodStart, periodEnd, teacher, location, color, weekText,
    weeks: weeks.filter(week => weekText === '每周' || (index === 8 ? week % 3 === 0 : week <= 16 && (index === 5 ? week % 2 === 1 : index === 6 ? week % 2 === 0 : true))),
  }));
}
