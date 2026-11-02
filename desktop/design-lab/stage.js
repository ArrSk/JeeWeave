/* 夜场 · 交互
   台上只站一件事，其余在两侧候场。换幕慢、缓、带一点黑。 */
(function () {
  'use strict';

  var L = window.Lab;
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var esc = L.esc, hm = L.hm, pad = L.pad;

  var mode = 'today';        // today | items | notes | objects
  var currentId = null;      // 台上那件事
  var done = {};
  var nowMin = L.clockNow();
  var cursor = 0;

  var stage = $('#stage'), wingList = $('#wing-list');

  /* ── 包厢栏 ─────────────────────────────────────────── */
  function paintCircle() {
    var d = new Date();
    var t = new Date(d.getTime());
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var w1 = new Date(t.getFullYear(), 0, 4);
    var wk = 1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
    $('#act-no').textContent = '第 ' + wk + ' 场';
    $('#act-date').textContent = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + L.weekdayName(d);
  }

  /* ── 台上 ───────────────────────────────────────────── */
  function paintStage() {
    var list = wingSource();
    var item = list.filter(function (x) { return x.id === currentId; })[0] || list[0] || null;
    if (item) currentId = item.id;

    if (!item) {
      stage.innerHTML =
        '<div class="stage-empty">' +
        '<h1>台上空着</h1>' +
        '<p>' + (mode === 'notes' ? '还没有笔记。' : mode === 'objects' ? '还没有对象。' : '今天没有安排。') +
        '从右侧挑一件，或者直接打字新建。</p>' +
        '</div>' +
        '<div class="stage-foot"><i></i><span>' + clockLine() + '</span></div>';
      return;
    }

    var isDone = done[item.id] || item.done;
    var obj = item.obj || '';
    var meta = [];
    if (item.at != null) meta.push(['时间', hm(item.at) + (item.dur ? ' – ' + hm(item.at + item.dur) : '')]);
    if (obj) meta.push(['对象', obj]);
    if (item.goal) meta.push(['目标', item.goal]);
    if (item.criteria) meta.push(['完成标准', item.criteria]);
    if (item.where) meta.push(['地点', item.where]);
    if (item.source) meta.push(['来处', '课次 · ' + item.source.courseId]);

    var phases = (item.phases || []).length
      ? '<ul class="scene-phases">' + item.phases.map(function (p) {
        return '<li class="' + (p.done ? 'done' : '') + '"><i></i>' + esc(p.title) + '</li>';
      }).join('') + '</ul>' : '';

    var slots = (item.slots || []).length
      ? '<ul class="scene-phases">' + item.slots.map(function (s) {
        return '<li><i></i>' + esc(s.label || '执行') + ' · ' + s.start.replace('today', '今天').replace('T', ' ') + '</li>';
      }).join('') + '</ul>' : '';

    var body = item.body
      ? '<p class="scene-note">' + esc(item.body) + '</p>' : '';

    stage.innerHTML =
      '<div class="scene-in">' +
      '<div class="scene-kicker" style="--thread:var(--t-' + (item.thread || 'slate') + ')">' +
      '<i></i><b>' + esc(item.kindName || '事项') + '</b>' +
      (item.at != null ? '<span>·</span>' + hm(item.at) : '') +
      '</div>' +
      '<div class="scene' + (isDone ? ' is-done' : '') + '">' +
      '<h1>' + esc(item.title) + '</h1>' +
      (item.note ? '<p class="scene-note">' + esc(item.note) + '</p>' : '') +
      body +
      (meta.length ? '<dl class="scene-meta">' + meta.map(function (m) {
        return '<div><dt>' + esc(m[0]) + '</dt><dd>' + esc(m[1]) + '</dd></div>';
      }).join('') + '</dl>' : '') +
      phases + slots +
      (item.at != null || item.id ?
        '<div class="scene-acts">' +
        (item.at != null ? '<button class="act prime" type="button" data-act="done">' + (isDone ? '重新开场' : '收工') + '</button>' : '') +
        (item.at != null ? '<button class="act" type="button" data-act="later">推后半小时</button>' : '') +
        '<button class="act" type="button" data-act="note">记一笔</button>' +
        '<button class="act" type="button" data-act="object">看对象</button>' +
        '</div>' : '') +
      '</div></div>' +
      '<div class="stage-foot"><i></i><span>' + clockLine() + '</span></div>';

    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      var el = $('.scene-in', stage);
      if (el) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    }
  }

  function clockLine() {
    var slips = L.todaySlips();
    var open = slips.filter(function (s) { return !done[s.id] && !s.done; }).length;
    return hm(nowMin) + '　·　未走完 ' + open + ' 件　·　共 ' + slips.length + ' 场';
  }

  /* ── 候场 ───────────────────────────────────────────── */
  function wingSource() {
    if (mode === 'notes') {
      return L.notes.map(function (n) {
        var obj = L.objects.filter(function (o) { return o.id === n.objectId; })[0];
        return {
          id: n.id, title: n.title || n.body.slice(0, 24), kindName: n.kind,
          thread: obj ? obj.thread : 'slate', obj: obj ? obj.name : '',
          at: null, body: n.body, note: '', tags: n.tags, where: '', goal: '', criteria: '',
          phases: [], slots: [], isNote: true
        };
      });
    }
    if (mode === 'objects') {
      return L.objects.map(function (o) {
        var its = L.items.filter(function (it) { return it.objectId === o.id; });
        return {
          id: o.id, title: o.name, kindName: o.kind, thread: o.thread, obj: '',
          at: null, goal: o.goal, criteria: '', where: '',
          note: its.length ? its.map(function (i) { return i.title; }).join('　·　') : '还没有关联的事',
          phases: [], slots: []
        };
      });
    }
    if (mode === 'items') {
      return L.items.map(function (it) {
        var obj = L.objects.filter(function (o) { return o.id === it.objectId; })[0];
        return {
          id: it.id, title: it.title, kindName: kindName(it.kind),
          thread: obj ? obj.thread : 'slate', obj: obj ? obj.name : '',
          at: null, note: it.note, goal: it.goal, criteria: it.completionCriteria,
          phases: it.phases || [], slots: it.slots || [], done: it.done,
          source: it.source, where: '', when: describe(it.anchor)
        };
      });
    }
    // today
    return L.todaySlips().map(function (s) {
      return {
        id: s.id, title: s.title, kindName: kindName(s.kind), thread: s.thread,
        obj: s.obj, at: s.at, dur: s.dur, note: s.note, goal: s.goal, criteria: s.criteria,
        phases: s.phases, slots: s.slots, done: s.done, source: s.source, where: '', criteriaLabel: ''
      };
    });
  }

  function kindName(k) {
    return { task: '事项', plan: '计划', event: '事件', exam: '考试' }[k] || '事项';
  }
  function describe(a) {
    if (!a) return '';
    if (a.type === 'floating') return '无期限';
    if (a.type === 'deadline') return '截止 ' + a.date + ' ' + (a.time || '');
    if (a.type === 'absolute') return a.start.replace('T', ' ');
    if (a.type === 'range') return a.start + ' 至 ' + a.end;
    if (a.type === 'weekly') return '每周 ' + (a.weekdays || []).join('、');
    return '';
  }

  function paintWings() {
    var list = wingSource();
    $('#wings-count').textContent = list.length;
    wingList.innerHTML = list.map(function (it, i) {
      var isDone = done[it.id] || it.done;
      var isOn = it.id === currentId;
      return '<button class="wing' + (isOn ? ' is-on' : '') + (isDone ? ' is-done' : '') + '"' +
        ' type="button" data-wing="' + it.id + '" style="--i:' + i + ';--thread:var(--t-' + (it.thread || 'slate') + ')">' +
        '<span class="wing-t"><i></i>' + esc(it.kindName) +
        (it.at != null ? ' · ' + hm(it.at) : '') + '</span>' +
        '<b>' + esc(it.title) + '</b>' +
        '</button>';
    }).join('') || '<p style="padding:12px; font-size:12px; color:var(--ink-3)">这边空着。</p>';

    $$('[data-wing]', wingList).forEach(function (b) {
      b.addEventListener('click', function () { cueTo(b.dataset.wing); });
    });
    $$('.wing-scale button').forEach(function (b) {
      b.setAttribute('aria-current', String(
        (b.dataset.act === 'items' && mode === 'items') ||
        (b.dataset.act === 'notes' && mode === 'notes') ||
        (b.dataset.act === 'objects' && mode === 'objects')
      ));
    });
  }

  /* ── 换幕：拉一次黑 ─────────────────────────────────── */
  var curtain = $('#curtain');

  function cueTo(id) {
    if (id === currentId) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    currentId = id;
    if (reduce) { paintStage(); paintWings(); return; }
    curtain.classList.add('is-on');
    setTimeout(function () {
      paintStage();
      paintWings();
      requestAnimationFrame(function () {
        curtain.classList.remove('is-on');
      });
    }, 340);
  }

  function setMode(next) {
    if (!next || next === mode) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    mode = next;
    currentId = null;
    if (reduce) { paintStage(); paintWings(); return; }
    curtain.classList.add('is-on');
    setTimeout(function () {
      paintStage();
      paintWings();
      requestAnimationFrame(function () { curtain.classList.remove('is-on'); });
    }, 340);
  }

  /* ── 收工 ───────────────────────────────────────────── */
  function toggleDone() {
    if (!currentId) return;
    if (done[currentId]) delete done[currentId]; else done[currentId] = true;
    var it = L.items.filter(function (x) { return x.id === currentId; })[0];
    if (it) it.done = !!done[currentId];
    var s = L.todaySlips().filter(function (x) { return x.id === currentId; })[0];
    if (s) s.done = !!done[currentId];
    cue(done[currentId] ? '这一场收了' : '重新开场');
    paintStage();
    paintWings();
  }

  /* ── 幕线 ───────────────────────────────────────────── */
  function paintPit() {
    var start = 6 * 60, end = 24 * 60;
    var ratio = Math.max(0, Math.min(1, (nowMin - start) / (end - start)));
    var dot = $('#pit-now');
    if (dot) dot.style.left = (ratio * 100) + '%';
    var times = $('#pit-times');
    if (!times.dataset.done) {
      var out = '';
      for (var h = 6; h <= 24; h += 3) {
        var r = (h * 60 - start) / (end - start);
        out += '<span style="left:' + (r * 100) + '%">' + pad(h) + ':00</span>';
      }
      times.innerHTML = out;
      times.dataset.done = '1';
    }
  }

  /* ── 命令 ───────────────────────────────────────────── */
  var cw = $('#cmd-wrap'), ci = $('#cmd-input'), cl = $('#cmd-list'), cf = $('#cmd-foot');
  var cmdOn = false, rows = [], cur = 0;

  function source() {
    var out = [
      { g: 'jump', label: '今天', sub: '台上的日程', run: function () { setMode('today'); } },
      { g: 'jump', label: '全部事项', sub: L.items.length + ' 件', run: function () { setMode('items'); } },
      { g: 'jump', label: '笔记', sub: L.notes.length + ' 条', run: function () { setMode('notes'); } },
      { g: 'jump', label: '对象', sub: L.objects.length + ' 个', run: function () { setMode('objects'); } },
      { g: 'act', label: '节目单', sub: '键位', run: function () { setBill(true); } }
    ];
    wingSource().forEach(function (it) {
      out.push({
        g: 'dot', thread: it.thread, label: it.title, sub: it.kindName + (it.at != null ? ' · ' + hm(it.at) : ''),
        run: function () { cueTo(it.id); }
      });
    });
    return out;
  }

  function renderCmd(q) {
    q = (q || '').trim().toLowerCase();
    var all = source();
    rows = q ? all.filter(function (r) { return (r.label + ' ' + (r.sub || '')).toLowerCase().indexOf(q) >= 0; }) : all;
    cur = 0;
    if (!rows.length) {
      cl.innerHTML = '<li class="cmd-empty">台上没有「' + esc(q) + '」。<div class="sugg">' +
        ['今天', '笔记', '对象', '中期报告'].map(function (s) {
          return '<button type="button" data-sugg="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('') + '</div></li>';
      cf.textContent = 'Esc 收起';
      return;
    }
    cl.innerHTML = rows.map(function (r, i) {
      var g = r.g === 'dot'
        ? '<span class="glyph" style="--thread:var(--t-' + r.thread + ')"><i></i></span>'
        : '<span class="glyph"><svg viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg></span>';
      return '<li><button class="cmd-row' + (i === 0 ? ' is-on' : '') + '" type="button" data-row="' + i + '">' +
        g + '<span class="label">' + esc(r.label) + '</span>' +
        (r.sub ? '<span class="sub">' + esc(r.sub) + '</span>' : '') + '</button></li>';
    }).join('');
    cf.innerHTML = '↑↓ 选 · ⏎ 上台 · Esc 收起';
  }

  function move(step) {
    if (!rows.length) return;
    cur = (cur + step + rows.length) % rows.length;
    $$('.cmd-row', cl).forEach(function (el, i) { el.classList.toggle('is-on', i === cur); });
    var on = $('.cmd-row.is-on', cl);
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function run(i) {
    var r = rows[i];
    if (!r) return;
    setCmd(false);
    setTimeout(r.run, 70);
  }

  function setCmd(on, seed) {
    cmdOn = on;
    cw.classList.toggle('is-on', on);
    cw.setAttribute('aria-hidden', String(!on));
    if (on) { cw.removeAttribute('inert'); ci.value = seed || ''; renderCmd(seed); setTimeout(function () { ci.focus(); }, 60); }
    else { cw.setAttribute('inert', ''); ci.blur(); }
  }

  cw.addEventListener('click', function (e) {
    if (e.target === cw) { setCmd(false); return; }
    var s = e.target.closest('[data-sugg]');
    if (s) { ci.value = s.dataset.sugg; renderCmd(s.dataset.sugg); ci.focus(); return; }
    var b = e.target.closest('[data-row]');
    if (b) run(+b.dataset.row);
  });
  ci.addEventListener('input', function () { renderCmd(ci.value); });
  cl.addEventListener('pointermove', function (e) {
    var b = e.target.closest('[data-row]');
    if (!b) return;
    var i = +b.dataset.row;
    if (i !== cur) { cur = i; move(0); }
  });

  /* ── 节目单 / 提示 ─────────────────────────────────── */
  var bill = $('#bill');
  function setBill(on) {
    bill.classList.toggle('is-on', on);
    bill.setAttribute('aria-hidden', String(!on));
    if (on) { bill.removeAttribute('inert'); $('#bill-close').focus(); } else bill.setAttribute('inert', '');
  }
  $('#bill-close').addEventListener('click', function () { setBill(false); });
  $('#help-btn').addEventListener('click', function () { setBill(!bill.classList.contains('is-on')); });

  var cueEl = $('#cue'), cueT = 0;
  function cue(text) {
    cueEl.textContent = text;
    cueEl.classList.add('is-on');
    clearTimeout(cueT);
    cueT = setTimeout(function () { cueEl.classList.remove('is-on'); }, 2400);
  }

  /* ── 台上动作 ───────────────────────────────────────── */
  stage.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var what = b.dataset.act;
    if (what === 'done') toggleDone();
    if (what === 'later') {
      var s = L.todaySlips().filter(function (x) { return x.id === currentId; })[0];
      if (s) { s.at += 30; cue('推后到 ' + hm(s.at)); paintStage(); }
    }
    if (what === 'note') { setMode('notes'); cue('翻到笔记'); }
    if (what === 'object') {
      var it = wingSource().filter(function (x) { return x.id === currentId; })[0];
      var obj = it && L.objects.filter(function (o) { return o.name === it.obj; })[0];
      if (obj) { currentId = obj.id; setMode('objects'); }
      else cue('这件事还没有归属对象');
    }
  });

  $$('.wing-scale button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.act); });
  });
  $('#search-btn').addEventListener('click', function () { setCmd(true); });
  $('#mood-btn').addEventListener('click', function () {
    // 换一点光：只是把顶光偏冷或偏暖，不改任何数据
    var root = doc.documentElement;
    var warm = root.dataset.light === 'warm';
    root.dataset.light = warm ? 'cool' : 'warm';
    root.style.setProperty('--accent', warm ? '#b8956a' : '#a89bc4');
    cue(warm ? '暖光' : '冷光');
  });

  /* ── 键盘 ───────────────────────────────────────────── */
  doc.addEventListener('keydown', function (e) {
    var inField = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (e.key === 'Escape') {
      if (cmdOn) { setCmd(false); return; }
      if (bill.classList.contains('is-on')) { setBill(false); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd(!cmdOn); return; }
    if (cmdOn) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); run(cur); return; }
      return;
    }
    if (inField) return;
    if (e.key === '?') { e.preventDefault(); setBill(!bill.classList.contains('is-on')); return; }
    if (e.key === '1') { setMode('today'); return; }
    if (e.key === '2') { setMode('items'); return; }
    if (e.key === '3') { setMode('notes'); return; }
    if (e.key === ' ') {
      var onStage = currentId && wingSource().some(function (x) { return x.id === currentId; });
      if (onStage) { e.preventDefault(); toggleDone(); }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var list = wingSource();
      if (!list.length) return;
      e.preventDefault();
      var i = list.findIndex(function (x) { return x.id === currentId; });
      if (i < 0) i = 0;
      i = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      cueTo(list[i].id);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { setCmd(true, e.key); e.preventDefault(); }
  });

  /* ── 起手 ───────────────────────────────────────────── */
  paintCircle();
  var first = L.todaySlips().filter(function (s) { return !s.done && s.at >= nowMin; })[0]
    || L.todaySlips()[0];
  currentId = first ? first.id : null;
  paintStage();
  paintWings();
  paintPit();
  L.installDust({ count: 12, tint: 'rgba(184,149,106,' });

  // 幕线：只画一次刻度，动的是那小点
  setInterval(function () {
    var m = L.clockNow();
    if (m === nowMin) return;
    nowMin = m;
    paintPit();
    var foot = $('.stage-foot span');
    if (foot) foot.textContent = clockLine();
  }, 30000);
})();
