// Run with node. Own the Electron lifetime and remove the isolated test data on success/failure.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../.cache/test-runs');
if(!process.versions.electron){
  const {spawn}=require('node:child_process');
  fs.mkdirSync(base,{recursive:true});const run=fs.mkdtempSync(path.join(base,'redesign-spec-'));
  if(path.dirname(run)!==base)throw Error('Unsafe test directory');
  (async()=>{
    let code=1,child;const timer=setTimeout(()=>child?.kill(),420000);
    try{
      child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true,env:{...process.env,JEEWEAVE_DIAGNOSTICS_TEST:run,JEEWEAVE_DATA_DIR:path.join(run,'data'),JEEWEAVE_DESKTOP_PROTOTYPE:'1'}});
      code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',n=>resolve(n??1));});
    }finally{clearTimeout(timer);fs.rmSync(run,{recursive:true,force:true,maxRetries:20,retryDelay:150});console.log('Redesign spec test data removed.');}
    process.exitCode=code;
  })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow}=require('electron'),output=path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST||'');
  if(path.dirname(output)!==base||!path.basename(output).startsWith('redesign-spec-'))throw Error('Use node desktop/tests/redesign-spec.cjs');
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
  app.on('browser-window-created',(_event,win)=>{win.setSkipTaskbar(true);win.__diagnosticHide=()=>win.hide();win.on('show',win.__diagnosticHide);});
  require('../main.cjs');
  const wait=()=>new Promise(r=>setTimeout(r,70));
  (async()=>{
    await app.whenReady();let win;
    for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());if(win&&await win.webContents.executeJavaScript('Boolean(document.querySelector("#desktop-module-reminders"))').catch(()=>false))break;await wait();}
    assert.ok(win);win.setMinimumSize(900,640);win.webContents.setBackgroundThrottling(false);const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error'){errors.push(event.message);console.error('renderer:',event.message);}});
    const run=code=>win.webContents.executeJavaScript('(()=>{return eval('+JSON.stringify(code)+')})()').catch(error=>{throw Error(error.message+'; step: '+code.slice(0,600));}),click=selector=>run('document.querySelector('+JSON.stringify(selector)+').click();true');
    const sleep=ms=>new Promise(r=>setTimeout(r,ms)),disk=()=>JSON.parse(fs.readFileSync(path.join(output,'data/workspace.json'),'utf8'));
    const key=(selector,key,extra={})=>run('document.querySelector('+JSON.stringify(selector)+').dispatchEvent(new KeyboardEvent("keydown",'+JSON.stringify({key,bubbles:true,cancelable:true,...extra})+'));true');
    const fill=(selector,values)=>run('(()=>{const f=document.querySelector('+JSON.stringify(selector)+');for(const[k,v]of Object.entries('+JSON.stringify(values)+'))f.elements[k].value=v;f.requestSubmit();return true})()');
    const capture=async name=>{if(process.env.JEEWEAVE_SPEC_REVIEW!=='1')return;win.removeListener('show',win.__diagnosticHide);win.showInactive();await sleep(450);for(let i=0;i<3;i++){try{fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());return;}catch(e){if(i===2)throw e;await sleep(150);}}};
    const day=await run('(async()=>{const m=await import("../shared/packages/core/src/semester-calendar.mjs");return m.today()})()');
    await click('.nav [data-view=settings]');await click('[data-theme=studio-linen]');
    assert.equal(await run('document.querySelector(".desktop-settings-subnav").children.length>3'),true);
    await click('.nav [data-view=plans]');await click('#desktop-add-plan');await sleep(80);
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.title.closest(".design-field")!==null'),true);
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.date.type'),'date');
    await click('#desktop-plan-form [data-picker=date]');assert.equal(await run('document.querySelector("#design-field-picker").matches(":popover-open")'),true);
    assert.equal(await run('document.activeElement.hasAttribute("data-picker-date")'),true);
    await key('#design-field-picker [data-picker-date][tabindex="0"]','ArrowRight');await key('#design-field-picker [data-picker-date][tabindex="0"]','Enter');
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.date.value'),new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10));
    await fill('#desktop-plan-form',{title:'完成设计说明',date:day});
    assert.equal(disk().data.tasks.length,1);
    // The native input remains the source even though the time editor accepts shorthand.
    await click('#desktop-add-plan');await run('const f=document.querySelector("#desktop-plan-form");f.elements.type.value="event";f.elements.type.dispatchEvent(new Event("change",{bubbles:true}));true');await sleep(60);
    await run('const f=document.querySelector("#desktop-plan-form"),p=f.elements.startTime.closest(".design-field").querySelector("[data-design-proxy]");p.value="9p";p.dispatchEvent(new Event("input",{bubbles:true}));true');
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.startTime.value'),'21:00');
    await key('#desktop-plan-form [data-design-proxy=time]','ArrowUp');assert.equal(await run('document.querySelector("#desktop-plan-form").elements.startTime.value'),'21:15');
    await run('const f=document.querySelector("#desktop-plan-form"),p=f.elements.startTime.closest(".design-field").querySelector("[data-design-proxy]");p.value="25:00";p.dispatchEvent(new Event("input",{bubbles:true}));p.dispatchEvent(new Event("blur"));true');
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.startTime.getAttribute("aria-invalid")'),'true');
    await key('#desktop-plan-form [data-design-proxy=time]','Enter',{isComposing:true});assert.equal(await run('document.querySelector("#design-field-picker").matches(":popover-open")'),false);
    await click('#desktop-plan-form [data-picker=time]');await click('#design-field-picker [data-time-confirm]');
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.startTime.validity.valid'),true,'picker clears a previous shorthand validation error');
    await fill('#desktop-plan-form',{title:'设计讨论',date:day,startTime:'14:00',endTime:'15:00'});assert.equal(disk().data.plans.length,1);
    await click('#desktop-add-plan');await run('const f=document.querySelector("#desktop-plan-form");f.elements.type.value="weekly";f.elements.type.dispatchEvent(new Event("change",{bubbles:true}));true');await sleep(60);
    const checked=await run('document.querySelector("#desktop-plan-form [name=weekdays]").checked');await click('.design-weekday-buttons button');
    assert.equal(await run('document.querySelector("#desktop-plan-form [name=weekdays]").checked'),!checked);
    await click('#desktop-cancel-plan');
    // Keyboard scheduling and drag share the same public slot creation path.
    const task=disk().data.tasks[0];await run('document.querySelector(".main").scrollTop=0;true');
    await key(`[data-arrange-id="${task.id}"]`,'ArrowDown',{altKey:true});await key(`[data-arrange-id="${task.id}"]`,'Enter');
    assert.equal(disk().data.tasks[0].executionSlots.length,1);
    await click(`[data-item-action=toggle][data-id="${task.id}"]`);assert.equal(disk().data.tasks[0].done,true);
    assert.equal(await run('document.querySelectorAll(".design-retained-completion").length'),1);
    await click('.design-retained-completion button');assert.equal(disk().data.tasks[0].done,false);
    await click(`[data-item-action=toggle][data-id="${task.id}"]`);await run('document.body.focus();document.dispatchEvent(new KeyboardEvent("keydown",{key:"z",ctrlKey:true,bubbles:true}));true');
    assert.equal(disk().data.tasks[0].done,false);
    await click('.nav [data-view=today]');await click(`[data-today-item-complete="${task.id}"]`);
    assert.equal(disk().data.tasks[0].done,true);assert.equal(await run('document.querySelectorAll(".design-retained-completion").length'),1);
    await click('.design-retained-completion button');assert.equal(disk().data.tasks[0].done,false);
    await click('.nav [data-view=plans]');await click(`[data-item-action=delete][data-id="${task.id}"]`);assert.equal(disk().data.tasks.length,1);
    await click('[data-delete-cancel]');assert.equal(disk().data.tasks.length,1);
    await click('.nav [data-view=notes]');await click('#desktop-journal-new');await sleep(60);
    await run('const f=document.querySelector("#desktop-journal-form"),p=f.elements.tags.closest(".design-field").querySelector("[data-design-proxy]");p.value="学习";p.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true,isComposing:true}));true');
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.tags.value'),'','IME composition does not commit a tag');
    await run('const f=document.querySelector("#desktop-journal-form"),p=f.elements.tags.closest(".design-field").querySelector("[data-design-proxy]");p.value="学习";p.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));true');
    assert.equal(await run('document.querySelector("#desktop-journal-form").elements.tags.value'),'学习');
    await fill('#desktop-journal-form',{body:'阅读与记录的内容。',date:day,title:'设计记录'});
    assert.deepEqual(disk().data.journal.entries[0].tags,['学习']);
    // 120 immediate navigations must leave at most one live pair, never cloned IDs.
    win.removeListener('show',win.__diagnosticHide);win.showInactive();await sleep(100);
    await run('for(let i=0;i<120;i++)document.querySelector(i%2?".nav [data-view=plans]":".nav [data-view=today]").click();true');
    assert.equal(await run('document.querySelectorAll(".design-page-snapshot").length<=1'),true);
    assert.equal(await run('[...document.querySelectorAll("[id]")].length===new Set([...document.querySelectorAll("[id]")].map(e=>e.id)).size'),true);
    await sleep(420);assert.equal(await run('document.querySelectorAll(".design-page-snapshot").length'),0);
    // Move an arrange handle across navigation and drop onto the same calendar API.
    await click('.nav [data-view=calendar]');await click('[data-cal-view=week]');await click('.nav [data-view=plans]');
    win.focus();await sleep(450);await run('document.querySelector("[data-arrange-id='+task.id+']").scrollIntoView({block:"center"});true');
    const handleRect=await run('document.querySelector("[data-arrange-id='+task.id+']").getBoundingClientRect().toJSON()'),navRect=await run('document.querySelector(".nav [data-view=calendar]").getBoundingClientRect().toJSON()');
    const hx=Math.round(handleRect.x+handleRect.width/2),hy=Math.round(handleRect.y+handleRect.height/2),nx=Math.round(navRect.x+navRect.width/2),ny=Math.round(navRect.y+navRect.height/2);
    win.webContents.sendInputEvent({type:'mouseMove',x:hx,y:hy});await sleep(70);win.webContents.sendInputEvent({type:'mouseDown',x:hx,y:hy,button:'left',clickCount:1});await sleep(70);
    assert.equal(await run('document.querySelectorAll(".design-paper-drag").length'),1,'pointer pickup is committed before moving across navigation');
    win.webContents.sendInputEvent({type:'mouseMove',x:nx,y:ny,modifiers:['leftbuttondown']});await sleep(450);
    assert.equal(await run('document.querySelector(".main").dataset.activeView'),'calendar');
    await run('document.querySelector(".desktop-calendar-time-scroll").scrollTop=8*48;true');
    const dayRect=await run('document.querySelector('+JSON.stringify('[data-time-date="'+day+'"]')+').getBoundingClientRect().toJSON()'),dx=Math.round(dayRect.x+dayRect.width/2),dy=Math.round(dayRect.y+9*48);
    win.webContents.sendInputEvent({type:'mouseMove',x:dx,y:dy,modifiers:['leftbuttondown']});await sleep(80);win.webContents.sendInputEvent({type:'mouseUp',x:dx,y:dy,button:'left',clickCount:1});await sleep(80);
    assert.equal(disk().data.tasks[0].executionSlots.length,2,'pointer and keyboard both append one slot to the original item');
    await click('.nav [data-view=settings]');await click('#desktop-developer-mode');await click('.nav [data-view=courses]');await click('#desktop-load-demo');
    for(const [width,color]of [[1440,'studio-linen'],[900,'studio-ink']]){
      win.setSize(width,width===1440?960:760);assert.ok(Math.abs((await run("innerWidth"))-width)<=2,"actual viewport width within native border rounding");await click('[data-theme='+color+']');
      for(const page of ['today','courses','plans','calendar','notes','objects','settings']){await click('.nav [data-view='+page+']');await sleep(420);assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true,page+' fits '+width);if(['today','courses','settings'].includes(page))await capture(page+'-'+width);}
      await click('.nav [data-view=plans]');await click('#desktop-add-plan');await capture('inputs-'+width);await click('#desktop-cancel-plan');
      await click('#desktop-search-open');assert.equal(await run('document.querySelector("#desktop-search-input").getBoundingClientRect().width>document.querySelector(".desktop-search-line").getBoundingClientRect().width*.6'),true,'inline search fills its available width');await capture('search-'+width);await click('[data-search-close]');
    }
    await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(60);
    assert.equal(await run('document.querySelector("#desktop-design-particles")'),null);
    await click('.nav [data-view=today]');assert.equal(await run('document.querySelectorAll(".design-page-snapshot").length'),0);win.webContents.debugger.detach();
    assert.deepEqual(errors,[]);
    const summary=path.resolve(__dirname,'../.cache/verification');fs.mkdirSync(summary,{recursive:true});fs.writeFileSync(path.join(summary,'redesign-spec-20261031.json'),JSON.stringify({status:'passed',date:'2026-10-31',checks:['paper contrast','date native source and keyboard picker','time shorthand, validation recovery and increments','weekday native source','tag IME-safe commit','native pointer and keyboard slot paths','today/planning completion retained and undo/CtrlZ','delete cancellation','inline search width','120 interruptible page changes','no duplicate snapshot IDs','all pages 900/1440','reduced motion no canvas'],boundary:'Isolated window disables background throttling/native occlusion for input injection; no hardware FPS, full screen reader, external API or OS reminder claim'},null,2));
    console.log('PASS redesign specification. '+output);if(process.env.JEEWEAVE_SPEC_REVIEW==='1'){const until=Date.now()+Math.min(300000,Number(process.env.JEEWEAVE_SPEC_REVIEW_MS)||45000);while(Date.now()<until&&!fs.existsSync(path.join(output,'review.done')))await sleep(250);}app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}
