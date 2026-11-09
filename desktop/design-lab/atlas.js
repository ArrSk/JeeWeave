/* 舆图 · 交互
   三个图层：地块（对象）、路线（今天）、界标（事项）。
   同一份资料，三种看法。 */
(function () {
  'use strict';

  var L = window.Lab;
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var esc = L.esc, hm = L.hm, pad = L.pad;

  var layer = 'route';
  var done = {};
  var nowMin = L.clockNow();
  var onId = null;

  var map = $('#map'), inner = null;

  /* ── 图廓 ───────────────────────────────────────────── */
  function paintPlate() {
    var d = new Date();
    var t = new Date(d.getTime());
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var w1 = new Date(t.getFullYear(), 0, 4);
    var wk = 1 + Math.round(((t - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
    $('#plate-sub').textContent = '第 ' + wk + ' 周 · ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + L.weekdayName(d);
    $$('#legend [data-layer]').forEach(function (b) {
      b.setAttribute('aria-current', String(b.dataset.layer === layer));
    });
  }

  function cartouche(title, sub, stats) {
    return '<div class="cartouche">' +
      '<h1>' + title + '</h1>' +
      '<p>' + sub + '</p>' +
      '<div class="sub">' + stats + '</div>' +
      '</div>';
  }

  /* ── 路线：今天 ─────────────────────────────────────── */
  function renderRoute() {
    var slips = L.todaySlips();
    var open = slips.filter(function (s) { return !done[s.id] && !s.done; }).length;
    var next = slips.filter(function (s) { return !done[s.id] && !s.done && s.at >= nowMin; })[0];

    var html = cartouche(
      '今天的<em>路线</em>',
      next ? '此刻你在 ' + hm(nowMin) + '。下一处里程碑是「' + esc(next.title) + '」。'
        : '此刻你在 ' + hm(nowMin) + '。今天余下的路都走过了。',
      '<span>未走完 <b>' + open + '</b></span><span>全长 <b>' + slips.length + '</b> 处</span><span>当前 <b>' + hm(nowMin) + '</b></span>'
    );

    var past = slips.filter(function (s) { return s.at + (s.dur || 0) < nowMin; });
    var live = slips.filter(function (s) { return s.at + (s.dur || 0) >= nowMin && s.at <= nowMin + 240; });
    var later = slips.filter(function (s) { return s.at > nowMin + 240; });

    html += '<div class="route">';
    if (past.length) html += divider('已经走过', past.length) + past.map(legHTML).join('');
    if (live.length) html += divider('此刻前后', live.length) + live.map(legHTML).join('');
    if (later.length) html += divider('再往前', later.length) + later.map(legHTML).join('');
    html += '</div>';

    inner.innerHTML = html;
    bindLegs();
  }

  function divider(label, n) {
    return '<div class="divider"><span>' + label + '</span><b>' + n + '</b></div>';
  }

  function legHTML(s, i) {
    var isDone = done[s.id] || s.done;
    var meta = [];
    if (s.goal) meta.push('有目标');
    if (s.phases.length) meta.push('阶段 ' + s.phases.filter(function (p) { return p.done; }).length + '/' + s.phases.length);
    if (s.slots.length) meta.push('执行 ' + s.slots.length + ' 段');
    if (s.source) meta.push('课次布置');
    if (s.kind === 'event') meta.push('事件');

    return '<article class="leg' + (isDone ? ' is-done' : '') + (onId === s.id ? ' is-on' : '') +
      '" style="--i:' + i + ';--thread:var(--t-' + s.thread + ')">' +
      '<div class="leg-time"><b>' + hm(s.at) + '</b>' + (s.dur ? '– ' + hm(s.at + s.dur) : '') +
      (s.obj ? '<span>·</span>' + esc(s.obj) : '') + '</div>' +
      '<button type="button" data-open="' + s.id + '" style="text-align:left;width:100%">' +
      '<h3 class="leg-title">' + esc(s.title) + '</h3>' +
      (s.note ? '<p class="leg-note">' + esc(s.note) + '</p>' : '') +
      (meta.length ? '<div class="leg-meta">' + meta.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div>' : '') +
      '</button>' +
      '<button class="leg-mark" type="button" data-done="' + s.id + '" aria-label="完成 ' + esc(s.title) + '">' +
      '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>' +
      '</article>';
  }

  /* ── 地块：对象 ─────────────────────────────────────── */
  function renderTerrain() {
    var html = cartouche(
      '这块<em>疆域</em>',
      '每个对象是一块地。有目标的地长出斜纹，边上的数字是它牵着的安排。',
      '<span>共 <b>' + L.objects.length + '</b> 块</span><span>今天 <b>' + L.todaySlips().length + '</b> 处里程碑</span>'
    );
    html += '<div class="fields">' + L.objects.map(function (o, i) {
      var its = L.items.filter(function (it) { return it.objectId === o.id; });
      var notes = L.notes.filter(function (n) { return n.objectId === o.id; });
      return '<button class="field' + (o.goal ? ' is-goal' : '') + '" type="button" data-field="' + o.id + '"' +
        ' style="--i:' + i + ';--thread:var(--t-' + o.thread + ')">' +
        '<div class="field-head"><i></i><small>' + esc(o.kind) + '</small></div>' +
        '<b>' + esc(o.name) + '</b>' +
        '<p>' + (o.goal ? esc(o.goal) : '还没有写目的') + '</p>' +
        '<div class="field-foot"><span>事项 <b>' + its.length + '</b></span><span>笔记 <b>' + notes.length + '</b></span></div>' +
        '</button>';
    }).join('') + '</div>';

    // 地块下面接一条今天的路线摘要
    var slips = L.todaySlips().slice(0, 4);
    if (slips.length) {
      html += divider('从这些地里穿出来的路', slips.length);
      html += '<div class="route">' + slips.map(legHTML).join('') + '</div>';
    }

    inner.innerHTML = html;
    bindLegs();
    $$('[data-field]', inner).forEach(function (b) {
      b.addEventListener('click', function () { openField(b.dataset.field, b); });
      b.addEventListener('pointerenter', function () { annotate(b.dataset.field); });
      b.addEventListener('pointerleave', function () { annotate(null); });
    });
  }

  /* ── 界标：事项 ─────────────────────────────────────── */
  function renderMarks() {
    var items = L.items.slice().sort(function (a, b) {
      return Number(!!(done[a.id] || a.done)) - Number(!!(done[b.id] || b.done));
    });
    var open = items.filter(function (i) { return !done[i.id] && !i.done; }).length;
    var html = cartouche(
      '所有<em>界标</em>',
      '待办、事件、考试与计划。每一个都可以回到它所在的那块地。',
      '<span>共 <b>' + items.length + '</b> 处</span><span>未完成 <b>' + open + '</b></span><span>对象 <b>' + L.objects.length + '</b></span>'
    );
    html += '<div class="marks">' + items.map(function (it, i) {
      var obj = L.objects.filter(function (o) { return o.id === it.objectId; })[0];
      var isDone = done[it.id] || it.done;
      return '<button class="mark' + (isDone ? ' is-done' : '') + '" type="button" data-mark="' + it.id + '"' +
        ' style="--i:' + i + ';--thread:var(--t-' + (obj ? obj.thread : 'slate') + ')">' +
        '<div class="mark-top"><i></i><small>' + kindName(it.kind) + (obj ? ' · ' + esc(obj.name) : '') + '</small></div>' +
        '<b' + (isDone ? ' style="text-decoration:line-through;color:var(--ink-3)"' : '') + '>' + esc(it.title) + '</b>' +
        '<p>' + describe(it.anchor) + (it.goal ? ' · ' + esc(it.goal) : '') + '</p>' +
        '</button>';
    }).join('') + '</div>';

    inner.innerHTML = html;
    $$('[data-mark]', inner).forEach(function (b) {
      b.addEventListener('click', function () { openMark(b.dataset.mark, b); });
    });
  }

  function kindName(k) {
    return { task: '事项', plan: '计划', event: '事件', exam: '考试' }[k] || '事项';
  }
  function describe(a) {
    if (!a) return '无期限';
    if (a.type === 'floating') return '无期限';
    if (a.type === 'deadline') return (a.date === 'today' ? '今天 ' : a.date + ' ') + (a.time || '') + ' 截止';
    if (a.type === 'absolute') return a.start.replace('today', '今天').replace('T', ' ') + ' 起';
    if (a.type === 'range') return a.start + ' 至 ' + a.end;
    if (a.type === 'weekly') return '每周 ' + (a.weekdays || []).join('、');
    return '';
  }

  function bindLegs() {
    $$('[data-open]', inner).forEach(function (b) {
      b.addEventListener('click', function () {
        var s = L.todaySlips().filter(function (x) { return x.id === b.dataset.open; })[0];
        if (!s) return;
        onId = s.id;
        $$('.leg', inner).forEach(function (el) { el.classList.toggle('is-on', el.dataset.id === s.id); });
        openLeg(s, b);
      });
      b.addEventListener('pointerenter', function () {
        var s = L.todaySlips().filter(function (x) { return x.id === b.dataset.open; })[0];
        if (s) annotate({ kind: kindName(s.kind), name: s.title, at: hm(s.at) });
      });
      b.addEventListener('pointerleave', function () { annotate(null); });
    });
    $$('[data-done]', inner).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleDone(b.dataset.done);
      });
    });
  }

  /* ── 右缘注释（不再是图标上的小框） ───────────────────── */
  var annotEl = $('#annot');

  function annotate(src) {
    if (!src) { annotEl.innerHTML = ''; return; }
    if (typeof src === 'string') {
      var o = L.objects.filter(function (x) { return x.id === src; })[0];
      if (!o) return;
      annotEl.innerHTML = '<b>' + esc(o.name) + '</b><br>' + esc(o.kind) + ' · ' +
        L.items.filter(function (i) { return i.objectId === o.id; }).length + ' 件事';
      return;
    }
    annotEl.innerHTML = '<b>' + esc(src.name) + '</b><br>' + esc(src.kind) + ' · ' + esc(src.at);
  }

  /* ── 地志 ───────────────────────────────────────────── */
  var gz = $('#gazetteer');

  function openLeg(s, anchor) {
    var rows = [
      ['时间', hm(s.at) + (s.dur ? ' – ' + hm(s.at + s.dur) : '')],
      ['对象', s.obj || '独立'],
      ['目标', s.goal || '未写'],
      ['完成标准', s.criteria || '未写'],
      ['来源', s.source ? '课次 · ' + s.source.courseId : '手动记录']
    ];
    var phases = (s.phases || []).length
      ? '<ul class="gz-list">' + s.phases.map(function (p) {
        return '<li class="' + (p.done ? 'done' : '') + '"><i></i>' + esc(p.title) + '</li>';
      }).join('') + '</ul>' : '';
    var slots = (s.slots || []).length
      ? '<ul class="gz-list">' + s.slots.map(function (x) {
        return '<li><i></i>' + esc(x.label || '执行') + ' · ' + x.start.replace('today', '今天').replace('T', ' ') + '</li>';
      }).join('') + '</ul>' : '';
    show({
      thread: s.thread, kind: kindName(s.kind), title: s.title, note: s.note,
      rows: rows, extra: phases + slots,
      acts: (s.id ? '<button class="stamp prime" type="button" data-act="done" data-id="' + s.id + '">插上界标</button>' +
        '<button class="stamp" type="button" data-act="later" data-id="' + s.id + '">推后半小时</button>' : '') +
        '<button class="stamp" type="button" data-close>收起</button>'
    }, anchor);
  }

  function openField(id, anchor) {
    var o = L.objects.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    var its = L.items.filter(function (it) { return it.objectId === id; });
    var notes = L.notes.filter(function (n) { return n.objectId === id; });
    show({
      thread: o.thread, kind: o.kind, title: o.name,
      note: o.goal ? '目的：' + o.goal : '还没有写目的。',
      rows: [['事项', its.length + ' 件'], ['笔记', notes.length + ' 条'], ['今天', L.todaySlips().filter(function (s) { return s.obj === o.name; }).length + ' 处']],
      extra: its.length ? '<ul class="gz-list">' + its.slice(0, 5).map(function (it) {
        return '<li class="' + (it.done ? 'done' : '') + '"><i></i>' + esc(it.title) + '</li>';
      }).join('') + '</ul>' : '',
      acts: '<button class="stamp" type="button" data-close>收起</button>'
    }, anchor);
  }

  function openMark(id, anchor) {
    var it = L.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    var obj = L.objects.filter(function (o) { return o.id === it.objectId; })[0];
    var rows = [['时间', describe(it.anchor)]];
    if (obj) rows.push(['对象', obj.name]);
    if (it.goal) rows.push(['目标', it.goal]);
    if (it.completionCriteria) rows.push(['标准', it.completionCriteria]);
    show({
      thread: obj ? obj.thread : 'slate', kind: kindName(it.kind), title: it.title, note: it.note,
      rows: rows,
      extra: (it.phases || []).length ? '<ul class="gz-list">' + it.phases.map(function (p) {
        return '<li class="' + (p.done ? 'done' : '') + '"><i></i>' + esc(p.title) + '</li>';
      }).join('') + '</ul>' : '',
      acts: '<button class="stamp prime" type="button" data-act="mark-done" data-id="' + it.id + '">完成</button>' +
        '<button class="stamp" type="button" data-close>收起</button>'
    }, anchor);
  }

  function show(o, anchor) {
    var rows = (o.rows || []).map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('');
    gz.innerHTML =
      '<button class="plate-btn gz-x" type="button" aria-label="收起" data-close>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="gz-kind" style="--thread:var(--t-' + (o.thread || 'slate') + ')"><i></i>' + esc(o.kind) + '</div>' +
      '<h3>' + esc(o.title) + '</h3>' +
      (o.note ? '<p>' + esc(o.note) + '</p>' : '') +
      (rows ? '<dl>' + rows + '</dl>' : '') +
      (o.extra || '') +
      '<div class="gz-acts">' + (o.acts || '<button class="stamp" type="button" data-close>收起</button>') + '</div>';

    gz.classList.add('is-on');
    gz.setAttribute('aria-hidden', 'false');
    gz.removeAttribute('inert');
    if (anchor) {
      var r = anchor.getBoundingClientRect();
      var w = gz.offsetWidth, h = gz.offsetHeight;
      var left = r.right + 16;
      if (left + w > innerWidth - 16) left = Math.max(12, r.left - w - 16);
      var top = Math.min(Math.max(r.top - 6, 68), innerHeight - h - 20);
      gz.style.left = Math.round(left) + 'px';
      gz.style.top = Math.round(top) + 'px';
    }
    var f = $('.stamp', gz);
    if (f) f.focus();
  }

  function hide() {
    $$('.leg.is-on,.field.is-on', inner).forEach(function (el) { el.classList.remove('is-on'); });
    gz.classList.remove('is-on');
    gz.setAttribute('aria-hidden', 'true');
    gz.setAttribute('inert', '');
    onId = null;
  }

  gz.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { hide(); return; }
    var a = e.target.closest('[data-act]');
    if (!a) return;
    var id = a.dataset.id;
    if (a.dataset.act === 'done' || a.dataset.act === 'mark-done') { toggleDone(id); hide(); }
    if (a.dataset.act === 'later') {
      var s = L.todaySlips().filter(function (x) { return x.id === id; })[0];
      if (s) { s.at += 30; toast('推后到 ' + hm(s.at)); }
      hide();
      render();
    }
  });

  function toggleDone(id) {
    if (done[id]) delete done[id]; else done[id] = true;
    var it = L.items.filter(function (x) { return x.id === id; })[0];
    if (it) it.done = !!done[id];
    var s = L.todaySlips().filter(function (x) { return x.id === id; })[0];
    if (s) s.done = !!done[id];
    toast(done[id] ? '界标插上了' : '界标又拔起来了');
    render();
  }

  /* ── 图层切换：慢一点 ───────────────────────────────── */
  function setLayer(next) {
    if (!next || next === layer) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { layer = next; render(); return; }
    map.style.transition = 'opacity 420ms cubic-bezier(.33,.8,.36,1)';
    map.style.opacity = '0';
    setTimeout(function () {
      layer = next;
      render();
      map.scrollTop = 0;
      requestAnimationFrame(function () {
        map.style.transition = 'opacity 680ms cubic-bezier(.33,.8,.36,1)';
        map.style.opacity = '1';
      });
    }, 440);
  }

  function render() {
    map.innerHTML = '<div class="grid" aria-hidden="true"></div><div class="map-inner" id="map-inner"></div>';
    inner = $('#map-inner');
    if (layer === 'terrain') renderTerrain();
    else if (layer === 'marks') renderMarks();
    else renderRoute();
    paintPlate();
  }

  /* ── 命令 ───────────────────────────────────────────── */
  var cw = $('#cmd-wrap'), ci = $('#cmd-input'), cl = $('#cmd-list'), cf = $('#cmd-foot');
  var cmdOn = false, rows = [], cur = 0;

  function source() {
    var out = [
      { g: 'jump', label: '地块', sub: '对象', run: function () { setLayer('terrain'); } },
      { g: 'jump', label: '路线', sub: '今天', run: function () { setLayer('route'); } },
      { g: 'jump', label: '界标', sub: '事项', run: function () { setLayer('marks'); } },
      { g: 'act', label: '说明', sub: '键位', run: function () { setHelp(true); } }
    ];
    L.objects.forEach(function (o) {
      out.push({ g: 'dot', thread: o.thread, label: o.name, sub: '对象 · ' + o.kind, run: function () { setLayer('terrain'); } });
    });
    L.todaySlips().forEach(function (s) {
      out.push({
        g: 'dot', thread: s.thread, label: s.title, sub: hm(s.at) + ' · ' + kindName(s.kind),
        run: function () { setLayer('route'); }
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
      cl.innerHTML = '<li class="cmd-empty">没有「' + esc(q) + '」。<div class="sugg">' +
        ['地块', '路线', '界标', '中期报告'].map(function (s) {
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
    cf.innerHTML = '↑↓ 选 · ⏎ 去 · Esc 收起';
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

  /* ── 说明 / 提示 ────────────────────────────────────── */
  var help = $('#help');
  function setHelp(on) {
    help.classList.toggle('is-on', on);
    help.setAttribute('aria-hidden', String(!on));
    if (on) { help.removeAttribute('inert'); $('#help-close').focus(); } else help.setAttribute('inert', '');
  }
  $('#help-close').addEventListener('click', function () { setHelp(false); });
  $('#help-btn').addEventListener('click', function () { setHelp(!help.classList.contains('is-on')); });
  $('#scale-btn').addEventListener('click', function () { toast('比例：一格约两小时'); });

  var toastEl = $('#toast'), toastT = 0;
  function toast(t) {
    toastEl.textContent = t;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2600);
  }

  /* ── 绑定 ───────────────────────────────────────────── */
  $$('#legend [data-layer]').forEach(function (b) {
    b.addEventListener('click', function () { setLayer(b.dataset.layer); });
  });

  doc.addEventListener('keydown', function (e) {
    var inField = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (e.key === 'Escape') {
      if (cmdOn) { setCmd(false); return; }
      if (help.classList.contains('is-on')) { setHelp(false); return; }
      if (gz.classList.contains('is-on')) { hide(); return; }
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
    if (e.key === '?') { e.preventDefault(); setHelp(!help.classList.contains('is-on')); return; }
    if (e.key === '1') { setLayer('terrain'); return; }
    if (e.key === '2') { setLayer('route'); return; }
    if (e.key === '3') { setLayer('marks'); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { setCmd(true, e.key); e.preventDefault(); }
  });

  /* ── 左缘刻度 ───────────────────────────────────────── */
  var ticks = '';
  for (var i = 0; i < 12; i++) ticks += '<i></i>';
  $('#gauge-ticks').innerHTML = ticks;

  /* ── 起手 ───────────────────────────────────────────── */
  render();
  L.installDust({ count: 14, tint: 'rgba(138,111,78,' });

  setInterval(function () {
    var m = L.clockNow();
    if (m === nowMin) return;
    nowMin = m;
    if (layer === 'route') render();
  }, 30000);
})();
