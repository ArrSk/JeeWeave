const {app,BrowserWindow,session,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const fs=require('node:fs');
const {collectPublicPage}=require('../web-collector.cjs');
const output=path.resolve(__dirname,'../.cache/verification');
app.setPath('userData',path.join(output,'features-profile'));
app.disableHardwareAcceleration();
const timeout=setTimeout(()=>{console.error('FAIL: workbench features timed out');app.exit(1);},40000);
let requests=0;
const server=http.createServer((req,res)=>{
  requests++;
  if(req.url==='/fail'){res.writeHead(503);res.end('fixture failure');return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<title>本地模拟通知</title><main><h1>学习活动</h1><p>请于 2026-10-20 前提交报名表。</p><p>请于 2026-10-21 前上传小组材料。</p><p>活动地点：图书馆。</p><p>&lt;img src=x onerror=window.injected=true&gt;</p><script>window.unwantedScript=true</script></main>');
});
app.whenReady().then(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  ipcMain.handle('fixture:collect',(_event,url)=>collectPublicPage(url,{root:path.join(output,'web-fixtures')}));
  const window=new BrowserWindow({width:1280,height:900,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true,session:session.fromPartition('features-fixture'),preload:path.join(__dirname,'fixtures/workbench-preload.cjs')}});
  const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
  const run=async code=>{try{return await window.webContents.executeJavaScript(code);}catch(error){throw Error(`${error.message}; code=${code}`);}};
  const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
  const waitFor=async code=>{for(let i=0;i<100;i++){if(await run(code))return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error(`UI state missing: ${code}; ${errors.join(';')}`);};
  const capture=async name=>{
    for(let attempt=0;;attempt++){
      await new Promise(resolve=>setTimeout(resolve,300));
      try{fs.writeFileSync(path.join(output,name),(await window.webContents.capturePage()).toPNG());return;}
      catch(error){if(!String(error.message).includes('UnknownVizError')||attempt>=2)throw Error(`Screenshot ${name}: ${error.message}`);}
    }
  };
  await window.loadFile(path.resolve(__dirname,'../prototype.html'));
  await waitFor('!!document.querySelector("#desktop-demo-plans")');
  if(process.env.JEEWEAVE_UI_SCOPE==='today'){
    const {today}=await import('../../shared/packages/core/src/semester-calendar.mjs');
    const {addDays}=await import('../calendar.mjs');
    const day=today(),yesterday=addDays(day,-1),tomorrow=addDays(day,1);
    const tasks=[{id:'due',title:'今天提交报告',date:day,note:'核对内容后提交。'},
      {id:'late',title:'昨天未完成的作业',date:yesterday},
      {id:'free',title:'没有日期的长期想法，展开查看后再决定如何安排',date:''},
      {id:'future',title:'明天准备材料',date:tomorrow},
      {id:'slot',title:'今天投入一段时间',date:tomorrow,executionSlots:[{id:'slot1',label:'准备初稿',start:`${day}T19:00:00+08:00`,end:`${day}T20:00:00+08:00`}]},
      {id:'done',title:'已完成内容不再占位',date:day,done:true}];
    await run(`localStorage.setItem('jiwei-desktop-tasks',JSON.stringify(${JSON.stringify(tasks)}));localStorage.setItem('jiwei-desktop-plans',JSON.stringify([{id:'free',title:'另一集合中的同名编号',date:''}]));true`);
    const before=await run('localStorage.getItem("jiwei-desktop-tasks")');
    await click('[data-view="today"]');
    assert.equal(await run('document.querySelectorAll("#desktop-today-list [data-today-item]").length'),2);
    assert.equal(await run('document.querySelector("#desktop-today-count").textContent.includes("2 项今日事项")'),true);
    assert.equal(await run('document.querySelector("#desktop-today-list").textContent.includes("昨天未完成")'),false);
    assert.equal(await run('document.querySelector("#desktop-today-other-open").textContent.includes("4")'),true);
    await click('#desktop-today-list [data-today-item="slot"] summary');
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(await run('document.querySelector("#desktop-today-list [data-today-item=slot] details").open'),true);
    await capture('today-focused-wide.png');
    await click('#desktop-today-other-open');
    assert.equal(await run('document.querySelector("#desktop-today-other-dialog").matches(":modal")'),true);
    assert.equal(await run('document.querySelector("#desktop-today-other-open").getAttribute("aria-expanded")'),'true');
    assert.equal(await run('document.querySelectorAll("#desktop-today-other-list [data-today-item=free]").length'),2);
    await click('#desktop-today-other-list [data-today-group=undated] > summary');
    await click('#desktop-today-other-list [data-today-item=free][data-kind=task] summary');
    await capture('today-other-wide.png');
    window.setSize(900,700);await capture('today-other-compact.png');
    assert.equal(await run('document.querySelector("#desktop-today-other-dialog").getBoundingClientRect().right<=innerWidth'),true);
    await click('[data-today-other-close]');
    assert.equal(await run('document.activeElement.id'),'desktop-today-other-open');
    await click('#desktop-today-other-open');
    assert.equal(await run('document.querySelector("#desktop-today-other-list [data-today-group=undated]").open'),true);
    assert.equal(await run('document.querySelector("#desktop-today-other-list [data-today-item=free][data-kind=task] details").open'),true);
    await click('#desktop-today-other-list [data-today-item=free][data-kind=task] [data-today-item-edit]');
    assert.equal(await run('document.querySelector(".main").dataset.activeView'),'plans');
    assert.equal(await run('document.querySelector("#desktop-today-other-dialog").open'),false);
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.title.value'),tasks[2].title);
    await click('#desktop-close-plan');await click('[data-view="today"]');
    assert.equal(await run('document.querySelector("#desktop-today-list [data-today-item=slot] details").open'),true);
    await click('#desktop-today-list [data-today-group=scheduled] > summary');
    await new Promise(resolve=>setTimeout(resolve,20));
    await click('[data-view="plans"]');await click('[data-view="today"]');
    assert.equal(await run('document.querySelector("#desktop-today-list [data-today-group=scheduled]").open'),false);
    assert.equal(await run('localStorage.getItem("jiwei-desktop-tasks")'),before);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS: today-only grouping/counts, separate modal, nested expand/collapse retained across refresh/navigation, original item editor, focus return and wide/compact layout; source records unchanged.');
    clearTimeout(timeout);server.close();app.exit(0);return;
  }
  await click('[data-view="settings"]'); await click('#desktop-developer-mode');
  await run(`localStorage.setItem('jiwei-desktop-plans',JSON.stringify([{id:'real-plan',title:'真实计划夹具',date:'',done:false}]));localStorage.setItem('jiwei-desktop-tasks',JSON.stringify([{id:'real-plan',title:'真实待办夹具',date:'',done:false}]));true`);
  await click('[data-view="plans"]');await click('#desktop-demo-plans');await click('#desktop-demo-plans');
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-plans')).length`),8);
  await click('[data-view="plans"]');await click('#desktop-demo-plans');
  await click('[data-task-toggle="demo-task-1"]');await click('#desktop-demo-plans');
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).find(t=>t.id==='demo-task-1').done`),true);
  await click('[data-view="web-capture"]');await click('#desktop-demo-web');await click('#desktop-demo-web');
  assert.equal(requests,0,'example import must never access the illustrative URL');
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-web-collections-v1')).length`),1);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).length`),5,'drafts need confirmation');
  await click('[data-view="today"]');await click('#desktop-demo-today');
  assert.equal(await run(`document.querySelector('#desktop-today-list').textContent.includes('今日学习讨论')`),true);
  assert.equal(await run(`document.querySelector('#desktop-today-list').textContent.includes('预约图书馆讨论室')`),false,'future task should not be shown as due today');
  await capture('features-today-wide.png');
  // Exercise the today consumer using only this fixture's temporary cache.
  const todayKeys=['jiwei-desktop-tasks','jiwei-desktop-plans','jiwei-desktop-modules-v1','jiwei-desktop-developer-mode','jiwei-desktop-timetables-v1'];
  const todayBackup=await run(`Object.fromEntries(${JSON.stringify(todayKeys)}.map(key=>[key,localStorage.getItem(key)]))`);
  const reloadToday=async()=>{await window.loadFile(path.resolve(__dirname,'../prototype.html'));await waitFor('!!document.querySelector("#desktop-demo-today")');await click('[data-view="today"]');};
  const todayText=()=>run('document.querySelector("#desktop-today-list").textContent+document.querySelector("#desktop-today-other-list").textContent');
  const overviewCount=async()=>{await click('[data-view="overview"]');return run(`(()=>{const b=document.querySelector('#desktop-overview-summary [data-view="plans"]');return b?parseInt(b.closest('article').querySelector('small').textContent,10):null})()`);};
  const overviewBefore=await overviewCount();assert.equal(typeof overviewBefore,'number');
  const originalPlanCount=JSON.parse(todayBackup['jiwei-desktop-plans']||'[]').filter(item=>!item.done).length;
  try {
    await run(`(async()=>{const{today}=await import('../shared/packages/core/src/semester-calendar.mjs');const{addDays}=await import('./calendar.mjs');const day=today();
      const tasks=JSON.parse(localStorage.getItem('jiwei-desktop-tasks')||'[]');tasks.push(
        {id:'today-service-same',title:'今日接口·待办',date:day},
        {id:'today-service-overdue',title:'今日接口·逾期',date:addDays(day,-1)},
        {id:'today-service-future',title:'今日接口·未来',date:addDays(day,1)},
        {id:'today-service-done',title:'今日接口·已完成',date:day,done:true},
        {id:'today-service-sample',title:'今日接口·隐藏示例',date:day,example:true});
      const plans=JSON.parse(localStorage.getItem('jiwei-desktop-plans')||'[]');plans.push({id:'today-service-same',title:'今日接口·无期限计划',date:''});
      localStorage.setItem('jiwei-desktop-tasks',JSON.stringify(tasks));localStorage.setItem('jiwei-desktop-plans',JSON.stringify(plans));return true;})()`);
    const beforeQuery=await run('[localStorage.getItem("jiwei-desktop-tasks"),localStorage.getItem("jiwei-desktop-plans")]');
    await reloadToday();let text=await todayText();
    for(const title of ['今日接口·待办','今日接口·逾期','今日接口·无期限计划'])assert.ok(text.includes(title));
    assert.equal(text.includes('今日接口·已完成'),false);
    assert.equal(await run('document.querySelector("#desktop-today-list").textContent.includes("今日接口·未来")'),false);
    assert.equal(await run('document.querySelector("#desktop-today-other-list").textContent.includes("今日接口·未来")'),true);
    assert.equal(await overviewCount(),overviewBefore+5,'overview counts future unfinished records as well as today and floating records');
    assert.deepEqual(await run('[localStorage.getItem("jiwei-desktop-tasks"),localStorage.getItem("jiwei-desktop-plans")]'),beforeQuery,'today never writes its projected records');
    await click('[data-view="plans"]');await click('[data-task-toggle="today-service-same"]');await click('[data-view="today"]');
    text=await todayText();assert.equal(text.includes('今日接口·待办'),false);assert.ok(text.includes('今日接口·无期限计划'),'same id in the other collection remains visible');
    assert.equal(await overviewCount(),overviewBefore+4,'completion changes the overview without affecting the other collection with the same id');
    await run(`(async()=>{const{readModules}=await import('./modules.mjs');const p=readModules(localStorage);p.enabled.tasks=false;p.enabled.plans=true;localStorage.setItem('jiwei-desktop-modules-v1',JSON.stringify(p));return true})()`);
    await reloadToday();text=await todayText();assert.ok(text.includes('今日接口·无期限计划'));assert.equal(text.includes('今日接口·逾期'),false);
    assert.equal(await run('JSON.parse(localStorage.getItem("jiwei-desktop-modules-v1")).enabled.tasks'),false,'query preserves the legacy single-sided switch');
    assert.equal(await overviewCount(),originalPlanCount+1,'legacy plan-only switch excludes tasks from the overview');
    await run(`(()=>{const p=JSON.parse(localStorage.getItem('jiwei-desktop-modules-v1'));p.enabled.plans=false;localStorage.setItem('jiwei-desktop-modules-v1',JSON.stringify(p));return true})()`);
    await reloadToday();assert.equal((await todayText()).includes('今日接口·'),false);
    assert.equal(await run('document.querySelector("#desktop-today-course-state")!==null'),true,'courses remain when all item sources are disabled');
    assert.equal(await overviewCount(),null,'disabling all item sources removes the overview row');
    assert.equal(await run('document.querySelector("#desktop-overview-summary [data-view=courses]")!==null'),true);
    await run(`(()=>{const p=JSON.parse(localStorage.getItem('jiwei-desktop-modules-v1'));p.enabled.tasks=p.enabled.plans=true;localStorage.setItem('jiwei-desktop-modules-v1',JSON.stringify(p));localStorage.setItem('jiwei-desktop-developer-mode','false');return true})()`);
    await reloadToday();text=await todayText();assert.ok(text.includes('今日接口·逾期'));assert.equal(text.includes('今日接口·隐藏示例'),false);
    assert.equal(await overviewCount(),5,'ordinary mode counts the five unfinished real records and hides every imported example');
    // Exercise the course consumer with the same isolated cache and restore below.
    const courseFixture=await run(`(async()=>{const{today,weekdayOf,mondayOf}=await import('../shared/packages/core/src/semester-calendar.mjs');const{addDays}=await import('./calendar.mjs');const{createTimetableStore}=await import('./timetable-store.mjs');const{changeOccurrence}=await import('./course-occurrences.mjs');const day=today(),startDate=mondayOf(day),future=addDays(day,7),store=createTimetableStore(localStorage),first=store.current().id;
      store.update({name:'今日课程接口',startDate,totalWeeks:4,adjustments:[],courses:[
        {id:'today-course-out',title:'今日课程·调出',weekday:weekdayOf(day),periodStart:1,periodEnd:2,weeks:[1]},
        {id:'today-course-cancel',title:'今日课程·停课',weekday:weekdayOf(day),periodStart:3,periodEnd:4,weeks:[1]},
        {id:'today-course-in',title:'今日课程·调入',weekday:weekdayOf(day),periodStart:1,periodEnd:2,weeks:[2]}],unplacedCourses:[{id:'today-unplaced',title:'今日课程·未排课',raw:'无时间'}]});
      store.update({adjustments:changeOccurrence(store.current(),'today-course-out',day,{action:'move',date:future,periodStart:1,periodEnd:2,location:'未来教室'})});
      store.update({adjustments:changeOccurrence(store.current(),'today-course-cancel',day,{action:'cancel'})});
      store.update({adjustments:changeOccurrence(store.current(),'today-course-in',future,{action:'move',date:day,periodStart:5,periodEnd:6,location:'调入教室',reason:'今日课程接口调入'})});
      return{first,day,future,startDate,clock:store.current().schedule.find(p=>p.index===5).start+'–'+store.current().schedule.find(p=>p.index===6).end};})()`);
    const courseBefore=await run('localStorage.getItem("jiwei-desktop-timetables-v1")');
    await click('[data-view="today"]');text=await todayText();
    for(const title of ['今日课程·调出 · 本次调出','今日课程·停课 · 本次停课','今日课程·调入 · 本次调入',courseFixture.clock,'调入教室'])assert.ok(text.includes(title),`missing ${title}; ${text}`);
    assert.equal(text.includes('今日课程·未排课'),false);
    assert.ok((await run('document.querySelector("#desktop-today-count").textContent')).startsWith('1 次课'));
    assert.equal(await run('localStorage.getItem("jiwei-desktop-timetables-v1")'),courseBefore);
    await click('[data-today-adjust="today-course-in"]');
    assert.equal(await run('document.querySelector("#desktop-adjust-form [name=reason]").value'),'今日课程接口调入');
    await click('#desktop-adjust-form [data-close-tool]');
    // A provider read failure must preserve the item list and report unavailability.
    await click('[data-view="plans"]');
    await run(`window.__todayGetItem=Storage.prototype.getItem;window.__todayCourseReads=0;Storage.prototype.getItem=function(key){if(key==='jiwei-desktop-timetables-v1'){window.__todayCourseReads++;throw Error('simulated course provider unavailable');}return window.__todayGetItem.call(this,key);};true`);
    try {
      await click('[data-view="today"]');text=await todayText();
      assert.ok(text.includes('课程服务暂不可用'));assert.ok(text.includes('今日接口·逾期'));
      assert.equal(await run('window.__todayCourseReads'),1,'a failed provider is never retried via a direct timetable read');
      assert.ok((await run('document.querySelector("#desktop-today-count").textContent')).startsWith('课程暂不可用'));
    } finally {await run('Storage.prototype.getItem=window.__todayGetItem;delete window.__todayGetItem;delete window.__todayCourseReads;true');}
    await click('[data-view="plans"]');await click('[data-view="today"]');assert.ok((await todayText()).includes('今日课程·调入'));
    // An old button must not open a course with the same ID in a newly selected table.
    await run(`(async()=>{const{createTimetableStore}=await import('./timetable-store.mjs');window.__oldTodayCourse=document.querySelector('[data-today-adjust="today-course-in"]');const store=createTimetableStore(localStorage);store.create({name:'同编号另一表',startDate:${JSON.stringify(courseFixture.startDate)},totalWeeks:4});store.update({courses:[{id:'today-course-in',title:'另一表同编号课程',weekday:(await import('../shared/packages/core/src/semester-calendar.mjs')).weekdayOf(${JSON.stringify(courseFixture.day)}),periodStart:1,periodEnd:2,weeks:[]}]});return true})()`);
    const switched=await run('localStorage.getItem("jiwei-desktop-timetables-v1")');
    await run('window.__oldTodayCourse.click();delete window.__oldTodayCourse;true');
    assert.equal(await run('document.querySelector(".main").dataset.activeView'),'today');assert.ok((await todayText()).includes('另一表同编号课程'));
    assert.equal(await run('document.querySelector("#desktop-course-tools-dialog").open'),false);
    assert.equal(await run('localStorage.getItem("jiwei-desktop-timetables-v1")'),switched);
    await click('[data-view="plugins"]');await click('#desktop-module-courses');await click('[data-view="today"]');
    assert.equal(await run('document.querySelector("#desktop-today-course-state")!==null'),false);assert.ok((await todayText()).includes('今日接口·逾期'));
    assert.equal(await run('localStorage.getItem("jiwei-desktop-timetables-v1")'),switched);
    await click('[data-view="plugins"]');await click('#desktop-module-courses');await click('[data-view="today"]');assert.ok((await todayText()).includes('另一表同编号课程'));
    console.log('PASS: today course service projection, moved/cancelled/incoming lessons and clocks, source adjustment link, failed-provider item preservation, stale cross-table buttons and module toggle recovery.');
  } finally {
    await run(`(()=>{for(const[key,value]of Object.entries(${JSON.stringify(todayBackup)})){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}return true})()`);
    await window.loadFile(path.resolve(__dirname,'../prototype.html'));await waitFor('!!document.querySelector("#desktop-demo-today")');
  }
  assert.equal(await overviewCount(),overviewBefore,'restored fixture data restores the overview without a persisted count');
  console.log('PASS: today service projection, overdue/future/completed and floating records, same-id completion linkage, read-only queries, legacy partial/all-off switches and hidden examples.');
  console.log('PASS: overview summary follows completion, includes future records, preserves same-id source identity, old plan-only/all-off switches, example hiding and read-only counts.');
  await click('[data-view="settings"]');await click('#desktop-load-all-examples');await click('#desktop-load-all-examples');
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-timetables-v1')).tables.length`),2);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-plans')).find(p=>p.id==='real-plan').title`),'真实计划夹具');
  await click('[data-view="web-capture"]');
  await run(`document.querySelector('#collect-url').value=${JSON.stringify(base+'/notice')};document.querySelector('#desktop-web-form').requestSubmit();true`);
  await waitFor(`document.querySelector('#collect-status').textContent.includes('已整理')`);
  assert.equal(await run(`document.querySelectorAll('[data-approve-draft]').length`),2);
  assert.equal(await run(`document.querySelector('#collect-submit').disabled`),false);
  assert.equal(await run(`document.querySelector('#collect-title').textContent`),'本地模拟通知');
  assert.equal(await run('window.injected || window.unwantedScript || false'),false);
  await run(`const f=document.querySelector('[data-approve-draft]');f.elements.title.value='已核对的报名任务';f.elements.date.value='2026-10-19';f.requestSubmit();true`);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).length`),6);
  assert.equal(await run(`document.querySelector('[data-approve-draft] button').disabled`),true);
  await run(`document.querySelector('#desktop-web-form').requestSubmit();true`);
  await waitFor(`!document.querySelector('#collect-submit').disabled`);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).length`),6);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-web-collections-v1')).length`),2);
  await click('#desktop-dismiss-notice');
  await capture('features-web-wide.png');
  window.setSize(900,700);await capture('features-web-compact.png');
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await run(`document.querySelector('#collect-url').value=${JSON.stringify(base+'/fail')};document.querySelector('#desktop-web-form').requestSubmit();true`);
  await waitFor(`document.querySelector('#collect-status').textContent.includes('503')`);
  assert.equal(await run(`document.querySelector('#collect-title').textContent`),'本地模拟通知');
  await run(`for(const id of ['courses','plans','plans','web-capture','today','ledger','courses'])document.querySelector('.nav [data-view="'+id+'"]').click();true`);
  assert.deepEqual(await run(`Array.from(document.querySelectorAll('[data-page]')).filter(p=>!p.hidden&&!p.classList.contains('hidden')).map(p=>p.dataset.page)`),['courses']);
  assert.equal(await run(`document.getAnimations().filter(a=>a.id==='desktop-page-enter').length`),1);
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(await run(`getComputedStyle(document.querySelector('[data-page="courses"]')).transform`),'none');
  const reduced=await run(`(async()=>{const{createPageMotion}=await import('./page-motion.mjs');const e=document.createElement('div');let result;e.animate=(frames,options)=>{result={frames,options};return{cancel(){}}};createPageMotion(()=>true)(e);return result;})()`);
  assert.equal(reduced,undefined,'reduced motion does not animate');
  const light=await run(`(async()=>{const{createPageMotion}=await import('./page-motion.mjs');const e=document.createElement('div');let result,cancelled=0;e.animate=(frames,options)=>{result={frames,options};return{cancel(){cancelled++}}};const play=createPageMotion(()=>false);play(e);play(e);return{...result,cancelled};})()`);
  assert.ok(light.options.duration<=140);assert.equal(light.frames.some(frame=>'transform'in frame||'filter'in frame),false);assert.equal(light.cancelled,1);
  await window.loadFile(path.resolve(__dirname,'../prototype.html'));await waitFor('!!document.querySelector("#desktop-demo-web")');
  await click('[data-view="web-capture"]');
  assert.equal(await run(`document.querySelector('[data-approve-draft] button').disabled`),true);
  await click('[data-view="plans"]');
  assert.equal(await run(`document.querySelector('#desktop-plan-list').textContent.includes('已核对的报名任务')`),true);
  window.setSize(1280,900);
  assert.equal(await run(`document.querySelector('.brand').textContent.trim()`),'JeeWeave·几微');
  assert.equal(await run(`document.querySelector('.brand img').naturalWidth`)>0,true);
  // Collection + ID identifies an item: old stores can legally share an ID.
  await click('[data-task-edit="real-plan"]');
  await run(`document.querySelector('#desktop-plan-form [name=title]').value='同编号待办已编辑';document.querySelector('#desktop-plan-form').requestSubmit();true`);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).find(i=>i.id==='real-plan').title`),'同编号待办已编辑');
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-plans')).find(i=>i.id==='real-plan').title`),'真实计划夹具');
  const taskCount=await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).length`);
  await click('#desktop-add-plan');
  assert.equal(await run(`document.querySelector('#desktop-plan-dialog').matches(':modal')`),true);
  assert.equal(await run(`document.activeElement.name`),'title');
  await run(`document.querySelector('#desktop-plan-form [name=title]').value='取消不保存';document.querySelector('#desktop-plan-dialog').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`);
  assert.equal(await run(`document.querySelector('#desktop-plan-dialog').open`),false);
  assert.equal(await run(`document.activeElement.id`),'desktop-add-plan');
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).length`),taskCount);
  await click('#desktop-add-plan');
  await run(`document.querySelector('#desktop-plan-form [name=title]').value='弹窗新增待办';document.querySelector('#desktop-plan-form [name=date]').value='';document.querySelector('#desktop-plan-form [name=startTime]').value='18:30';document.querySelector('#desktop-plan-form').requestSubmit();true`);
  assert.equal(await run(`document.querySelector('#desktop-plan-dialog').open`),true);
  assert.equal(await run(`document.querySelector('#desktop-plan-form').checkValidity()`),false);
  await run(`document.querySelector('#desktop-plan-form [name=date]').value='2026-10-26';true`);
  const fits=async selector=>run(`(()=>{const d=document.querySelector(${JSON.stringify(selector)}),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=36&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth+1})()`);
  assert.equal(await fits('#desktop-plan-dialog'),true);
  const taskHeight=await run(`document.querySelector('#desktop-plan-form [name=title]').getBoundingClientRect().height`);
  assert.equal(taskHeight,40);
  await capture('ui-refresh-task-wide.png');
  await run(`document.querySelector('#desktop-plan-form').requestSubmit();true`);
  assert.equal(await run(`document.querySelector('#desktop-plan-dialog').open`),false);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).length`),taskCount+1);
  await click('[data-view="plans"]');await click('#desktop-add-plan');
  assert.equal(await run(`document.querySelector('#desktop-plan-dialog').matches(':modal')`),true);
  assert.equal(await fits('#desktop-plan-dialog'),true);
  assert.equal(await run(`document.querySelector('#desktop-plan-form [name=title]').getBoundingClientRect().height`),taskHeight);
  await capture('ui-refresh-plan-wide.png');await click('#desktop-close-plan');
  await click('[data-view="courses"]');await click('#desktop-add-course');
  assert.equal(await run(`document.querySelector('#desktop-course-editor [name=title]').getBoundingClientRect().height`),taskHeight);
  assert.equal(await run(`getComputedStyle(document.documentElement).getPropertyValue('--desktop-period-height').trim()`),'64px');
  await capture('ui-refresh-course-wide.png');await click('#desktop-cancel-course');
  window.setSize(900,640);
  await click('[data-view="plans"]');await click('#desktop-add-plan');
  assert.equal(await fits('#desktop-plan-dialog'),true);await capture('ui-refresh-task-compact.png');await click('#desktop-close-plan');
  await click('[data-view="settings"]');await click('[data-theme="ink"]');
  await click('[data-view="plans"]');await click('#desktop-add-plan');
  assert.equal(await fits('#desktop-plan-dialog'),true);await capture('ui-refresh-plan-dark-compact.png');
  await click('#desktop-close-plan');
  // A legacy user may have disabled only plans. The combined entry stays usable
  // without silently rewriting their preference or exposing their hidden data.
  await run(`localStorage.setItem('jiwei-desktop-modules-v1',JSON.stringify({schemaVersion:1,enabled:{plans:false,tasks:true}}));true`);
  await window.loadFile(path.resolve(__dirname,'../prototype.html')); await waitFor('!!document.querySelector("#desktop-plan-form")');
  assert.equal(await run('document.querySelector(".nav [data-view=plans]").hidden'),false);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-modules-v1')).enabled.plans`),false);
  await click('[data-view="plugins"]');
  assert.equal(await run('document.querySelector("#desktop-module-plans").indeterminate'),true);
  await click('[data-view="plans"]'); await click('#desktop-add-plan');
  await run(`(()=>{const f=document.querySelector('#desktop-plan-form');f.elements.title.value='旧单边开关下的考试';f.elements.type.value='event';f.elements.type.dispatchEvent(new Event('change',{bubbles:true}));f.elements.date.value='2026-10-22';f.elements.startTime.value='09:00';f.elements.endTime.value='11:00';f.requestSubmit();return true;})()`);
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-tasks')).find(i=>i.title==='旧单边开关下的考试').anchor.type`),'absolute');
  assert.equal(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-modules-v1')).enabled.plans`),false);
  // Repeatedly unload/reload all built-ins; each restored handler must run once.
  await click('[data-view="plugins"]');
  for(let cycle=0;cycle<3;cycle++)for(const id of ['notes','objects','today','courses','plans','calendar','web-capture','course-import']){
    await click(`#desktop-module-${id}`);await click(`#desktop-module-${id}`);
  }
  for(const id of ['desktop-plan-dialog','desktop-course-dialog','desktop-object-dialog','desktop-journal-dialog'])assert.equal(await run(`document.querySelectorAll('#${id}').length`),1,`${id} must not accumulate across reloads`);
  const beforeReloadAdd=await run('JSON.parse(localStorage.getItem("jiwei-desktop-tasks")).length');
  await click('[data-view="plans"]');await click('#desktop-add-plan');
  await run('document.querySelector("#desktop-plan-form [name=title]").value="插件反复开关后仅保存一次";document.querySelector("#desktop-plan-form").requestSubmit();true');
  assert.equal(await run('JSON.parse(localStorage.getItem("jiwei-desktop-tasks")).length'),beforeReloadAdd+1);
  await click('[data-view="plugins"]');await click('#desktop-module-plans');
  await run('document.querySelector("#desktop-plan-form [name=title]").value="关闭后旧表单不能保存";document.querySelector("#desktop-plan-form").requestSubmit();true');
  assert.equal(await run('JSON.parse(localStorage.getItem("jiwei-desktop-tasks")).length'),beforeReloadAdd+1);
  assert.equal(await run('document.querySelector(".main").dataset.activeView'),'plugins');await click('#desktop-module-plans');
  console.log('PASS: repeated lifecycle reload of every builtin keeps single dialogs and one save handler.');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: per-feature/all examples merge without overwriting, public-page HTTP → original files → highlights/drafts → explicit task approval, duplicates/reload/failure preservation, safe text rendering, today dates, rapid navigation cancellation, reduced motion and desktop screenshots.');
  clearTimeout(timeout);server.close();app.exit(0);
}).catch(error=>{console.error(error.stack);app.exit(1);});
