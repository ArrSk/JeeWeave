// Desktop UI verification with isolated example data. Does not use user storage.
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const output = path.resolve(__dirname, '../.cache/verification');
app.setPath('userData', path.join(output, 'workbench-ui-profile'));
app.disableHardwareAcceleration();
const timeout = setTimeout(() => { console.error('FAIL: workbench UI timed out'); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width:1280, height:900, show:false, webPreferences:{offscreen:true, backgroundThrottling:false, sandbox:true, contextIsolation:true, session:session.fromPartition('workbench-ui')} });
  const errors = [];
  window.webContents.on('console-message', event => { if(event.level === 'error') { errors.push(event.message); console.error('renderer:', event.message); } });
  await window.loadFile(path.resolve(__dirname, '../prototype.html'));
  const run = async code => {
    try { return await window.webContents.executeJavaScript(code); }
    catch(error) { throw new Error(`${error.message}; check: ${code}`); }
  };
  const click = selector => run(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
  const visiblePanes = () => run(`Array.from(document.querySelectorAll('[data-settings-pane]')).filter(el => !el.hidden).map(el => el.dataset.settingsPane)`);
  const capture = async name => {
    await new Promise(resolve => setTimeout(resolve, 180));
    fs.writeFileSync(path.join(output, name), (await window.webContents.capturePage()).toPNG());
  };
  const noOverflow = async () => {
    const overflow = await run(`(() => {
      const pane = document.querySelector('[data-settings-pane]:not([hidden])');
      const elements = pane ? [...pane.querySelectorAll('button,input,select')] : [];
      return elements.filter(el => el.getClientRects().length && (el.getBoundingClientRect().right > pane.getBoundingClientRect().right + 1 || el.getBoundingClientRect().left < pane.getBoundingClientRect().left - 1)).map(el => el.id || el.name);
    })()`);
    assert.deepEqual(overflow, [], 'settings controls must fit inside their pane');
    assert.equal(await run('document.documentElement.scrollWidth <= window.innerWidth'), true);
  };
  for(let i=0;i<60;i++){ if(await run('!!document.querySelector("#desktop-empty-import")')) break; await new Promise(resolve=>setTimeout(resolve,50)); }
  await click('[data-view="courses"]');
  await click('#desktop-empty-import');
  assert.deepEqual(await visiblePanes(), ['import']);
  assert.equal(await run('document.querySelector("#desktop-open-course-settings").getAttribute("aria-expanded")'), 'true');
  assert.equal(await run('document.querySelector(".desktop-portal-address").open'), false);
  await run(`document.querySelector('#desktop-open-import').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true})); true`);
  assert.deepEqual(await visiblePanes(), ['batch']);
  assert.equal(await run('document.activeElement.id'), 'desktop-open-batch');
  await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Home', bubbles:true})); true`);
  assert.deepEqual(await visiblePanes(), ['semester']);
  await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true})); true`);
  assert.equal(await run('document.querySelector("#desktop-course-settings").hidden'), true);
  assert.equal(await run('document.activeElement.id'), 'desktop-open-course-settings');
  await click('#desktop-load-demo'); await click('#desktop-dismiss-notice');
  await capture('workbench-timetable-wide.png');
  await click('#desktop-open-course-settings'); await click('#desktop-open-import');
  await noOverflow(); await capture('workbench-import-wide.png');
  await click('#desktop-tab-schedule'); await noOverflow();
  await capture('workbench-schedule-wide.png');
  window.setSize(900,700);
  await click('#desktop-tab-semester');
  await noOverflow(); await capture('workbench-settings-compact.png');
  const before = await run('localStorage.getItem("jiwei-desktop-timetables-v1")');
  await click('#desktop-delete-semester'); await click('#desktop-cancel-delete-semester');
  assert.equal(await run('localStorage.getItem("jiwei-desktop-timetables-v1")'), before);
  await click('#desktop-new-semester');
  await run(`document.querySelector('#desktop-new-semester-form [name="name"]').value='交互验证课表'; document.querySelector('#desktop-new-semester-form').requestSubmit(); true`);
  assert.equal(await run('JSON.parse(localStorage.getItem("jiwei-desktop-timetables-v1")).tables.length'),3);
  assert.deepEqual(await visiblePanes(), ['semester']);
  for (const name of ['week','import','batch','schedule']) {
    await click(`[data-settings-tab="${name}"]`); await noOverflow();
    assert.deepEqual(await visiblePanes(), [name]);
  }
  await click('[data-view="tasks"]');
  assert.equal(await run('document.querySelector(".desktop-course-panel").hidden'),true);
  await click('[data-view="settings"]'); await click('.desktop-theme-actions [data-theme="forest"]');
  assert.equal(await run('document.documentElement.dataset.theme'), 'forest');
  assert.equal(await run('document.querySelectorAll("button[data-theme=forest][aria-pressed=true]").length'),2);
  assert.equal(errors.length,0, errors.join('\n'));
  console.log('PASS: empty-state import, mutually exclusive settings tabs, keyboard navigation/Escape/focus return, week/import/batch/schedule panes, cancellation without data changes, new timetable, theme state, page isolation; control bounds at 1280×900 and 900×700.');
  clearTimeout(timeout); app.exit(0);
}).catch(error => {console.error(error.stack); app.exit(1);});
