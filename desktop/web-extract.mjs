import { dateForWeek } from '../shared/packages/core/src/semester-calendar.mjs';

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; } catch { return false; }
}
export function extractActionDate(text, referenceDate) {
  const explicit = text.match(/(?:(20\d{2})\s*[-/年]\s*)?(\d{1,2})\s*[-/月]\s*(\d{1,2})(?:日|号)?/);
  if (explicit) {
    const date = `${explicit[1] || referenceDate.slice(0, 4)}-${explicit[2].padStart(2, '0')}-${explicit[3].padStart(2, '0')}`;
    return { date: validDate(date) ? date : '', inferred: !explicit[1] };
  }
  const relative = text.match(/今天|明天|后天/);
  if (relative) return { date: dateForWeek({ startDate: referenceDate }, 1, ['今天', '明天', '后天'].indexOf(relative[0]) + 1), inferred: true };
  return { date: '', inferred: false };
}
export function organizeWebText(source, referenceDate) {
  const lines = [...new Set(String(source.text || '').split(/\n+|(?<=[。；;！？])\s*/).map(line => line.replace(/\s+/g, ' ').trim()).filter(line => line.length > 5))];
  const ranked = lines.map((text, index) => {
    const action = /提交|报名|申请|上传|缴费|确认|领取|参加|完成|登记|预约|交付/.test(text) && !/无需|不用|不需要|请勿|虚构示例|已取消/.test(text);
    const dated = extractActionDate(text, referenceDate);
    const score = (action ? 4 : 0) + (dated.date ? 3 : 0) + (/截止|截至|重要|注意|务必|地点|时间|要求/.test(text) ? 2 : 0);
    return { text, index, action, ...dated, score };
  });
  const highlights = ranked.filter(line => line.score).sort((a,b) => b.score-a.score || a.index-b.index).slice(0,8).sort((a,b)=>a.index-b.index).map(line=>line.text);
  if (!highlights.length) highlights.push(...lines.slice(0,3));
  const drafts = ranked.filter(line => line.action).slice(0,8).map((line,index)=>({
    id: `draft-${index + 1}`, title: line.text.slice(0,160), date: line.date, dateInferred: line.inferred,
    evidence: line.text, status: 'pending',
  }));
  return { highlights, drafts };
}
