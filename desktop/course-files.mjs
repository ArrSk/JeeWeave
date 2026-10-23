import { buildCourseFields } from './course-fields.mjs';
import { projectCourseOccurrences, courseTimes } from './course-occurrences.mjs';
import { dateForWeek, currentWeek, weekdayOf, mondayOf } from '../shared/packages/core/src/semester-calendar.mjs';
import { itemTimeParts } from './planning.mjs';
import { validDate } from './web-extract.mjs';

const fieldsOf = c => ({ title: c.title || '', teacher: c.teacher || '', location: c.location || '', weekday: String(c.weekday || ''), periodStart: String(c.periodStart || ''), periodEnd: String(c.periodEnd || ''), weeksText: c.weekText || (c.weeks || []).join(','), color: c.color || '' });
export function courseFileKey(course, table) { const c = buildCourseFields(fieldsOf(course), table); return JSON.stringify([c.title,c.teacher,c.location,c.weekday,c.periodStart,c.periodEnd,[...((c.weeks.length ? c.weeks : Array.from({length:table.totalWeeks},(_,i)=>i+1)))].sort((a,b)=>a-b)]); }
export function analyzeCourseRows(rows, table) {
  const known = table.courses.map(c=>({ ...c, weeks: c.weeks?.length ? c.weeks : Array.from({length:table.totalWeeks},(_,i)=>i+1) }));
  return rows.map(row => {
    const errors = [...(row.errors || [])]; let course, duplicate = false, conflicts = [];
    try { course = buildCourseFields(row.fields, table); } catch (error) { errors.push(error.message); }
    if (!errors.length && row.selected !== false) {
      duplicate = known.some(c=>courseFileKey(c,table)===courseFileKey(course,table));
      const weeks = course.weeks.length ? course.weeks : Array.from({length:table.totalWeeks},(_,i)=>i+1);
      if (!duplicate) { conflicts = [...new Set(known.filter(c=>c.weekday===course.weekday&&c.periodStart<=course.periodEnd&&c.periodEnd>=course.periodStart&&c.weeks.some(w=>weeks.includes(w))).map(c=>c.title))]; known.push({...course,weeks}); }
    }
    return { ...row, course, errors, duplicate, conflicts };
  });
}
export function prepareCourseFileCommit(rows, table) {
  const analyses = analyzeCourseRows(rows, table), selected = analyses.filter(r=>r.selected!==false);
  if (!selected.length) throw Error('请至少选择一行课程。');
  if (selected.some(r=>r.errors.length)) throw Error('仍有错误行，请修正或明确取消选择后再导入。');
  const at = new Date().toISOString(), additions = selected.filter(r=>!r.duplicate).map(r=>({...r.course,id:`file_${Date.now()}_${r.line}_${Math.random().toString(36).slice(2,8)}`,createdAt:at,updatedAt:at}));
  return { courses: [...table.courses,...additions], imported: additions.length, skipped: analyses.length-additions.length };
}
export function buildCourseBatch(courses, rows, table) {
  if (rows.length!==courses.length || new Set(rows.map(r=>r.id)).size!==rows.length || rows.some(r=>!courses.some(c=>c.id===r.id))) throw Error('课程清单已变化，请重新打开批量编辑。');
  return courses.map(old=>{const row=rows.find(r=>r.id===old.id),next=buildCourseFields(row.fields,table);return Object.keys(next).every(k=>JSON.stringify(next[k])===JSON.stringify(old[k]))?old:{...old,...next,updatedAt:new Date().toISOString()};});
}
function csvRows(input) {
  const rows=[]; let row=[],cell='',quoted=false,afterQuote=false;
  const text=String(input).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"'){quoted=false;afterQuote=true;}else cell+=ch;}
    else if(ch===','||ch==='\n'){row.push(cell.trim());cell='';afterQuote=false;if(ch==='\n'){if(row.some(Boolean))rows.push(row);row=[];}}
    else if(ch==='"'){if(cell.trim()||afterQuote)throw Error('CSV 引号格式无效。');quoted=true;}
    else {if(afterQuote&&!/\s/.test(ch))throw Error('CSV 闭引号后只能接逗号或换行。');cell+=ch;}
    if(rows.length>10000)throw Error('一次最多导入 10000 行。');
  }
  if(quoted)throw Error('CSV 引号未闭合，请检查文件。');row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
}
export function parseCourseCsv(text) {
  const rows=csvRows(text); if(rows.length<2)throw Error('CSV 需要表头和至少一行课程。');
  const norm=s=>s.toLowerCase().replace(/[\s_\-]/g,''),headers=rows.shift().map(norm);
  const aliases={title:['title','name','课程名','课程名称','课程','名称'],teacher:['teacher','教师','老师'],location:['location','地点','教室'],weekday:['weekday','day','星期','周几'],periodStart:['periodStart','start','开始节','起始节','开始节次'],periodEnd:['periodEnd','end','结束节','结束节次'],weeksText:['weeks','week','周次','教学周'],color:['color','颜色']};
  const indexes=Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,headers.findIndex(h=>names.map(norm).includes(h))]));
  for(const key of ['title','weekday','periodStart'])if(indexes[key]<0)throw Error(`CSV 缺少必需表头：${aliases[key][2]||key}`);
  return rows.map((cells,i)=>{const fields=Object.fromEntries(Object.entries(indexes).map(([key,at])=>[key,at>=0?cells[at]||'':'']));fields.periodEnd ||= fields.periodStart;fields.weekday=String(Number(fields.weekday)||'一二三四五六日'.indexOf(fields.weekday.replace(/^(星期|周)/,'').replace('天','日'))+1||fields.weekday);return{line:i+2,fields,selected:true,errors:[]};});
}
const unescapeIcs=value=>value.replace(/\\([nN\\;,])/g,(_,c)=>/[nN]/.test(c)?'\n':c);
const escapeIcs=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
function icsEvents(input) {
  if(!/^BEGIN:VCALENDAR\s*$/mi.test(input))throw Error('不是有效的 ICS 日历文件。');
  const events=[];let current=null,depth=0;
  for(const line of input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n[ \t]/g,'').split('\n')){
    if(/^BEGIN:VEVENT$/i.test(line)){if(current)throw Error('ICS 事件嵌套无效。');current={};depth=0;}
    else if(/^END:VEVENT$/i.test(line)){if(!current)throw Error('ICS 事件边界无效。');events.push(current);current=null;}
    else if(current){if(/^BEGIN:/i.test(line)){depth++;continue;}if(/^END:/i.test(line)){depth--;continue;}if(depth)continue;const at=line.indexOf(':');if(at<1)continue;const raw=line.slice(0,at),key=raw.split(';')[0].toUpperCase();(current[key] ||= []).push({raw,value:unescapeIcs(line.slice(at+1))});}
    if(events.length>10000)throw Error('ICS 事件数量超过 10000。');
  }
  if(current)throw Error('ICS 事件未结束。');if(!events.length)throw Error('ICS 中没有课程事件。');return events;
}
function icsDate(field) {
  if(!field)throw Error('缺少开始或结束时间。');const m=field.value.match(/^(\d{4})(\d{2})(\d{2})T([01]\d|2[0-3])([0-5]\d)([0-5]\d)?(Z)?$/i);if(!m)throw Error('只支持有具体时刻的课程，全天或非法时间需修正。');
  if(Number(m[6]||0)!==0)throw Error('课程作息按分钟保存，秒级时刻请先修正后再导入。');
  const date=`${m[1]}-${m[2]}-${m[3]}`,time=`${m[4]}:${m[5]}`;if(!validDate(date))throw Error('ICS 日期不存在。');
  const zone=field.raw.match(/TZID=(?:"([^"]+)"|([^;]+))/i),tz=zone?.[1]||zone?.[2];if(tz&&!['Asia/Shanghai','Asia/Chongqing','Asia/Harbin','Asia/Hong_Kong'].includes(tz))throw Error(`暂不支持时区 ${tz}，请先导出 UTC 或北京时间的具体课次。`);
  return m[7]?itemTimeParts(`${date}T${time}:${m[6]||'00'}Z`):{date,time};
}
export function parseCourseIcs(text, table) {
  if(!table.startDate||!table.schedule.length)throw Error('导入 ICS 前请设置开学日与作息时间。');
  const events=icsEvents(text),groups=new Map(),get=(e,k)=>e[k]?.[0]?.value||'';
  const overridden=new Set(events.filter(e=>e['RECURRENCE-ID']).map(e=>get(e,'UID')));
  for(const [index,e] of events.entries()){
    if(get(e,'STATUS').toUpperCase()==='CANCELLED'&&!e['RECURRENCE-ID'])continue;
    let fields={title:get(e,'SUMMARY'),teacher:get(e,'X-JEEWEAVE-TEACHER')||get(e,'DESCRIPTION').match(/(?:教师|老师)[:：]\s*([^\n]+)/)?.[1]||'',location:get(e,'LOCATION'),weekday:'',periodStart:'',periodEnd:'',weeksText:'',color:get(e,'X-JEEWEAVE-COLOR')||get(e,'X-JIWEI-COLOR')};
    try{
      if(e.EXRULE)throw Error('不支持 EXRULE 排除规则，请先展开具体课次。');
      if(e['RECURRENCE-ID']||overridden.has(get(e,'UID')))throw Error('该系列含 RECURRENCE-ID 单次覆盖，请先展开为独立课次再导入，避免漏掉调整。');
      const start=icsDate(e.DTSTART?.[0]),end=icsDate(e.DTEND?.[0]);
      if(start.date!==end.date||end.time<=start.time)throw Error('课程需要同一天内且结束晚于开始的时段。');
      const first=table.schedule.find(p=>p.start===start.time),last=table.schedule.find(p=>p.end===end.time);
      if(!first||!last||last.index<first.index)throw Error('日历时段无法匹配当前作息，请先设置对应作息时间。');
      fields.periodStart=String(first.index);fields.periodEnd=String(last.index);
      const dates=new Set([start.date]);
      if(e.RRULE){
        if(e.RRULE.length!==1)throw Error('不支持多个重复规则，请先展开课次。');
        const rule=Object.fromEntries(get(e,'RRULE').toUpperCase().split(';').map(v=>v.split('='))),allowed=['FREQ','BYDAY','INTERVAL','COUNT','UNTIL','WKST'];
        if(rule.FREQ!=='WEEKLY'||Object.keys(rule).some(k=>!allowed.includes(k))||rule.WKST&&rule.WKST!=='MO')throw Error('目前只支持以周一为起点的每周重复规则，请先展开其他重复。');
        const interval=Number(rule.INTERVAL||1),count=Number(rule.COUNT||10000),weekdays=rule.BYDAY?rule.BYDAY.split(',').map(d=>['MO','TU','WE','TH','FR','SA','SU'].indexOf(d)+1):[weekdayOf(start.date)];
        if(!Number.isInteger(interval)||interval<1||!Number.isInteger(count)||count<1||weekdays.some(d=>!d)||!weekdays.includes(weekdayOf(start.date))||rule.COUNT&&rule.UNTIL)throw Error('重复规则参数无效。');
        let until=rule.UNTIL?icsDate({raw:'UNTIL',value:rule.UNTIL}):null,seen=0;
        const termEnd=dateForWeek(table,table.totalWeeks,7);
        if((Date.parse(termEnd)-Date.parse(start.date))/86400000>3660)throw Error('重复起点距当前学期超过十年，请先裁剪日历。');
        dates.clear();for(let date=start.date;date<=termEnd;date=dateForWeek({startDate:date},1,2)){
          if(until&&`${date}T${start.time}`>`${until.date}T${until.time}`)break;
          const week=Math.round((Date.parse(mondayOf(date))-Date.parse(mondayOf(start.date)))/604800000);
          if(week%interval===0&&weekdays.includes(weekdayOf(date))){if(++seen>count)break;dates.add(date);}
        }
      }
      for(const f of e.RDATE||[])for(const value of f.value.split(',')){const added=icsDate({...f,value});if(added.time!==start.time)throw Error('额外课次与系列时刻不同，请先展开为独立事件。');dates.add(added.date);}
      for(const f of e.EXDATE||[])for(const value of f.value.split(',')){const excluded=icsDate({...f,value});if(excluded.time===start.time)dates.delete(excluded.date);}
      // Preserve an error row instead of silently importing a partial semester.
      if(!dates.size)throw Error('此事件没有可导入课次。');
      for(const date of dates){const week=currentWeek(table,date);if(week<1||week>table.totalWeeks)throw Error('日历课次超出当前学期，请先裁剪文件或选择正确课表。');}
      for(const date of dates){const week=currentWeek(table,date);
        const part={...fields,weekday:String(weekdayOf(date)),weeksText:String(week)},key=JSON.stringify([part.title,part.teacher,part.location,part.weekday,part.periodStart,part.periodEnd,part.color]);
        const old=groups.get(key);if(old)old.weeks.add(week);else groups.set(key,{line:index+1,fields:part,weeks:new Set([week]),selected:true,errors:[]});
      }
    }catch(error){groups.set(`error-${index}`,{line:index+1,fields,selected:true,errors:[error.message],weeks:null});}
  }
  // Any invalid member of a recurring event must block that whole event, not
  // leave already-expanded rows behind. Build a temporary expansion per event.
  return [...groups.values()].map(({weeks,...row})=>({...row,fields:{...row.fields,...(weeks?{weeksText:[...weeks].sort((a,b)=>a-b).join(',')}:{})}}));
}
export function exportCourseIcs(table) {
  if(!table.startDate)throw Error('导出 ICS 前请设置第 1 周周一。');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//JeeWeave//Desktop Courses//CN','CALSCALE:GREGORIAN',`X-WR-CALNAME:${escapeIcs(table.name)}`];
  for(const entry of projectCourseOccurrences(table).filter(e=>e.status==='normal')){
    const times=courseTimes(table,entry);if(!times)throw Error(`课程“${entry.title}”没有完整作息，请先补齐。`);
    const utc=time=>new Date(`${entry.date}T${time}:00+08:00`).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    lines.push('BEGIN:VEVENT',`UID:${encodeURIComponent(JSON.stringify([table.id,entry.logicalId]))}@jeeweave.local`,`DTSTAMP:${stamp}`,`DTSTART:${utc(times.start)}`,`DTEND:${utc(times.end)}`,`SUMMARY:${escapeIcs(entry.title)}`,`LOCATION:${escapeIcs(entry.location)}`,`DESCRIPTION:${escapeIcs(`教师：${entry.teacher||''}\n${entry.isMovedIn?'调入课次，原日期：'+entry.originalDate:''}`)}`,`X-JEEWEAVE-TEACHER:${escapeIcs(entry.teacher)}`,`X-JEEWEAVE-PERIODS:${entry.periodStart}-${entry.periodEnd}`,`X-JEEWEAVE-COLOR:${escapeIcs(entry.color)}`,'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const encoder=new TextEncoder();return lines.map(line=>{let out='',part='',bytes=0;for(const ch of line){const n=encoder.encode(ch).length;if(bytes+n>75){out+=part+'\r\n';part=' ';bytes=1;}part+=ch;bytes+=n;}return out+part;}).join('\r\n')+'\r\n';
}
export function exportCourseCsv(table) { const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return '\ufefftitle,teacher,location,weekday,periodStart,periodEnd,weeks,color\r\n'+table.courses.map(c=>[c.title,c.teacher,c.location,c.weekday,c.periodStart,c.periodEnd,c.weekText||(c.weeks||[]).join(','),c.color].map(cell).join(',')).join('\r\n'); }
