import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCourseWeeks, prepareCapturedCourses, capturedSchoolSchedule } from './course-import.mjs';
import { createTimetableStore } from './timetable-store.mjs';

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

test('合并节次的列表保留单双周两条英语及不同地点，且星期之间不继承节次', () => {
  const merged = '星期一 3-4 模拟英语 周数：4-18周(双) 校区:本部 上课地点：语音室 教师 ：甲老师 学分：2.0 课程性质：限选 模拟英语 周数：5-17周(单) 校区:本部 上课地点：普通教室 教师 ：甲老师 学分：2.0 课程性质：限选 星期二 5 模拟实验 周数：1-2周 上课地点：实验室 教师：乙老师 学分：1';
  const result = prepareCapturedCourses({ text: merged });
  assert.equal(result.courses.length, 3);
  assert.deepEqual(result.courses.slice(0, 2).map(c => [c.title, c.periodStart, c.periodEnd, c.location]), [['模拟英语', 3, 4, '语音室'], ['模拟英语', 3, 4, '普通教室']]);
  assert.deepEqual(result.courses[1].weeks, [5, 7, 9, 11, 13, 15, 17]);
  assert.equal(result.courses[2].periodEnd, 5);
  assert.throws(() => prepareCapturedCourses({ text: merged.replace('星期二 5 模拟实验', '星期二 模拟实验') }), /本次未导入/);
});

test('结构化列表优先还原单元格，数量或网格冲突阻止整个批次写入', () => {
  const course = { title: '结构化课程', weekday: 2, periodStart: 1, periodEnd: 2, weekText: '1-4周(双)', teacher: '老师', location: '教室' };
  assert.equal(prepareCapturedCourses({ text: '周数：1-4周(双)', listCards: [course], listRecordCount: 1 }).courses[0].title, '结构化课程');
  assert.throws(() => prepareCapturedCourses({ text: text + ' 漏失课程 周数：1-16周', cards: [course] }), /识别不完整/);
  assert.throws(() => prepareCapturedCourses({ text, cards: [course] }), /列表与网格/);
});

test('周次不能只解析一半后悄悄忽略其余片段', () => {
  assert.deepEqual(parseCourseWeeks('1-4周,未知周次'), []);
  assert.deepEqual(parseCourseWeeks('1-4,61-62'), []);
  assert.deepEqual(parseCourseWeeks('1-5周(单),6-10周(双)'), [1, 3, 5, 6, 8, 10]);
});

test('其它课程单独保留原文和周次、跨视图去重，重复导入不新增', () => {
  const other = '其它课程：模拟军训甲老师(共19周)/1-19周/无;模拟专题乙老师(共8周)/5-12周/无;';
  const first = prepareCapturedCourses({ text: `${text} ${other} 导出 ${other}` });
  assert.equal(first.courses.length, 3);
  assert.equal(first.unplacedAdditions.length, 2);
  assert.equal(first.unplacedCourses[0].weekday, undefined);
  assert.equal(first.unplacedCourses[0].raw, '模拟军训甲老师(共19周)/1-19周/无');
  assert.deepEqual(first.unplacedCourses[1].weeks, [5, 6, 7, 8, 9, 10, 11, 12]);
  const second = prepareCapturedCourses({ text: `${text} ${other}` }, first.additions, first.unplacedAdditions);
  assert.equal(second.additions.length, 0); assert.equal(second.unplacedAdditions.length, 0); assert.equal(second.unplacedSkipped, 2);
  assert.equal(prepareCapturedCourses({ text: other.replace(/;$/, '') }).unplacedAdditions.length, 2);
  assert.throws(() => prepareCapturedCourses({ text: `${text} ${other}错误记录;` }), /其它课程的格式/);
});

test('南邮导入仅校正通用默认作息，未知学校和自定义时间保持原样', () => {
  const data = new Map();
  const store = createTimetableStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  const generic = store.defaultSchedule(), capture = { url: 'https://vpn.njupt.edu.cn:8443/http/example' };
  const school = capturedSchoolSchedule(capture, generic, generic);
  assert.deepEqual(school[4], { index: 5, start: '11:30', end: '12:15' });
  assert.deepEqual(school[5], { index: 6, start: '13:45', end: '14:30' });
  assert.equal(school[9].start, '18:30'); assert.equal(school[11].end, '21:05');
  assert.equal(capturedSchoolSchedule(capture, [{ ...generic[0], start: '09:00' }, ...generic.slice(1)], generic), null);
  assert.equal(capturedSchoolSchedule(capture, generic, generic, true), null);
  assert.equal(capturedSchoolSchedule({ url: 'https://njupt.edu.cn.example.com' }, generic, generic), null);
  assert.equal(capturedSchoolSchedule({}, generic, generic), null);
  assert.equal(store.current().schedule[4].start, '14:00');
});
