// Isolated evidence and regression checks for the post-0.3 workstream.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const output = path.resolve(__dirname, '../.cache/verification/next-development');
fs.mkdirSync(output, { recursive: true });
const native = process.env.JEEWEAVE_NEXT_NATIVE === '1';
if (native) {
  process.env.JEEWEAVE_DATA_DIR = path.join(output, `native-${Date.now()}`, 'data');
  require('../main.cjs');
} else app.setPath('userData', path.join(output, 'profile'));
app.disableHardwareAcceleration();
const timer = setTimeout(() => { console.error('Timed out'); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  let window;
  if (native) {
    for (let attempt = 0; attempt < 100; attempt++) { window = BrowserWindow.getAllWindows().find(window => !window.isDestroyed()); if (window) break; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.ok(window); window.hide(); window.webContents.setBackgroundThrottling(false);
  } else window = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, session: session.fromPartition('next-development') } });
  const errors = [];
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const run = code => window.webContents.executeJavaScript(code);
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
  if (!native) await window.loadFile(path.resolve(__dirname, '../prototype.html'));
  for (let i = 0; i < 100; i++) { if (await run('!!document.querySelector("#desktop-developer-mode")')) break; await new Promise(resolve => setTimeout(resolve, 60)); }
  await click('[data-view="settings"]');
  if (!await run('document.querySelector("#desktop-developer-mode").checked')) await click('#desktop-developer-mode');
  await click('[data-view="courses"]'); await click('#desktop-load-demo');
  await run('document.getAnimations().forEach(a=>a.finish());true');
  const capture = async name => {
    if (native || process.env.JEEWEAVE_SKIP_SHOTS === '1') return;
    await new Promise(resolve => setTimeout(resolve, 220));
    for (let attempt = 0; attempt < 3; attempt++) {
      try { fs.writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG()); return; }
      catch (error) { if (!error.message.includes('UnknownVizError') || attempt === 2) throw error; await new Promise(resolve => setTimeout(resolve, 300)); }
    }
  };
  await capture(process.env.JIWEI_BASELINE ? 'before-desktop.png' : 'desktop.png');
  if (!process.env.JIWEI_BASELINE) {
    await click('.desktop-timetable-course');
    const originalDate = await run('document.querySelector("#desktop-course-work-date").textContent');
    assert.match(originalDate, /2026/);
    await click('#desktop-course-add-work');
    await run(`(()=>{const f=document.querySelector('#desktop-plan-form');f.elements.title.value='课次作业验证';f.elements.type.value='deadline';f.elements.type.dispatchEvent(new Event('change',{bubbles:true}));f.elements.date.value='2026-10-25';f.elements.goal.value='掌握积分方法';f.elements.completionCriteria.value='提交 PDF 并检查错题';f.requestSubmit();return true;})()`);
    const homework = await run('JSON.parse(localStorage.getItem("jiwei-desktop-tasks")).find(item=>item.title==="课次作业验证")');
    assert.ok(homework?.courseOrigin); assert.equal(homework.goal, '掌握积分方法');
    await click(`[data-item-action="edit"][data-id="${homework.id}"]`);
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",ctrlKey:true,bubbles:true}));true');
    assert.equal(await run('document.querySelector("#desktop-search-dialog").open'), false, 'search cannot discard an open editor');
    await click('#desktop-item-open-course');
    assert.equal(await run('document.querySelectorAll("[data-class-work]").length'), 1);
    await click('[data-class-work]'); await click('#desktop-cancel-plan');
    await click('#desktop-add-plan');
    await run(`(()=>{const f=document.querySelector('#desktop-plan-form');f.elements.title.value='分阶段实验';f.elements.type.value='range';f.elements.type.dispatchEvent(new Event('change',{bubbles:true}));f.elements.date.value='2026-10-19';f.elements.endDate.value='2026-10-30';return true;})()`);
    await click('#desktop-add-phase');
    await run(`(()=>{const r=document.querySelector('.desktop-phase-row');r.querySelector('[data-phase-field=title]').value='整理数据';r.querySelector('[data-phase-field=startDate]').value='2026-10-19';r.querySelector('[data-phase-field=endDate]').value='2026-10-22';return true;})()`);
    await click('#desktop-add-slot');
    await run(`(()=>{const r=document.querySelector('.desktop-slot-row');r.querySelector('[data-slot-field=phaseId]').selectedIndex=1;r.querySelector('[data-slot-field=startDate]').value='2026-10-21';r.querySelector('[data-slot-field=endDate]').value='2026-10-21';return true;})()`);
    window.setSize(900, 760); await capture('phase-editor-compact.png');
    await run('document.querySelector("#desktop-plan-form").requestSubmit();true');
    const phased = await run('JSON.parse(localStorage.getItem("jiwei-desktop-plans")).find(item=>item.title==="分阶段实验")');
    assert.equal(phased.executionSlots[0].phaseId, phased.phases[0].id);
    await click('#desktop-add-plan');
    await run(`(()=>{const f=document.querySelector('#desktop-plan-form');f.elements.title.value='重复安排验证';f.elements.type.value='weekly';f.elements.type.dispatchEvent(new Event('change',{bubbles:true}));f.elements.date.value='2026-10-19';return true;})()`);
    await click('#desktop-add-slot');
    await run(`(()=>{const r=document.querySelector('.desktop-slot-row');r.querySelector('[data-slot-field=occurrenceDate]').value='2026-10-19';r.querySelector('[data-slot-field=startDate]').value='2026-10-21';r.querySelector('[data-slot-field=endDate]').value='2026-10-21';document.querySelector('#desktop-plan-form').requestSubmit();return true;})()`);
    const repeated = await run('JSON.parse(localStorage.getItem("jiwei-desktop-plans")).find(item=>item.title==="重复安排验证")');
    assert.ok(repeated); assert.equal(repeated.executionSlots[0].occurrenceDate, '2026-10-19');
    await click('[data-view="calendar"]');
    await run(`(()=>{const d=document.querySelector('#desktop-calendar-jump');d.value='2026-10-21';d.dispatchEvent(new Event('change',{bubbles:true}));[...document.querySelectorAll('.cal-execution')].find(b=>b.textContent.includes('重复安排验证')).click();return true;})()`);
    await click('[data-cal-complete]');
    assert.deepEqual(await run(`JSON.parse(localStorage.getItem('jiwei-desktop-plans')).find(item=>item.id===${JSON.stringify(repeated.id)}).completedDates`), ['2026-10-19']);
    window.setSize(1280, 900);
    await click('#desktop-search-open');
    await run(`(()=>{const input=document.querySelector('#desktop-search-input');input.value='积分';input.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    assert.equal(await run('document.querySelector("#desktop-search-results").textContent.includes("课次作业验证")'), true);
    await capture('search-wide.png'); await click('[data-search-open]');
    assert.equal(await run('document.querySelector("#desktop-plan-form").elements.title.value'), '课次作业验证');
    await click('#desktop-cancel-plan');
    await click('[data-view="objects"]'); await click('#desktop-demo-objects');
    await run('document.querySelector(".main").scrollTop=0;true');
    await capture('objects-wide.png');
    await click('#desktop-sidebar-toggle');
    assert.equal(await run('document.querySelector(".shell").classList.contains("is-sidebar-collapsed")'), true);
    await click('#desktop-sidebar-toggle');
    window.setSize(900, 640);
    await new Promise(resolve => setTimeout(resolve, 150));
    const geometry = await run('({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll("body *")].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({tag:el.tagName,id:el.id,right:el.getBoundingClientRect().right}))})');
    assert.ok(geometry.scroll <= geometry.width, JSON.stringify(geometry));
    await window.loadFile(path.resolve(__dirname, '../prototype.html'));
    for (let i = 0; i < 100; i++) { if (await run('!!document.querySelector("#desktop-search-open")')) break; await new Promise(resolve => setTimeout(resolve, 60)); }
    assert.equal(await run('JSON.parse(localStorage.getItem("jiwei-desktop-tasks")).some(item=>item.title==="课次作业验证"&&item.courseOrigin&&item.completionCriteria)'), true);
    if (native) {
      const saved = JSON.parse(fs.readFileSync(path.join(process.env.JEEWEAVE_DATA_DIR, 'workspace.json'), 'utf8'));
      assert.ok(saved.data.tasks.some(item => item.id === homework.id && item.courseOrigin && item.goal === '掌握积分方法'));
      assert.deepEqual(saved.data.plans.find(item => item.id === repeated.id).completedDates, ['2026-10-19']);
      console.log('PASS: same flow through actual main/preload IPC and workspace file; reload reads persisted source/criteria/slots.');
    }
    console.log('PASS: class-to-task identity, goal/criteria, return to source, phase/weekly slots, occurrence completion, search routing, collapse, compact layout and reload.');
  }
  assert.deepEqual(errors, []);
  clearTimeout(timer); window.destroy(); app.exit(0);
}).catch(error => { console.error(error.stack); app.exit(1); });
