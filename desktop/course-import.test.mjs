import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCourseWeeks, prepareCapturedCourses } from './course-import.mjs';

const text = '课表信息 星期一 1-2 高等数学 周数：1-16周 校区：本部 上课地点：教西101 教师 ：张老师 学分：6 课程性质：必修 星期四 5-6 体育 周数：1-15周(单) 校区：本部 上课地点：操场 教师 ：李老师 学分：1 课程性质：必修 星期五 7-8 物理实验 周数：2-16周(双) 校区：本部 上课地点：实验楼201 教师 ：王老师 学分：1 课程性质：必修';
test('旧列表解析保留课程信息、连堂、单双周', () => {
  const result = prepareCapturedCourses({ text });
  assert.equal(result.additions.length, 3);
  assert.deepEqual(result.courses[1].weeks, [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(result.courses[2].weeks, [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.equal(result.courses[0].teacher, '张老师');
  assert.equal(result.courses[0].location, '教西101');
  assert.equal(result.courses[0].periodEnd, 2);
});

test('相同课程重复抓取和同次重复项都跳过，不受周次顺序影响', () => {
  const first = prepareCapturedCourses({ text });
  const existing = first.additions.map(course => ({ ...course, weeks: course.weeks.toReversed() }));
  assert.equal(prepareCapturedCourses({ text }, existing).additions.length, 0);
  const course = { title: '程序设计', weekday: 3, periodStart: 3, periodEnd: 4, weekText: '1-16周' };
  const result = prepareCapturedCourses({ cards: [course, course] });
  assert.equal(result.additions.length, 1); assert.equal(result.skipped, 1);
});

test('网格课程缺失周次会阻止整次导入，不当作每周；正常列表可兜底', () => {
  const incomplete = { title: '课程', weekday: 1, periodStart: 1, periodEnd: 2 };
  assert.throws(() => prepareCapturedCourses({ cards: [incomplete] }), /周次不完整/);
  assert.equal(prepareCapturedCourses({ cards: [incomplete], text }).courses.length, 3);
  assert.throws(() => prepareCapturedCourses({ text: '统一身份认证登录' }), /没有识别出课程/);
});

test('多段周次与各段单双周分别处理，防止误导入到其他周', () => {
  assert.deepEqual(parseCourseWeeks('1-3单,4-8双'), [1, 3, 4, 6, 8]);
  assert.deepEqual(parseCourseWeeks('第1-4,6-10周(双)'), [2, 4, 6, 8, 10]);
  assert.deepEqual(parseCourseWeeks('4-2'), []);
});
