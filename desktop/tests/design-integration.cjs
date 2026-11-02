// Run with node. Own the Electron lifetime and remove the isolated test data on success/failure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../.cache/test-runs');
if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  fs.mkdirSync(base,{recursive:true});const run=fs.mkdtempSync(path.join(base,'design-integration-'));
  if(path.dirname(run)!==base)throw Error('Unsafe test directory');
  (async()=>{
    let code=1,child;const timer=setTimeout(()=>child?.kill(),180000);
    try{
      child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,env:{...process.env,JEEWEAVE_DIAGNOSTICS_TEST:run,JEEWEAVE_DATA_DIR:path.join(run,'data'),JEEWEAVE_DESKTOP_PROTOTYPE:'1'}});
      code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',n=>resolve(n??1));});
    }finally{clearTimeout(timer);fs.rmSync(run,{recursive:true,force:true,maxRetries:20,retryDelay:150});console.log('Design integration test data removed.');}
    process.exitCode=code;
  })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow}=require('electron'),output=path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST||'');
  if(path.dirname(output)!==base||!path.basename(output).startsWith('design-integration-'))throw Error('Use node desktop/tests/design-integration.cjs');
  app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
  app.on('browser-window-created',(_event,win)=>{win.setSkipTaskbar(true);win.__diagnosticHide=()=>win.hide();win.on('show',win.__diagnosticHide);});
  require('../main.cjs');
  const wait=()=>new Promise(r=>setTimeout(r,70));
  (async()=>{
    await app.whenReady();let win;
    for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('Boolean(document.querySelector("#desktop-module-reminders"))').catch(()=>false))break;await wait();}
    assert.ok(win);win.setMinimumSize(900,640);win.webContents.setBackgroundThrottling(false);win.removeListener('show',win.__diagnosticHide);win.showInactive();const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error('renderer:',event.message);}});
    const run=code=>win.webContents.executeJavaScript(code).catch(error=>{throw Error(error.message+'; step: '+code.slice(0,600));}),click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click();true');

    const disk=()=>JSON.parse(fs.readFileSync(path.join(output,'data/workspace.json'),'utf8'));
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const layout=id=>click(`[data-desktop-layout="${id}"]`),theme=id=>click(`[data-theme="${id}"]`);
    const geometry=()=>run('(()=>{const r=document.querySelector(".main").getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()');
    const business=()=>{const d=disk().data;delete d.preferences;return JSON.stringify(d)};
    const capture=async name=>{if(process.env.JEEWEAVE_TEST_NO_CAPTURE==='1')return;if(process.env.JEEWEAVE_DESIGN_CONFIRM==='1'&&!['dock-courses-900','settings-1440'].includes(name))return;console.log('Capture '+name);win.showInactive();await sleep(500);for(let attempt=0;attempt<3;attempt++){try{fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());return;}catch(error){if(attempt===2)throw error;await sleep(120);}}};
    await click('.nav [data-view="settings"]');await click('#desktop-developer-mode');
    await click('.nav [data-view="courses"]');await click('#desktop-load-demo');
    await click('.nav [data-view="settings"]');
    const before=business();
    const ids=['sidebar','rail','top','float','dock','island','focus'];
    const colors=['studio-linen','studio-ink','studio-mist','studio-sand','studio-lavender','studio-graphite','studio-rose','studio-ocean'];
    for(const width of [1440,900]){
      win.setSize(width,width===1440?960:760);await sleep(160);assert.ok(Math.abs((await run("innerWidth"))-width)<=2,"actual viewport width within native border rounding");
      for(const id of ids){
        await layout(id);await sleep(70);const bounds=await geometry();
        for(const color of colors){await theme(color);assert.deepEqual(await geometry(),bounds,'color does not move geometry');assert.equal(disk().data.preferences.layout.layout,id);}
        for(const page of ['today','courses','plans','calendar','objects','notes','web-capture','plugins','settings']){
          await click(`.nav [data-view="${page}"]`);
          assert.equal(await run('document.querySelector(".main").dataset.activeView'),page);
          assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true);
        }
        const inBounds=await run('(()=>{const a=document.querySelector(".sidebar").getBoundingClientRect(),b=document.querySelector(".shell").getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1})()');
        assert.equal(inBounds,true,id+' navigation fits');
        if(['float','dock','island'].includes(id)){
          await run('document.querySelector("#desktop-bar-handle").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));true');
          const p=disk().data.preferences.layout.position;assert.ok(p);
          await theme('studio-linen');assert.deepEqual(disk().data.preferences.layout.position,p);
          await run('document.querySelector("#desktop-bar-handle").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));true');
          assert.equal(disk().data.preferences.layout.position,null);
        }
      }
    }
    assert.equal(business(),before,'design changes preserve all business collections');
    // Actual pointer capture drag in the real window; no real workspace or OS cursor movement.
    win.removeListener('show',win.__diagnosticHide);win.show();win.focus();await layout('dock');await sleep(100);
    const rect=await run('document.querySelector("#desktop-bar-handle").getBoundingClientRect().toJSON()');
    const x=Math.round(rect.x+rect.width/2),y=Math.round(rect.y+rect.height/2);
    win.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});
    win.webContents.sendInputEvent({type:'mouseMove',x:x+40,y:y-30,button:'left',buttons:['left']});
    win.webContents.sendInputEvent({type:'mouseUp',x:x+40,y:y-30,button:'left',clickCount:1});await sleep(100);
    assert.ok(disk().data.preferences.layout.position,'actual pointer drag is saved');win.hide();
    const saved=disk().data.preferences.layout;
    await win.reload();await sleep(600);
    assert.equal(await run('document.documentElement.dataset.workspaceLayout'),'dock');assert.deepEqual(disk().data.preferences.layout,saved);
    await click('.nav [data-view="settings"]');
    // A storage failure must leave the previously committed layout applied.
    await click('#desktop-bar-reset');const barBefore=await run('document.querySelector(".sidebar").getBoundingClientRect().left');
    const rename=fs.renameSync;
    try{fs.renameSync=(from,to)=>{if(path.resolve(to)===path.resolve(output,'data/workspace.json'))throw Error('isolated layout save failure');return rename(from,to);};await layout('rail');assert.equal(await run('document.documentElement.dataset.workspaceLayout'),'dock');assert.equal(disk().data.preferences.layout.layout,'dock');await run('document.querySelector("#desktop-bar-handle").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));true');assert.equal(await run('document.querySelector(".sidebar").getBoundingClientRect().left'),barBefore,'failed drag save restores rendered position');}finally{fs.renameSync=rename;}
    await layout('focus');await click('#desktop-layout-menu');
    assert.equal(await run('document.documentElement.classList.contains("desktop-menu-open")'),true);
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true');
    assert.equal(await run('document.activeElement.id'),'desktop-layout-menu');
    await click('#desktop-search-open');assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),false);
    await click('[data-search-close]');
    await click('#desktop-assistant-open');assert.equal(await run('document.querySelector("#desktop-assistant-dialog").open'),true);
    await run('document.querySelector("#desktop-assistant-dialog").close();true');
    await click('.nav [data-view="plugins"]');await click('#desktop-module-assistant');
    assert.equal(await run('!document.querySelector("#desktop-assistant-open")'),true);
    await click('#desktop-module-assistant');assert.equal(await run('document.querySelectorAll("#desktop-assistant-open").length'),1);
    for(const id of ids){
      await layout(id);await click('.nav [data-view="courses"]');await click('#desktop-add-course');
      assert.equal(await run('document.querySelector("#desktop-course-dialog").open'),true);
      const fits=await run('(()=>{const a=document.querySelector("#desktop-course-dialog").getBoundingClientRect(),b=document.querySelector(".main").getBoundingClientRect();return a.left>=b.left&&a.right<=b.right+1&&a.top>=b.top&&a.bottom<=innerHeight})()');assert.equal(fits,true,'course sheet fits '+id);
      await run('document.querySelector("#desktop-course-editor").elements.title.value="未提交课程草稿";true');
      // Color can be applied without replacing an open editor or losing its draft.
      await theme('studio-ink');assert.equal(await run('document.querySelector("#desktop-course-editor").elements.title.value'),'未提交课程草稿');
      await run('document.querySelector("#desktop-course-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));true');
      if(id==='dock'||id==='island'){await capture(id+'-courses-900');}
      await click('.nav [data-view="settings"]');
    }
    win.setSize(1440,960);
    for(const [id,color] of [['sidebar','studio-linen'],['float','studio-lavender'],['focus','studio-mist']]){
      await layout(id);await theme(color);await click('.nav [data-view="today"]');await capture(id+'-today-1440');await click('.nav [data-view="settings"]');
    }
    await layout('dock');await theme('studio-sand');await capture('settings-1440');
    await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await run('document.querySelector("#desktop-design-particles")?getComputedStyle(document.querySelector("#desktop-design-particles")).display:"none"'),'none');win.webContents.debugger.detach();
    assert.deepEqual(errors,[]);
    const summary=path.resolve(__dirname,'../.cache/verification');fs.mkdirSync(summary,{recursive:true});fs.writeFileSync(path.join(summary,'desktop-design-20261031.json'),JSON.stringify({date:'2026-10-31',status:'passed',layouts:7,newPalettes:8,widths:[900,1440],checks:['56 combinations at both widths','real IPC persistence and reload','failed-write keeps layout','business data unchanged','actual pointer drag','keyboard movement and reset','focus menu and keyboard return','course sheets and unsaved draft','search assistant plugin close/reopen','reduced motion'],boundaries:['No real API or reminders used','No hardware FPS measurement']},null,2));
    console.log('PASS desktop design integration. Review images for 35 seconds: '+output);if(process.env.JEEWEAVE_TEST_NO_CAPTURE!=='1')await sleep(35000);app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}


