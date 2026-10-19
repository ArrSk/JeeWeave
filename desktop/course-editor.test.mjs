import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coursePalettes, paletteForCourse } from './course-colors.mjs';
import { editorWeeks, toggleEditorWeek, buildCourseFields } from './course-editor.mjs';
import { groupCourseIntervals } from './course-layout.mjs';
const table = { totalWeeks: 20, schedule: Array.from({length:12},(_,i)=>({index:i+1})), courses: [] };
test('课程七色、自动分类与旧色值保持已部署网页的配色约定', () => {
  assert.equal(coursePalettes.length,7);
  for(const palette of coursePalettes) { assert.equal(paletteForCourse({color:palette.name}).bg,palette.bg); assert.equal(paletteForCourse({color:palette.bg}).name,palette.name); }
  assert.equal(paletteForCourse({title:'大学物理'}).name,'cyan'); assert.equal(paletteForCourse({title:'线性代数'}).name,'blue');
  assert.equal(paletteForCourse({title:'大学物理',color:'purple'}).name,'purple');
  assert.deepEqual(paletteForCourse({title:'自选课🌱'}),paletteForCourse({title:'自选课🌱',color:'unknown'}));
});
test('周次保留单双周与离散周，拒绝部分无效或超学期而非丢掉片段', () => {
  assert.equal(editorWeeks('',20).length,20); assert.deepEqual(editorWeeks('1-8周(单),10-16双',20),[1,3,5,7,10,12,14,16]);
  for(const text of ['1-3,错误','0-3','1-21','8-2','2-2单']) assert.throws(()=>editorWeeks(text,20));
});
test('逐周去选写回显式周次，全部选回可简写，最后一周不能默变每周', () => {
  assert.equal(toggleEditorWeek('',2,4),'1,3,4'); assert.equal(toggleEditorWeek('1,3,4',2,4),'');
  assert.throws(()=>toggleEditorWeek('3',3,4),/至少/);
});
test('编辑字段保存颜色与时间，起止和星期有严格校验，不修改原数据', () => {
  const fields={title:'  完整课程名  ',teacher:' 教师 ',location:' 教室 ',weekday:'2',periodStart:'3',periodEnd:'4',weeksText:'1-16单',color:'cyan'};
  const result=buildCourseFields(fields,table); assert.equal(result.title,'完整课程名'); assert.equal(result.color,'cyan'); assert.deepEqual(result.weeks,[1,3,5,7,9,11,13,15]);
  assert.equal(fields.title,'  完整课程名  ');
  for(const patch of [{weekday:0},{periodStart:5,periodEnd:3},{periodEnd:13},{title:' '},{weeksText:'1-8,未知'}]) assert.throws(()=>buildCourseFields({...fields,...patch},table));
});
test('相交课次分列，首尾相连但不重叠的课复用列，输入引用保持完整', () => {
  const courses=[{id:'a',periodStart:1,periodEnd:2},{id:'b',periodStart:2,periodEnd:3},{id:'c',periodStart:3,periodEnd:4},{id:'d',periodStart:7,periodEnd:8}];
  const before=JSON.stringify(courses),groups=groupCourseIntervals(courses);
  assert.equal(groups.length,2); assert.equal(groups[0].laneCount,2); assert.deepEqual(groups[0].items.map(i=>i.lane),[0,1,0]); assert.equal(groups[1].laneCount,1);
  assert.equal(groups[0].items[0].course,courses[0]); assert.equal(JSON.stringify(courses),before);
});
