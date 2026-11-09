// 织机（v2）的离屏验证：全部功能可达、插件开关真的改变壳、材质可换、无横溢。
const fs = require('node:fs');
const path = require('node:path');

const base = path.resolve(__dirname, '../.cache/verification');
const temporary = path.join(base, 'loom-test');
const shots = path.resolve(__dirname, '../.cache/loom-shots');
if (path.dirname(temporary) !== base || path.basename(temporary) !== 'loom-test') {
  throw Error('Unsafe cleanup directory');
}

// 现有实现里能点到的每一个页面
const ALL_PAGES = ['today', 'items', 'courses', 'calendar', 'notes', 'objects', 'web', 'reminders', 'assistant', 'chat', 'import', 'plugins', 'settings'];

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], { stdio: 'inherit', windowsHide: true, env });
  const timer = setTimeout(() => child.kill(), 240000);
  child.on('error', (e) => console.error(e));
  child.on('close', (code) => {
    clearTimeout(timer);
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
    process.exitCode = code ?? 1;
  });
} else {
  const { app, BrowserWindow, session } = require('electron');
  const assert = require('node:assert/strict');

  fs.mkdirSync(temporary, { recursive: true });
  if (process.env.LOOM_SHOTS === '1') fs.mkdirSync(shots, { recursive: true });
  app.setPath('userData', path.join(temporary, 'profile'));
  app.disableHardwareAcceleration();

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const timeout = setTimeout(() => { console.error('loom timeout'); app.exit(1); }, 230000);
  let checks = 0;
  const step = (name) => { checks += 1; process.stdout.write('  ok ' + checks + ' — ' + name + '\n'); };

  let win;
  app.whenReady().then(async () => {
    try {
      win = new BrowserWindow({
        width: 1440, height: 900, show: false,
        webPreferences: {
          offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true,
          session: session.fromPartition('loom-shell')
        }
      });
      const run = (code) => win.webContents.executeJavaScript(code);
      const errors = [];
      win.webContents.on('console-message', (e) => {
        if (e.level === 'error' || e.level === 3) errors.push(e.message);
      });
      const capture = async (name) => {
        if (process.env.LOOM_SHOTS !== '1') return;
        await run(`(()=>{const t=document.getElementById('toast');if(t)t.classList.remove('is-on')})()`).catch(() => {});
        await delay(900);
        fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG());
      };
      const open = async (hash) => {
        await win.loadFile(path.join(__dirname, '../design-lab/loom.html'), hash ? { hash } : undefined);
        await delay(1100);
      };
      const goTo = async (id) => {
        await run(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
        await run(`(()=>{const b=document.querySelector('.shuttle-item[data-go="${id}"]');if(b){b.click();return 'click'}history.replaceState(null,'','#${id}');location.reload();return 'reload'})()`);
        await delay(900);
      };

      await open('today');

      // ── 1. 壳立住了 ────────────────────────────────────
      assert.equal(await run('document.body.dataset.page'), 'today', '起手在今天');
      assert.ok(await run('document.querySelectorAll(".warp-row").length >= 6'), '今天有六条以上安排');
      assert.ok(await run('document.querySelectorAll(".shuttle-item").length === 11'), '梭上是十一个已启用插件页');
      assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, '1440 不横溢');
      step('打开：今天有内容、梭上十一枚、1440 不横溢');

      // ── 2. 现有功能的每一页都能到、都有内容 ──────────────
      const covered = [];
      for (const id of ALL_PAGES) {
        await open(id);
        const info = await run(`(()=>{
          const page=document.querySelector('.page');
          const body=document.body.dataset.page;
          const off=!!page&&/· 已关闭/.test(page.textContent);
          const len=page?page.textContent.trim().length:0;
          return {body,off,len,scroll:document.documentElement.scrollWidth<=innerWidth+1}
        })()`);
        assert.equal(info.body, id, id + ' 直接打开也对得上');
        assert.ok(info.off || info.len > 80, id + ' 有真内容');
        assert.equal(info.scroll, true, id + ' 不横溢');
        covered.push(id + (info.off ? '(关)' : ''));
      }
      assert.equal(covered.length, ALL_PAGES.length, '十三个页面都过了一遍');
      step('全功能覆盖：十三页逐页打开、都有内容、都不横溢');

      // ── 3. 插件开关真的改变壳 ──────────────────────────
      await open('plugins');
      await run(`document.querySelector('.sw[data-id="notes"]').click()`);
      await delay(500);
      assert.equal(await run('document.querySelectorAll(".shuttle-item").length'), 10, '关掉笔记，梭上少一枚');
      assert.equal(await run('document.querySelector(".shuttle-item[data-go=notes]")'), null, '笔记不在梭上');
      await open('notes');
      assert.ok(await run('/已关闭/.test(document.querySelector(".page").textContent)'), '直接开笔记页会说明它被关了');
      await run(`document.querySelector('[data-go=plugins]').click()`);
      await delay(700);
      await run(`document.querySelector('.sw[data-id="notes"]').click()`);
      await delay(500);
      assert.equal(await run('document.querySelectorAll(".shuttle-item").length'), 11, '打开笔记，梭上回来');
      step('插件开关：关掉后梭少一枚、页面说明、打开后恢复');

      // ── 4. 依赖：课程表关了，教务导入跟着失效 ──────────
      await run(`document.querySelector('.sw[data-id="courses"]').click()`);
      await delay(500);
      const dep = await run(`(()=>{
        const imp=document.querySelector('.sw[data-id="course-import"]');
        const card=imp.closest('.plug');
        return {blocked:card.classList.contains('is-blocked'),disabled:imp.disabled,
                noCourses:!document.querySelector('.shuttle-item[data-go=courses]')}
      })()`);
      assert.equal(dep.noCourses, true, '课程表不在梭上');
      assert.equal(dep.blocked, true, '教务导入被标成阻塞');
      await open('import');
      assert.ok(await run('/它依赖「课程表」/.test(document.querySelector(".page").textContent)'), '导入页说明依赖');
      await run(`document.querySelector('[data-go=plugins]').click()`);
      await delay(700);
      await run(`document.querySelector('.sw[data-id="courses"]').click()`);
      await delay(500);
      step('依赖：关课程表后教务导入不可用、导入页给出原因、恢复后回来');

      // ── 4b. 插件没有上限：后装一批进「新装」，可打开、可恢复 ──
      await open('plugins');
      const beforeStress = await run('document.querySelectorAll(".shuttle-item").length');
      await run(`document.querySelector('[data-act="stress-install"]').click()`);
      await delay(500);
      const afterStress = await run('document.querySelectorAll(".shuttle-item").length');
      assert.ok(afterStress > beforeStress + 5, '装进一批后梭上多出多枚');
      assert.equal(await run('document.querySelectorAll(".shuttle-set[data-set=more] .shuttle-item").length'), afterStress - beforeStress, '后装页面全落在「新装」组');
      assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, '装进一批后 1440 不横溢');
      await capture('stress-plugins');
      const extraPage = await run('document.querySelector(".shuttle-set[data-set=more] .shuttle-item").dataset.go');
      await run(`document.querySelector('.shuttle-set[data-set=more] .shuttle-item').click()`);
      await delay(700);
      assert.equal(await run('document.body.dataset.page'), extraPage, '后装的页能直接打开');
      assert.ok(await run('/后装插件/.test(document.querySelector(".page").textContent)'), '页面说明它来自后装插件');
      win.setSize(880, 760);
      await delay(500);
      assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, '装进一批后 880 也不横溢');
      await capture('stress-narrow');
      win.setSize(1440, 900);
      await delay(400);
      await run(`document.querySelector('[data-go=plugins]').click()`);
      await delay(700);
      await run(`document.querySelector('[data-act="stress-reset"]').click()`);
      await delay(500);
      assert.equal(await run('document.querySelectorAll(".shuttle-item").length'), beforeStress, '恢复后梭回到原样');
      assert.equal(await run('document.querySelector(".shuttle-set[data-set=more]")'), null, '「新装」组跟着清空');
      step('插件无上限：后装一批进「新装」、可打开、窄窗不横溢、可恢复');

      // ── 5. 命令面板 ────────────────────────────────────
      await open('today');
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true}))`);
      await delay(400);
      assert.equal(await run('document.getElementById("palette").classList.contains("is-on")'), true, 'Ctrl K 打开命令');
      assert.ok(await run('document.querySelectorAll("#palette-list .pal-item").length >= 6'), '空态给建议');
      await run(`(()=>{const i=document.getElementById('palette-input');i.value='日';i.dispatchEvent(new Event('input'));})()`);
      await delay(250);
      assert.ok(await run('document.querySelectorAll("#palette-list .pal-item").length >= 1'), '能过滤');
      await run(`(()=>{const i=document.getElementById('palette-input');i.value='zzzz';i.dispatchEvent(new Event('input'));})()`);
      await delay(250);
      assert.ok(await run('/要不要试试/.test(document.getElementById("palette-list").textContent)'), '无结果给建议');
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
      await delay(300);
      assert.equal(await run('document.getElementById("palette").classList.contains("is-on")'), false, 'Esc 收起');
      step('命令：Ctrl K、建议、过滤、无结果建议、Esc');

      // ── 6. 四种材质 ────────────────────────────────────
      for (const skin of ['water', 'map', 'house', 'paper']) {
        await run(`(()=>{const b=document.getElementById('skin-btn');b.click();
          document.querySelector('.swatches [data-skin="${skin}"]').click();})()`);
        await delay(500);
        assert.equal(await run('document.body.dataset.skin'), skin, '切到 ' + skin);
        assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, skin + ' 不横溢');
        if (skin === 'water') await capture('skin-water');
        if (skin === 'house') await capture('skin-house');
      }
      step('材质：纸/水/图/场都能切、都不横溢');

      // ── 7. 每一页都留一张图 ────────────────────────────
      for (const id of ['today', 'items', 'courses', 'calendar', 'notes', 'objects', 'web', 'plugins', 'settings', 'assistant', 'reminders', 'chat', 'import']) {
        await open(id);
        await capture('page-' + id);
      }
      step('截图：十三页各一张');

      // ── 8. 窄窗 ────────────────────────────────────────
      win.setSize(880, 760);
      await delay(600);
      for (const id of ['today', 'courses', 'items', 'plugins', 'settings']) {
        await open(id);
        assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, id + ' 880 不横溢');
        if (id === 'today') await capture('narrow-today');
      }
      win.setSize(1440, 900);
      await delay(500);
      step('窄窗：880 下五个主页面都不横溢');

      // ── 9. 减弱动效 ────────────────────────────────────
      await open('today');
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
      });
      await open('today');
      assert.equal(await run('Boolean(document.querySelector(".ambient-dust"))'), false, '减弱动效时不画微尘');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
      win.webContents.debugger.detach();
      step('减弱动效：不创建微尘画布');

      // ── 10. 零存储 ─────────────────────────────────────
      assert.equal(await run('localStorage.length'), 0, 'localStorage 为空');
      assert.equal(await run('sessionStorage.length'), 0, 'sessionStorage 为空');
      step('零存储：两个 storage 都是 0');

      // ── 11. 无报错 ─────────────────────────────────────
      assert.deepEqual(errors, [], '没有控制台错误');
      step('无控制台错误');

      fs.writeFileSync(path.join(base, 'loom.json'), JSON.stringify({
        status: 'passed', at: new Date().toISOString(), checks,
        pages: ALL_PAGES, viewports: [1440, 880], skins: ['paper', 'water', 'map', 'house']
      }, null, 2));

      process.stdout.write('\n织机：' + checks + ' 项通过\n');
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      clearTimeout(timeout);
      console.error('\nFAILED:', error && error.message);
      if (error && error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
      app.exit(1);
    }
  });
}
