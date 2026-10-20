import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCourseCsv,parseCourseIcs,exportCourseIcs,exportCourseCsv,analyzeCourseRows,prepareCourseFileCommit,buildCourseBatch } from './course-files.mjs';
import { changeOccurrence,projectCourseOccurrences } from './course-occurrences.mjs';
const table=()=>({id:'t',name:'课程日历',startDate:'2026-10-19',totalWeeks:4,schedule:[{index:1,start:'08:00',end:'08:45'},{index:2,start:'08:55',end:'09:40'}],courses:[]});
const csv='title,teacher,location,weekday,periodStart,periodEnd,weeks,color\n高数,甲,101,1,1,2,1-4,blue';
test('CSV 可编辑草稿保留错误，单双周/中文表头/引号换行/列顺序可读，不默丢行',()=>{
 const t=table(),rows=parseCourseCsv('课程名称,周次,星期,开始节,结束节,教室,教师\n"高数,基础\n课程",1-4单,周一,1,2,"101""室",甲\n坏课,99,周二,0,4,102,乙');
 assert.equal(rows.length,2);assert.match(rows[0].fields.title,/高数,基础\n课程/);assert.equal(rows[0].fields.location,'101"室');assert.equal(analyzeCourseRows(rows,t)[1].errors.length,1);assert.throws(()=>prepareCourseFileCommit(rows,t),/错误行/);
 rows[1].selected=false;const result=prepareCourseFileCommit(rows,t);assert.deepEqual(result.courses[0].weeks,[1,3]);assert.equal(t.courses.length,0);assert.throws(()=>parseCourseCsv(csv+'\n"未闭合'),/引号/);
});
test('重复按等价周次与内容判断，文件内重复和时间冲突可见；确认只生成一份新课程',()=>{
 const t=table(),rows=parseCourseCsv(csv+'\n高数,甲,101,1,1,2,"1,2,3,4",red\n物理,乙,102,1,1,2,每周,');const analysis=analyzeCourseRows(rows,t);assert.equal(analysis[1].duplicate,true);assert.deepEqual(analysis[2].conflicts,['高数']);const result=prepareCourseFileCommit(rows,t);assert.equal(result.imported,2);assert.equal(result.skipped,1);assert.equal(analyzeCourseRows(rows,{...t,courses:result.courses}).filter(r=>r.duplicate).length,3);
});
test('批量名称/星期/节次/教师/地点/周次保留 ID、createdAt、来源，整批错误不改原数组',()=>{
 const t=table();t.courses=prepareCourseFileCommit(parseCourseCsv(csv),t).courses.map(c=>({...c,sourceUrl:'keep'}));const old=t.courses[0],fields={...old,weeksText:'2,4',weekday:'3',title:'高数改名',teacher:'乙',location:'202',periodStart:'2',periodEnd:'2'};
 const updated=buildCourseBatch(t.courses,[{id:old.id,fields}],t);assert.equal(updated[0].id,old.id);assert.equal(updated[0].createdAt,old.createdAt);assert.equal(updated[0].sourceUrl,'keep');assert.equal(updated[0].weekday,3);assert.equal(t.courses[0].weekday,1);assert.throws(()=>buildCourseBatch(t.courses,[{id:old.id,fields:{...fields,periodStart:'0'}}],t),/节次/);
});
test('ICS 导出反映调停课，UTC、教师地点、中文转义和 75 字节折行可回读，UID 稳定',()=>{
 const t=table();t.courses=prepareCourseFileCommit(parseCourseCsv(csv),t).courses;t.courses[0].title='中文超长标题'.repeat(25)+',;\\\n课程';
 t.adjustments=changeOccurrence(t,t.courses[0].id,'2026-10-19',{action:'move',date:'2026-10-21',periodStart:1,periodEnd:2,location:'202'});t.adjustments=changeOccurrence(t,t.courses[0].id,'2026-10-26',{action:'cancel'});
 const ics=exportCourseIcs(t),encoder=new TextEncoder();for(const line of ics.split('\r\n'))assert.ok(encoder.encode(line).length<=75);
 assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,3);assert.match(ics,/20261021T000000Z/);assert.doesNotMatch(ics,/20261019T000000Z/);
 const imported=prepareCourseFileCommit(parseCourseIcs(ics,{...t,courses:[],adjustments:[]}),{...t,courses:[],adjustments:[]});
 const actual=projectCourseOccurrences({...t,courses:imported.courses,adjustments:[]}).map(e=>[e.date,e.title,e.location]);const expected=projectCourseOccurrences(t).filter(e=>e.status==='normal').map(e=>[e.date,e.title,e.location]);assert.deepEqual(actual,expected);
 assert.equal(exportCourseIcs(t).match(/UID:.*/g).join(),ics.match(/UID:.*/g).join());assert.equal(parseCourseCsv(exportCourseCsv(t))[0].fields.title,t.courses[0].title);
});
test('ICS 每周重复与排除正确展开，不支持的系列或时区显式报错，不残留部分展开结果',()=>{
 const t=table(),make=extra=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:abc\r\nSUMMARY:高数\r\nDTSTART;TZID=Asia/Shanghai:20261019T080000\r\nDTEND;TZID=Asia/Shanghai:20261019T094000\r\n'+extra+'\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
 const rows=parseCourseIcs(make('RRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE;TZID=Asia/Shanghai:20261026T080000'),t);assert.equal(rows[0].fields.weeksText,'1,3,4');
 const invalid=parseCourseIcs(make('RRULE:FREQ=MONTHLY;COUNT=4'),t);assert.match(invalid[0].errors[0],/重复/);assert.throws(()=>prepareCourseFileCommit(invalid,t),/错误行/);
 const outside=parseCourseIcs(make('RDATE;TZID=Asia/Shanghai:20261201T080000'),t);assert.equal(outside.length,1);assert.equal(outside[0].errors.length,1,'bad series does not leave the first valid date behind');
 const tz=parseCourseIcs(make('').replaceAll('Asia/Shanghai','America/New_York'),t);assert.match(tz[0].errors[0],/时区/);
});
