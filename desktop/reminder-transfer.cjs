// Portable reminder data and an app-owned recovery journal. No credentials or profile.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const idPattern=/^[a-f0-9-]{36}$/;
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function portableReminders(value){
  if(value?.schemaVersion!==1||!Array.isArray(value.rows)||value.rows.length>200)throw Error('提醒格式版本或数量不支持，请升级应用并保留原包。');
  const ids=new Set();
  return {schemaVersion:1,rows:value.rows.map(row=>{
    if(!row||!idPattern.test(row.id||'')||ids.has(row.id))throw Error('提醒编号无效或重复。');
    ids.add(row.id);
    const mode=row.mode||'timed',title=typeof row.title==='string'?row.title.trim():'';
    if(!['timed','silent','attention'].includes(mode)||!title||title.length>160||row.archived!==undefined&&typeof row.archived!=='boolean'||row.daily!==undefined&&typeof row.daily!=='boolean')throw Error('提醒内容或状态无效。');
    const next={id:row.id,title,mode,archived:row.archived===true,daily:mode==='timed'&&row.daily===true,at:mode==='attention'?null:row.at};
    if(mode==='silent'){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')||new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)!==row.date)throw Error('静默提醒日期无效。');
      next.date=row.date;next.at=new Date(row.date+'T00:00:00').getTime();
    }
    if(mode==='timed'&&(!Number.isSafeInteger(next.at)||next.at<0||next.at>Date.UTC(2101,0,1)))throw Error('定时提醒时间无效。');
    if(row.lastFired!==undefined&&row.lastFired!==null){const at=typeof row.lastFired==='number'?row.lastFired:Date.parse(row.lastFired);if(!Number.isSafeInteger(at)||at<0||at>Date.UTC(2101,0,1))throw Error('提醒投递记录无效。');next.lastFired=at;}
    return next;
  })};
}
function summarizeReminders(incoming,current,now=Date.now()){
  const old=new Map(current.rows.map(r=>[r.id,r])),ids=new Set(incoming.rows.map(r=>r.id));
  return {included:true,total:incoming.rows.length,timed:incoming.rows.filter(r=>r.mode==='timed').length,silent:incoming.rows.filter(r=>r.mode==='silent').length,attention:incoming.rows.filter(r=>r.mode==='attention').length,archived:incoming.rows.filter(r=>r.archived).length,expired:incoming.rows.filter(r=>r.mode==='timed'&&!r.daily&&r.at<=now).length,conflicts:incoming.rows.filter(r=>old.has(r.id)&&fingerprint(old.get(r.id))!==fingerprint(r)).length,removed:current.rows.filter(r=>!ids.has(r.id)).length};
}
function atomic(file,bytes){
  const tmp=file+'.migration-new';
  fs.mkdirSync(path.dirname(file),{recursive:true});
  try{const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
  finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
const journalName='reminder-transfer.pending.json';
function safeFile(root,name){
  if(!/^(?:workspace\.json|reminders\.json|reminder-receipts\/[a-f0-9-]{36}\.json)$/.test(name))throw Error('迁移恢复路径无效。');
  const file=path.join(root,...name.split('/'));
  for(const check of [path.dirname(file),file])if(fs.existsSync(check)&&fs.lstatSync(check).isSymbolicLink())throw Error('提醒资料包含链接，未迁移。');
  return file;
}
function beginRecovery(root,ids,candidate,captureDirectory){
  const journal=path.join(root,journalName);
  if(fs.existsSync(journal))throw Error('存在尚未完成的迁移，请先重启几微完成恢复。');
  const names=['workspace.json','reminders.json',...new Set(ids.map(id=>'reminder-receipts/'+id+'.json'))];
  const files=names.map(name=>{const file=safeFile(root,name);return {name,base64:fs.existsSync(file)?fs.readFileSync(file).toString('base64'):null};});
  const state={schemaVersion:1,targetRevision:candidate.revision+1,targetDataHash:fingerprint(candidate.data),files,captureDirectory};
  atomic(journal,JSON.stringify(state));return state;
}
function recoverWorkspaceTransfer(root,{forceRollback=false}={}){
  const journal=path.join(root,journalName);if(!fs.existsSync(journal))return null;
  const state=JSON.parse(fs.readFileSync(journal,'utf8'));
  if(state.schemaVersion!==1||!Array.isArray(state.files)||state.files.length>402)throw Error('迁移恢复记录损坏，请保留data及备份。');
  let current;try{current=JSON.parse(fs.readFileSync(path.join(root,'workspace.json'),'utf8'));}catch{}
  const committed=!forceRollback&&current?.data&&current?.revision===state.targetRevision&&fingerprint(current.data)===state.targetDataHash;
  const restoredFiles=state.files.map(entry=>{
    const file=safeFile(root,entry.name);
    if(entry.base64===null)return {file,bytes:null};
    if(typeof entry.base64!=='string')throw Error('迁移恢复内容损坏。');
    const bytes=Buffer.from(entry.base64,'base64');if(bytes.toString('base64')!==entry.base64)throw Error('迁移恢复内容损坏。');
    return {file,bytes};
  });
  if(!committed){
    for(const {file,bytes} of restoredFiles){
      if(bytes===null){if(fs.existsSync(file))fs.unlinkSync(file);}
      else atomic(file,bytes);
    }
    if(state.captureDirectory){
      const target=path.resolve(state.captureDirectory),base=path.resolve(root,'captures/migrations');
      if(path.dirname(target)!==base||!/^transfer-[a-f0-9-]+$/.test(path.basename(target)))throw Error('迁移临时目录无效。');
      fs.rmSync(target,{recursive:true,force:true});
    }
  }
  fs.unlinkSync(journal);return {committed,recovered:true};
}
const completeRecovery=root=>fs.unlinkSync(path.join(root,journalName));
module.exports={completeRecovery,portableReminders,summarizeReminders,fingerprint,atomic,beginRecovery,recoverWorkspaceTransfer,journalName};
