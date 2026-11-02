// Run with node. Own the Electron lifetime and remove the isolated test data on success/failure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../.cache/test-runs');
if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  fs.mkdirSync(base,{recursive:true});const run=fs.mkdtempSync(path.join(base,'chrome-interaction-'));
  if(path.dirname(run)!==base)throw Error('Unsafe test directory');
  (async()=>{
    let code=1,child;const timer=setTimeout(()=>child?.kill(),180000);
    try{
      child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,env:{...process.env,JEEWEAVE_DIAGNOSTICS_TEST:run,JEEWEAVE_DATA_DIR:path.join(run,'data'),JEEWEAVE_DESKTOP_PROTOTYPE:'1'}});
      code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',n=>resolve(n??1));});
    }finally{clearTimeout(timer);fs.rmSync(run,{recursive:true,force:true,maxRetries:20,retryDelay:150});console.log('Chrome interaction test data removed.');}
    process.exitCode=code;
  })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow}=require('electron'),output=path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST||'');
  if(path.dirname(output)!==base||!path.basename(output).startsWith('chrome-interaction-'))throw Error('Use node desktop/tests/chrome-interaction.cjs');
  app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
  app.on('browser-window-created',(_event,win)=>{win.setSkipTaskbar(true);win.__diagnosticHide=()=>win.hide();win.on('show',win.__diagnosticHide);});
  require('../main.cjs');
  const wait=()=>new Promise(r=>setTimeout(r,70));
  (async()=>{
    await app.whenReady();let win;
    for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('Boolean(document.querySelector("#desktop-module-reminders"))').catch(()=>false))break;await wait();}
    assert.ok(win);win.setMinimumSize(900,640);win.webContents.setBackgroundThrottling(false);win.removeListener('show',win.__diagnosticHide);win.showInactive();const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error('renderer:',event.message);}});
    const run=code=>win.webContents.executeJavaScript(code).catch(error=>{throw Error(error.message+'; step: '+code.slice(0,600));}),click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click();true');
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const query=async text=>run('document.querySelector("#desktop-search-input").value='+JSON.stringify(text)+';document.querySelector("#desktop-search-input").dispatchEvent(new Event("input",{bubbles:true}));true');
    const key=(selector,value)=>run('document.querySelector('+JSON.stringify(selector)+').dispatchEvent(new KeyboardEvent("keydown",{key:'+JSON.stringify(value)+',bubbles:true,cancelable:true}));true');
    const capture=async name=>{if(process.env.JEEWEAVE_CHROME_FAST==='1')return;win.removeListener('show',win.__diagnosticHide);win.showInactive();await sleep(400);for(let i=0;i<3;i++){try{fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());return;}catch(e){if(i===2)throw e;await sleep(100);}}};
    await click('.nav [data-view=settings]');await click('#desktop-developer-mode');await click('.nav [data-view=courses]');await click('#desktop-load-demo');
    const ids=['sidebar','rail','top','float','dock','island','focus'];
    for(const width of [1440,900]){
      win.setSize(width,width===1440?960:760);await sleep(160);assert.ok(Math.abs((await run("innerWidth"))-width)<=2,"actual viewport width within native border rounding");
      for(const id of ids){
        await click('[data-desktop-layout='+id+']');await sleep(90);
        assert.equal(await run('document.querySelectorAll("#desktop-assistant-open").length'),1);
        assert.equal(await run('document.querySelectorAll(".sidebar [data-view=settings]").length'),1);
        assert.equal(await run('document.querySelectorAll("[data-shell-action=assistant],[data-shell-action=settings]").length'),0);
        assert.equal(await run('document.querySelectorAll("#desktop-search-open").length'),1);
        assert.equal(await run('(()=>{const a=document.querySelector("#desktop-assistant-open"),b=document.querySelector(".nav [data-view=courses]");return a.getBoundingClientRect().height<=b.getBoundingClientRect().height+1&&getComputedStyle(a.querySelector("svg")).height===getComputedStyle(b.querySelector("svg")).height})()'),true,'assistant matches navigation size: '+id);
        await click('#desktop-search-open');await query('高等数学');
        assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),false);
        assert.equal(await run('document.querySelectorAll("dialog[open]").length'),0,'search is not a modal');
        assert.ok(await run('document.querySelectorAll("[data-search-open]").length')>0);
        assert.equal(await run('document.querySelector("#desktop-search-panel").getAttribute("role")'),'search');
        assert.equal(await run('(()=>{const a=document.querySelector(".desktop-search-dropdown").getBoundingClientRect(),b=document.querySelector(".main").getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.bottom<=innerHeight})()'),true,'search dropdown fits '+id);
        if((id==='dock'&&width===900)||(id==='sidebar'&&width===1440))await capture(id+'-search-'+width);
        await key('#desktop-search-input','ArrowDown');assert.equal(await run('document.activeElement.hasAttribute("data-search-open")'),true);
        await key('[data-search-open]','ArrowUp');assert.equal(await run('document.activeElement.id'),'desktop-search-input');
        await key('#desktop-search-input','Escape');assert.equal(await run('document.querySelector("#desktop-search-input").value'),'');await key('#desktop-search-input','Escape');assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true);
        assert.equal(await run('document.activeElement.id'),'desktop-search-open');
      }
    }
    // Chinese IME does not replace results halfway through composition.
    await click('#desktop-search-open');await query('高等数学');
    const before=await run('document.querySelector("#desktop-search-results").textContent');
    await run('document.querySelector("#desktop-search-input").value="不存在的资料";document.querySelector("#desktop-search-input").dispatchEvent(new InputEvent("input",{isComposing:true,bubbles:true}));true');
    assert.equal(await run('document.querySelector("#desktop-search-results").textContent'),before);
    await run('document.querySelector("#desktop-search-input").dispatchEvent(new CompositionEvent("compositionend",{bubbles:true}));true');
    assert.match(await run('document.querySelector("#desktop-search-results").textContent'),/没有匹配/);
    await query('高等数学');await run('document.querySelector("#desktop-search-type").value="courseEntry";document.querySelector("#desktop-search-type").dispatchEvent(new Event("change"));true');
    await key('#desktop-search-input','Enter');assert.equal(await run('document.querySelector("#desktop-course-dialog").open'),true,'original course opens');
    assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true);
    await run('document.querySelector("#desktop-course-editor").elements.title.value="保留编辑草稿";document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true}));true');
    assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true);
    assert.equal(await run('document.querySelector("#desktop-course-editor").elements.title.value'),'保留编辑草稿');
    await run('document.querySelector("#desktop-course-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));true');
    await click('#desktop-layout-menu');await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true}));true');assert.equal(await run('document.documentElement.classList.contains("desktop-menu-open")'),false,JSON.stringify(await run('({hidden:document.querySelector("#desktop-search-panel").hidden,active:document.activeElement.id,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.id)})')));await run('document.querySelector(".main").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));true');
    assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true,'clicking outside collapses search');
    await click('#desktop-search-open');await click('.nav [data-view=today]');
    assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true,'navigation collapses search');
    await click('.nav [data-view=plugins]');await click('#desktop-module-assistant');assert.equal(await run('document.querySelectorAll("#desktop-assistant-open").length'),0);
    await click('#desktop-module-assistant');assert.equal(await run('document.querySelectorAll("#desktop-assistant-open").length'),1);
    await click('[data-desktop-layout=dock]');win.setSize(900,760);await click('.nav [data-view=courses]');await capture('dock-navigation-900');
    assert.deepEqual(errors,[]);
    const summary=path.resolve(__dirname,'../.cache/verification');fs.mkdirSync(summary,{recursive:true});fs.writeFileSync(path.join(summary,'chrome-interaction-20261031.json'),JSON.stringify({date:'2026-10-31',status:'passed',layouts:7,widths:[900,1440],checks:['unique search/AI/settings entries','equal assistant navigation height and icon size','inline search without modal','dropdown bounds','IME and empty state','type filter and original course open','open editor draft protected','keyboard arrows Escape focus return','outside click and navigation close','assistant plugin stop/reopen'],boundary:'Isolated data; no real API or hardware FPS check'},null,2));
    console.log('PASS chrome interaction: '+output);if(process.env.JEEWEAVE_CHROME_FAST!=='1')await sleep(35000);app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}

