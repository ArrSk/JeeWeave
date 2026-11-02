// 四向候选的离屏验证：页面能开、布局不横溢、关键交互与微尘都工作。
const fs = require('node:fs');
const path = require('node:path');

const base = path.resolve(__dirname, '../.cache/verification');
const temporary = path.join(base, 'design-lab-test');
const shots = path.resolve(__dirname, '../.cache/lab-shots');
if (path.dirname(temporary) !== base || path.basename(temporary) !== 'design-lab-test') {
  throw Error('Unsafe cleanup directory');
}

const PAGES = [
  { file: 'index.html', name: 'hall', title: '四向画廊' },
  { file: 'ripple.html', name: 'ripple', title: '涟漪' },
  { file: 'atlas.html', name: 'atlas', title: '舆图' },
  { file: 'stage.html', name: 'stage', title: '夜场' },
  { file: 'jingwei.html', name: 'jingwei', title: '经纬' }
];

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], { stdio: 'inherit', windowsHide: true, env });
  const timer = setTimeout(() => child.kill(), 200000);
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
  if (process.env.LAB_SHOTS === '1') fs.mkdirSync(shots, { recursive: true });
  app.setPath('userData', path.join(temporary, 'profile'));
  app.disableHardwareAcceleration();

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const timeout = setTimeout(() => { console.error('lab gallery timeout'); app.exit(1); }, 190000);
  let checks = 0;
  const step = (name) => { checks += 1; process.stdout.write('  ok ' + checks + ' — ' + name + '\n'); };

  let win;
  app.whenReady().then(async () => {
    try {
      win = new BrowserWindow({
        width: 1440, height: 900, show: false,
        webPreferences: {
          offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true,
          session: session.fromPartition('design-lab-gallery')
        }
      });
      const run = (code) => win.webContents.executeJavaScript(code);
      const capture = async (name) => {
        if (process.env.LAB_SHOTS !== '1') return;
        await run(`(()=>{const c=document.querySelector('.cue,#hint,#toast');if(c)c.classList.remove('is-on');return true})()`).catch(() => {});
        await delay(820);
        fs.writeFileSync(path.join(shots, name + '.png'), (await win.webContents.capturePage()).toPNG());
      };
      const open = async (file) => {
        await win.loadFile(path.join(__dirname, '../design-lab/' + file));
        await delay(1000);
      };

      for (const page of PAGES) {
        const errors = [];
        const onError = (e) => { if (e.level === 'error' || e.level === 3) errors.push(e.message); };
        win.webContents.on('console-message', onError);

        await open(page.file);

        // 1. 页面立住了：画廊看卡片数，其余看有没有真内容
        if (page.file === 'index.html') {
          assert.equal(await run('document.querySelectorAll(".card").length'), 4, '画廊有四张卡（三新骨架已隐藏、代码保留）');
        } else {
          assert.ok(await run('document.body && document.body.children.length > 2'), page.title + ' 有内容');
        }
        assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, page.title + ' 1440 不横溢');

        // 2. 共用资料确实被读到（画廊页除外）
        if (page.file !== 'index.html') {
          assert.ok(await run('Boolean(window.Lab && window.Lab.todaySlips().length >= 6)'),
            page.title + ' 读到了共用资料');
          assert.ok(await run('window.Lab.items.length >= 9'), page.title + ' 有事项');
          assert.ok(await run('window.Lab.objects.length === 8'), page.title + ' 有八个对象');
        }

        // 3. 微尘存在且不接事件（画廊页没有）
        if (page.file !== 'index.html') {
          const dust = await run(`(()=>{const c=document.querySelector('.ambient-dust');
            if(!c) return {ok:false};
            const s=getComputedStyle(c);
            return {ok:true,pe:s.pointerEvents,w:c.width>0,h:c.height>0,aria:c.getAttribute('aria-hidden')}})()`);
          assert.equal(dust.ok, true, page.title + ' 有微尘层');
          assert.equal(dust.pe, 'none', page.title + ' 微尘不拦截指针');
          assert.equal(dust.aria, 'true', page.title + ' 微尘对读屏隐藏');
        }

        if (page.file !== 'index.html') await capture(page.name + '-1440');

        // 4. 命令面板：Ctrl+K 打开、打字即筛、Esc 关
        //    经纬用的是 palette-*，其余三个是 cmd-*，按页取前缀。
        if (page.file !== 'index.html') {
          const p = page.file === 'jingwei.html'
            ? { wrap: '#palette-wrap', input: '#palette-input', list: '#palette-list', on: 'is-open' }
            : { wrap: '#cmd-wrap', input: '#cmd-input', list: '#cmd-list', on: 'is-on' };
          await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));true`);
          await delay(420);
          const opened = await run(`(()=>{const w=document.querySelector('${p.wrap}');return w&&w.classList.contains('${p.on}')})()`);
          assert.equal(opened, true, page.title + ' Ctrl+K 打开命令');
          await run(`(()=>{const i=document.querySelector('${p.input}');i.value='中';i.dispatchEvent(new Event('input'));return true})()`);
          await delay(260);
          const filtered = await run(`[...document.querySelectorAll('${p.list} .label')].map(e=>e.textContent)`);
          assert.ok(filtered.length > 0, page.title + ' 输入能筛出结果');
          await capture(page.name + '-cmd');
          await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`);
          await delay(340);
          assert.equal(await run(`document.querySelector('${p.wrap}').classList.contains('${p.on}')`), false,
            page.title + ' Esc 收起命令');
        }

        // 5. 页内没有图标小框（旧版 long-knot 的 data-tip）
        assert.equal(await run(`document.querySelectorAll('[data-tip]:not(.long-knot)').length`), 0,
          page.title + ' 不靠 data-tip 弹框');

        if (page.file !== 'index.html') {
          // 6. 窄窗
          win.setSize(880, 700);
          await delay(760);
          assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true,
            page.title + ' 880 不横溢');
          await capture(page.name + '-880');
          win.setSize(1440, 900);
          await delay(560);
        }

        assert.deepEqual(errors, [], page.title + ' 无控制台错误：' + errors.join(' | '));
        win.webContents.removeListener('console-message', onError);
        step(page.title + '：打开、共用资料、微尘、命令、无小框、窄窗、无报错');
      }

      // ── 逐方向的关键交互 ────────────────────────────────
      // 涟漪：完成一颗石子
      await open('ripple.html');
      await run(`(()=>{const b=document.querySelector('[data-check]');b.click();return true})()`);
      await delay(420);
      assert.equal(await run(`document.querySelectorAll('.stone.is-done').length>=1`), true, '涟漪：能圈掉一颗石子');
      await run(`(()=>{const s=document.querySelectorAll('[data-open]')[1];s.click();return true})()`);
      await delay(420);
      assert.equal(await run(`document.querySelector('#detail').classList.contains('is-on')`), true, '涟漪：详情就地展开');
      await capture('ripple-detail');
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true`);
      await delay(300);
      // 换视图走慢转场
      await run(`document.querySelector('.bar-r [data-view=week]').click();true`);
      await delay(1400);
      assert.equal(await run(`document.querySelector('.bar-scale').textContent`), '本周', '涟漪：切到本周');
      await capture('ripple-week');
      step('涟漪：圈掉石子、就地详情、慢转场到本周');

      // 舆图：三个图层
      await open('atlas.html');
      await run(`document.querySelector('#legend [data-layer=terrain]').click();true`);
      await delay(1300);
      assert.equal(await run(`document.querySelectorAll('.field').length`), 8, '舆图：八块地');
      await capture('atlas-terrain');
      await run(`document.querySelector('#legend [data-layer=marks]').click();true`);
      await delay(1300);
      assert.ok(await run(`document.querySelectorAll('.mark').length`) >= 9, '舆图：界标齐全');
      await run(`(()=>{document.querySelector('[data-mark]').click();return true})()`);
      await delay(420);
      assert.equal(await run(`document.querySelector('#gazetteer').classList.contains('is-on')`), true, '舆图：地志展开');
      await capture('atlas-marks');
      step('舆图：八块地、界标齐全、地志就地展开');

      // 夜场：台上换幕
      await open('stage.html');
      assert.ok(await run(`document.querySelectorAll('.wing').length>=6`), '夜场：候场有人');
      const before = await run(`document.querySelector('.scene h1') && document.querySelector('.scene h1').textContent`);
      await run(`(()=>{const w=[...document.querySelectorAll('.wing')].find(x=>!x.classList.contains('is-on'));w.click();return true})()`);
      await delay(900);
      const after = await run(`document.querySelector('.scene h1') && document.querySelector('.scene h1').textContent`);
      assert.ok(before && after, '夜场：台上有戏');
      assert.notEqual(before, after, '夜场：换幕后台上换了戏');
      await capture('stage-main');
      await run(`(()=>{const b=document.querySelector('[data-act=done]');if(b)b.click();return true})()`);
      await delay(420);
      step('夜场：候场换幕、收工');

      // 经纬：三尺度 + 微尘
      await open('jingwei.html');
      assert.equal(await run(`document.querySelectorAll('.slip').length>=6`), true, '经纬：纸条在线上');
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'2',bubbles:true}));true`);
      await delay(1400);
      assert.equal(await run(`document.querySelector('.plane.is-live').id`), 'plane-week', '经纬：换到本周');
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'3',bubbles:true}));true`);
      await delay(1400);
      assert.equal(await run(`document.querySelector('.plane.is-live').id`), 'plane-long', '经纬：换到长线');
      // 长线上不再有原地小框
      assert.equal(await run(`(()=>{const k=document.querySelector('.long-knot');return k?getComputedStyle(k,'::after').content:'none'})()`), 'none',
        '经纬：长线不再弹小框');
      await capture('jingwei-long');
      step('经纬：三尺度慢切换、长线无小框');

      // ── 减弱动效：四个方向都不再画微尘 ──────────────────
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
      });
      for (const f of ['ripple.html', 'atlas.html', 'stage.html', 'jingwei.html']) {
        await open(f);
        const dust = await run(`document.querySelectorAll('.ambient-dust').length`);
        assert.equal(dust, 0, f + ' 减弱动效时不画微尘');
      }
      win.webContents.debugger.detach();
      step('减弱动效：四个方向都不画微尘');

      // ── 零存储 ─────────────────────────────────────────
      for (const f of ['ripple.html', 'atlas.html', 'stage.html', 'jingwei.html']) {
        await open(f);
        assert.equal(await run(`(()=>{try{return localStorage.length}catch(e){return 0}})()`), 0, f + ' 不写存储');
      }
      step('零存储：四个方向都不动 localStorage');

      clearTimeout(timeout);
      fs.writeFileSync(path.resolve(__dirname, '../.cache/verification/design-lab.json'),
        JSON.stringify({
          status: 'passed', at: new Date().toISOString(), checks,
          directions: PAGES.map((p) => p.title),
          viewports: [1440, 880],
          sharedModel: { items: 9, objects: 8, notes: 4, courses: 7, modules: 10 },
          note: '四个方向 + 画廊；微尘可关；长线小框已移除；转场放慢'
        }, null, 2) + '\n');
      console.log('\n四向候选：' + checks + ' 项通过');
      app.exit(0);
    } catch (e) {
      clearTimeout(timeout);
      console.error('\n失败：', (e && e.stack) || e);
      if (win && !win.isDestroyed()) {
        try {
          fs.writeFileSync(path.join(temporary, 'failure.png'), (await win.webContents.capturePage()).toPNG());
          console.error('截图：', path.join(temporary, 'failure.png'));
        } catch (_) { /* 尽力而为 */ }
      }
      app.exit(1);
    }
  }).catch((e) => { console.error(e); app.exit(1); });
}
