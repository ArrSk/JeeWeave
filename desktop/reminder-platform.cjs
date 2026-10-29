const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {powershell,psQuote}=require('./windows-shell.cjs');
function createReminderPlatform({root,scheduler,platform=process.platform,enabled=()=>true}){
  const rowsFile=path.join(root,'reminders.json'),worker=path.join(root,'reminder-worker.ps1');
  fs.mkdirSync(root,{recursive:true});
  const atomic=(file,data)=>{const temp=file+'.new';try{fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}};
  const rows=()=>{if(!fs.existsSync(rowsFile))return [];const value=JSON.parse(fs.readFileSync(rowsFile,'utf8'));if(!Array.isArray(value))throw Error('提醒文件损坏，请保留文件后恢复');return value;};
  const taskName=id=>'JeeWeave-'+createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,12)+'-'+id;
  const schedule=scheduler||(async(mode,row)=>{if(platform!=='win32')throw Error('当前系统不支持 Windows 提醒');fs.copyFileSync(path.join(__dirname,'reminder-task.ps1'),worker);return powershell('& '+psQuote(worker)+' -Mode '+mode+' -Root '+psQuote(root)+' -Id '+psQuote(row.id));});
  let queue=Promise.resolve(),applied=null;
  const serial=(job,guard=true)=>{const run=queue.then(()=>{if(guard)check();return job();});queue=run.catch(()=>{});return run;};
  const check=()=>{if(!enabled())throw Error('提醒插件已关闭，请在插件管理中开启。');};
  async function handle(action,p={}){
    check();
    if(action==='reminders-list')return {ok:true,rows:rows().map(row=>{let fired=null;try{fired=JSON.parse(fs.readFileSync(path.join(root,'reminder-receipts',row.id+'.json'),'utf8').replace(/^\uFEFF/,''));}catch{}return {...row,lastFired:fired?.fired||null,delivered:Boolean(fired&&!row.daily&&fired.fired>=row.at)};})};
    if(action==='reminder-add')return serial(async()=>{
      const {validateReminder}=await import('./reminder-core.mjs');const intent=validateReminder({action:'reminder',...p});if(intent.action!=='reminder')throw Error('提醒格式无效');
      const old=rows();if(old.length>=200)throw Error('请先清理旧提醒，最多保留200条');
      const row={id:randomUUID(),title:intent.title,at:intent.at,daily:intent.daily,mode:intent.mode,date:intent.date,archived:false};if(row.mode==='timed')row.taskName=taskName(row.id);
      atomic(rowsFile,JSON.stringify([...old,row],null,2));
      try{if(row.mode==='timed')await schedule('Register',row);}catch(error){atomic(rowsFile,JSON.stringify(old,null,2));throw error;}
      return {ok:true,row};
    });
    if(action==='reminder-cancel')return serial(async()=>{
      if(!/^[a-f0-9-]{36}$/.test(p.id||''))throw Error('提醒编号无效');const all=rows(),row=all.find(r=>r.id===p.id);if(!row)throw Error('提醒已不存在');
      if(!row.mode||row.mode==='timed')await schedule('Cancel',row);atomic(rowsFile,JSON.stringify(all.filter(r=>r.id!==p.id),null,2));const receipt=path.join(root,'reminder-receipts',p.id+'.json');if(fs.existsSync(receipt))fs.unlinkSync(receipt);return {ok:true};
    });
    if(action==='reminder-state')return serial(async()=>{
      if(typeof p.archived!=='boolean')throw Error('处理状态无效');
      const all=rows(),row=all.find(r=>r.id===p.id);if(!row)throw Error('提醒已不存在');
      if(!row.mode||row.mode==='timed')throw Error('定时提醒请使用取消');
      row.archived=p.archived;atomic(rowsFile,JSON.stringify(all,null,2));return {ok:true};
    });
    if(action==='reminder-repair')return serial(async()=>{let count=0;for(const row of rows()){if(row.archived||row.mode&&row.mode!=='timed'||!row.daily&&row.at<Date.now())continue;await schedule('Register',row);count++;}return {ok:true,count};});
    throw Error('不支持此提醒操作');
  }
  // Disabling retains rows but cancels OS tasks; enabling restores only future/daily tasks.
  function reconcile(){return serial(async()=>{
    const wanted=enabled();if(wanted===applied)return;
    for(const row of rows()){
      if(row.mode&&row.mode!=='timed')continue;
      if(wanted){if(!enabled()||row.archived||!row.daily&&row.at<Date.now())continue;await schedule('Register',row);}
      else await schedule('Cancel',row);
    }
    applied=wanted;
  },false);}
  return {handle,reconcile};
}
module.exports={createReminderPlatform};
