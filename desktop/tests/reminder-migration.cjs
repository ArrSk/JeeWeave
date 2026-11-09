// Run with node. Own the Electron lifetime and remove the isolated test data on success/failure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../.cache/test-runs');
if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  fs.mkdirSync(base,{recursive:true});const run=fs.mkdtempSync(path.join(base,'migration-'));
  if(path.dirname(run)!==base)throw Error('Unsafe test directory');
  (async()=>{
    let code=1,child;const timer=setTimeout(()=>child?.kill(),90000);
    try{
      child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,env:{...process.env,JEEWEAVE_DIAGNOSTICS_TEST:run,JEEWEAVE_DATA_DIR:path.join(run,'data'),JEEWEAVE_DESKTOP_PROTOTYPE:'1'}});
      code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',n=>resolve(n??1));});
    }finally{clearTimeout(timer);fs.rmSync(run,{recursive:true,force:true,maxRetries:20,retryDelay:150});console.log('Migration test data removed.');}
    process.exitCode=code;
  })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow}=require('electron'),output=path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST||'');
  if(path.dirname(output)!==base||!path.basename(output).startsWith('migration-'))throw Error('Use node desktop/tests/reminder-migration.cjs');
  app.disableHardwareAcceleration();
  app.on('browser-window-created',(_event,win)=>{win.setSkipTaskbar(true);win.__diagnosticHide=()=>win.hide();win.on('show',win.__diagnosticHide);});
  require('../main.cjs');
  const wait=()=>new Promise(r=>setTimeout(r,70));
  (async()=>{
    await app.whenReady();let win;
    for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('Boolean(document.querySelector("#desktop-module-reminders"))').catch(()=>false))break;await wait();}
    assert.ok(win);const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    const run=code=>win.webContents.executeJavaScript(code),click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click();true');
    const {emptyWorkspace}=await import('../workspace-format.mjs');
    const id='cccccccc-cccc-4ccc-cccc-cccccccccccc',day=new Date().toLocaleDateString('sv-SE');
    const incoming=path.join(output,'incoming.jiwei'),exported=path.join(output,'exported.jiwei');
    const local=await run('jeeWeaveDesktop.assistant("reminder-add",{title:"原注意事项",mode:"attention"})');
    const pack={format:'jeeweave-desktop-transfer',packageVersion:2,appVersion:'fixture',workspace:emptyWorkspace(),files:[],reminders:{schemaVersion:1,rows:[
      {id:local.row.id,title:'导入注意事项',mode:'attention',at:null,daily:false,archived:true},
      {id,title:'静默提示',mode:'silent',date:day,at:Date.now(),daily:false,archived:false},
      {id:'dddddddd-dddd-4ddd-dddd-dddddddddddd',title:'已过期',mode:'timed',at:Date.now()-60000,daily:false,archived:false}
    ]}};
    fs.writeFileSync(incoming,JSON.stringify(pack));
    const {dialog}=require('electron');
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[incoming]});
    dialog.showSaveDialog=async()=>({canceled:false,filePath:exported});
    const until=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await wait();}throw Error('Migration UI did not settle');};
    await click('.nav [data-view="settings"]');
    const original=await run('(async()=>JSON.stringify((await jeeWeaveDesktop.readWorkspace()).workspace))()');
    await click('#desktop-import-data');await until(()=>run('!document.querySelector("#desktop-restore-preview").hidden'));
    const summary=await run('document.querySelector("#desktop-restore-summary").textContent');
    assert.ok(summary.includes('提醒：3条')&&summary.includes('同编号内容冲突1条')&&summary.includes('过期单次1条'));
    assert.equal(await run('(async()=>JSON.stringify((await jeeWeaveDesktop.readWorkspace()).workspace))()'),original);
    await click('#desktop-cancel-restore');assert.equal((await run('jeeWeaveDesktop.assistant("reminders-list")')).rows.length,1);
    await click('#desktop-import-data');await until(()=>run('!document.querySelector("#desktop-restore-preview").hidden'));
    win.removeListener('show',win.__diagnosticHide);win.setTitle('几微 · 隔离迁移验证');win.showInactive();await wait();
    win.setSize(1280,900);await wait();
    await run('document.querySelector(".main").style.scrollBehavior="auto";document.querySelector("#desktop-restore-preview").scrollIntoView({block:"center",behavior:"instant"});true');await new Promise(r=>setTimeout(r,350));
    for(let i=0;i<3;i++){try{fs.writeFileSync(path.join(output,'migration-preview.png'),(await win.webContents.capturePage()).toPNG());break;}catch(error){if(i===2)throw error;await wait();}}
    win.hide();
    if(process.env.JEEWEAVE_DIAGNOSTIC_REVIEW==='1'){console.log('Migration visual batch: '+output);await new Promise(r=>setTimeout(r,35000));}
    await click('#desktop-confirm-restore');await until(()=>run('document.querySelector("#desktop-confirm-restore").disabled===false&&document.querySelector("#desktop-restore-preview").hidden'));
    const rows=(await run('jeeWeaveDesktop.assistant("reminders-list")')).rows;
    assert.equal(rows.length,3);assert.ok(rows.find(r=>r.title==='导入注意事项').archived);
    assert.ok(await run('document.querySelector("#desktop-transfer-result").textContent.includes("完整备份")'));
    await click('#desktop-export-data');await until(()=>Promise.resolve(fs.existsSync(exported)));
    const restored=JSON.parse(fs.readFileSync(exported));assert.equal(restored.packageVersion,2);assert.equal(restored.reminders.rows.length,3);
    assert.ok(!fs.existsSync(path.join(output,'data/reminder-transfer.pending.json')));
    assert.deepEqual(errors,[]);
    console.log('Migration UI and real IPC: preview/cancel, conflict/expiry counts, confirmed import, full backup and v2 export passed.');
    app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}
