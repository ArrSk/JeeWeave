// Isolated review of the standalone prototype; never loads the application preload or data.
const fs=require('node:fs');
const path=require('node:path');
if(!process.versions.electron){
 const {spawn}=require('node:child_process');
 const base=path.resolve(__dirname,'../.cache/verification');
 const temporary=path.join(base,'design-demo-test');
 if(path.dirname(temporary)!==base||path.basename(temporary)!=='design-demo-test')throw Error('Unsafe cleanup directory');
 const child=spawn(require('electron'),[__filename],{stdio:'inherit',windowsHide:true});
 const timer=setTimeout(()=>child.kill(),95000);
 child.on('error',e=>console.error(e));
 child.on('close',code=>{clearTimeout(timer);fs.rmSync(temporary,{recursive:true,force:true,maxRetries:20,retryDelay:150});process.exitCode=code??1;});
}else{
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../.cache/verification');
const temporary=path.join(root,'design-demo-test');
fs.mkdirSync(temporary,{recursive:true});
app.setPath('userData',path.join(temporary,'profile'));
app.disableHardwareAcceleration();
let win;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const timeout=setTimeout(()=>{console.error('design demo timeout');app.exit(1);},90000);
app.whenReady().then(async()=>{
 let error;
 try{
  win=new BrowserWindow({width:1440,height:960,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true,session:session.fromPartition('design-demo-test')}});
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
  await win.loadFile(path.resolve(__dirname,'../design-demo/index.html'));
  const run=c=>win.webContents.executeJavaScript(c);
  const click=s=>run(`document.querySelector(${JSON.stringify(s)}).click();true`);
  const capture=async name=>{if(process.env.JEEWEAVE_TEST_NO_CAPTURE==='1')return;await delay(450);fs.writeFileSync(path.join(temporary,name+'.png'),(await win.webContents.capturePage()).toPNG())};
  const fit=async()=>assert.equal(await run('document.documentElement.scrollWidth<=innerWidth && document.querySelector(".shell").getBoundingClientRect().bottom<=innerHeight'),true);
  const layouts=['sidebar','rail','top','float','dock','island','focus'];
  const palettes=['linen','ink','mist','sand','lavender','graphite','rose','ocean'];
  const choose=async(kind,id)=>click(`[data-${kind}-choice=${id}]`);
  const geometry=()=>run(`(()=>{const b=document.querySelector('.sidebar').getBoundingClientRect(),s=document.querySelector('#stage').getBoundingClientRect();return [b.x,b.y,b.width,b.height,s.x,s.y,s.width,s.height]})()`);
  for(const width of [1440,900]){
   win.setSize(width,width===1440?960:820);
   for(const layout of layouts){
    await choose('layout',layout);await delay(300);const before=await geometry();
    for(const palette of palettes){
     await choose('palette',palette);await fit();assert.deepEqual(await geometry(),before,'palette must not alter layout');
     assert.equal(await run('document.body.dataset.layout'),layout);
     assert.equal(await run('document.body.dataset.palette'),palette);
    }
    if(width===1440){await choose('palette',{sidebar:'linen',rail:'ink',top:'mist',float:'lavender',dock:'sand',island:'ocean',focus:'rose'}[layout]);await capture(layout);}
    if(layout==='focus'){await click('#menu-toggle');assert.equal(await run('document.querySelector("#menu-toggle").getAttribute("aria-expanded")'),'true');}
    for(const id of ['objects','courses','items','calendar','notes','capture','search','plugins','settings','today']){
     await click(`[data-go=${id}]`);await delay(15);
     assert.equal(await run('document.querySelectorAll(".page.active").length'),1);
     assert.equal(await run('document.querySelectorAll(".page:not([inert])").length'),1);
    }
    if(['float','dock','island'].includes(layout)){
     const initial=await geometry();
     await run('document.querySelector("#drag-handle").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));true');
     const moved=await geometry();assert.ok(moved[0]>initial[0],'keyboard moves the floating bar');
     await choose('palette','rose');assert.deepEqual(await geometry(),moved,'palette preserves dragged position');
     await run('document.querySelector("#drag-handle").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}));true');
     assert.deepEqual(await geometry(),initial,'Home restores position');
    }
   }
  }
  await choose('layout','dock');await choose('palette','lavender');win.setSize(900,820);await capture('dock-900');
  await choose('layout','float');await capture('float-900');
  await choose('layout','focus');await click('#menu-toggle');await capture('focus-menu-900');
  await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true');
  assert.equal(await run('document.querySelector("#menu-toggle").getAttribute("aria-expanded")'),'false');
  await choose('layout','sidebar');
  await click('[data-go=items]');await click('#page-items [data-complete=math]');await choose('layout','dock');await choose('palette','sand');assert.equal(await run('document.querySelector(".page.active").id'),'page-items');
  assert.equal(await run('document.querySelectorAll("[data-task-row=math].done").length>=3'),true);
  await click('#page-items [data-schedule=math]');
  await run('document.querySelector("#slot-end").value="18:00"; document.querySelector("#schedule-form").requestSubmit();true');
  assert.match(await run('document.querySelector("#schedule-error").textContent'),/晚于/);
  await run('document.querySelector("#slot-end").value="20:30"; document.querySelector("#schedule-form").requestSubmit();true');
  assert.match(await run('document.querySelector("#page-items [data-task-time=math]").textContent'),/20:30/);
  await click('[data-go=search]');await run('document.querySelector("#search-input").value="无此示例";document.querySelector("#search-input").dispatchEvent(new Event("input"));true');
  assert.match(await run('document.querySelector("#search-results").textContent'),/没有找到/);
  await choose('layout','rail');await choose('palette','ink');await click('[data-go=objects]');win.setSize(1100,820);await fit();await capture('ink-objects-1100');
  await click('[data-object="1"]');assert.equal(await run('document.querySelector("#object-title").textContent'),'程序设计');
  await click('[data-object-tab=notes]');assert.equal(await run('document.querySelectorAll("#object-sources .source-row:not([hidden])").length'),1);
  await choose('layout','top');await choose('palette','mist');win.setSize(900,760);await click('[data-go=calendar]');await fit();await capture('mist-calendar-900');
  await click('#page-calendar [data-detail]');await capture('detail-900');
  await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));true');
  assert.equal(await run('document.querySelector("#inspector").inert'),true);
  await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true}));true');
  assert.equal(await run('document.activeElement.id'),'search-input');
  await win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await run('getComputedStyle(document.querySelector("#particles")).display'),'none');
  win.webContents.debugger.detach();
  assert.deepEqual(errors,[]);
  assert.equal(await run('localStorage.length'),0);
  fs.writeFileSync(path.join(root,'design-demo-summary.json'),JSON.stringify({date:'2026-10-31',result:'passed',layouts:7,palettes:8,combinations:56,widths:[1440,1100,900],checks:['palette/layout geometry independence at 1440/900','floating keyboard movement and reset','palette preserves moved position','focus menu open and Escape','rapid navigation','single active and interactive page','shared completion','schedule error and save','object filters','search empty state','Escape and Ctrl+K','reduced motion','zero localStorage writes'],boundary:'Offscreen software rendering; no real-workspace or subjective hardware smoothness validation.'},null,2));
  console.log('PASS. Review screenshots available for 30 seconds: '+temporary);
  if(process.env.JEEWEAVE_TEST_NO_CAPTURE!=='1')await delay(30000);
 }catch(e){error=e;console.error(e.stack)}
 finally{
  if(win&&!win.isDestroyed())win.destroy();
  clearTimeout(timeout);
  app.exit(error?1:0);
 }
});
}
