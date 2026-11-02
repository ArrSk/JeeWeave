/* 织机 · 壳
   梭 = 插件清单，页 = 插件注册的路由。关掉插件，梭上那一枚和它的页一起消失。 */

(function (global) {
  var L = global.Lab;
  var P = global.LoomPages;
  var esc = L.esc;

  var stage = document.getElementById('stage');
  var shuttle = document.getElementById('shuttle');
  var palette = document.getElementById('palette');
  var palInput = document.getElementById('palette-input');
  var palList = document.getElementById('palette-list');
  var palFoot = document.getElementById('palette-foot');
  var help = document.getElementById('help');
  var skinsMenu = document.getElementById('skin-menu');
  var toastEl = document.getElementById('toast');
  var skinBtn = document.getElementById('skin-btn');
  var skinName = document.getElementById('skin-name');
  var markWeek = document.getElementById('mark-week');

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var dust = null;
  var current = null;
  var lastPage = null;
  var toastTimer = 0;
  var undo = null;
  var palIndex = 0;
  var palItems = [];

  var ICONS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4"/>',
    diamond: '<path d="m12 3 9 9-9 9-9-9Z"/><path d="m8 12 3 3 5-6"/>',
    grid: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 3v4m8-4v4M9 10v11m6-11v11"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>',
    pen: '<path d="M12 4H4v16h16v-8M10 14l1-5 8-8 4 4-8 8Z"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1"/>',
    bell: '<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.5 20a2 2 0 0 0 3 0"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    chat: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z"/>',
    down: '<path d="M12 4v12m0 0 4-4m-4 4-4-4M4 20h16"/>',
    plug: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7m-3.5-3.5v7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  /* ── 梭 ─────────────────────────────────────────────── */

  function visiblePages() {
    return P.pages.filter(function (p) { return p.core || P.isOn(p.owner); });
  }

  function paintShuttle() {
    var list = visiblePages();
    shuttle.innerHTML = list.map(function (p, i) {
      return '<button type="button" class="shuttle-item" data-go="' + p.id + '"' +
        (p.id === current ? ' aria-current="page"' : '') + ' title="' + esc(p.name) + '">' +
        icon(p.icon) + '<span>' + esc(p.name) + '</span></button>';
    }).join('');
  }

  /* ── 路由 ───────────────────────────────────────────── */

  function paint(id) {
    var body = P.render(id);
    var page = P.pages.filter(function (p) { return p.id === id; })[0] || {};
    var owner = page.owner;
    var off = owner && !P.isOn(owner);

    if (off) {
      var plug = P.plugins.filter(function (x) { return x.id === owner; })[0] || { name: page.name };
      var req = plug.requires && P.plugins.filter(function (x) { return x.id === plug.requires; })[0];
      var why = req
        ? '它依赖「' + req.name + '」。' + req.name + '关着的时候，它也不出现、不注册命令。'
        : '它的页面、命令和梭上的位置都一起消失了。到「插件」里再打开就能回来。';
      body = '<div class="ph"><div class="ph-l"><h1>' + esc(plug.name) + ' · 已关闭</h1><p>' + why + '</p></div></div>' +
        '<button type="button" class="btn" data-go="plugins">去插件</button>';
    }

    stage.innerHTML = '<section class="page" data-page="' + id + '">' + body + '</section>';
    document.body.dataset.page = id;
    current = id;
    paintShuttle();
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
    stage.scrollTop = 0;
    global.scrollTo(0, 0);
  }

  function go(id, opts) {
    if (!id) return;
    var page = P.pages.filter(function (p) { return p.id === id; })[0];
    if (!page) return;
    if (id === current) { if (opts && opts.force) paint(id); return; }
    lastPage = current;
    if (reduce.matches) { paint(id); return; }
    var old = stage.querySelector('.page');
    if (old) {
      old.classList.add('is-leaving');
      window.setTimeout(function () { paint(id); }, 260 + 140);
    } else {
      paint(id);
    }
  }

  /* ── 命令面板 ───────────────────────────────────────── */

  function commands() {
    var out = [];
    visiblePages().forEach(function (p) {
      out.push({ own: '页面', name: p.name, sub: '', run: function () { go(p.id); } });
    });
    if (P.isOn('plans')) {
      L.items.forEach(function (it) {
        out.push({
          own: '事项', name: it.title, sub: (it.kind === 'task' ? '待办' : it.kind === 'plan' ? '计划' : '事件'),
          run: function () { go('items'); }
        });
      });
    }
    if (P.isOn('objects')) {
      L.objects.forEach(function (o) {
        out.push({ own: '对象', name: o.name, sub: o.kind, run: function () { P.state.objSel = o.id; go('objects'); } });
      });
    }
    if (P.isOn('notes')) {
      L.notes.forEach(function (n) {
        out.push({ own: '笔记', name: n.title || n.body.slice(0, 14) + '…', sub: n.kind, run: function () { P.state.noteSel = n.id; go('notes'); } });
      });
    }
    P.plugins.forEach(function (p) {
      if (p.suspended || p.missing) return;
      var on = !!P.state.modules[p.id];
      out.push({
        own: '插件', name: (on ? '关掉 ' : '打开 ') + p.name, sub: on ? '已开' : '已关',
        run: function () { power(p.id, !on); }
      });
    });
    out.push({ own: '设置', name: '换材质', sub: '纸 / 水 / 图 / 场', run: function () { cycleSkin(); } });
    out.push({ own: '设置', name: '开发者模式', sub: P.state.developer ? '已开' : '已关', run: function () { P.state.developer = !P.state.developer; go('settings', { force: true }); } });
    return out;
  }

  function filterPalette(q) {
    var all = commands();
    q = (q || '').trim().toLowerCase();
    if (!q) return all.slice(0, 8);
    return all.filter(function (c) {
      return (c.own + ' ' + c.name + ' ' + c.sub).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 9);
  }

  function paintPalette(q) {
    palItems = filterPalette(q);
    palIndex = 0;
    if (!palItems.length) {
      palList.innerHTML = '<li class="pal-item" style="color:var(--ink3);cursor:default">没有这一项。要不要试试「今天」「课程表」「换材质」？</li>';
      palFoot.textContent = '换个说法，或者按 Esc 先退出';
      return;
    }
    palList.innerHTML = palItems.map(function (c, i) {
      return '<li class="pal-item' + (i === 0 ? ' is-on' : '') + '" role="option" aria-selected="' + (i === 0) + '" data-i="' + i + '">' +
        '<span class="pal-own">' + esc(c.own) + '</span>' +
        '<span class="pal-name">' + esc(c.name) + '</span>' +
        '<span class="pal-sub">' + esc(c.sub || '') + '</span></li>';
    }).join('');
    palFoot.textContent = '↑↓ 选 · ↵ 打开 · 直接打字也能呼出';
  }

  function movePal(d) {
    if (!palItems.length) return;
    palIndex = (palIndex + d + palItems.length) % palItems.length;
    Array.prototype.forEach.call(palList.children, function (el, i) {
      if (el.classList) {
        el.classList.toggle('is-on', i === palIndex);
        el.setAttribute('aria-selected', String(i === palIndex));
      }
    });
  }

  function openPalette(prefill) {
    palette.classList.add('is-on');
    palette.removeAttribute('inert');
    palInput.value = prefill || '';
    paintPalette(prefill || '');
    window.setTimeout(function () { palInput.focus(); }, 30);
  }
  function closePalette() {
    palette.classList.remove('is-on');
    palette.setAttribute('inert', '');
  }
  function runPal() {
    var c = palItems[palIndex];
    if (!c) return;
    closePalette();
    c.run();
  }

  /* ── 插件开关 ───────────────────────────────────────── */

  function power(id, on) {
    var p = P.plugins.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (p.suspended) { toast('「' + p.name + '」在正式版本里是挂起的，开关不生效'); return; }
    if (p.missing) { toast('「' + p.name + '」还没实装'); return; }
    P.setPlugin(id, on);
    paintShuttle();

    // 依赖它的插件跟着失效
    var affected = P.plugins.filter(function (x) { return x.requires === id; });

    if (!on) {
      // 当前页若属于这个插件（或依赖它的插件），退回今天
      var here = P.pages.filter(function (pg) { return pg.id === current; })[0];
      var bad = here && (here.owner === id || affected.some(function (a) { return a.id === here.owner; }));
      if (bad) go('today');
      toast('「' + p.name + '」已关掉' + (affected.length ? '，依赖它的 ' + affected.map(function (a) { return a.name; }).join('、') + ' 一起停用' : ''));
    } else {
      toast('「' + p.name + '」已打开');
    }

    if (current === 'plugins' || current === 'import') go(current, { force: true });
  }

  /* ── 材质 ───────────────────────────────────────────── */

  var SKINS = [
    { id: 'paper', name: '纸', tint: '#8a8578' },
    { id: 'water', name: '水', tint: '#7fa8bd' },
    { id: 'map', name: '图', tint: '#a08b63' },
    { id: 'house', name: '场', tint: '#b8956a' }
  ];

  function currentSkin() {
    return SKINS.filter(function (s) { return s.id === document.body.dataset.skin; })[0] || SKINS[0];
  }

  function applySkin(id) {
    document.body.dataset.skin = id;
    var s = currentSkin();
    P.state.skin = id;
    skinName.textContent = s.name;
    paintSwatches();
    if (dust) { dust.dispose(); dust = null; }
    dust = L.installDust({ count: 15, tint: s.tint });
  }

  function cycleSkin() {
    var i = SKINS.map(function (s) { return s.id; }).indexOf(document.body.dataset.skin);
    applySkin(SKINS[(i + 1) % SKINS.length].id);
    toast('材质 · ' + currentSkin().name);
  }

  function paintSwatches() {
    skinsMenu.innerHTML = SKINS.map(function (s) {
      return '<button type="button" role="menuitemradio" aria-checked="' + (document.body.dataset.skin === s.id) + '" data-skin="' + s.id + '">' +
        '<i style="background:' + s.tint + '"></i>' + s.name + '</button>';
    }).join('');
  }

  /* ── 提示与撤回 ─────────────────────────────────────── */

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove('is-on'); }, 3200);
  }

  function toggleDone(id) {
    var slips = L.todaySlips();
    var s = slips.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var before = P.state.done[id] != null ? P.state.done[id] : s.done;
    P.state.done[id] = !before;
    undo = { id: id, before: before };
    if (current === 'today') paint('today');
    toast(before ? '又变回没做了 · Ctrl Z 可退回' : '穿过一线 · ' + s.title + ' · Ctrl Z 可撤回');
  }

  /* ── 事件 ───────────────────────────────────────────── */

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-act],[data-skin]');
    if (!t) return;

    if (t.dataset.go) { go(t.dataset.go); return; }

    if (t.dataset.skin) {
      applySkin(t.dataset.skin);
      skinsMenu.classList.remove('is-on');
      skinsMenu.setAttribute('inert', '');
      skinBtn.setAttribute('aria-expanded', 'false');
      return;
    }

    var act = t.dataset.act;
    var id = t.dataset.id;
    var k = t.dataset.k;

    if (act === 'done') { e.stopPropagation(); toggleDone(id); return; }
    if (act === 'open-item') { toast('示例稿里不展开详情；真实实现里这里开一条侧记'); return; }
    if (act === 'open-course') { toast('课程详情在真实实现里是个覆盖层'); return; }
    if (act === 'item-filter') { P.state.itemFilter = k; paint('items'); return; }
    if (act === 'note-filter') { P.state.noteFilter = k; P.state.noteSel = null; paint('notes'); return; }
    if (act === 'note-sel') { P.state.noteSel = id; paint('notes'); return; }
    if (act === 'obj-sel') { P.state.objSel = P.state.objSel === id ? null : id; paint('objects'); return; }
    if (act === 'web-sel') { P.state.webSel = id; paint('web'); return; }
    if (act === 'cal-mode') { P.state.calMode = k; paint('calendar'); return; }
    if (act === 'cal-prev') { P.state.calOffset -= 1; paint('calendar'); return; }
    if (act === 'cal-next') { P.state.calOffset += 1; paint('calendar'); return; }
    if (act === 'week-prev') { P.state.week = Math.max(1, P.state.week - 1); paint('courses'); return; }
    if (act === 'week-next') { P.state.week = Math.min(20, P.state.week + 1); paint('courses'); return; }
    if (act === 'parity') { P.state.parity = k; paint('courses'); return; }
    if (act === 'skin') { applySkin(k); paint('settings'); return; }
    if (act === 'theme') { P.state.theme = k; document.documentElement.style.setProperty('--accent', (L.themes.filter(function (x) { return x.id === k; })[0] || {}).accent); paint('settings'); return; }
    if (act === 'power') { power(id, !P.state.modules[id]); return; }
    if (act === 'developer') { P.state.developer = !P.state.developer; paint('settings'); return; }
    if (act === 'goto-import') { go('import'); return; }
    if (act === 'scroll-now') { window.scrollTo(0, 0); return; }
    if (act === 'noop') { toast('这一处在示例稿里没有接行为'); return; }
  });

  skinBtn.addEventListener('click', function () {
    var on = skinsMenu.classList.toggle('is-on');
    skinBtn.setAttribute('aria-expanded', String(on));
    if (on) skinsMenu.removeAttribute('inert'); else skinsMenu.setAttribute('inert', '');
  });

  document.getElementById('cmd-open').addEventListener('click', function () { openPalette(''); });
  document.getElementById('help-open').addEventListener('click', function () {
    help.classList.add('is-on'); help.removeAttribute('inert');
  });
  document.getElementById('help-close').addEventListener('click', function () {
    help.classList.remove('is-on'); help.setAttribute('inert', '');
  });
  help.addEventListener('click', function (e) {
    if (e.target === help) { help.classList.remove('is-on'); help.setAttribute('inert', ''); }
  });

  palette.addEventListener('click', function (e) {
    if (e.target === palette) { closePalette(); return; }
    var li = e.target.closest('.pal-item[data-i]');
    if (li) { palIndex = +li.dataset.i; runPal(); }
  });
  palInput.addEventListener('input', function () { paintPalette(palInput.value); });

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);

    if (e.key === 'Escape') {
      if (palette.classList.contains('is-on')) { closePalette(); return; }
      if (help.classList.contains('is-on')) { help.classList.remove('is-on'); help.setAttribute('inert', ''); return; }
      if (skinsMenu.classList.contains('is-on')) { skinsMenu.classList.remove('is-on'); skinsMenu.setAttribute('inert', ''); skinBtn.setAttribute('aria-expanded', 'false'); return; }
      return;
    }

    if (palette.classList.contains('is-on')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); movePal(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); movePal(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); runPal(); return; }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(''); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (!undo) return;
      e.preventDefault();
      var u = undo; undo = null;
      P.state.done[u.id] = u.before;
      if (current === 'today') paint('today');
      toast('已撤回');
      return;
    }
    if (typing) return;

    if (e.key === '?') { e.preventDefault(); help.classList.add('is-on'); help.removeAttribute('inert'); return; }

    if (/^[1-9]$/.test(e.key)) {
      var list = visiblePages();
      var target = list[+e.key - 1];
      if (target) { e.preventDefault(); go(target.id); }
      return;
    }
    if (e.key === '[' || e.key === ']') {
      var l = visiblePages();
      var i = l.map(function (p) { return p.id; }).indexOf(current);
      if (i < 0) return;
      e.preventDefault();
      go(l[(i + (e.key === ']' ? 1 : l.length - 1)) % l.length].id);
      return;
    }
    if (e.key.length === 1 && /[a-z\u4e00-\u9fa5]/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      openPalette(''); return;
    }
  });

  reduce.addEventListener('change', function () {
    if (dust) { dust.dispose(); dust = null; }
    if (!reduce.matches) dust = L.installDust({ count: 15, tint: currentSkin().tint });
  });

  // 地址栏里换 #页面 也算换页（前进后退、外部链接都走这里）
  window.addEventListener('hashchange', function () {
    var id = location.hash.slice(1);
    if (id && id !== current && P.pages.some(function (p) { return p.id === id; })) paint(id);
  });

  /* ── 起手 ───────────────────────────────────────────── */

  var weekNo = L.semesters[0].current;
  markWeek.textContent = '第 ' + weekNo + ' 周 · ' + L.weekdayName();
  P.state.week = weekNo;
  applySkin('paper');
  paintShuttle();

  var start = location.hash.slice(1);
  if (!P.pages.some(function (p) { return p.id === start; })) start = 'today';
  paint(start);
  stage.focus();
})(window);
