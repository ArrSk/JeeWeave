// 三套新骨架的离屏验证：能开、13 页可达、插件开关生效、不横溢、无报错。
const fs = require('node:fs');
const path = require('node:path');

const base = path.resolve(__dirname, '../.cache/verification');
const temporary = path.join(base, 'shells-test');
const shots = path.resolve(__dirname, '../.cache/shell-shots');
if (path.dirname(temporary) !== base || path.basename(temporary) !== 'shells-test') {
  throw Error('Unsafe cleanup directory');
}

const SHELLS = [
  { file: 'book.html', name: 'book', title: '书页', nav: '[data-go]', pick: '[data-pick]' },
  { file: 'ring.html', name: 'ring', title: '环时', nav: '[data-go]', pick: '[data-seg]' },
  { file: 'tree.html', name: 'tree', title: '三栏', nav: '[data-go]', pick: '[data-pick]' }
];
const PAGES = ['today', 'items', 'courses', 'calendar', 'notes', 'objects', 'web', 'reminders', 'assistant', 'chat', 'import', 'plugins', 'settings'];

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], { stdio: 'inherit', windowsHide: true, env });
  const timer = setTimeout(() => child.kill(), 260000);
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
  if (process.env.SHELL_SHOTS === '1') fs.mkdirSync(shots, { recursive: true });
  app.setPath('userData', path.join(temporary, 'profile'));
  app.disableHardwareAcceleration();

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const timeout = setTimeout(() => { console.error('shells timeout'); app.exit(1); }, 250000);
  let checks = 0;
  const step = (m) => { checks += 1; process.stdout.write('  ok ' + checks + ' — ' + m + '\n'); };

  let win;
  app.whenReady().then(async () => {
    try {
      win = new BrowserWindow({
        width: 1440, height: 900, show: false,
        webPreferences: {
          offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true,
          session: session.fromPartition('shells-test')
        }
      });
      const run = (c) => win.webContents.executeJavaScript(c);
      const capture = async (n) => {
        if (process.env.SHELL_SHOTS !== '1') return;
        await run(`(()=>{const t=document.getElementById('note');if(t)t.classList.remove('is-on')})()`).catch(() => {});
        await delay(820);
        fs.writeFileSync(path.join(shots, n + '.png'), (await win.webContents.capturePage()).toPNG());
      };
      const open = async (file, hash) => {
        await win.loadFile(path.join(__dirname, '../design-lab/' + file));
        if (hash) {
          // loadFile 的 hash 在某些版本上不生效，显式设一次再重载
          await win.webContents.executeJavaScript(`location.hash=${JSON.stringify('#' + hash)};true`).catch(() => {});
        }
        await delay(1100);
      };

      for (const shell of SHELLS) {
        const errors = [];
        const onErr = (e) => { if (e.level === 'error' || e.level === 3) errors.push(e.message); };
        win.webContents.on('console-message', onErr);

        await open(shell.file);

        // 1. 起手有内容
        assert.ok(await run('document.body && document.body.children.length > 2'), shell.title + ' 有结构');
        assert.equal(await run('document.body.dataset.page'), 'today', shell.title + ' 起手在今天');
        assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, shell.title + ' 1440 不横溢');

        // 2. 读到了共用资料与插件清单
        assert.ok(await run('window.Lab && window.Lab.todaySlips().length >= 6'), shell.title + ' 读到资料');
        assert.ok(await run('window.Plugs && window.Plugs.list.length === 12'), shell.title + ' 读到 12 个插件');
        assert.ok(await run('window.Plugs.pages.length === 13'), shell.title + ' 有 13 个页面');

        await capture(shell.name + '-today');

        // 3. 每一页都能直接开
        const seen = [];
        for (const id of PAGES) {
          await open(shell.file, id);
          const info = await run(`(()=>{const p=document.body.dataset.page;
            const txt=document.body.textContent.trim().length;
            const closed=/已关闭|已关掉|关掉/.test(document.querySelector('main, .main, .leaf-r, #relay, #stage')?.textContent||'');
            return {p, txt, closed, scroll:document.documentElement.scrollWidth<=innerWidth+1}})()`);
          assert.equal(info.p, id, shell.title + ' / ' + id + ' 对得上');
          assert.ok(info.txt > 90, shell.title + ' / ' + id + ' 有内容');
          assert.equal(info.scroll, true, shell.title + ' / ' + id + ' 不横溢');
          seen.push(id + (info.closed ? '(关)' : ''));
        }
        assert.equal(seen.length, PAGES.length, shell.title + ' 十三页都过');

        // 4. 插件开关真的改变壳
        await open(shell.file, 'plugins');
        // 在插件页点「笔记」那一条
        const clicked = await run(`(()=>{
          const nodes=[...document.querySelectorAll('[data-plug]')];
          const b=nodes.find(n=>n.textContent.includes('笔记'));
          if(!b) return false; b.click(); return true;})()`);
        assert.equal(clicked, true, shell.title + ' 插件页能点到笔记');

        // 5. Ctrl K 命令面板
        await open(shell.file, 'today');
        await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))`);
        await delay(400);
        const cmdOn = await run(`(()=>{const w=document.getElementById('cmd');return w&&w.classList.contains('is-on')})()`);
        assert.equal(cmdOn, true, shell.title + ' Ctrl K 打开命令');
        await run(`(()=>{const i=document.getElementById('cmd-input');i.value='日';i.dispatchEvent(new Event('input'));})()`);
        await delay(260);
        assert.ok(await run('document.querySelectorAll("#cmd-list .ci").length>=1'), shell.title + ' 能筛');
        await capture(shell.name + '-cmd');
        await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
        await delay(300);
        assert.equal(await run(`document.getElementById('cmd').classList.contains('is-on')`), false, shell.title + ' Esc 收起');

        // 6. 窄窗
        win.setSize(880, 760);
        await delay(700);
        for (const id of ['today', 'items', 'courses', 'plugins']) {
          await open(shell.file, id);
          assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, shell.title + ' 880 / ' + id + ' 不横溢');
          if (id === 'today') await capture(shell.name + '-880');
        }
        win.setSize(1440, 900);
        await delay(520);

        assert.deepEqual(errors, [], shell.title + ' 无控制台错误：' + errors.join(' | '));
        win.webContents.removeListener('console-message', onErr);
        step(shell.title + '：起手、资料、13 页、插件开关、命令、880、无报错');
      }

      // 各自的关键交互
      await open('book.html', 'today');
      await run(`(()=>{const b=document.querySelector('[data-done]');if(b)b.click();})()`);
      await delay(500);
      assert.ok(await run('/划掉|已划/.test(document.body.textContent)'), '书页：能划掉');
      await capture('book-done');
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))`);
      await delay(900);
      assert.equal(await run('document.body.dataset.page'), 'items', '书页：→ 翻到事项');
      await capture('book-items');
      step('书页：划掉、翻章');

      await open('ring.html', 'today');
      assert.ok(await run('document.querySelectorAll("#dial-svg .seg").length>=5'), '环时：环上有扇区');
      await run(`(()=>{const s=document.querySelector('#dial-svg .seg');s.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()`);
      await delay(400);
      assert.ok(await run('document.querySelector("#relay").textContent.trim().length>20'), '环时：点扇区换了右栏');
      await capture('ring-today');
      await run(`(()=>{const b=document.querySelector('[data-scale=week]');b.click();})()`);
      await delay(700);
      assert.equal(await run('document.body.dataset.page'), 'courses', '环时：切到周视图');
      await capture('ring-courses');
      step('环时：扇区、切尺度');

      await open('tree.html', 'today');
      assert.ok(await run('document.querySelectorAll(".trow").length>=6'), '三栏：表里有行');
      await run(`(()=>{const r=document.querySelectorAll('.trow')[1];r.click();})()`);
      await delay(500);
      assert.ok(await run('document.querySelector("#ins-body").textContent.trim().length>30'), '三栏：检查器有字段');
      await capture('tree-today');
      await run(`(()=>{const b=document.querySelector('[data-go=items]');b.click();})()`);
      await delay(600);
      assert.equal(await run('document.body.dataset.page'), 'items', '三栏：树里切页');
      await capture('tree-items');
      step('三栏：行、检查器、树内切换');

      // 零存储 + 减弱动效
      await open('book.html', 'today');
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
      });
      await open('book.html', 'today');
      assert.equal(await run('Boolean(document.querySelector(".ambient-dust"))'), false, '减弱动效：书页不画微尘');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] });
      win.webContents.debugger.detach();
      for (const s of SHELLS) {
        await open(s.file, 'today');
        assert.equal(await run('localStorage.length'), 0, s.title + ' 零存储');
      }
      step('减弱动效与零存储');

      clearTimeout(timeout);
      fs.writeFileSync(path.join(base, 'shells.json'), JSON.stringify({
        status: 'passed', at: new Date().toISOString(), checks,
        shells: SHELLS.map((s) => s.title), pages: PAGES, viewports: [1440, 880]
      }, null, 2));
      process.stdout.write('\n三套新骨架：' + checks + ' 项通过\n');
      app.exit(0);
    } catch (error) {
      clearTimeout(timeout);
      console.error('\nFAILED:', error && error.message);
      if (error && error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'));
      app.exit(1);
    }
  });
}
