// Phase 0: real main-process IPC, isolated data, and cleanup after the child exits.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '../.cache/test-runs');
if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'skeleton-switch-'));
  if (path.dirname(dir) !== base) throw Error('Unsafe test directory');
  (async () => {
    let child, code = 1;
    const timer = setTimeout(() => child?.kill(), 180000);
    try {
      child = spawn(require('electron'), [__filename], { stdio: 'inherit', windowsHide: true, env: { ...process.env, JEEWEAVE_DIAGNOSTICS_TEST: dir, JEEWEAVE_DATA_DIR: path.join(dir, 'data'), JEEWEAVE_DESKTOP_PROTOTYPE: '1' } });
      code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', n => resolve(n ?? 1)); });
    } finally {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
      console.log('Skeleton test data and screenshots removed.');
    }
    process.exitCode = code;
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const dir = path.resolve(process.env.JEEWEAVE_DIAGNOSTICS_TEST || '');
  if (path.dirname(dir) !== base || !path.basename(dir).startsWith('skeleton-switch-')) throw Error('Run this test with node');
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.on('browser-window-created', (_event, win) => { win.setSkipTaskbar(true); });
  require('../main.cjs');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  (async () => {
    await app.whenReady(); let win;
    for (let i = 0; i < 150; i++) {
      win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      if (win && await win.webContents.executeJavaScript('!!document.querySelector("#desktop-module-reminders")').catch(() => false)) break;
      await sleep(70);
    }
    assert.ok(win);
    win.setMinimumSize(900, 640); win.setSize(1440, 960);
    win.webContents.setBackgroundThrottling(false); win.showInactive();
    const errors = [];
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    const run = code => win.webContents.executeJavaScript(code).catch(error=>{throw Error(error.message+'; step: '+code.slice(0,700));});
    const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click();true`);
    const state = () => run('document.documentElement.dataset.workspaceSkeleton');
    const disk = () => JSON.parse(fs.readFileSync(path.join(dir, 'data/workspace.json'), 'utf8'));
    const business = () => { const data = disk().data; delete data.preferences; delete data.extensions['jiwei-desktop-skeleton-v1']; return JSON.stringify(data); };
    const order = () => run('[...document.querySelector(".main").children].map(n=>n.id+":"+n.tagName+":"+n.className)');
    const capture = async name => { await sleep(400); fs.writeFileSync(path.join(dir, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
    const reload = async () => {
      win.reload();
      await sleep(200);
      for (let i = 0; i < 150; i++) { if (await run('!!document.querySelector("#desktop-module-reminders")').catch(() => false)) return; await sleep(70); }
      throw Error('Reload timed out');
    };

    const page = () => run('document.querySelector(".main").dataset.activeView');
    const key = (key, extra={}) => run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',${JSON.stringify({key,bubbles:true,...extra})}));true`);
    const call = (name,...args) => run(`window.jeeWeaveAssistantActions(${JSON.stringify({action:'call',name,args})})`);
    const go = async id => { if(['today','courses','objects'].includes(id))await click(`.loom-scales [data-loom-go="${id}"]`);else{await click('[data-loom-thread]');await click(`.loom-links [data-loom-go="${id}"]`);} };
    assert.equal(await state(), 'workbench');
    await click('.nav [data-view="settings"]');
    assert.equal(await run('document.querySelector(".desktop-settings-subnav button").textContent'), '骨架');
    await click('[data-desktop-layout="dock"]');
    const previousLayout = disk().data.preferences.layout, before = business(), children = await order();
    await run('window.__originalPages=new Map([...document.querySelectorAll("[data-page]")].map(n=>[n.dataset.page,n]));true');
    await click('[data-desktop-skeleton="loom"]');
    assert.equal(await state(),'loom');
    for(const width of [1440,1100,900]) {
      win.setSize(width,900);await sleep(100);
      assert.ok(Math.abs(await run('innerWidth')-width)<=2);
      for(const id of ['overview','today','courses','calendar','plans','notes','objects','web-capture','reminders','plugins','settings']) {
        await go(id);assert.equal(await page(),id);
        assert.equal(await run(`document.querySelector('.loom-content>[data-page="${id}"]')===window.__originalPages.get('${id}')`),true,'same live page node '+id);
        assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true,`no overflow ${width} ${id}`);
        assert.equal(await run('document.querySelectorAll(".loom-content>[data-page]:not([hidden])").length'),1);
      }
    }
    await go('assistant');assert.equal(await run('document.querySelector("#desktop-assistant-dialog").open'),true);
    await click('#desktop-assistant-dialog [data-close]');
    assert.equal(await run('document.activeElement.getClientRects().length>0'),true);
    await click('[data-loom-thread]');
    assert.equal(await run('document.querySelector(".loom-links [data-loom-go=chat-monitor]").disabled'),true);
    assert.match(await run('document.querySelector(".loom-drawer").textContent'),/记账 · 未实装/);
    await key('Escape');
    // Native keyboard path: focus is required by Electron sendInputEvent.
    win.show();win.focus();
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'P',modifiers:['control']});
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'P',modifiers:['control']});await sleep(70);
    assert.equal(await run('document.querySelector("#loom-command-panel").open'),true);
    assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true);
    for(const id of ['overview','today','courses','calendar','plans','notes','objects','web-capture','reminders','plugins','settings','assistant']) {
      await run(`document.querySelector('#loom-command-input').value='${id}';document.querySelector('#loom-command-input').dispatchEvent(new Event('input',{bubbles:true}));true`);
      if(id==='assistant') {await click(`.loom-command-results [data-loom-go="${id}"]`);await click('#desktop-assistant-dialog [data-close]');}
      else {await key('Enter');assert.equal(await page(),id);}
      await key('p',{ctrlKey:true});
    }
    await key('Escape');
    // IME Enter must not choose a page.
    await key('p',{ctrlKey:true});await key('Enter',{isComposing:true});assert.equal(await run('document.querySelector("#loom-command-panel").open'),true);await key('Escape');
    // Existing search is the same node, and Escape returns focus to its visible trigger.
    await click('[data-loom-search]');assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),false);
    await key('Escape');assert.equal(await run('document.activeElement.hasAttribute("data-loom-search")'),true);
    // Both UI switches and public commands refresh navigation, with stale-target guards.
    await go('plugins');
    await run('window.__staleNote=document.querySelector(".loom-links [data-loom-go=notes]");true');
    await click('#desktop-module-notes');
    assert.equal(await run('!!document.querySelector(".loom-links [data-loom-go=notes]")'),false);
    await run('window.__staleNote.disabled=false;document.querySelector(".loom-links").append(window.__staleNote);window.__staleNote.click();true');
    assert.equal(await page(),'plugins');assert.match(await run('document.querySelector(".loom-feedback").textContent'),/已关闭/);
    await click('#desktop-module-notes');assert.equal(await run('!!document.querySelector(".loom-links [data-loom-go=notes]")'),true);
    for(const id of ['reminders','assistant','courses','objects']) {
      await call('plugins.set',id,false);assert.equal(await run(`!!document.querySelector('.loom-links [data-loom-go="${id}"],.loom-scales [data-loom-go="${id}"]')`),false);
      if(id==='assistant')await click('#desktop-module-assistant');else await call('plugins.set',id,true);assert.equal(await run(`!!document.querySelector('.loom-links [data-loom-go="${id}"],.loom-scales [data-loom-go="${id}"]')`),true);
    }
    await go('reminders');await call('plugins.set','reminders',false);assert.equal(await page(),'overview');await call('plugins.set','reminders',true);
    await go('reminders');assert.equal(await run('document.querySelectorAll("[data-page=reminders]").length'),1);
    await go('courses');await call('plugins.set','courses',false);assert.equal(await page(),'overview');await call('plugins.set','courses',true);
    // Original programmatic page commands continue through host.navigate.
    for(const name of ['settings.open','plugins.open','today.open','calendar.open','overview.open','reminders.open']) {await call(name);assert.equal(await page(),name.split('.')[0]);assert.equal(await run(`!!document.querySelector('.loom-content>[data-page="${name.split('.')[0]}"]')`),true);}
    for(const name of ['courses.settings','courses.import']) {
      await call(name);assert.equal(await page(),'courses');assert.equal(await run('document.querySelector("#desktop-course-dialog").open'),true);
      await run('document.querySelector("#desktop-course-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));true');
    }
    await go('settings');await click('[data-skeleton-return]');
    assert.equal(await state(),'workbench');assert.deepEqual(await order(),children);assert.deepEqual(disk().data.preferences.layout,previousLayout);
    assert.equal(business(),before,'navigation, toggles, and switches do not write business collections');
    await click('[data-desktop-skeleton="loom"]');
    const rename=fs.renameSync;
    try {fs.renameSync=(from,to)=>{if(path.resolve(to)===path.join(dir,'data/workspace.json'))throw Error('隔离测试保存失败');return rename(from,to);};await click('[data-skeleton-return]');assert.equal(await state(),'loom');assert.match(await run('document.querySelector(".loom-feedback").textContent'),/失败/);}finally{fs.renameSync=rename;}
    await reload();assert.equal(await state(),'loom');assert.equal(await run('!!document.querySelector(".loom-content>[data-page=overview]")'),true);
    // Real edits through existing forms, using isolated demo data only.
    await go('settings');await click('#desktop-developer-mode');await go('courses');await click('#desktop-load-demo');
    await call('today.open');await click('[data-today-adjust]');assert.equal(await page(),'courses');assert.equal(await run('!!document.querySelector("dialog[open] #desktop-adjust-form")'),true);await click('#desktop-adjust-form [data-close-tool]');
    const tables=disk().data.timetables,table=tables.tables.find(t=>t.id===tables.activeId),course=table.courses[0];
    await call('courses.edit',course.id,null,table.id);
    await run('document.querySelector("#desktop-course-editor").elements.title.value="经纬编辑原课程";document.querySelector("#desktop-course-editor").requestSubmit();true');
    assert.equal(disk().data.timetables.tables.find(t=>t.id===table.id).courses.find(c=>c.id===course.id).title,'经纬编辑原课程');
    if(course.createdAt)assert.equal(disk().data.timetables.tables.find(t=>t.id===table.id).courses.find(c=>c.id===course.id).createdAt,course.createdAt);
    const object=await call('objects.save',{title:'经纬关联对象',type:'general'});await call('objects.open',object.id);assert.equal(await page(),'objects');
    await go('web-capture');await click('#desktop-demo-web');const captureRecord=disk().data.webCaptures[0];await call('web-captures.open',{collection:'capture',id:captureRecord.id});assert.equal(await page(),'web-capture');
    await go('courses');await click('#desktop-add-course');
    await run('document.querySelector("#desktop-course-editor").elements.title.value="经纬课程草稿";true');
    await key('p',{ctrlKey:true});assert.equal(await run('document.querySelector("#loom-command-panel").open'),false);
    await click('[data-skeleton-return]');assert.equal(await state(),'loom');
    assert.equal(await run('document.querySelector("#desktop-course-editor").elements.title.value'),'经纬课程草稿');
    await run('document.querySelector("#desktop-course-dialog").dispatchEvent(new Event("cancel",{cancelable:true}));true');
    await call('items.edit','task',null);assert.equal(await page(),'plans');
    await run('const f=document.querySelector("#desktop-plan-form");f.elements.title.value="经纬真实事项";f.requestSubmit();true');
    const item=disk().data.tasks.find(t=>t.title==='经纬真实事项');assert.ok(item);
    await call('items.toggle',{collection:'task',id:item.id});assert.equal(disk().data.tasks.find(t=>t.id===item.id).done,true);
    const exported=await call('workspace.export');assert.ok(exported);

    // Repair brief: real same-time items, read-only count, geometry and original actions.
    const day=await run(`(async()=>{const c=await import('../shared/packages/core/src/semester-calendar.mjs');return c.today()})()`);
    for(let i=0;i<3;i++)await call('items.save',{kind:'task',type:'event',title:'经纬同刻事项'+i,date:day,startTime:'10:30',endTime:'11:00',timed:true,note:'只在隔离测试中存在的真实事项，用于核对纸条和批注。'});
    await go('today');await sleep(150);
    const todayModel=await call('today.query',day,'10:30');
    assert.equal(await run('document.querySelectorAll(".loom-slip").length'),todayModel.scheduledItems.length);
    assert.ok(await run('document.querySelectorAll(".loom-warp .loom-tick").length>=24'));
    assert.equal(await run('getComputedStyle(document.querySelector(".loom-today h1")).outlineStyle'),'none');
    assert.equal(await run('!!document.querySelector(".loom-now-dot")&&document.querySelectorAll(".loom-slip-margin").length===document.querySelectorAll(".loom-paper").length'),true);
    for(const width of [1440,1100,900]){
      win.setSize(width,960);await sleep(150);
      assert.equal(await run('getComputedStyle(document.documentElement).getPropertyValue("--warp-x").trim()'),width===900?'56px':'120px');
      assert.equal(await run('(()=>{const rows=[...document.querySelectorAll(".loom-paper")];return rows.every((r,i)=>!i||parseFloat(r.style.top)>=parseFloat(rows[i-1].style.top)+rows[i-1].offsetHeight+10.9)})()'),true);
      assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true);
      assert.equal(await run('(()=>{const c=document.querySelector(".loom-now-clock").getBoundingClientRect(),p=document.querySelector(".loom-paper").getBoundingClientRect();return c.left>=0&&c.right<p.left})()'),true,'clock stays clear of paper text');
    }
    // K keeps the original search; P only opens page navigation.
    await key('k',{ctrlKey:true});assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),false);assert.equal(await run('document.querySelector("#loom-command-panel").open'),false);await key('Escape');
    await key('p',{ctrlKey:true});assert.equal(await run('document.querySelector("#loom-command-panel").open'),true);assert.equal(await run('document.querySelector("#desktop-search-panel").hidden'),true);await key('Escape');
    const first=await run('document.querySelector(".loom-slip").dataset.id');
    const renameForItem=fs.renameSync;
    try{fs.renameSync=(from,to)=>{if(path.resolve(to)===path.join(dir,'data/workspace.json'))throw Error('纸条保存失败');return renameForItem(from,to);};await click('.loom-slip .loom-slip-knot');assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,false);assert.match(await run('document.querySelector(".loom-feedback").textContent'),/纸条保存失败/);}finally{fs.renameSync=renameForItem;}
    await click('.loom-slip .loom-slip-knot');await sleep(100);assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,true);
    assert.equal(await run('document.querySelectorAll(".loom-slip").length'),(await call('today.query',day,'10:30')).scheduledItems.length);
    await sleep(100);await click('.loom-completion-slot .design-retained-completion button');assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,false);
    await click('.loom-slip .loom-slip-knot');await sleep(100);assert.equal([...disk().data.tasks,...disk().data.plans].find(t=>t.id===first).done,true);
    await click('[data-loom-today-other]');assert.equal(await run('!!document.querySelector("dialog[open] .desktop-today-other")'),true);await click('[data-today-other-close]');
    await go('settings');assert.equal(await run('document.querySelector("[data-skeleton-section=loom]").parentElement.querySelector("h2").textContent'),'骨架');assert.equal(await run('document.querySelectorAll("[data-loom-layout-choice]:disabled").length'),0);
    await click('[data-theme=studio-linen]');
    for(const [time,title] of [['14:00','给导师回信'],['15:30','组会 · 讨论方案'],['17:00','跑步与复盘']])await call('items.save',{type:'event',title,date:day,startTime:time,endTime:time==='14:00'?'14:15':time==='15:30'?'16:30':'17:40',timed:true,note:'来自真实服务的隔离示例，用于核对纸条版式。'});
    await go('today');win.setSize(1440,960);await sleep(150);await click('[data-loom-now]');assert.equal(await run('document.querySelector("#loom-surface").scrollTop>0&&document.querySelector(".main").scrollTop===0'),true);win.webContents.sendInputEvent({type:'mouseMove',x:4,y:80});await capture('jingwei-repaired-today-1440');
    // Reference is isolated and read-only; close it before cleanup.
    const reference=new BrowserWindow({width:1440,height:960,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:true,sandbox:true,partition:'loom-design-reference'}});
    await reference.loadFile(path.resolve(__dirname,'../design-lab/jingwei.html'));await sleep(1400);
    fs.writeFileSync(path.join(dir,'jingwei-reference-1440.png'),(await reference.webContents.capturePage()).toPNG());reference.destroy();
    require('node:child_process').execFileSync('python',['-c',"from PIL import Image,ImageDraw; import sys; from pathlib import Path; p=Path(sys.argv[1]); a=Image.open(p/'jingwei-repaired-today-1440.png').convert('RGB'); b=Image.open(p/'jingwei-reference-1440.png').convert('RGB'); a.thumbnail((720,480)); b.thumbnail((720,480)); c=Image.new('RGB',(1464,520),'white'); c.paste(a,(8,32)); c.paste(b,(736,32)); d=ImageDraw.Draw(c); d.text((8,8),'Current desktop - real service data',fill='black'); d.text((736,8),'Design reference - static demo',fill='black'); c.save(p/'jingwei-comparison.png')",dir],{windowsHide:true});
    await go('courses');await capture('jingwei-courses-900');

    win.setSize(1440,960);await go('today');await capture('jingwei-today-1440');await go('objects');await capture('jingwei-objects-1440');
    await click('[data-loom-thread]');await capture('jingwei-drawer-1440');await key('Escape');await go('settings');await capture('jingwei-settings-1440');
    await run('[...document.querySelectorAll(".desktop-settings-subnav button")].find(b=>b.textContent==="骨架").click();true');
    assert.equal(await run('document.querySelector("[data-loom-layout-choice=jingwei]").getClientRects().length>0'),true);
    await capture('jingwei-layout-settings-1440');
    await key('p',{ctrlKey:true});await capture('jingwei-command-1440');await key('Escape');
    await win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await go('today');assert.equal(await run('document.querySelector("#desktop-design-particles")?getComputedStyle(document.querySelector("#desktop-design-particles")).display:"none"'),'none');assert.equal(await run('getComputedStyle(document.querySelector(".loom-now-dot"),"::after").display'),'none');win.webContents.debugger.detach();
    for(let i=0;i<30;i++){await call(i%2?'today.open':'calendar.open');}
    assert.equal(await run('new Set([...document.querySelectorAll("[id]")].map(n=>n.id)).size===document.querySelectorAll("[id]").length'),true);
    await go('settings');await click('[data-skeleton-return]');assert.deepEqual(await order(),children);
    assert.deepEqual(errors,[]);
    const summary=path.resolve(__dirname,'../.cache/verification');fs.mkdirSync(summary,{recursive:true});fs.writeFileSync(path.join(summary,'skeleton-switch-20261102-repair.json'),JSON.stringify({date:'2026-11-02',phase:'repair-today',status:'passed',widths:[900,1100,1440],checks:['11 page nodes plus assistant and suspended chat status','two navigation routes','Ctrl K search / Ctrl P pages and IME guard','ticks, paper count, 11px gaps, settings ownership','paper completion failure and success','original other-items sheet','original record search','plugin UI and command toggles','dynamic reminders stop/reopen','existing page/editor/import/export commands','real item form and completion','exact DOM restoration','reload and failed return','draft protection','rapid navigation and unique IDs','reduced motion'],boundary:'Three other layouts pending phase 2; no real reminders or API requests'},null,2));
    console.log('PASS skeleton today repair. Review screenshots: '+dir);if(process.env.JEEWEAVE_TEST_NO_CAPTURE!=='1')await sleep(55000);app.exit(0);
  })().catch(error=>{console.error(error);app.exit(1);});
}
