export function validateReminder(value,now=Date.now()){
  const action='reminder',title=String(value.title||'').trim();
  if(!title||title.length>160)throw Error('提醒内容为空或太长。');
  const mode=value.mode||'timed';
  if(!['timed','silent','attention'].includes(mode))throw Error('提醒类型无效');
  if(mode==='attention')return {action,title,mode,at:null,daily:false};
  if(value.daily!==undefined&&typeof value.daily!=='boolean')throw Error('重复规则无效。');
  if(mode==='silent'){
    const day=value.date||new Date(value.at||now).toLocaleDateString('sv-SE');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('提示日期无效');
    const at=new Date(day+'T00:00:00').getTime(),date=new Date(now);date.setHours(0,0,0,0);
    if(!Number.isSafeInteger(at)||new Date(at).toLocaleDateString('sv-SE')!==day||at<date.getTime()||at>now+366*86400000)throw Error('静默提示请选择今天或未来一年内的日期');
    return {action,title,mode,date:day,at,daily:false};
  }
  const at=Number(value.at);
  if(!Number.isSafeInteger(at)||at<=now||at>now+366*86400000)throw Error('提醒时间需在未来一年以内。');
  return {action,title,mode,at,daily:value.daily===true};
}
export function remindersForDay(rows, now=new Date()) {
  const date=now.toLocaleDateString('sv-SE');
  return rows.flatMap(row=>{
    if(row.archived)return [];
    if(row.mode==='attention')return [{...row,todayAt:null}];
    if(row.mode==='silent')return row.date===date?[{...row,todayAt:row.at}]:[];
    const at=new Date(row.at),fired=row.lastFired?new Date(row.lastFired):null;
    if(row.daily){if(at.toLocaleDateString('sv-SE')>date)return [];const scheduled=new Date(now);scheduled.setHours(at.getHours(),at.getMinutes(),at.getSeconds(),0);return [{...row,todayAt:scheduled.getTime(),delivered:fired?.toLocaleDateString('sv-SE')===date}];}
    return at.toLocaleDateString('sv-SE')===date||fired?.toLocaleDateString('sv-SE')===date?[{...row,todayAt:row.at}]:[];
  }).sort((a,b)=>a.todayAt-b.todayAt);
}
