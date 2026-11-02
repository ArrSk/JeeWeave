/* 涟漪 · 交互
   一天是水面，安排是石子。近处有形，远处只是水光。
   所有资料来自 shared.js，只在内存里。 */
(function () {
  'use strict';

  var L = window.Lab;
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var esc = L.esc, hm = L.hm, pad = L.pad;

  var view = 'now';
  var scale = 'day';
  var done = {};
  var nowMin = L.clockNow();
  var openId = null;

  var water = $('#water');
  var inner = null;

  /* ── 头 ─────────────────────────────────────────────── */
  function paintBar() {
    var d = new Date();
    $('#bar-date').textContent = (d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + L.weekdayName(d);
    $('#bar-scale').textContent = { now: '今天', week: '本周', items: '事项', notes: '笔记', objects: '对象' }[view];
    $$('.bar-r > button').forEach(function (b) {
      b.setAttribute('aria-current', String(b.dataset.view === view));
    });
    $('#scales-note').textContent = {
      day: '今天 · ' + L.todaySlips().length + ' 颗石子',
      week: '本周 · ' + L.weekGrid().reduce(function (n, a) { return n + a.length; }, 0) + ' 次课',
      month: '本月 · 3 个截止'
    }[scale];
  }

  function head(title, sub, meta, metaBig) {
    return '<div class="head">' +
      '<div><h1>' + title + '</h1><p>' + sub + '</p></div>' +
      '<div class="head-meta">' + (meta ? meta : '') + (metaBig ? '<b>' + metaBig + '</b>' : '') + '</div>' +
      '</div><div class="nowline"></div>';
  }

  /* ── 今天：水面上的一天 ─────────────────────────────── */
  function renderNow() {
    var slips = L.todaySlips();
    var week = L.weekdayName(new Date());
    var open = slips.filter(function (s) { return !done[s.id] && !s.done; }).length;
    var next = slips.filter(function (s) { return !done[s.id] && !s.done && s.at >= nowMin; })[0];
    var sub = next
      ? '此刻 <b>' + hm(nowMin) + '</b>，接下来是 ' + esc(next.title) +
      (next.at - nowMin > 0 ? '，还有 ' + (next.at - nowMin) + ' 分钟。' : '。')
      : '此刻 <b>' + hm(nowMin) + '</b>，今天余下的都走完了。';

    var html = head(
      '今天 · <em>' + week + '</em>',
      sub,
      '未走完 <b>' + open + '</b> 件',
      pad(new Date().getDate())
    );

    if (!slips.length) {
      html += '<div class="empty"><svg viewBox="0 0 24 24"><path d="M3 12c3-4 6-4 9 0s6 4 9 0"/><path d="M3 17c3-3 6-3 9 0s6 3 9 0" opacity=".5"/></svg><p>今天的水面是空的。</p></div>';
      inner.innerHTML = html;
      return;
    }

    // 三段：已经过去 / 正在与接下来 / 稍晚
    var past = slips.filter(function (s) { return s.at + (s.dur || 0) < nowMin; });
    var soon = slips.filter(function (s) { return s.at + (s.dur || 0) >= nowMin && s.at <= nowMin + 180; });
    var later = slips.filter(function (s) { return s.at > nowMin + 180; });

    html += '<div class="stream">';
    if (past.length) html += group('已经流过去', past.length) + past.map(rowHTML).join('');
    if (soon.length) html += group('此刻附近', soon.length) + soon.map(rowHTML).join('');
    if (later.length) html += group('稍晚', later.length) + later.map(rowHTML).join('');
    html += '</div>';

    inner.innerHTML = html;
    bindRows();
  }

  function group(label, n) {
    return '<div class="group"><span>' + label + '</span><b>' + n + '</b></div>';
  }

  function rowHTML(s, i) {
    var isDone = done[s.id] || s.done;
    var isPast = s.at + (s.dur || 0) < nowMin;
    var cls = 'stone' + (isDone ? ' is-done' : '') + (isPast && !isDone ? ' is-past' : '') +
      (openId === s.id ? ' is-on' : '');
    var time = '<b>' + hm(s.at) + '</b>' + (s.dur ? '<small>' + hm(s.at + s.dur) + '</small>' : '');
    var tags = [];
    if (s.goal) tags.push('目标');
    if (s.phases.length) tags.push('阶段 ' + s.phases.filter(function (p) { return p.done; }).length + '/' + s.phases.length);
    if (s.slots.length) tags.push('执行 ' + s.slots.length + ' 段');
    if (s.source) tags.push('来自课程');
    if (s.kind === 'event') tags.push('事件');

    return '<article class="' + cls + '" data-id="' + s.id + '" style="--i:' + i + ';--thread:var(--t-' + s.thread + ')">' +
      '<div class="stone-time">' + time + '</div>' +
      '<button class="stone-card" type="button" data-open="' + s.id + '">' +
      '<div class="stone-head">' +
      '<span class="stone-kind"><i></i>' + kindName(s.kind) + '</span>' +
      (s.obj ? '<span class="stone-obj">· ' + esc(s.obj) + '</span>' : '') +
      '</div>' +
      '<h3 class="stone-title">' + esc(s.title) + '</h3>' +
      (s.note ? '<p class="stone-note">' + esc(s.note) + '</p>' : '') +
      (tags.length ? '<div class="stone-tags">' + tags.map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>' : '') +
      '<span class="stone-check" role="checkbox" aria-checked="' + (isDone ? 'true' : 'false') + '"' +
      ' aria-label="完成 ' + esc(s.title) + '" data-check="' + s.id + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></span>' +
      '</button>' +
      '</article>';
  }

  function kindName(k) {
    return { task: '事项', plan: '计划', event: '事件', exam: '考试' }[k] || '事项';
  }

  /* ── 本周 ───────────────────────────────────────────── */
  function renderWeek() {
    var grid = L.weekGrid();
    var d = new Date();
    var idx = (d.getDay() + 6) % 7;
    var names = ['一', '二', '三', '四', '五', '六', '日'];
    var total = grid.reduce(function (n, a) { return n + a.length; }, 0);

    var html = head('本周', '七条水道并着流。今天那条泛着光。',
      '课次 <b>' + total + '</b> 次', L.semesters[0].weeks);
    html += '<div class="week">' + grid.map(function (day, i) {
      return '<div class="week-col' + (i === idx ? ' is-today' : '') + '">' +
        '<div class="week-day" style="--i:' + i + '">周' + names[i] + '<b>' + (i === idx ? '今' : '') + '</b></div>' +
        '<div class="week-body">' + day.map(function (c, j) {
          return '<button class="week-slot" type="button" data-course="' + c.id + '"' +
            ' style="--thread:var(--t-' + c.thread + ');--i:' + j + '">' +
            '<time>' + hm(c.at) + '–' + hm(c.end) + '</time>' +
            esc(c.title) + '</button>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';

    inner.innerHTML = html;
    $$('[data-course]', inner).forEach(function (b) {
      b.addEventListener('click', function () {
        var c = L.courses.filter(function (x) { return x.id === b.dataset.course; })[0];
        if (c) openDetail({
          kind: '课程', thread: c.thread, title: c.title,
          rows: [['教师', c.teacher], ['教室', c.room], ['周次', c.weeks],
            ['节次', '第 ' + c.p0 + '–' + c.p1 + ' 节']]
        }, b);
      });
    });
  }

  /* ── 事项 ───────────────────────────────────────────── */
  function renderItems() {
    var items = L.items.slice().sort(function (a, b) {
      return Number(!!(done[a.id] || a.done)) - Number(!!(done[b.id] || b.done));
    });
    var open = items.filter(function (i) { return !done[i.id] && !i.done; }).length;
    var html = head('事项', '待办、事件、考试与计划，按同一套语汇排。',
      '未完成 <b>' + open + '</b> 件', items.length);
    html += '<div class="rows">' + items.map(function (it, i) {
      var obj = L.objects.filter(function (o) { return o.id === it.objectId; })[0];
      var isDone = done[it.id] || it.done;
      var meta = describeAnchor(it.anchor);
      var tags = [];
      if (it.goal) tags.push('有目标');
      if (it.phases && it.phases.length) tags.push('阶段 ' + it.phases.filter(function (p) { return p.done; }).length + '/' + it.phases.length);
      if (it.slots && it.slots.length) tags.push('执行 ' + it.slots.length + ' 段');
      return '<button class="row" type="button" data-item="' + it.id + '" style="--i:' + i + '">' +
        '<span class="dot" style="--thread:var(--t-' + (obj ? obj.thread : 'slate') + ')"></span>' +
        '<span class="row-main">' +
        '<span class="row-title"' + (isDone ? ' style="text-decoration:line-through;color:var(--ink-3)"' : '') + '>' + esc(it.title) + '</span>' +
        '<p class="row-sub">' + meta + (obj ? ' · ' + esc(obj.name) : '') + (tags.length ? ' · ' + tags.join(' · ') : '') + '</p>' +
        '</span>' +
        '<span class="row-tag">' + kindName(it.kind) + '</span>' +
        '</button>';
    }).join('') + '</div>';

    inner.innerHTML = html;
    $$('[data-item]', inner).forEach(function (b) {
      b.addEventListener('click', function () {
        var it = L.items.filter(function (x) { return x.id === b.dataset.item; })[0];
        if (!it) return;
        var obj = L.objects.filter(function (o) { return o.id === it.objectId; })[0];
        var rows = [['时间', describeAnchor(it.anchor)]];
        if (obj) rows.push(['对象', obj.name]);
        if (it.goal) rows.push(['目标', it.goal]);
        if (it.completionCriteria) rows.push(['完成标准', it.completionCriteria]);
        openDetail({
          kind: kindName(it.kind), thread: obj ? obj.thread : 'slate',
          title: it.title, note: it.note, rows: rows, phases: it.phases,
          slots: it.slots, id: it.id
        }, b);
      });
    });
  }

  function describeAnchor(a) {
    if (!a) return '无期限';
    if (a.type === 'floating') return '无期限 · 按自己的节奏';
    if (a.type === 'deadline') return (a.date === 'today' ? '今天 ' : a.date + ' ') + (a.time || '') + ' 截止';
    if (a.type === 'absolute') return a.start.replace('today', '今天').replace('T', ' ') + ' 起';
    if (a.type === 'range') return a.start.replace('m-', '') + ' 至 ' + a.end;
    if (a.type === 'weekly') return '每周 ' + (a.weekdays || []).join('、') + ' · ' + (a.startTime || '');
    return '';
  }

  /* ── 笔记 ───────────────────────────────────────────── */
  function renderNotes() {
    var html = head('笔记', '见闻、感受、想法、摘录与复盘。留白比字多。', '共 <b>' + L.notes.length + '</b> 条', L.notes.length);
    html += L.notes.map(function (n, i) {
      var obj = L.objects.filter(function (o) { return o.id === n.objectId; })[0];
      return '<button class="note-row" type="button" data-note="' + n.id + '" style="--i:' + i + '">' +
        '<div class="note-meta">' +
        '<b>' + (n.date === 'today' ? '今天' : n.date) + '</b>' + n.time +
        '<div>' + n.kind + '</div>' +
        '<div>' + (obj ? esc(obj.name) : '') + '</div>' +
        '</div>' +
        '<div>' +
        '<div class="note-body">' + (n.title ? '<strong>' + esc(n.title) + '</strong><br>' : '') + esc(n.body) + '</div>' +
        (n.tags.length ? '<div class="note-tags">' + n.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
        '</div></button>';
    }).join('');
    inner.innerHTML = html;
  }

  /* ── 对象 ───────────────────────────────────────────── */
  function renderObjects() {
    var html = head('对象', '课程、项目与主题。每根线头牵着一串安排。', '共 <b>' + L.objects.length + '</b> 个', L.objects.length);
    html += '<div class="rows">' + L.objects.map(function (o, i) {
      var n = L.items.filter(function (it) { return it.objectId === o.id; }).length;
      var notes = L.notes.filter(function (x) { return x.objectId === o.id; }).length;
      return '<button class="row" type="button" data-obj="' + o.id + '" style="--i:' + i + '">' +
        '<span class="dot" style="--thread:var(--t-' + o.thread + ')"></span>' +
        '<span class="row-main">' +
        '<span class="row-title">' + esc(o.name) + '</span>' +
        '<p class="row-sub">' + (o.goal ? esc(o.goal) : '未写目的') + ' · ' + n + ' 件事 · ' + notes + ' 条笔记</p>' +
        '</span>' +
        '<span class="row-tag">' + esc(o.kind) + '</span>' +
        '</button>';
    }).join('') + '</div>';

    inner.innerHTML = html;
    $$('[data-obj]', inner).forEach(function (b) {
      b.addEventListener('click', function () {
        var o = L.objects.filter(function (x) { return x.id === b.dataset.obj; })[0];
        if (!o) return;
        var its = L.items.filter(function (it) { return it.objectId === o.id; });
        openDetail({
          kind: o.kind, thread: o.thread, title: o.name,
          note: o.goal ? '目的：' + o.goal : '',
          rows: [['事项', its.length + ' 件'], ['笔记', L.notes.filter(function (n) { return n.objectId === o.id; }).length + ' 条']],
          list: its.map(function (it) { return it.title; })
        }, b);
      });
    });
  }

  /* ── 详情 ───────────────────────────────────────────── */
  var detail = $('#detail');

  function openDetail(o, anchor) {
    var rows = (o.rows || []).map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('');
    var phases = (o.phases || []).length
      ? '<ul class="detail-phases">' + o.phases.map(function (p) {
        return '<li class="' + (p.done ? 'done' : '') + '"><i></i>' + esc(p.title) + '</li>';
      }).join('') + '</ul>' : '';
    var slots = (o.slots || []).length
      ? '<ul class="detail-phases">' + o.slots.map(function (s) {
        return '<li><i></i>' + esc(s.label || '执行') + ' · ' + s.start.replace('today', '今天').replace('T', ' ') + '</li>';
      }).join('') + '</ul>' : '';
    var list = (o.list || []).length
      ? '<ul class="detail-phases">' + o.list.map(function (t) { return '<li><i></i>' + esc(t) + '</li>'; }).join('') + '</ul>' : '';

    detail.innerHTML =
      '<button class="icon-btn detail-x" type="button" aria-label="收起" data-close>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="stone-kind" style="--thread:var(--t-' + (o.thread || 'slate') + ')"><i></i>' + esc(o.kind || '事项') + '</div>' +
      '<h3>' + esc(o.title) + '</h3>' +
      (o.note ? '<p>' + esc(o.note) + '</p>' : '') +
      (rows ? '<dl>' + rows + '</dl>' : '') +
      phases + slots + list +
      '<div class="detail-acts">' +
      (o.id ? '<button class="pill prime" type="button" data-act="done">完成</button>' +
        '<button class="pill" type="button" data-act="later">推后半小时</button>' : '') +
      '<button class="pill" type="button" data-close>收起</button>' +
      '</div>';

    detail.classList.add('is-on');
    detail.setAttribute('aria-hidden', 'false');
    detail.removeAttribute('inert');
    detail.dataset.id = o.id || '';

    if (anchor) {
      var r = anchor.getBoundingClientRect();
      var w = detail.offsetWidth, h = detail.offsetHeight;
      var left = r.right + 16;
      if (left + w > innerWidth - 20) left = Math.max(14, r.left - w - 16);
      var top = Math.min(Math.max(r.top - 8, 66), innerHeight - h - 90);
      detail.style.left = Math.round(left) + 'px';
      detail.style.top = Math.round(top) + 'px';
      anchor.classList.add('is-on');
    }
    var f = $('.pill', detail);
    if (f) f.focus();
  }

  function closeDetail() {
    var on = $('.stone.is-on', inner);
    if (on) on.classList.remove('is-on');
    detail.classList.remove('is-on');
    detail.setAttribute('aria-hidden', 'true');
    detail.setAttribute('inert', '');
    openId = null;
  }

  detail.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { closeDetail(); return; }
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var id = detail.dataset.id;
    if (act.dataset.act === 'done' && id) { toggleDone(id); closeDetail(); }
    if (act.dataset.act === 'later') {
      var s = L.todaySlips().filter(function (x) { return x.id === id; })[0];
      if (s) { s.at += 30; hint('推后到 ' + hm(s.at)); }
      closeDetail();
      renderNow();
    }
  });

  /* ── 完成 ───────────────────────────────────────────── */
  function toggleDone(id) {
    if (done[id]) { delete done[id]; hint('又浮起来了'); }
    else { done[id] = true; hint('圈掉了'); }
    var s = L.todaySlips().filter(function (x) { return x.id === id; })[0];
    if (s) s.done = !!done[id];
    if (view === 'now') renderNow(); else if (view === 'items') renderItems();
    paintBar();
  }

  function bindRows() {
    $$('[data-check]', inner).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleDone(b.dataset.check);
      });
    });
    $$('[data-open]', inner).forEach(function (b) {
      b.addEventListener('click', function () {
        var s = L.todaySlips().filter(function (x) { return x.id === b.dataset.open; })[0];
        if (!s) return;
        openId = s.id;
        $$('.stone', inner).forEach(function (el) { el.classList.toggle('is-on', el.dataset.id === s.id); });
        openDetail({
          id: s.id, kind: kindName(s.kind), thread: s.thread, title: s.title,
          note: s.note,
          rows: [['时间', hm(s.at) + (s.dur ? ' – ' + hm(s.at + s.dur) : '')],
            ['对象', s.obj || '独立'],
            ['目标', s.goal || '未写'],
            ['完成标准', s.criteria || '未写'],
            ['来源', s.source ? '课程 · 第 ' + s.source.courseId : '手动记录']],
          phases: s.phases, slots: s.slots
        }, b);
      });
    });
  }

  /* ── 视图切换：慢一点，软一点 ───────────────────────── */
  function setView(next) {
    if (!next || next === view) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { view = next; paint(); return; }
    // 水面先退下去，新的一层再浮起来
    water.style.transition = 'opacity 420ms cubic-bezier(.22,.61,.36,1), transform 620ms cubic-bezier(.16,1,.3,1)';
    water.style.opacity = '0';
    water.style.transform = 'translateY(-8px)';
    setTimeout(function () {
      view = next;
      paint();
      water.scrollTop = 0;
      water.style.transition = 'none';
      water.style.transform = 'translateY(10px)';
      requestAnimationFrame(function () {
        water.style.transition = 'opacity 620ms cubic-bezier(.22,.61,.36,1), transform 900ms cubic-bezier(.16,1,.3,1)';
        water.style.opacity = '1';
        water.style.transform = 'none';
      });
    }, 430);
  }

  function paint() {
    water.innerHTML = '<div class="water-inner" id="water-inner"></div>';
    inner = $('#water-inner');
    if (view === 'now') renderNow();
    else if (view === 'week') renderWeek();
    else if (view === 'items') renderItems();
    else if (view === 'notes') renderNotes();
    else if (view === 'objects') renderObjects();
    paintBar();
  }

  /* ── 命令 ───────────────────────────────────────────── */
  var cmdWrap = $('#cmd-wrap'), cmdInput = $('#cmd-input'), cmdList = $('#cmd-list'), cmdFoot = $('#cmd-foot');
  var cmdOn = false, rows = [], cursor = 0;

  function source() {
    var out = [
      { g: 'jump', label: '今天', sub: '水面', run: function () { setView('now'); } },
      { g: 'jump', label: '本周', sub: '七条水道', run: function () { setView('week'); } },
      { g: 'jump', label: '事项', sub: L.items.length + ' 件', run: function () { setView('items'); } },
      { g: 'jump', label: '笔记', sub: L.notes.length + ' 条', run: function () { setView('notes'); } },
      { g: 'jump', label: '对象', sub: L.objects.length + ' 个', run: function () { setView('objects'); } },
      { g: 'act', label: '说明', sub: '键位', run: function () { setHelp(true); } }
    ];
    L.todaySlips().forEach(function (s) {
      out.push({
        g: 'dot', thread: s.thread, label: s.title, sub: hm(s.at) + ' · ' + kindName(s.kind),
        run: function () { setView('now'); setTimeout(function () { var el = $('[data-open="' + s.id + '"]'); if (el) el.click(); }, 620); }
      });
    });
    L.objects.forEach(function (o) {
      out.push({ g: 'dot', thread: o.thread, label: o.name, sub: '对象 · ' + o.n, run: function () { setView('objects'); } });
    });
    return out;
  }

  function renderCmd(q) {
    q = (q || '').trim().toLowerCase();
    var all = source();
    rows = q ? all.filter(function (r) { return (r.label + ' ' + (r.sub || '')).toLowerCase().indexOf(q) >= 0; }) : all;
    cursor = 0;
    if (!rows.length) {
      cmdList.innerHTML = '<li class="cmd-empty">没有「' + esc(q) + '」。试试：' +
        '<div class="sugg">' + ['今天', '事项', '笔记', '中期报告'].map(function (s) {
          return '<button type="button" data-sugg="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('') + '</div></li>';
      cmdFoot.textContent = 'Esc 收起';
      return;
    }
    cmdList.innerHTML = rows.map(function (r, i) {
      var glyph = r.g === 'dot'
        ? '<span class="glyph" style="--thread:var(--t-' + r.thread + ')"><i></i></span>'
        : '<span class="glyph"><svg viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg></span>';
      return '<li><button class="cmd-row' + (i === 0 ? ' is-on' : '') + '" type="button" data-row="' + i + '">' +
        glyph + '<span class="label">' + esc(r.label) + '</span>' +
        (r.sub ? '<span class="sub">' + esc(r.sub) + '</span>' : '') +
        '</button></li>';
    }).join('');
    cmdFoot.innerHTML = '↑↓ 选 · ⏎ 去 · Esc 收起';
  }

  function moveCmd(step) {
    if (!rows.length) return;
    cursor = (cursor + step + rows.length) % rows.length;
    $$('.cmd-row', cmdList).forEach(function (el, i) { el.classList.toggle('is-on', i === cursor); });
    var on = $('.cmd-row.is-on', cmdList);
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function runCmd(i) {
    var r = rows[i];
    if (!r) return;
    setCmd(false);
    setTimeout(r.run, 80);
  }

  function setCmd(on, seed) {
    cmdOn = on;
    cmdWrap.classList.toggle('is-on', on);
    cmdWrap.setAttribute('aria-hidden', String(!on));
    if (on) { cmdWrap.removeAttribute('inert'); cmdInput.value = seed || ''; renderCmd(seed); setTimeout(function () { cmdInput.focus(); }, 60); }
    else { cmdWrap.setAttribute('inert', ''); cmdInput.blur(); }
  }

  cmdWrap.addEventListener('click', function (e) {
    if (e.target === cmdWrap) { setCmd(false); return; }
    var s = e.target.closest('[data-sugg]');
    if (s) { cmdInput.value = s.dataset.sugg; renderCmd(s.dataset.sugg); cmdInput.focus(); return; }
    var b = e.target.closest('[data-row]');
    if (b) runCmd(+b.dataset.row);
  });
  cmdInput.addEventListener('input', function () { renderCmd(cmdInput.value); });
  cmdList.addEventListener('pointermove', function (e) {
    var b = e.target.closest('[data-row]');
    if (!b) return;
    var i = +b.dataset.row;
    if (i !== cursor) { cursor = i; moveCmd(0); }
  });

  /* ── 说明 / 提示 ────────────────────────────────────── */
  var help = $('#help'), helpBtn = null;
  function setHelp(on) {
    help.classList.toggle('is-on', on);
    help.setAttribute('aria-hidden', String(!on));
    if (on) { help.removeAttribute('inert'); $('#help-close').focus(); } else help.setAttribute('inert', '');
  }
  $('#help-close').addEventListener('click', function () { setHelp(false); });

  var hintEl = $('#hint'), hintTimer = 0;
  function hint(text) {
    hintEl.textContent = text;
    hintEl.classList.add('is-on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hintEl.classList.remove('is-on'); }, 2600);
  }

  /* ── 顶部与底部 ─────────────────────────────────────── */
  $$('.bar-r > button').forEach(function (b) {
    b.addEventListener('click', function () { setView(b.dataset.view); });
  });
  $('#search-btn').addEventListener('click', function () { setCmd(true); });
  $('#more-btn').addEventListener('click', function () { setHelp(true); });

  $$('#scales button').forEach(function (b) {
    b.addEventListener('click', function () {
      scale = b.dataset.scale;
      $$('#scales button').forEach(function (x) { x.setAttribute('aria-current', String(x === b)); });
      setView(scale === 'day' ? 'now' : scale === 'week' ? 'week' : 'items');
      paintBar();
    });
  });

  /* ── 键盘 ───────────────────────────────────────────── */
  doc.addEventListener('keydown', function (e) {
    var inField = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (e.key === 'Escape') {
      if (cmdOn) { setCmd(false); return; }
      if (help.classList.contains('is-on')) { setHelp(false); return; }
      if (detail.classList.contains('is-on')) { closeDetail(); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd(!cmdOn); return; }
    if (cmdOn) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCmd(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveCmd(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); runCmd(cursor); return; }
      return;
    }
    if (inField) return;
    if (e.key === '?') { e.preventDefault(); setHelp(!help.classList.contains('is-on')); return; }
    if (e.key === '1') { setView('now'); return; }
    if (e.key === '2') { setView('week'); return; }
    if (e.key === '3') { setView('items'); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { setCmd(true, e.key); e.preventDefault(); }
  });

  /* ── 起手 ───────────────────────────────────────────── */
  paint();
  L.installDust({ count: 16, tint: 'rgba(47,107,140,' });

  requestAnimationFrame(function () {
    var soon = $('.stone', inner);
    if (soon) {
      var top = soon.getBoundingClientRect().top + water.scrollTop - 180;
      water.scrollTop = Math.max(0, top);
    }
  });

  setInterval(function () {
    var m = L.clockNow();
    if (m === nowMin) return;
    nowMin = m;
    if (view === 'now') renderNow();
    paintBar();
  }, 30000);
})();
