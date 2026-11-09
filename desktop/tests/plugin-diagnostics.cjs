// Run with node. Own the Electron lifetime and remove the isolated test data on success/failure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../.cache/test-runs');
if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  fs.mkdirSync(base,{recursive:true});const run=fs.mkdtempSync(path.join(base,'diagnostics-'));
  if(path.dirname(run)!==base)throw Error('Unsafe test directory');
  (async()=>{
    let code=1,child;const timer=setTimeout(()=>child?.kill(),90000);
    try{
      child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,env:{...process.env,JEEWEAVE_DIAGNOSTICS_TEST:run,JEEWEAVE_DATA_DIR:path.join(run,'data'),JEEWEAVE_DESKTOP_PROTOTYPE:'1'}});
      code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',n=>resolve(n??1));});
    }finally{clearTimeout(timer);fs.rmSync(run,{recursive:true,force:true,maxRetries:20,retryDelay:150});console.log('Diagnostics test data removed.');}
    process.exitCode=code;
  })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow}=require('electron'),output=path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST||'');
  if(path.dirname(output)!==base||!path.basename(output).startsWith('diagnostics-'))throw Error('Use node desktop/tests/plugin-diagnostics.cjs');
  app.disableHardwareAcceleration();
  app.on('browser-window-created',(_event,win)=>{win.setSkipTaskbar(true);win.__diagnosticHide=()=>win.hide();win.on('show',win.__diagnosticHide);});
  require('../main.cjs');
  const wait=()=>new Promise(r=>setTimeout(r,70));
  (async()=>{
    await app.whenReady();let win;
    for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('Boolean(document.querySelector("#desktop-module-reminders"))').catch(()=>false))break;await wait();}
    assert.ok(win);const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    const run=code=>win.webContents.executeJavaScript(code),click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click();true');
    assert.equal((await run('jeeWeaveDesktop.assistant("reminder-diagnostics")')).ok,false,'Native diagnostics require developer mode');
    assert.equal(await run('document.querySelector("#desktop-plugin-diagnostics").hidden'),true);
    await click('.nav [data-view="settings"]');await click('#desktop-developer-mode');await click('.nav [data-view="plugins"]');
    assert.equal(await run('document.querySelector("#desktop-plugin-diagnostics").hidden'),false);
    await run('document.querySelector("#desktop-plugin-diagnostics").open=true;true');await wait();
    const before=await run('(async()=>JSON.stringify((await jeeWeaveDesktop.readWorkspace()).workspace))()');
    await click('[data-refresh-diagnostics]');await wait();
    assert.equal(await run('(async()=>JSON.stringify((await jeeWeaveDesktop.readWorkspace()).workspace))()'),before,'Reading diagnostics cannot modify workspace');
    assert.ok(await run('document.querySelector("[data-plugin=reminders]").textContent.includes("运行中")'));
    await click('[data-module=reminders]');await wait();
    assert.ok(await run('document.querySelector("[data-plugin=reminders]").textContent.includes("已停用")'));
    const paused=await run('jeeWeaveDesktop.assistant("reminder-diagnostics")');
    assert.equal(paused.ok,true);assert.equal(paused.desiredEnabled,false);assert.equal(paused.appliedEnabled,false);
    await click('[data-refresh-diagnostics]');await wait();
    assert.ok(await run('document.querySelector("[data-platform-diagnostics]").textContent.includes("暂停请求已处理")'));
    for(let i=0;i<3;i++){await click('[data-module=reminders]');await click('[data-module=reminders]');}await wait();
    await click('[data-module=reminders]');await wait();
    assert.equal(await run('document.querySelectorAll("#desktop-reminders-open").length'),1);
    assert.ok(await run('document.querySelector("[data-plugin=reminders]").textContent.includes("运行中")'));
    win.removeListener('show',win.__diagnosticHide);win.setTitle('几微 · 隔离诊断验证');win.showInactive();await new Promise(r=>setTimeout(r,500));
    for(const width of [1100,1440]){
      win.setSize(width,900);await wait();await run('document.querySelector("#desktop-plugin-diagnostics").scrollIntoView({block:"start"});true');
      assert.ok(await run('document.querySelector("[data-plugin=reminders] dl").getBoundingClientRect().right<=innerWidth'),'Diagnostic fields fit viewport');
      for(let attempt=0;attempt<3;attempt++){try{fs.writeFileSync(path.join(output,'diagnostics-'+width+'.png'),(await win.webContents.capturePage()).toPNG());break;}catch(error){if(attempt===2)throw error;await wait();}}
    }
    win.hide();
    if(process.env.JEEWEAVE_DIAGNOSTIC_REVIEW==='1'){console.log('Visual batch: '+output);await new Promise(r=>setTimeout(r,35000));}
    await click('.nav [data-view="settings"]');await click('#desktop-developer-mode');
    assert.equal(await run('document.querySelector("#desktop-plugin-diagnostics").hidden'),true);
    assert.equal((await run('jeeWeaveDesktop.assistant("reminder-diagnostics")')).ok,false);
    assert.deepEqual(errors,[]);
    console.log('Diagnostics UI and real IPC: developer guard, read-only snapshot, native disabled state, re-enable and widths passed.');
    app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}
