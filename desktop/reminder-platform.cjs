const {portableReminders,atomic:atomicTransfer,journalName}=require('./reminder-transfer.cjs');
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {powershell,psQuote}=require('./windows-shell.cjs');
function createReminderPlatform({root,scheduler,platform=process.platform,enabled=()=>true}){
  const rowsFile=path.join(root,'reminders.json'),worker=path.join(root,'reminder-worker.ps1');
  fs.mkdirSync(root,{recursive:true});
  const atomic=(file,data)=>{const temp=file+'.new';try{fs.writeFileSync(temp,data,{mode:0o600});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}};
  const rows=()=>{if(!fs.existsSync(rowsFile))return [];const value=JSON.parse(fs.readFileSync(rowsFile,'utf8'));if(!Array.isArray(value))throw Error('提醒文件损坏，请保留文件后恢复');return value;};
  const taskName=id=>'JeeWeave-'+createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,12)+'-'+id;
  const schedule=scheduler||(async(mode,row)=>{if(platform!=='win32')throw Error('当前系统不支持 Windows 提醒');fs.copyFileSync(path.join(__dirname,'reminder-task.ps1'),worker);return powershell('& '+psQuote(worker)+' -Mode '+mode+' -Root '+psQuote(root)+' -Id '+psQuote(row.id),{timeout:40000});});
  let queue=Promise.resolve(),applied=null,pending=0,running=null,lastError=null;
  const serial=(job,guard=true,operation='write')=>{
    pending++;
    const run=queue.then(async()=>{
      running=operation;
      try{if(guard)check();return await job();}
      catch(error){if(operation==='reconcile')applied=null;lastError={message:String(error.message||error).slice(0,300),at:new Date().toISOString(),operation};throw error;}
      finally{pending--;running=null;}
    });
    queue=run.catch(()=>{});return run;
  };
  const check=()=>{if(fs.existsSync(path.join(root,journalName)))throw Error('迁移恢复尚未完成，请重启几微。');if(!enabled())throw Error('提醒插件已关闭，请在插件管理中开启。');};
  async function handle(action,p={}){
    check();
    if(action==='reminders-list')return {ok:true,rows:rows().map(row=>{let fired=null;try{fired=JSON.parse(fs.readFileSync(path.join(root,'reminder-receipts',row.id+'.json'),'utf8').replace(/^\uFEFF/,''));}catch{}return {...row,lastFired:fired?.fired||row.lastFired||null,delivered:Boolean((!row.mode||row.mode==='timed')&&!row.daily&&(fired?.fired||row.lastFired||0)>=row.at)};})};
    if(action==='reminder-add')return serial(async()=>{
      const {validateReminder}=await import('./reminder-core.mjs');const intent=validateReminder({action:'reminder',...p});if(intent.action!=='reminder')throw Error('提醒格式无效');
      const old=rows();if(old.length>=200)throw Error('请先清理旧提醒，最多保留200条');
      const row={id:randomUUID(),title:intent.title,at:intent.at,daily:intent.daily,mode:intent.mode,date:intent.date,archived:false};if(row.mode==='timed')row.taskName=taskName(row.id);
      atomic(rowsFile,JSON.stringify([...old,row],null,2));
      try{if(row.mode==='timed')await schedule('Register',row);}catch(error){atomic(rowsFile,JSON.stringify(old,null,2));throw error;}
      return {ok:true,row};
    });
    if(action==='reminder-update')return serial(async()=>{
      const {validateReminder,reminderRevision}=await import('./reminder-core.mjs');
      const all=rows(),index=all.findIndex(row=>row.id===p.id),previous=all[index];
      if(!previous)throw Error('提醒已不存在，请重新打开列表。');
      if(typeof p.expected!=='string'||p.expected!==reminderRevision(previous))throw Error('提醒已变化，请重新打开后修改。');
      if(previous.archived)throw Error('请先恢复已处理的提醒。');
      if(p.mode!==(previous.mode||'timed'))throw Error('编辑时保留原提醒类型；更换类型请单独新增。');
      const intent=validateReminder({...p,action:'reminder'});
      const next={...previous,title:intent.title,at:intent.at,daily:intent.daily,mode:intent.mode};
      if(intent.date)next.date=intent.date;else delete next.date;
      all[index]=next;
      atomic(rowsFile,JSON.stringify(all,null,2));
      try { if(next.mode==='timed')await schedule('Register',next); }
      catch(error) {
        all[index]=previous;atomic(rowsFile,JSON.stringify(all,null,2));
        try { if(previous.mode==='timed'||!previous.mode)await schedule('Register',previous); }
        catch(restore) { applied=null;throw Error('原提醒资料已恢复，但系统提醒需重新注册：'+restore.message+'；改期失败：'+error.message); }
        throw error;
      }
      return {ok:true,row:next};
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
    if(action==='reminder-repair')return serial(async()=>{let count=0;for(const row of rows()){if(row.archived||row.mode&&row.mode!=='timed'||!row.daily&&(row.at<Date.now()||row.lastFired>=row.at))continue;await schedule('Register',row);count++;}return {ok:true,count};});
    throw Error('不支持此提醒操作');
  }
  // Disabling retains rows but cancels OS tasks; enabling restores only future/daily tasks.
  function reconcile(){const wanted=enabled();return serial(async()=>{
    if(fs.existsSync(path.join(root,journalName)))throw Error('迁移恢复尚未完成，请重启几微。');
    if(wanted===applied)return;
    for(const row of rows()){
      if(row.mode&&row.mode!=='timed')continue;
      if(wanted){if(!enabled()||row.archived||!row.daily&&(row.at<Date.now()||row.lastFired>=row.at))continue;await schedule('Register',row);}
      else await schedule('Cancel',row);
    }
    applied=wanted;
  },false,'reconcile');}
  // Read-only runtime state, not an enumeration or verification of OS Task Scheduler.
  const diagnostics=()=>({desiredEnabled:Boolean(enabled()),appliedEnabled:applied,pending,running,lastError:lastError?{...lastError}:null});
  const snapshot=()=>portableReminders({schemaVersion:1,rows:rows().map(row=>{
    let fired=row.lastFired||null;try{fired=JSON.parse(fs.readFileSync(path.join(root,'reminder-receipts',row.id+'.json'),'utf8').replace(/^\uFEFF/,''))?.fired||fired;}catch{}
    return {...row,lastFired:fired};
  })});
  const eligible=row=>(!row.mode||row.mode==='timed')&&!row.archived&&(row.daily||row.at>Date.now())&&!(row.lastFired&&!row.daily&&row.lastFired>=row.at);
  function transfer(incoming,hooks){
    return serial(async()=>{
      hooks.check();
      const before=snapshot(),previous=rows(),warnings=[];
      const next=portableReminders(incoming).rows.map(row=>{
        const next={...row};
        if(row.mode==='timed'){
          next.taskName=taskName(row.id);
          if(row.daily&&row.at<=Date.now()){
            const clock=new Date(row.at),day=new Date();day.setHours(clock.getHours(),clock.getMinutes(),clock.getSeconds(),0);
            if(day.getTime()<=Date.now()||row.lastFired&&new Date(row.lastFired).toLocaleDateString('sv-SE')===day.toLocaleDateString('sv-SE'))day.setDate(day.getDate()+1);
            next.at=day.getTime();
          }
        }
        return next;
      });
      const backup=hooks.backup();
      hooks.begin([...new Set([...before.rows,...next].map(row=>row.id))]);
      applied=null;let committed=false,result;
      try{
        for(const row of previous)if(!row.mode||row.mode==='timed')await schedule('Cancel',row);
        atomic(rowsFile,JSON.stringify(next,null,2));
        for(const id of new Set([...before.rows,...next].map(row=>row.id))){
          const row=next.find(row=>row.id===id),file=path.join(root,'reminder-receipts',id+'.json');
          if(row?.lastFired){const fired=new Date(row.lastFired);atomicTransfer(file,JSON.stringify({fired:row.lastFired,day:fired.toLocaleDateString('sv-SE')}));}
          else if(fs.existsSync(file))fs.unlinkSync(file);
        }
        result=hooks.commit();committed=true;
        try{hooks.finish();}catch(error){warnings.push('资料已写入，但迁移恢复记录未清理，请重启几微完成恢复。');lastError={message:String(error.message).slice(0,300),at:new Date().toISOString(),operation:'migration'};}
      }catch(error){
        if(!committed){
          try{hooks.rollback();}catch(rollback){throw Error('导入失败且自动恢复未完成，请重启并保留data及备份：'+rollback.message);}
          try{if(enabled())for(const row of previous)if(eligible(row))await schedule('Register',row);applied=Boolean(enabled());}
          catch(restore){lastError={message:String(restore.message).slice(0,300),at:new Date().toISOString(),operation:'migration-rollback'};throw Error('原资料已恢复，但系统提醒需重新注册：'+restore.message+'；导入失败原因：'+error.message);}
        }
        throw error;
      }
      if(!fs.existsSync(path.join(root,journalName))){
        try{if(enabled())for(const row of next)if(eligible(row))await schedule('Register',row);applied=Boolean(enabled());}
        catch(error){warnings.push('资料已导入，系统提醒恢复失败，请在提醒页“重新注册提醒”后核对。');lastError={message:String(error.message).slice(0,300),at:new Date().toISOString(),operation:'migration-register'};}
      }
      return {...result,backup,warnings};
    },false,'migration');
  }
  return {handle,reconcile,diagnostics,snapshot,transfer};
}
module.exports={createReminderPlatform};
