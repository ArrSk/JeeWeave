// Run with node. Own the Electron lifetime and remove the isolated test data on success/failure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../.cache/test-runs');
if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  fs.mkdirSync(base,{recursive:true});const run=fs.mkdtempSync(path.join(base,'quick-schedule-'));
  if(path.dirname(run)!==base)throw Error('Unsafe test directory');
  (async()=>{
    let code=1,child;const timer=setTimeout(()=>child?.kill(),90000);
    try{
      child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,env:{...process.env,JEEWEAVE_DIAGNOSTICS_TEST:run,JEEWEAVE_DATA_DIR:path.join(run,'data'),JEEWEAVE_DESKTOP_PROTOTYPE:'1'}});
      code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',n=>resolve(n??1));});
    }finally{clearTimeout(timer);fs.rmSync(run,{recursive:true,force:true,maxRetries:20,retryDelay:150});console.log('Quick schedule test data removed.');}
    process.exitCode=code;
  })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow}=require('electron'),output=path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST||'');
  if(path.dirname(output)!==base||!path.basename(output).startsWith('quick-schedule-'))throw Error('Use node desktop/tests/quick-schedule.cjs');
  app.disableHardwareAcceleration();
  app.on('browser-window-created',(_event,win)=>{win.setSkipTaskbar(true);win.__diagnosticHide=()=>win.hide();win.on('show',win.__diagnosticHide);});
  require('../main.cjs');
  const wait=()=>new Promise(r=>setTimeout(r,70));
  (async()=>{
    await app.whenReady();let win;
    for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('Boolean(document.querySelector("#desktop-module-reminders"))').catch(()=>false))break;await wait();}
    assert.ok(win);const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error('renderer:',event.message);}});
    const run=code=>win.webContents.executeJavaScript(code).catch(error=>{throw Error(error.message+'; step: '+code.slice(0,600));}),click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click();true');


    const disk=()=>JSON.parse(fs.readFileSync(path.join(output,'data/workspace.json'),'utf8'));
    const {today}=await import('../../shared/packages/core/src/semester-calendar.mjs');
    const day=today(),due=new Date(Date.parse(day+'T12:00:00Z')+7*86400000).toISOString().slice(0,10);
    const fill=(selector,fields)=>run('(()=>{const f=document.querySelector('+JSON.stringify(selector)+');for(const[k,v]of Object.entries('+JSON.stringify(fields)+'))f.elements[k].value=v;f.requestSubmit();return true;})()');
    await click('.nav [data-view="objects"]');await click('#desktop-new-object');
    await fill('#desktop-object-form',{title:'提高身体素质',type:'general'});
    await click('[data-object-add-item]');await fill('#desktop-plan-form',{title:'整理训练经验',date:due});
    const item=disk().data.tasks[0],links=JSON.stringify(disk().data.objectView.links);assert.ok(item);
    await click('.nav [data-view="today"]');
    const card='[data-today-item="'+item.id+'"]';
    const openSchedule=async()=>{
      await click('#desktop-today-other-open');
      await run('(()=>{const group=document.querySelector("[data-today-group=dated]");if(!group.open)group.querySelector("summary").click();const detail=document.querySelector('+JSON.stringify(card+' details')+');if(!detail.open)detail.querySelector("summary").click();return true;})()');
      await click(card+' [data-today-item-schedule]');
      assert.equal(await run('document.querySelector(".main").dataset.activeView'),'today');
      assert.equal(await run('document.querySelector("#desktop-today-other-dialog").open'),false);
      assert.equal(await run('document.querySelector("#desktop-item-schedule-dialog").open'),true);
    };
    const before=JSON.stringify(disk().data);await openSchedule();await click('#desktop-item-schedule-form [data-schedule-close]');assert.equal(JSON.stringify(disk().data),before,'cancel never writes');
    await openSchedule();
    await run('(()=>{const f=document.querySelector("#desktop-item-schedule-form");f.elements.start.value='+JSON.stringify(day+'T19:00')+';f.elements.end.value='+JSON.stringify(day+'T20:00')+';f.elements.label.value="训练后的复盘";return true;})()');
    const capture=async(name,width,height)=>{
      win.removeListener('show',win.__diagnosticHide);win.setSize(width,height);win.setTitle('几微 · 隔离快速安排验证');win.showInactive();await new Promise(r=>setTimeout(r,200));
      for(let i=0;i<3;i++){try{fs.writeFileSync(path.join(output,name),(await win.webContents.capturePage()).toPNG());break;}catch(error){if(i===2)throw error;await wait();}}
      assert.equal(await run('(()=>{const body=document.querySelector("#desktop-item-schedule-dialog .desktop-course-dialog-body");return body.scrollWidth<=body.clientWidth+1;})()'),true);win.hide();
    };
    await capture('quick-schedule-wide.png',1280,900);await capture('quick-schedule-compact.png',900,740);
    if(process.env.JEEWEAVE_DIAGNOSTIC_REVIEW==='1'){console.log('Quick schedule visual batch: '+output);await new Promise(r=>setTimeout(r,45000));}
    const rename=fs.renameSync;
    try{
      fs.renameSync=(from,to)=>{if(path.resolve(to)===path.resolve(output,'data/workspace.json'))throw Error('isolated schedule disk failure');return rename(from,to);};
      await run('document.querySelector("#desktop-item-schedule-form").requestSubmit();true');
      assert.equal(JSON.stringify(disk().data),before);
      assert.ok(await run('document.querySelector("#desktop-item-schedule-form [role=alert]").textContent.includes("输入仍在这里")'));
      assert.equal(await run('document.querySelector("#desktop-item-schedule-form").elements.label.value'),'训练后的复盘');
    }finally{fs.renameSync=rename;}
    await run('document.querySelector("#desktop-item-schedule-form").requestSubmit();true');
    const saved=disk().data.tasks.find(row=>row.id===item.id);assert.equal(saved.executionSlots.length,1);assert.deepEqual(saved.anchor,item.anchor);
    assert.equal(disk().data.tasks.length,1);assert.equal(JSON.stringify(disk().data.objectView.links),links);
    assert.ok(await run('document.querySelector("#desktop-today-list").textContent.includes("整理训练经验")'));
    assert.ok(await run('document.querySelector("#desktop-today-list").textContent.includes("19:00")'));
    assert.equal(await run('document.querySelector("#desktop-item-schedule-dialog").open'),false);
    await click('.nav [data-view="calendar"]');assert.ok(await run('document.querySelector("#desktop-calendar-grid").textContent.includes("整理训练经验")'));
    await click('.nav [data-view="objects"]');assert.ok(await run('document.querySelector("#desktop-object-detail").textContent.includes("19:00")'));
    // Page transitions close the sheet; source plugin stop also owns its lifecycle.
    await click('.nav [data-view="today"]');await click(card+' [data-today-item-schedule]');
    await click('.nav [data-view="objects"]');assert.equal(await run('document.querySelector("#desktop-item-schedule-dialog").open'),false);
    await click('.nav [data-view="today"]');await click(card+' [data-today-item-schedule]');await click('#desktop-module-plans');
    assert.equal(await run('document.querySelector("#desktop-item-schedule-dialog").open'),false);assert.equal(disk().data.tasks.length,1);
    await click('#desktop-module-plans');assert.equal(await run('document.querySelectorAll("#desktop-item-schedule-form").length'),1);
    assert.deepEqual(errors,[]);
    console.log('Quick schedule UI/real IPC passed: cancel, failure retry, original identity/deadline/links, today/calendar/object projection, navigation and plugin stop.');
    app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}
