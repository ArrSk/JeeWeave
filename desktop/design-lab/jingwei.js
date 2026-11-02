/* 经纬 · 交互实现
   一条经线：时间是它，对象也是它。三层尺度共用同一条线。
   所有示例资料只在内存里，不写存储、不连工作区。 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 时间 ───────────────────────────────────────────── */
  var MIN = 60, DAYSTART;
  var nowMin = 0;

  function clockNow() {
    var d = new Date();
    return d.getHours() * MIN + d.getMinutes();
  }
  function hm(m) {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    var h = Math.floor(m / MIN), mm = m % MIN;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 资料 ───────────────────────────────────────────── */
  var slips = [
    { id: 'a1', at: 8 * MIN, dur: 100, kind: '课程', thread: 'indigo', title: '高等数学 · 极限与连续', note: '今天讲第三章，ε–N 定义。带习题册，上周有 3 道没证完。', where: '三教 302', obj: '高等数学' },
    { id: 'a2', at: 9 * MIN + 50, dur: 0, kind: '事项', thread: 'moss', title: '交数据结构实验二', note: '只差报告最后一段图注。交之前再跑一次样例。', where: '课程平台', obj: '数据结构' },
    { id: 'a3', at: 12 * MIN + 10, dur: 0, kind: '事项', thread: 'clay', title: '午饭 · 和沈岳', note: '他说想聊实习的事，带上上个月那份时间表。', where: '二食堂', obj: '与沈岳' },
    { id: 'a4', at: 14 * MIN, dur: 15, kind: '事项', thread: 'madder', title: '给导师回信', note: '三点前必须发出：确认中期检查的时间，附上这版提纲。', where: '邮箱', obj: '导师' },
    { id: 'a5', at: 15 * MIN + 30, dur: 60, kind: '事项', thread: 'wisteria', title: '组会 · 中期进度', note: '讲 6 分钟。把“还没做”的部分说清楚，比藏起来好。', where: '线上', obj: '中期报告' },
    { id: 'a6', at: 17 * MIN, dur: 40, kind: '事项', thread: 'celadon', title: '跑 5 公里', note: '慢一点，昨天腿还紧。', where: '操场', obj: '体能' },
    { id: 'a7', at: 19 * MIN + 30, dur: 90, kind: '记录', thread: 'slate', title: '读《技术与时间》第二章', note: '重点看“已经在此”的那一段，和上周笔记里的疑问对照。', where: '书桌', obj: '阅读' },
    { id: 'a8', at: 22 * MIN, dur: 20, kind: '事项', thread: 'turmeric', title: '写三行复盘', note: '今天做成了什么、卡在哪、明天第一件事。', where: '笔记', obj: '论文' }
  ];

  var objects = [
    { name: '高等数学', thread: 'indigo', n: 6 },
    { name: '数据结构', thread: 'moss', n: 4 },
    { name: '中期报告', thread: 'madder', n: 9 },
    { name: '导师', thread: 'wisteria', n: 5 },
    { name: '与沈岳', thread: 'clay', n: 3 },
    { name: '体能', thread: 'celadon', n: 7 },
    { name: '阅读', thread: 'slate', n: 12 },
    { name: '论文', thread: 'turmeric', n: 8 }
  ];

  var weekNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var weekGrid = [
    [{ t: '08:00', h: '高等数学', c: 'indigo' }, { t: '14:00', h: '数据结构实验', c: 'moss' }],
    [{ t: '10:00', h: '组会', c: 'wisteria' }],
    [{ t: '08:00', h: '高等数学', c: 'indigo' }, { t: '16:00', h: '跑步', c: 'celadon' }],
    [{ t: '09:00', h: '写中期提纲', c: 'madder' }],
    [{ t: '08:00', h: '高等数学', c: 'indigo' }, { t: '12:10', h: '午饭 · 沈岳', c: 'clay' }, { t: '15:30', h: '组会 · 中期', c: 'wisteria' }],
    [{ t: '10:00', h: '图书馆 · 读第二章', c: 'slate' }],
    [{ t: '20:00', h: '写三行复盘', c: 'turmeric' }]
  ];

  var longRows = [
    { name: '中期报告', thread: 'madder', n: 9, knots: [[-24, '开题'], [-9, '提纲一稿'], [0, '回信给导师'], [12, '初稿'], [38, '中期检查']] },
    { name: '高等数学', thread: 'indigo', n: 6, knots: [[-20, '第一章测验'], [-6, '习题 3.1'], [0, '第三章'], [7, '习题 3.4'], [21, '期中']] },
    { name: '数据结构', thread: 'moss', n: 4, knots: [[-15, '实验一'], [-3, '实验二开写'], [0, '交实验二'], [14, '实验三']] },
    { name: '论文', thread: 'turmeric', n: 8, knots: [[-28, '读文献'], [-11, '方法一节'], [4, '补实验'], [26, '改第二稿']] },
    { name: '阅读', thread: 'slate', n: 12, knots: [[-18, '第一章'], [-7, '笔记整理'], [0, '第二章'], [9, '第三章']] },
    { name: '体能', thread: 'celadon', n: 7, knots: [[-12, '5 公里'], [-5, '4 公里'], [0, '5 公里'], [6, '长距离']] },
    { name: '导师', thread: 'wisteria', n: 5, knots: [[-16, '第一次汇报'], [-2, '发提纲'], [0, '等回信'], [11, '面谈']] },
    { name: '与沈岳', thread: 'clay', n: 3, knots: [[-9, '借书'], [0, '午饭'], [18, '还书']] }
  ];

  var done = Object.create(null);
  var lastDone = null;

  /* ── 尺度换算 ───────────────────────────────────────── */
  var WIN_START = 6 * MIN;
  function pxPerMin() {
    var raw = getComputedStyle(root).getPropertyValue('--hour').trim();
    var hour = parseFloat(raw) || 88;
    return hour / MIN;
  }
  function winStart() { return nowMin > 5 * MIN ? 6 * MIN : 0; }
  function yOf(min) { return (min - winStart()) * pxPerMin(); }
  function minOfY(y) { return winStart() + y / pxPerMin(); }

  /* ── 页头 ───────────────────────────────────────────── */
  function paintHead() {
    var d = new Date();
    var wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];    var stamp = $('#head-stamp');
    if (stamp) {
      stamp.innerHTML = '<span class="stamp-num">' + d.getMonth() + 1 + '</span>' +
        '<span class="stamp-dot">·</span>' +
        '<span class="stamp-num">' + d.getDate() + '</span>';
    }
    var echo = $('#echo-date');
    if (echo) echo.textContent = pad(d.getMonth() + 1) + '·' + pad(d.getDate()) + ' ' + wd;

    // ISO 周数
    var t = new Date(d.getTime());
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var week1 = new Date(t.getFullYear(), 0, 4);
    var week = 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    var headWeek = $('#head-week');
    if (headWeek) headWeek.textContent = wd + ' · 第 ' + week + ' 周';
    var weekNum = $('#week-num');
    if (weekNum) weekNum.textContent = week;
  }

  function paintOmen() {
    var omen = $('#head-omen');
    if (!omen) return;
    var left = slips.filter(function (s) { return !done[s.id] && s.at >= nowMin - 5; })
      .sort(function (a, b) { return a.at - b.at; });
    var next = left[0];
    var base = '现在 <b>' + hm(nowMin) + '</b>';
    if (!next) {
      omen.innerHTML = base + ' · 今天余下的都走完了';
      return;
    }
    var gap = next.at - nowMin;
    if (gap <= 0) {
      omen.innerHTML = base + ' · 正在 <em>' + esc(next.title) + '</em>';
    } else if (gap <= 60) {
      omen.innerHTML = base + ' · <em>' + esc(next.title) + '</em> 还有 <b>' + gap + '</b> 分钟';
    } else {
      var h = Math.floor(gap / 60), m = gap % 60;
      omen.innerHTML = base + ' · 到 <b>' + hm(next.at) + '</b> 之前还空着' +
        (h ? ' <b>' + h + '</b> 小时' : '') + (m ? ' <b>' + m + '</b> 分' : '');
    }
    var counts = { 课程: 0, 事项: 0, 记录: 0 };
    slips.forEach(function (s) { counts[s.kind] = (counts[s.kind] || 0) + 1; });
    var open = slips.filter(function (s) { return !done[s.id]; }).length;
    var el = $('#head-count');
    if (el) {
      el.innerHTML = '<span>' + open + '</span> 件未走完 · ' +
        slips.length + ' 件安排 · ' + counts['课程'] + ' 节课';
    }
  }

  /* ── 今天 ───────────────────────────────────────────── */
  function buildTicks() {
    var box = $('#warp-ticks');
    if (!box) return;
    var start = winStart(), end = start + 18 * MIN;
    var out = [];
    for (var m = start; m <= end; m += 30) {
      var y = yOf(m);
      if (m % MIN === 0) {
        out.push('<span class="tick is-hour" style="top:' + y + 'px"></span>');
        if (m % (2 * MIN) === 0 && m < end) {
          out.push('<span class="tick-label" data-min="' + m + '" style="top:' + y + 'px"><b>' + hm(m) + '</b></span>');
        }
      } else {
        out.push('<span class="tick" style="top:' + y + 'px"></span>');
      }
    }
    box.innerHTML = out.join('');
  }

  function timeText(s) {
    return hm(s.at) + (s.dur ? ' – ' + hm(s.at + s.dur) : '');
  }

  function slipHTML(s, i) {
    return '<li class="slip" tabindex="0" role="listitem" data-id="' + s.id + '" data-at="' + s.at + '"' +
      ' style="--i:' + i + ';--thread:var(--t-' + s.thread + ')"' +
      ' aria-label="' + esc(s.title) + '，' + hm(s.at) + '">' +
      '<span class="slip-body">' +
      '<span class="slip-kind"><i></i>' + s.kind + '</span>' +
      '<h3 class="slip-title">' + esc(s.title) + '</h3>' +
      '<p class="slip-note">' + esc(s.note) + '</p>' +
      '</span>' +
      '<span class="slip-margin">' +
      '<span class="slip-time">' + timeText(s) + '</span>' +
      '<span class="slip-where">' + esc(s.where) + '</span>' +
      '<span class="slip-obj">' + esc(s.obj) + '</span>' +
      '</span>' +
      '<button class="slip-knot" type="button" aria-label="穿过：' + esc(s.title) + '"></button>' +
      '<svg class="slip-stitch" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M2 9 C 52 3, 96 12, 148 7 S 232 10, 298 6"/></svg>' +
      '</li>';
  }

  function paintToday() {
    var list = $('#slips');
    if (!list) return;
    list.innerHTML = slips.map(slipHTML).join('');
    layoutToday();
  }

  function layoutToday() {
    var warp = $('#warp');
    if (!warp) return;
    var els = $$('.slip', warp).sort(function (a, b) { return (+a.dataset.at) - (+b.dataset.at); });
    var floor = -1e9;
    els.forEach(function (el) {
      var top = Math.max(yOf(+el.dataset.at), floor);
      el.style.top = top + 'px';
      floor = top + el.offsetHeight + 11;
    });
    warp.style.height = (yOf(winStart() + 18 * MIN) + 48) + 'px';
    paintTail(floor);
    paintNow();
  }

  // 一天走到这里之后的那一段：不打卷，只坠一颗结，写一行小字。
  function paintTail(lastBottom) {
    var warp = $('#warp');
    if (!warp) return;
    var tail = $('#warp-tail');
    var open = slips.filter(function (s) { return !done[s.id] && s.at >= nowMin - 5; }).length;
    var start = Math.max(lastBottom + 26, yOf(Math.max(nowMin, winStart())) + 30);
    var end = yOf(winStart() + 18 * MIN);
    if (end - start < 40) { if (tail) tail.remove(); return; }
    if (!tail) {
      tail = doc.createElement('div');
      tail.id = 'warp-tail';
      tail.className = 'warp-tail';
      tail.setAttribute('aria-hidden', 'true');
      warp.append(tail);
    }
    tail.style.top = start + 'px';
    tail.style.height = (end - start) + 'px';
    var txt = open ? '还有 ' + open + ' 件在下面' : '今天走到了这里';
    tail.innerHTML = '<span class="tail-line"></span><span class="tail-knot"></span><span class="tail-say">' + txt + '</span>';
  }

  function paintNow() {
    nowMin = clockNow();
    var mark = $('#now-mark');
    if (mark) mark.style.top = yOf(nowMin) + 'px';
    var clock = $('#now-clock');
    if (clock) clock.innerHTML = hm(nowMin) + '<i>' + (window.innerWidth > 700 ? '此刻' : '') + '</i>';
    var omen = $('#warp-omen');
    if (omen) {
      var a = yOf(Math.max(nowMin, winStart()));
      omen.style.top = a + 'px';
      omen.style.height = Math.max(24, yOf(Math.min(nowMin + 150, winStart() + 18 * MIN)) - a) + 'px';
    }
    $$('.slip').forEach(function (el) {
      var at = +el.dataset.at;
      el.classList.toggle('is-hot', !done[el.dataset.id] && at >= nowMin && at - nowMin <= 35);
      el.classList.toggle('is-past', at + (0) < nowMin);
    });
    // 此刻的钟点占了刻度位，就把附近那条刻度让开。
    $$('.tick-label').forEach(function (el) {
      var near = Math.abs(+el.dataset.min - nowMin) < 26;
      el.classList.toggle('is-muted', near);
    });
    paintOmen();
  }

  /* ── 本周 ───────────────────────────────────────────── */
  function weekPxPerMin() {
    var raw = getComputedStyle(root).getPropertyValue('--week-hour').trim();
    return (parseFloat(raw) || 34) / MIN;
  }
  function paintWeek() {
    var loom = $('#loom');
    if (!loom) return;
    var d = new Date();
    var idx = (d.getDay() + 6) % 7;
    var monday = new Date(d.getTime());
    monday.setDate(d.getDate() - idx);
    var pp = weekPxPerMin();
    var start = winStart();
    var span = 18 * MIN;
    var stackH = Math.round(span * pp) + 24;
    loom.innerHTML = weekGrid.map(function (day, i) {
      var date = new Date(monday.getTime());
      date.setDate(monday.getDate() + i);
      var fan = 'calc(' + i + ' * 100%)';
      var isToday = i === idx;
      // 按时间落位；同一小时内的挤压让开
      var placed = day.map(function (c) {
        var parts = c.t.split(':');
        return { c: c, at: (+parts[0]) * MIN + (+parts[1]) };
      }).sort(function (a, b) { return a.at - b.at; });
      var floor = -1e9;
      var chips = placed.map(function (p) {
        var y = Math.max((p.at - start) * pp, floor);
        floor = y + 62;
        return '<button class="chip" type="button" data-thread="' + p.c.c + '" data-title="' + esc(p.c.h) +
          '" data-time="' + p.c.t + '" style="--thread:var(--t-' + p.c.c + ');top:' + Math.round(y) + 'px">' +
          '<span class="chip-t">' + p.c.t + '</span>' +
          '<p class="chip-h">' + esc(p.c.h) + '</p></button>';
      }).join('');
      var nowLine = isToday
        ? '<span class="loom-now" style="top:' + Math.round((nowMin - start) * pp) + 'px" aria-hidden="true"></span>'
        : '';
      return '<div class="loom-col' + (isToday ? ' is-today' : '') + '" style="--i:' + i + ';--fan:' + fan + '">' +
        '<div class="loom-day"><b>' + (date.getDate()) + '</b>' + weekNames[i] + '</div>' +
        '<div class="loom-stack" style="height:' + stackH + 'px">' +
        nowLine + chips +
        '<button class="loom-add" type="button" data-day="' + i + '">+ 加一件</button>' +
        '</div>' +
        '</div>';
    }).join('');
    var total = weekGrid.reduce(function (n, d2) { return n + d2.length; }, 0);
    var wo = $('#week-omen');
    if (wo) wo.textContent = '七缕 · ' + total + ' 件安排 · 两个截止';
  }

  /* ── 长线 ───────────────────────────────────────────── */
  var LO_A = -30, LO_B = 60;
  function paintLong() {
    var box = $('#long');
    if (!box) return;
    var span = LO_B - LO_A;
    var ratio = function (d) { return (d - LO_A) / span * 100; };
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // 月份分隔
    var months = [];
    for (var d = LO_A; d <= LO_B; d++) {
      var day = new Date(today.getTime() + d * 86400000);
      if (day.getDate() === 1) {
        months.push('<span class="long-month" style="left:' + ratio(d) + '%">' + (day.getMonth() + 1) + ' 月</span>');
      }
    }
    var first = new Date(today.getTime() + LO_A * 86400000);
    months.unshift('<span class="long-month" style="left:0;transform:none">' + (first.getMonth() + 1) + ' 月</span>');

    var rows = longRows.map(function (row, i) {
      var knots = row.knots.map(function (k) {
        var day = new Date(today.getTime() + k[0] * 86400000);
        var tip = (day.getMonth() + 1) + '-' + pad(day.getDate()) + ' · ' + k[1];
        // 不在原地弹框；名字交给下方那行注脚，指针经过时更新。
        return '<button class="long-knot" type="button" tabindex="-1" data-tip="' + esc(tip) + '"' +
          ' aria-label="' + esc(tip) + '" style="left:' + ratio(k[0]) + '%"></button>';
      }).join('');
      return '<div class="long-row" style="--i:' + i + ';--thread:var(--t-' + row.thread + ')">' +
        '<span class="long-name"><i></i>' + row.name + '<small>' + row.n + '</small></span>' +
        knots + '</div>';
    }).join('');

    box.innerHTML =
      '<div class="long-axis">' + months.join('') + '</div>' +
      '<div class="long-rows">' + rows +
      '<div class="long-today" style="left:' + ratio(0) + '%"><span>今天</span></div></div>';
  }

  /* ── 对象抽屉 ───────────────────────────────────────── */
  function paintKnots() {
    var list = $('#knots');
    if (!list) return;
    list.innerHTML = objects.map(function (o) {
      return '<li><button class="knot" type="button" data-obj="' + esc(o.name) + '"' +
        ' style="--thread:var(--t-' + o.thread + ')">' +
        '<i></i><b>' + esc(o.name) + '</b><small>' + o.n + '</small></button></li>';
    }).join('');
  }

  var drawer = $('#drawer');
  var edge = $('#knots-open');
  var drawerOpen = false;
  function setDrawer(open) {
    drawerOpen = open;
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    if (open) drawer.removeAttribute('inert'); else drawer.setAttribute('inert', '');
    edge.setAttribute('aria-expanded', String(open));
    if (open) { var k = $('.knot', drawer); if (k) k.focus(); }
  }
  setDrawer(false);

  /* ── 案卷 ───────────────────────────────────────────── */
  var dossier = $('#dossier');
  var dossierOwner = null;

  function dossierHTML(o) {
    var rows = (o.rows || []).map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + r[1] + '</dd>';
    }).join('');
    return '<button class="pin dossier-x" type="button" aria-label="收起" data-close>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.3;stroke-linecap:round">' +
      '<path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
      '<div class="dossier-kind" style="--thread:var(--t-' + (o.thread || 'slate') + ')"><i></i>' + esc(o.kind || '事项') + '</div>' +
      '<h3 id="dossier-title">' + esc(o.title) + '</h3>' +
      (o.note ? '<p>' + esc(o.note) + '</p>' : '') +
      (rows ? '<dl>' + rows + '</dl>' : '') +
      '<div class="dossier-acts">' +
      (o.id ? '<button class="act act-prime" type="button" data-act="done">穿过</button>' +
        '<button class="act" type="button" data-act="later">推后半小时</button>' : '') +
      '<button class="act" type="button" data-close>收起</button>' +
      '</div>';
  }

  function openDossier(o, anchor) {
    dossier.innerHTML = dossierHTML(o);
    dossier.style.setProperty('--thread', 'var(--t-' + (o.thread || 'slate') + ')');
    dossier.classList.add('is-open');
    dossier.setAttribute('aria-hidden', 'false');
    dossier.removeAttribute('inert');
    dossierOwner = o;
    if (anchor) {
      var r = anchor.getBoundingClientRect();
      var w = dossier.offsetWidth, h = dossier.offsetHeight;
      var left = r.right + 20;
      if (left + w > window.innerWidth - 24) left = r.left - w - 20;
      if (left < 24) left = Math.min(r.right + 20, window.innerWidth - w - 24);
      var top = Math.min(Math.max(r.top - 6, 70), window.innerHeight - h - 26);
      dossier.style.left = Math.round(left) + 'px';
      dossier.style.top = Math.round(top) + 'px';
      if (anchor.classList) anchor.classList.add('is-open');
    }
    var first = $('.act', dossier);
    if (first) first.focus();
  }

  function closeDossier() {
    dossier.classList.remove('is-open');
    dossier.setAttribute('aria-hidden', 'true');
    dossier.setAttribute('inert', '');
    if (dossierOwner && dossierOwner.id) {
      var el = $('.slip[data-id="' + dossierOwner.id + '"]');
      if (el) { el.classList.remove('is-open'); el.focus(); }
    }
    dossierOwner = null;
  }

  dossier.addEventListener('click', function (e) {
    var t = e.target.closest('[data-close]');
    if (t) { closeDossier(); return; }
    var act = e.target.closest('[data-act]');
    if (!act || !dossierOwner || !dossierOwner.id) return;
    if (act.dataset.act === 'done') { closeDossier(); toggleDone(dossierOwner.id); }
    if (act.dataset.act === 'later') {
      var s = slips.filter(function (x) { return x.id === dossierOwner.id; })[0];
      if (s) { s.at += 30; closeDossier(); paintToday(); toast('推后到 ' + hm(s.at)); }
    }
  });

  /* ── 穿过 ───────────────────────────────────────────── */
  function toggleDone(id) {
    var el = $('.slip[data-id="' + id + '"]');
    var s = slips.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    if (done[id]) {
      delete done[id];
      if (el) el.classList.remove('is-done');
      paintOmen();
      return;
    }
    done[id] = true;
    lastDone = id;
    if (el) el.classList.add('is-done');
    paintOmen();
    toast('<b>' + esc(s.title) + '</b> 已穿过', { label: '撤回', run: function () { undoDone(); } });
  }
  function undoDone() {
    if (!lastDone) return;
    var id = lastDone;
    delete done[id];
    lastDone = null;
    var el = $('.slip[data-id="' + id + '"]');
    if (el) el.classList.remove('is-done');
    paintOmen();
    toast('已经退回来了');
  }

  /* ── 拖动改期 ───────────────────────────────────────── */
  var drag = null;
  var ghost = $('#ghost');
  var ghostTime = $('#ghost-time');

  function slipFromEvent(e) {
    var li = e.target.closest('.slip');
    if (!li) return null;
    if (e.target.closest('.slip-knot')) return null;
    return li;
  }

  doc.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    var li = slipFromEvent(e);
    if (!li) return;
    drag = {
      el: li, id: li.dataset.id, y0: e.clientY, top0: parseFloat(li.style.top) || 0,
      moved: false, px: yOf(0)
    };
    li.setPointerCapture && li.setPointerCapture(e.pointerId);
  });

  doc.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add('is-dragging');
      drag.el.style.transition = 'none';
    }
    var top = Math.max(0, drag.top0 + dy);
    drag.el.style.top = top + 'px';
    if (ghost) {
      ghost.classList.add('is-on');
      ghost.style.top = top + 'px';
      if (ghostTime) ghostTime.textContent = hm(snap(minOfY(top)));
    }
  });

  function snap(min) {
    return Math.round(min / 15) * 15;
  }

  doc.addEventListener('pointerup', function (e) {
    if (!drag) return;
    var d = drag; drag = null;
    d.el.classList.remove('is-dragging');
    if (ghost) ghost.classList.remove('is-on');
    if (!d.moved) { d.el.style.transition = ''; return; }
    var top = parseFloat(d.el.style.top) || 0;
    var min = Math.max(winStart(), Math.min(winStart() + 17 * MIN, snap(minOfY(top))));
    var s = slips.filter(function (x) { return x.id === d.id; })[0];
    if (s && s.at !== min) {
      s.at = min;
      d.el.dataset.at = min;
      var label = d.el.querySelector('.slip-time');
      if (label) label.textContent = timeText(s);
      toast('挪到 <b>' + hm(min) + '</b>');
    }
    d.el.style.transition = '';
    layoutToday();
    paintOmen();
    if (e) e.preventDefault();
  });

  /* ── 命令面板 ───────────────────────────────────────── */
  var pw = $('#palette-wrap');
  var pin = $('#palette-input');
  var plist = $('#palette-list');
  var pfoot = $('#palette-foot');
  var paletteOpen = false;
  var rows = [], cursor = 0;

  var ICON = {
    jump: '<svg viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg>',
    act: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    find: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.4"/><path d="M16 16l4 4"/></svg>',
    dot: '<i></i>'
  };

  function paletteSource() {
    var list = [
      { g: 'jump', label: '现在', sub: '一条经线', hint: '1', run: function () { setAltitude('now'); } },
      { g: 'jump', label: '本周', sub: '散成七缕', hint: '2', run: function () { setAltitude('week'); } },
      { g: 'jump', label: '长线', sub: '经线横过来', hint: '3', run: function () { setAltitude('long'); } },
      { g: 'act', label: '抽出对象线头', sub: '八根', hint: 'Ctrl B', run: function () { setDrawer(true); } },
      { g: 'act', label: '换到夜纸', sub: '纸与夜', hint: '', run: function () { toggleTheme(); } },
      { g: 'act', label: '看键盘', sub: '说明', hint: '?', run: function () { setHelp(true); } }
    ];
    slips.forEach(function (s) {
      list.push({
        g: 'dot', thread: s.thread, label: s.title, sub: hm(s.at) + ' · ' + s.kind,
        hint: done[s.id] ? '已穿过' : '',
        run: function () {
          if (altitude !== 'now') setAltitude('now');
          var el = $('.slip[data-id="' + s.id + '"]');
          if (el) el.scrollIntoView({ block: 'center' });
          openDossier(slipData(s), el);
        }
      });
    });
    objects.forEach(function (o) {
      list.push({
        g: 'dot', thread: o.thread, label: o.name, sub: '对象 · ' + o.n + ' 件',
        hint: '', run: function () { insertFromObject(o.name); }
      });
    });
    return list;
  }

  function slipData(s) {
    return {
      id: s.id, kind: s.kind, thread: s.thread, title: s.title, note: s.note,
      rows: [['时间', hm(s.at) + (s.dur ? ' – ' + hm(s.at + s.dur) : '')],
        ['对象', '<span class="knot-dot"></span>' + esc(s.obj)],
        ['地点', esc(s.where)],
        ['状态', done[s.id] ? '已穿过' : '未穿过']]
    };
  }

  function renderPalette(q) {
    var all = paletteSource();
    q = (q || '').trim().toLowerCase();
    rows = q ? all.filter(function (r) {
      return (r.label + ' ' + (r.sub || '')).toLowerCase().indexOf(q) >= 0;
    }) : all;
    cursor = 0;
    if (!rows.length) {
      plist.innerHTML = '<li class="palette-empty"><p>没有“' + esc(q) + '”。试试这些：</p>' +
        '<div class="sugg">' +
        ['本周', '中期报告', '抽出对象', '长线'].map(function (s) {
          return '<button type="button" data-sugg="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('') + '</div></li>';
      pfoot.textContent = 'Esc 收起';
      return;
    }
    plist.innerHTML = rows.map(function (r, i) {
      var glyph = r.g === 'dot'
        ? '<span class="glyph" style="--thread:var(--t-' + r.thread + ')"><i></i></span>'
        : '<span class="glyph">' + ICON[r.g] + '</span>';
      return '<li role="option" aria-selected="' + (i === 0) + '">' +
        '<button class="palette-row' + (i === 0 ? ' is-on' : '') + '" type="button" data-row="' + i + '">' +
        glyph + '<span class="label">' + esc(r.label) + '</span>' +
        (r.sub ? '<span class="sub">' + esc(r.sub) + '</span>' : '') +
        (r.hint ? '<kbd class="hint">' + esc(r.hint) + '</kbd>' : '') +
        '</button></li>';
    }).join('');
    pfoot.innerHTML = '↑↓ 选 · ⏎ 执行 · Esc 收起';
  }

  function moveCursor(step) {
    if (!rows.length) return;
    cursor = (cursor + step + rows.length) % rows.length;
    $$('.palette-row', plist).forEach(function (el, i) {
      el.classList.toggle('is-on', i === cursor);
      el.parentNode.setAttribute('aria-selected', String(i === cursor));
    });
    var on = $('.palette-row.is-on', plist);
    if (on) on.scrollIntoView({ block: 'nearest' });
  }

  function runRow(i) {
    var r = rows[i];
    if (!r) return;
    setPalette(false);
    setTimeout(r.run, 60);
  }

  function setPalette(open, seed) {
    paletteOpen = open;
    pw.classList.toggle('is-open', open);
    pw.setAttribute('aria-hidden', String(!open));
    if (open) pw.removeAttribute('inert'); else pw.setAttribute('inert', '');
    if (open) {
      pin.value = seed || '';
      renderPalette(seed || '');
      setTimeout(function () { pin.focus(); }, 40);
    } else {
      pin.blur();
    }
  }

  pw.addEventListener('click', function (e) {
    if (e.target === pw) { setPalette(false); return; }
    var s = e.target.closest('[data-sugg]');
    if (s) { pin.value = s.dataset.sugg; renderPalette(s.dataset.sugg); pin.focus(); return; }
    var b = e.target.closest('[data-row]');
    if (b) runRow(+b.dataset.row);
  });

  pin.addEventListener('input', function () { renderPalette(pin.value); });

  plist.addEventListener('pointermove', function (e) {
    var b = e.target.closest('[data-row]');
    if (!b) return;
    var i = +b.dataset.row;
    if (i !== cursor) { cursor = i; moveCursor(0); }
  });

  /* ── 插入 ───────────────────────────────────────────── */
  function insertFromObject(name, atMin) {
    var o = objects.filter(function (x) { return x.name === name; })[0] || { thread: 'slate', name: name };
    var at = (typeof atMin === 'number') ? snap(atMin) : snap(Math.max(nowMin + 30, winStart() + 30));
    at = Math.max(winStart(), Math.min(winStart() + 17 * MIN, at));
    while (slips.some(function (s) { return Math.abs(s.at - at) < 15; })) at += 15;
    if (at > winStart() + 17 * MIN) at = winStart() + 17 * MIN;
    slips.push({
      id: 'n' + Date.now(), at: at, dur: 0, kind: '事项', thread: o.thread,
      title: '与' + name + '有关的一件小事', note: '从对象线头落下来的，还没写具体内容。',
      where: '未定', obj: name
    });
    if (altitude !== 'now') setAltitude('now');
    paintToday();
    toast('落成 <b>' + hm(at) + '</b> · ' + esc(name));
  }

  /* ── 尺度 ───────────────────────────────────────────── */
  var altitude = 'now';
  var planeNow = $('#plane-now'), planeWeek = $('#plane-week'), planeLong = $('#plane-long');
  var scrollMemo = { now: undefined, week: undefined, long: undefined };

  function setAltitude(next) {
    if (!next || next === altitude) return;
    var cur = $('.plane.is-live');
    var nx = { now: planeNow, week: planeWeek, long: planeLong }[next];
    if (!nx) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (cur) {
      scrollMemo[altitude] = cur.scrollTop;
      cur.classList.remove('is-live');
      cur.classList.add('is-leaving');
      setTimeout(function () { cur.classList.remove('is-leaving'); }, reduce ? 60 : 760);
    }
    altitude = next;
    root.dataset.altitude = next;
    nx.classList.add('is-live');
    if (next === 'week') paintWeek();
    if (next === 'long') paintLong();
    // 第一次来这一层就落在“此刻”；之后按记住的位置。
    var memo = scrollMemo[next];
    nx.scrollTop = (memo === undefined || memo === 0)
      ? Math.max(0, yOf(nowMin) - nx.clientHeight * 0.5 + nx.clientHeight * 0.24)
      : memo;
    $$('#rail button').forEach(function (b) {
      b.setAttribute('aria-current', String(b.dataset.altitude === next));
    });
  }

  /* ── 提示条 ─────────────────────────────────────────── */
  var toastEl = $('#toast');
  var toastTimer = 0;
  function toast(html, opts) {
    opts = opts || {};
    toastEl.innerHTML = html + (opts.label ? ' <button type="button" id="toast-act">' + esc(opts.label) + '</button>' : '');
    toastEl.classList.add('is-on');
    toastEl._act = opts.run || null;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-on');
      toastEl._act = null;
    }, opts.hold || 5200);
  }
  toastEl.addEventListener('click', function (e) {
    if (e.target.id === 'toast-act' && toastEl._act) {
      var fn = toastEl._act;
      toastEl._act = null;
      clearTimeout(toastTimer);
      toastEl.classList.remove('is-on');
      fn();
    }
  });

  /* ── 说明 ───────────────────────────────────────────── */
  var helpEl = $('#help');
  var helpBtn = $('#help-open');
  function setHelp(open) {
    helpEl.classList.toggle('is-open', open);
    helpEl.setAttribute('aria-hidden', String(!open));
    if (open) helpEl.removeAttribute('inert'); else helpEl.setAttribute('inert', '');
    helpBtn.setAttribute('aria-expanded', String(open));
    if (open) { var b = $('#help-close'); if (b) b.focus(); }
    else helpBtn.focus();
  }
  $('#help-close').addEventListener('click', function () { setHelp(false); });
  helpBtn.addEventListener('click', function () { setHelp(!helpEl.classList.contains('is-open')); });

  /* ── 主题 ───────────────────────────────────────────── */
  function toggleTheme() {
    var next = root.dataset.theme === 'ink' ? 'paper' : 'ink';
    root.dataset.theme = next;
    toast(next === 'ink' ? '夜' : '纸');
  }
  $('#theme-toggle').addEventListener('click', toggleTheme);

  /* ── 尺度尺与线头 ───────────────────────────────────── */
  $('#rail').addEventListener('click', function (e) {
    var b = e.target.closest('[data-altitude]');
    if (b) setAltitude(b.dataset.altitude);
  });
  edge.addEventListener('click', function () {
    setDrawer(!drawerOpen);
  });
  $('#knots-close').addEventListener('click', function () {
    setDrawer(false);
    edge.focus();
  });
  // 轻点线头＝落成一件小事；拖动则由下面的 pointer 链路接管。
  $('#knots').addEventListener('click', function (e) {
    var k = e.target.closest('.knot');
    if (!k) return;
    insertFromObject(k.dataset.obj);
  });

  /* 对象拖到经线上 */
  var knotDrag = null;
  var knotGhost = null;
  doc.addEventListener('pointerdown', function (e) {
    var k = e.target.closest('.knot');
    if (!k) return;
    knotDrag = { name: k.dataset.obj, el: k, moved: false, y: e.clientY };
    k.classList.add('is-lifting');
  });
  doc.addEventListener('pointermove', function (e) {
    if (!knotDrag) return;
    if (!knotDrag.moved && Math.abs(e.clientY - knotDrag.y) < 6) return;
    if (!knotDrag.moved) {
      knotDrag.moved = true;
      knotGhost = doc.createElement('div');
      knotGhost.className = 'knot-ghost';
      knotGhost.textContent = knotDrag.name;
      doc.body.appendChild(knotGhost);
    }
    knotGhost.style.left = e.clientX + 12 + 'px';
    knotGhost.style.top = e.clientY - 12 + 'px';
  });
  doc.addEventListener('pointerup', function (e) {
    if (!knotDrag) return;
    var d = knotDrag; knotDrag = null;
    d.el.classList.remove('is-lifting');
    if (knotGhost) { knotGhost.remove(); knotGhost = null; }
    // 轻点交给 click；只有真的拖到纸面上才在这里落成。
    if (!d.moved) return;
    var plane = $('.plane.is-live');
    var sheet = plane && $('.sheet', plane);
    if (!sheet) return;
    var r = sheet.getBoundingClientRect();
    var warpX = r.left + (parseFloat(getComputedStyle(root).getPropertyValue('--warp-x')) || 120);
    if (e.clientX < warpX - 60) return;
    var top = e.clientY - r.top;
    insertFromObject(d.name, minOfY(top));
  });

  /* ── 键盘 ───────────────────────────────────────────── */
  doc.addEventListener('keydown', function (e) {
    var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

    if (e.key === 'Escape') {
      if (paletteOpen) { setPalette(false); return; }
      if (helpEl.classList.contains('is-open')) { setHelp(false); return; }
      if (drawerOpen) { setDrawer(false); return; }
      if (dossier.classList.contains('is-open')) { closeDossier(); return; }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setPalette(!paletteOpen);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      setDrawer(!drawerOpen);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (lastDone) { e.preventDefault(); undoDone(); }
      return;
    }

    if (paletteOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); runRow(cursor); return; }
      return;
    }

    if (inField) return;

    if (e.key === '?' || (e.shiftKey && e.key === '/')) { e.preventDefault(); setHelp(!helpEl.classList.contains('is-open')); return; }
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      setAltitude({ '1': 'now', '2': 'week', '3': 'long' }[e.key]); return;
    }

    var slipEl = e.target.closest && e.target.closest('.slip');
    if (slipEl) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (e.key === ' ') toggleDone(slipEl.dataset.id);
        else {
          var s = slips.filter(function (x) { return x.id === slipEl.dataset.id; })[0];
          if (s) openDossier(slipData(s), slipEl);
        }
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        var item = slips.filter(function (x) { return x.id === slipEl.dataset.id; })[0];
        if (item) {
          item.at = Math.max(winStart(), Math.min(winStart() + 17 * MIN, item.at + (e.key === 'ArrowUp' ? -15 : 15)));
          slipEl.dataset.at = item.at;
          var label = slipEl.querySelector('.slip-time');
          if (label) label.textContent = timeText(item);
          layoutToday();
          toast('挪到 <b>' + hm(item.at) + '</b>');
        }
        return;
      }
    }

    // Spotlight 行为：直接打字呼出
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      setPalette(true, e.key);
      e.preventDefault();
    }
  });

  /* ── 绑定 ───────────────────────────────────────────── */
  $('#slips').addEventListener('click', function (e) {
    var knot = e.target.closest('.slip-knot');
    var li = e.target.closest('.slip');
    if (!li) return;
    if (knot) { toggleDone(li.dataset.id); return; }
    var s = slips.filter(function (x) { return x.id === li.dataset.id; })[0];
    if (s) {
      $$('.slip.is-open').forEach(function (x) { x.classList.remove('is-open'); });
      openDossier(slipData(s), li);
    }
  });

  $('#loom').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (chip) {
      openDossier({
        kind: '本周', thread: chip.dataset.thread, title: chip.dataset.title,
        note: '', rows: [['时间', chip.dataset.time]]
      }, chip);
      return;
    }
    var add = e.target.closest('.loom-add');
    if (add) insertFromObject(objects[0].name);
  });

  $('#long').addEventListener('pointerover', function (e) {
    var k = e.target.closest('.long-knot');
    var note = $('#long-note');
    if (note) note.textContent = k ? k.dataset.tip : '';
  });
  $('#long').addEventListener('click', function (e) {
    var k = e.target.closest('.long-knot');
    if (k) toast(esc(k.dataset.tip));
  });

  $$('.plane').forEach(function (p) {
    p.addEventListener('scroll', function () {
      doc.body.classList.toggle('is-scrolled', p.scrollTop > 36);
    }, { passive: true });
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      layoutToday();
      if (altitude === 'week') paintWeek();
      if (altitude === 'long') paintLong();
    }, 120);
  });

  /* ── 起手 ───────────────────────────────────────────── */
  nowMin = clockNow();
  paintHead();
  buildTicks();
  paintToday();
  paintKnots();
  paintWeek();
  paintLong();
  requestAnimationFrame(function () {
    layoutToday();
    focusNow(false);
    followNow = true;
  });

  // 让“此刻”落在视口里，但至少留住页头——打开时先看见日期，再看见现在。
  function focusNow(smooth) {
    var plane = planeNow;
    var headH = $('.head', plane) ? $('.head', plane).offsetHeight : 0;
    var bias = Math.min(plane.clientHeight * 0.36, Math.max(0, plane.clientHeight * 0.5 - headH * 0.42));
    var target = Math.max(0, yOf(nowMin) - plane.clientHeight * 0.5 + bias);
    if (smooth && !reduced) plane.scrollTo({ top: target, behavior: 'smooth' });
    else plane.scrollTop = target;
  }

  // 用户自己滚动过，就不再替他挪；回到顶部时重新跟随。
  var followNow = false;
  planeNow.addEventListener('scroll', function () {
    var headH = $('.head', planeNow) ? $('.head', planeNow).offsetHeight : 0;
    var bias = Math.min(planeNow.clientHeight * 0.36, Math.max(0, planeNow.clientHeight * 0.5 - headH * 0.42));
    var target = Math.max(0, yOf(nowMin) - planeNow.clientHeight * 0.5 + bias);
    followNow = Math.abs(planeNow.scrollTop - target) < 140 || planeNow.scrollTop < 8;
  }, { passive: true });

  setInterval(function () {
    var m = clockNow();
    if (m === nowMin) return;
    nowMin = m;
    paintNow();
    if (followNow && altitude === 'now') focusNow(true);
  }, 20000);

  // 轻柔微尘：慢速上浮，靠近指针时被极轻地推开
  if (window.Lab && window.Lab.installDust) {
    window.Lab.installDust({
      count: 16,
      tint: root.dataset.theme === 'ink' ? 'rgba(237,232,220,' : 'rgba(90,84,70,'
    });
  }
})();
