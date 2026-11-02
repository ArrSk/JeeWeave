/* 环时 · 交互
   左：一天是个环，中间是指针。右：环上选中的那一段。
   环用 SVG 画扇区；点扇区与按 ← → 是同一件事。 */

(function (global) {
  'use strict';
  var L = global.Lab, PG = global.Plugs;
  var esc = L.esc, hm = L.hm, pad = L.pad;

  var st = {
    page: 'today',
    scale: 'day',
    sel: null,
    done: {},
    filter: 'all',
    week: L.semesters[0].current,
    calOffset: 0,
    objSel: null,
    noteSel: null,
    webSel: null
  };

  var svg = document.getElementById('dial-svg');
  var titleEl = document.getElementById('dial-title');
  var subEl = document.getElementById('dial-sub');
  var legendEl = document.getElementById('dial-legend');
  var relay = document.getElementById('relay');
  var peer = document.getElementById('peer');
  var dcTime = document.getElementById('dc-time');
  var dcLabel = document.getElementById('dc-label');
  var dcCount = document.getElementById('dc-count');
  var markSub = document.getElementById('mark-sub');
  var cmd = document.getElementById('cmd');
  var cmdInput = document.getElementById('cmd-input');
  var cmdList = document.getElementById('cmd-list');
  var help = document.getElementById('help');
  var noteEl = document.getElementById('note');
  var noteTimer = 0;
  var cmdRows = [], cmdIndex = 0;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var undo = null;
  var dust = null;

  var R = 400, C = 200, R_OUT = 172, R_IN = 104;
  var DAY_START = 6 * 60, DAY_END = 24 * 60;

  function ang(min) {
    // 06:00 在正上方（-90°），顺时针走到 24:00 回到上方
    var p = (min - DAY_START) / (DAY_END - DAY_START);
    return -90 + p * 360;
  }
  function pt(r, deg) {
    var rad = (deg * Math.PI) / 180;
    return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
  }
  function arc(rOut, rIn, a0, a1) {
    var large = (a1 - a0) > 180 ? 1 : 0;
    var p0 = pt(rOut, a0), p1 = pt(rOut, a1), p2 = pt(rIn, a1), p3 = pt(rIn, a0);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      ' A' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
      ' L' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2) +
      ' A' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + p3[0].toFixed(2) + ' ' + p3[1].toFixed(2) + ' Z';
  }

  function kindName(k) { return { task: '待办', plan: '计划', event: '事件', exam: '考试' }[k] || '事项'; }
  function objOf(id) { return L.objects.filter(function (o) { return o.id === id; })[0]; }
  function threadOf(k) { return L.threads[k] || '#d9a95c'; }
  function note(t) {
    noteEl.textContent = t;
    noteEl.classList.add('is-on');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { noteEl.classList.remove('is-on'); }, 2800);
  }

  /* ── 环 ───────────────────────────────────────────────── */

  function drawDial(segs, now) {
    var parts = [];
    // 轨道底
    parts.push('<circle cx="200" cy="200" r="' + ((R_OUT + R_IN) / 2) + '" fill="none" stroke="#2b3646" stroke-width="' + (R_OUT - R_IN) + '" opacity=".5"/>');
    // 刻度：每两小时一道；六点、十二点、十八点、二十四点加长
    for (var m = DAY_START; m <= DAY_END; m += 120) {
      var a = ang(m);
      var major = (m % 360 === 0) || m === DAY_START || m === DAY_END;
      var p0 = pt(R_OUT + 4, a), p1 = pt(R_OUT + (major ? 14 : 8), a);
      parts.push('<line x1="' + p0[0].toFixed(1) + '" y1="' + p0[1].toFixed(1) + '" x2="' + p1[0].toFixed(1) + '" y2="' + p1[1].toFixed(1) +
        '" stroke="#556277" stroke-width="' + (major ? 1.3 : .8) + '" opacity="' + (major ? .9 : .45) + '"/>');
      if (major && m % 360 === 0) {
        var lp = pt(R_OUT + 30, a);
        parts.push('<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 3.5).toFixed(1) + '" fill="#8b98a6" font-size="11" font-family="Cascadia Mono,Consolas,monospace" text-anchor="middle">' + pad(m / 60) + ':00</text>');
      }
    }

    // 扇区
    segs.forEach(function (s, i) {
      var a0 = ang(s.at), a1 = ang(Math.min(s.at + Math.max(s.dur, 12), DAY_END));
      var done = st.done[s.id] != null ? st.done[s.id] : s.done;
      var dim = done ? .45 : (s.at < now ? .72 : 1);
      var isSel = s.id === st.sel;
      parts.push('<g class="seg" data-seg="' + s.id + '" tabindex="0" role="button" aria-label="' + esc(s.title) + '">');
      parts.push('<path d="' + arc(R_OUT, R_IN, a0, a1) + '" fill="' + threadOf(s.thread) + '" opacity="' + (isSel ? .85 : .5 * dim) + '"/>');
      if (isSel) {
        parts.push('<path d="' + arc(R_OUT + 3, R_OUT + 1, a0, a1) + '" fill="' + threadOf(s.thread) + '" opacity=".95"/>');
        parts.push('<path d="' + arc(R_IN - 1, R_IN - 3, a0, a1) + '" fill="' + threadOf(s.thread) + '" opacity=".7"/>');
      }
      // 扇区里的小标签：够宽才放，且只放选中那一块，避免互相压
      if (isSel && (a1 - a0) > 20) {
        var mid = (a0 + a1) / 2, lp = pt((R_OUT + R_IN) / 2, mid);
        parts.push('<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 3).toFixed(1) +
          '" fill="#0b1017" font-size="9.5" font-weight="600" text-anchor="middle">' +
          esc(s.title.length > 6 ? s.title.slice(0, 6) + '…' : s.title) + '</text>');
      }
      parts.push('</g>');
    });

    // 指针：此刻
    var na = ang(Math.max(DAY_START, Math.min(DAY_END, now)));
    var n0 = pt(R_IN - 22, na), n1 = pt(R_OUT + 10, na);
    parts.push('<line x1="' + n0[0].toFixed(1) + '" y1="' + n0[1].toFixed(1) + '" x2="' + n1[0].toFixed(1) + '" y2="' + n1[1].toFixed(1) + '" stroke="#d9a95c" stroke-width="1.6" opacity=".9"/>');
    var nd = pt(R_OUT + 10, na);
    parts.push('<circle cx="' + nd[0].toFixed(1) + '" cy="' + nd[1].toFixed(1) + '" r="3.2" fill="#d9a95c"/>');

    svg.innerHTML = parts.join('');
  }

  /* ── 今天 ─────────────────────────────────────────────── */

  function buildToday() {
    var slips = L.todaySlips();
    var now = L.clockNow();
    if (!st.sel || !slips.some(function (s) { return s.id === st.sel; })) {
      st.sel = (slips.filter(function (s) { return s.at >= now; })[0] || slips[0] || {}).id;
    }
    return slips;
  }

  function renderToday() {
    var slips = buildToday();
    var now = L.clockNow();

    titleEl.textContent = '今天';
    subEl.textContent = L.weekdayName() + ' · 第 ' + st.week + ' 周';
    drawDial(slips, now);

    dcTime.textContent = hm(now);
    dcLabel.textContent = '此刻';
    var left = slips.filter(function (s) { return !(st.done[s.id] != null ? st.done[s.id] : s.done); }).length;
    dcCount.innerHTML = left + ' 件没走<br>' + slips.length + ' 件在环';

    legendEl.innerHTML = slips.slice(0, 8).map(function (s) {
      return '<span><i style="background:' + threadOf(s.thread) + '"></i>' +
        esc(s.title.length > 6 ? s.title.slice(0, 6) + '…' : s.title) + '</span>';
    }).join('');

    var s = slips.filter(function (x) { return x.id === st.sel; })[0] || slips[0];
    if (!s) {
      relay.innerHTML = '<div class="void"><h2>环上还空着</h2><p>今天没有排定的安排。从「事项」里挑一件放到环上。</p></div>';
      return;
    }
    var isDone = st.done[s.id] != null ? st.done[s.id] : s.done;
    var o = objOf(s.ref ? s.ref.objectId : '');
    relay.innerHTML = '<div class="slot">' +
      '<div class="slot-time"><b>' + hm(s.at) + '</b>' + (s.dur ? ' → ' + hm(s.at + s.dur) : '') + ' · ' + kindName(s.kind) + '</div>' +
      '<h2 class="slot-h' + (isDone ? ' is-done' : '') + '">' + esc(s.title) + '</h2>' +
      (s.goal ? '<p class="slot-body"><b>为什么：</b>' + esc(s.goal) + '</p>' : '') +
      (s.criteria ? '<p class="slot-body"><b>怎样算做好：</b>' + esc(s.criteria) + '</p>' : '') +
      (s.note ? '<p class="slot-body">' + esc(s.note) + '</p>' : '') +
      '<div class="slot-marks">' +
        (s.obj ? '<span class="tg th" style="--thread:' + threadOf(s.thread) + '">' + esc(s.obj) + '</span>' : '') +
        (s.source ? '<span class="tg">课次布置</span>' : '') +
        (s.phases.length ? '<span class="tg">阶段 ' + s.phases.filter(function (p) { return p.done; }).length + '/' + s.phases.length + '</span>' : '') +
        (s.slots.length ? '<span class="tg">执行 ' + s.slots.length + ' 段</span>' : '') +
      '</div>' +
      '<div class="slot-acts">' +
        '<button type="button" class="act act-prime" data-done="' + s.id + '">' + (isDone ? '取消' : '划掉') + '</button>' +
        '<button type="button" class="act" data-noop>安排时段</button>' +
        '<button type="button" class="act" data-noop>打开原记录</button>' +
      '</div>' +
      '</div>' +
      (s.phases.length ? '<div class="slot"><div class="slot-time">阶段</div>' +
        s.phases.map(function (p) {
          return '<p class="slot-body">' + (p.done ? '✓ ' : '· ') + esc(p.title) + '</p>';
        }).join('') + '</div>' : '');
  }

  /* ── 其它页 ───────────────────────────────────────────── */

  var PAGES_BTN = [
    ['today', '今天'], ['items', '事项'], ['courses', '课程'], ['calendar', '日历'],
    ['notes', '笔记'], ['objects', '对象'], ['web', '网页'], ['reminders', '提醒'],
    ['assistant', '助手'], ['chat', '群聊'], ['import', '导入'], ['plugins', '插件'], ['settings', '设置']
  ];

  function paintPeer() {
    peer.innerHTML = PAGES_BTN.filter(function (p) {
      var pg = PG.pages.filter(function (x) { return x.id === p[0]; })[0];
      return pg && (pg.core || PG.isOn(pg.owner));
    }).map(function (p) {
      return '<button type="button" data-go="' + p[0] + '"' + (p[0] === st.page ? ' aria-current="true"' : '') + '>' + p[1] + '</button>';
    }).join('');
  }

  function renderOther() {
    var page = st.page;
    drawMinimal(page);

    if (page === 'items') {
      var f = st.filter;
      titleEl.textContent = '事项';
      subEl.textContent = L.items.length + ' 件在册';
      dcTime.textContent = String(L.items.length);
      dcLabel.textContent = '在册';
      dcCount.innerHTML = L.items.filter(function (i) { return !i.done; }).length + ' 件没做完';

      var list = L.items.filter(function (i) { return f === 'all' || i.kind === f; });
      selectAux(list, st.sel2 || 'items');
      var pickId = st.sel2 && list.some(function (i) { return i.id === st.sel2; }) ? st.sel2 : (list[0] || {}).id;
      st.sel2 = pickId;

      relay.innerHTML = '<div class="peer" style="margin-bottom:14px">' +
        ['all', 'task', 'event', 'exam', 'plan'].map(function (k) {
          return '<button type="button" data-filter="' + k + '"' + (f === k ? ' aria-current="true"' : '') + '>' +
            (k === 'all' ? '全部' : kindName(k)) + ' ' +
            (k === 'all' ? L.items.length : L.items.filter(function (i) { return i.kind === k; }).length) + '</button>';
        }).join('') + '</div>' +
        '<div class="stack">' + list.map(function (it, i) {
          var o = objOf(it.objectId);
          var done = it.done;
          return '<button type="button" class="rowline" data-pick="' + it.id + '"' +
            (it.id === pickId ? ' aria-current="true"' : '') + '>' +
            '<span class="rn">' + pad(i + 1) + '</span>' +
            '<span class="rt2">' + esc(it.title) + '<small>' + esc(it.goal || '未写目的') +
            (o ? ' · ' + esc(o.name) : '') + '</small></span>' +
            '<span class="rd">' + (done ? '✓' : kindName(it.kind)) + '</span></button>';
        }).join('') + '</div>';
      return;
    }

    if (page === 'courses') {
      titleEl.textContent = '课程表';
      subEl.textContent = L.semesters[0].name + ' · 第 ' + st.week + ' 周';
      dcTime.textContent = String(L.courses.length);
      dcLabel.textContent = '门课';
      dcCount.innerHTML = L.semesters[0].weeks + ' 周 · ' + (st.week % 2 ? '单' : '双') + '周';
      drawCourseRing();
      relay.innerHTML = coursesTable();
      return;
    }

    if (page === 'calendar') {
      titleEl.textContent = (new Date().getMonth() + 1 + st.calOffset) + ' 月';
      subEl.textContent = '月';
      dcTime.textContent = String(new Date().getDate());
      dcLabel.textContent = '今天';
      dcCount.innerHTML = '月视图';
      drawMonthRing();
      relay.innerHTML = monthGrid();
      return;
    }

    if (page === 'notes') {
      titleEl.textContent = '笔记';
      subEl.textContent = L.notes.length + ' 则在册';
      drawOrdinal(L.notes.length);
      dcTime.textContent = String(L.notes.length);
      dcLabel.textContent = '则';
      dcCount.innerHTML = '五类用途';
      relay.innerHTML = '<div class="stack">' + L.notes.map(function (n, i) {
        var o = objOf(n.objectId);
        return '<button type="button" class="rowline" data-pick-note="' + n.id + '">' +
          '<span class="rn">' + pad(i + 1) + '</span>' +
          '<span class="rt2">' + esc(n.title || n.body.slice(0, 18) + '…') +
          '<small>' + esc(n.body.slice(0, 34)) + '…</small></span>' +
          '<span class="rd">' + esc(n.kind) + '</span></button>';
      }).join('') + '</div>';
      return;
    }

    if (page === 'objects') {
      titleEl.textContent = '对象';
      subEl.textContent = L.objects.length + ' 块';
      drawOrdinal(L.objects.length);
      dcTime.textContent = String(L.objects.length);
      dcLabel.textContent = '块';
      dcCount.innerHTML = L.items.length + ' 件关联';
      relay.innerHTML = '<div class="stack">' + L.objects.map(function (o, i) {
        var n = L.items.filter(function (x) { return x.objectId === o.id; }).length;
        return '<button type="button" class="rowline" data-pick-obj="' + o.id + '">' +
          '<span class="rn" style="color:' + threadOf(o.thread) + '">●</span>' +
          '<span class="rt2">' + esc(o.name) + '<small>' + esc(o.kind) + ' · ' + esc(o.goal || '未写目的') + '</small></span>' +
          '<span class="rd">' + n + ' 件</span></button>';
      }).join('') + '</div>';
      return;
    }

    if (page === 'web') {
      titleEl.textContent = '网页';
      subEl.textContent = L.captures.length + ' 条';
      drawOrdinal(L.captures.length);
      dcTime.textContent = String(L.captures.length);
      dcLabel.textContent = '条';
      dcCount.innerHTML = L.captures.filter(function (c) { return c.draft; }).length + ' 条待确认';
      relay.innerHTML = '<div class="stack">' + L.captures.map(function (c, i) {
        return '<div class="rowline" style="cursor:default">' +
          '<span class="rn">' + pad(i + 1) + '</span>' +
          '<span class="rt2">' + esc(c.title) + '<small>' + esc(c.url) + '</small></span>' +
          '<span class="rd">' + (c.draft ? '待确认' : '已整理') + '</span></div>';
      }).join('') + '</div>' +
      (L.captures[0] && L.captures[0].draft ? '<div class="slot" style="margin-top:18px"><div class="slot-time">待确认的行动</div>' +
        '<p class="slot-body">' + esc(L.captures[0].draft) + '</p></div>' : '');
      return;
    }

    if (page === 'reminders') {
      titleEl.textContent = '提醒';
      subEl.textContent = '三类';
      drawOrdinal(3);
      dcTime.textContent = String(L.reminders.length);
      dcLabel.textContent = '条';
      dcCount.innerHTML = '定时 / 静默 / 长期';
      relay.innerHTML = ['timed', 'silent', 'attention'].map(function (k, i) {
        var nm = { timed: '定时通知', silent: '今天的静默提示', attention: '长期注意' }[k];
        return '<div class="slot"><div class="slot-time">0' + (i + 1) + ' · ' + nm + '</div>' +
          L.reminders.filter(function (r) { return r.type === k; }).map(function (r) {
            return '<h3 class="slot-h" style="font-size:16px">' + esc(r.title) + '</h3>' +
              '<p class="slot-body">' + esc(r.at || r.until || '') + '</p>';
          }).join('') + '</div>';
      }).join('');
      return;
    }

    if (page === 'assistant') {
      var d = L.assistantDraft;
      titleEl.textContent = '助手';
      subEl.textContent = '一次草稿';
      drawOrdinal(d.steps.length);
      dcTime.textContent = String(d.steps.length);
      dcLabel.textContent = '步';
      dcCount.innerHTML = d.steps.filter(function (s) { return s.guessed; }).length + ' 步是推测';
      relay.innerHTML = '<div class="slot"><div class="slot-time">你说</div>' +
        '<p class="slot-body" style="font-size:15px;color:var(--ink)">' + esc(d.input) + '</p></div>' +
        d.steps.map(function (s, i) {
          return '<div class="slot"><div class="slot-time">第 ' + (i + 1) + ' 步' + (s.guessed ? ' · 推测' : '') + '</div>' +
            '<h2 class="slot-h" style="font-size:17px">' + esc(s.title) + '</h2>' +
            '<p class="slot-body">' + esc(s.time) + '</p></div>';
        }).join('') +
        '<div class="slot-acts" style="padding-bottom:20px"><button type="button" class="act act-prime" data-noop>就这样写进去</button>' +
        '<button type="button" class="act" data-noop>全部改一遍</button></div>';
      return;
    }

    if (page === 'chat') {
      titleEl.textContent = '群消息';
      subEl.textContent = '挂起';
      drawOrdinal(3);
      dcTime.textContent = '—';
      dcLabel.textContent = '挂起';
      dcCount.innerHTML = '界面在，开关不生效';
      relay.innerHTML = '<div class="void"><h2>挂起中</h2><p>正式版本里它不注册命令、不建任务、不读消息。下面是接通后的样子，仅示意。</p></div>' +
        [['班级群', '本周五实验课调到周四 5-6 节'], ['导师', '中期检查下周三，提前两天发材料'], ['项目组', '今晚八点停机一小时']]
          .map(function (m) {
            return '<div class="slot"><div class="slot-time">' + m[0] + '</div><h2 class="slot-h" style="font-size:16px">' + esc(m[1]) + '</h2></div>';
          }).join('');
      return;
    }

    if (page === 'import') {
      titleEl.textContent = '导入';
      subEl.textContent = '依赖课程表';
      drawOrdinal(6);
      dcTime.textContent = '6';
      dcLabel.textContent = '步';
      dcCount.innerHTML = PG.isOn('course-import') ? '已开启' : '默认关闭';
      relay.innerHTML = PG.isOn('course-import')
        ? '<div class="slot"><div class="slot-time">六个步骤</div><p class="slot-body">选择入口 · 手动登录 · 核对课表 · 合并或新建 · 写入切周次 · 备选 CSV。账号密码不经过几微。</p></div>'
        : '<div class="void"><h2>默认关闭</h2><p>这个插件默认不开。到「插件」里打开，或直接开它的页。</p></div>';
      return;
    }

    if (page === 'plugins') {
      titleEl.textContent = '插件';
      subEl.textContent = PG.onCount() + ' / 10 在册';
      drawOrdinal(PG.onCount());
      dcTime.textContent = String(PG.onCount());
      dcLabel.textContent = '在用';
      dcCount.innerHTML = PG.list.length + ' 个插件';
      relay.innerHTML = '<div class="stack">' + PG.list.map(function (p, i) {
        var on = !!PG.state[p.id];
        var blocked = p.requires && !PG.state[p.requires];
        return '<button type="button" class="rowline" data-plug="' + p.id + '"' + (on && !blocked ? '' : ' style="opacity:.6"') + '>' +
          '<span class="rn">' + (on && !blocked ? '●' : '○') + '</span>' +
          '<span class="rt2">' + esc(p.name) + (p.suspended ? ' · 挂起' : '') + (p.missing ? ' · 未实装' : '') +
          '<small>' + esc(p.desc) + '</small></span>' +
          '<span class="rd">' + (blocked ? '待依赖' : (on ? '开' : '关')) + '</span></button>';
      }).join('') + '</div>';
      return;
    }

    if (page === 'settings') {
      titleEl.textContent = '设置';
      subEl.textContent = '环时';
      drawOrdinal(4);
      dcTime.textContent = '4';
      dcLabel.textContent = '项';
      dcCount.innerHTML = '外观 / 布局 / 数据 / 开发者';
      relay.innerHTML = '<div class="slot"><div class="slot-time">01 · 外观</div><h2 class="slot-h" style="font-size:17px">环时专用</h2>' +
        '<p class="slot-body">墨蓝底、细白线、暖金指针。这个骨架只有这一套外观——环的形状本身就是设计。</p></div>' +
        '<div class="slot"><div class="slot-time">02 · 尺度</div><h2 class="slot-h" style="font-size:17px">日 / 周 / 月</h2>' +
        '<p class="slot-body">底部那三条线切换环的粒度：一天、一周、一个月各画一个环。</p></div>' +
        '<div class="slot"><div class="slot-time">03 · 数据</div><h2 class="slot-h" style="font-size:17px">本地文件</h2>' +
        '<p class="slot-body">workspace.json · 184 KB · 备份 3 份。</p></div>' +
        '<div class="slot"><div class="slot-time">04 · 开发者</div><h2 class="slot-h" style="font-size:17px">默认关闭</h2>' +
        '<p class="slot-body">普通页面不显示运行时与 IPC 诊断。</p></div>';
      return;
    }

    relay.innerHTML = '<div class="void"><h2>这一页还没有做</h2></div>';
  }

  function selectAux(list, key) { /* 仅占位 */ }

  /* 别的页，环退成一条细线 + 数量 */
  function drawMinimal(page) {
    var parts = [];
    parts.push('<circle cx="200" cy="200" r="138" fill="none" stroke="#2b3646" stroke-width="1"/>');
    parts.push('<circle cx="200" cy="200" r="104" fill="none" stroke="#2b3646" stroke-width="1" opacity=".5"/>');
    for (var a = 0; a < 360; a += 15) {
      var p0 = pt(138, a), p1 = pt(a % 90 === 0 ? 130 : 133, a);
      parts.push('<line x1="' + p0[0].toFixed(1) + '" y1="' + p0[1].toFixed(1) + '" x2="' + p1[0].toFixed(1) + '" y2="' + p1[1].toFixed(1) +
        '" stroke="#556277" stroke-width=".8" opacity="' + (a % 90 === 0 ? .8 : .32) + '"/>');
    }
    svg.innerHTML = parts.join('');
    legendEl.innerHTML = '';
  }
  function drawOrdinal(n) { drawMinimal('x'); }

  function drawCourseRing() {
    var parts = [];
    var now = L.clockNow();
    L.courses.forEach(function (c) {
      var p0 = L.toMin(L.periods[c.p0 - 1].s), p1 = L.toMin(L.periods[c.p1 - 1].e);
      parts.push('<path d="' + arc(R_OUT, R_IN, ang(p0), ang(Math.min(p1, DAY_END)) + 1) + '" fill="' + threadOf(c.thread) + '" opacity=".3"/>');
    });
    var na = ang(Math.max(DAY_START, Math.min(DAY_END, now)));
    var n0 = pt(R_IN - 22, na), n1 = pt(R_OUT + 10, na);
    parts.push('<line x1="' + n0[0].toFixed(1) + '" y1="' + n0[1].toFixed(1) + '" x2="' + n1[0].toFixed(1) + '" y2="' + n1[1].toFixed(1) + '" stroke="#d9a95c" stroke-width="1.6"/>');
    for (var m = DAY_START; m <= DAY_END; m += 120) {
      var a = ang(m), p = pt(R_OUT + 8, a);
      parts.push('<line x1="' + pt(R_OUT + 3, a)[0].toFixed(1) + '" y1="' + pt(R_OUT + 3, a)[1].toFixed(1) +
        '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="#556277" stroke-width=".8" opacity=".5"/>');
    }
    svg.innerHTML = parts.join('');
    legendEl.innerHTML = L.courses.slice(0, 7).map(function (c) {
      return '<span><i style="background:' + threadOf(c.thread) + '"></i>' + esc(c.title) + '</span>';
    }).join('');
  }

  function drawMonthRing() {
    var parts = [];
    parts.push('<circle cx="200" cy="200" r="138" fill="none" stroke="#2b3646" stroke-width="1"/>');
    var days = 30;
    for (var d = 1; d <= days; d++) {
      var a = -90 + (d / days) * 360;
      var p = pt(138, a);
      var today = d === new Date().getDate() && st.calOffset === 0;
      parts.push('<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (today ? 3.4 : 2.2) + '" fill="' + (today ? '#d9a95c' : '#556277') + '" opacity="' + (today ? 1 : .7) + '"/>');
      if (d % 5 === 0) {
        var lp = pt(120, a);
        parts.push('<text x="' + lp[0].toFixed(1) + '" y="' + (lp[1] + 3).toFixed(1) + '" fill="#73828f" font-size="9" text-anchor="middle" font-family="Cascadia Mono,Consolas,monospace">' + d + '</text>');
      }
    }
    svg.innerHTML = parts.join('');
    legendEl.innerHTML = '<span><i style="background:#d9a95c"></i>今天</span><span><i style="background:#556277"></i>这个月</span>';
  }

  function coursesTable() {
    var today = new Date().getDay() || 7;
    var odd = st.week % 2 === 1;
    var vis = L.courses.filter(function (c) {
      var s = c.weeks.indexOf('单') >= 0, d = c.weeks.indexOf('双') >= 0;
      if (s && !d) return odd;
      if (d && !s) return !odd;
      return true;
    });
    var head = '<tr><th></th>' + ['一', '二', '三', '四', '五', '六', '日'].map(function (d2, i) {
      return '<th style="' + (i + 1 === today ? 'color:var(--gold)' : '') + '">' + d2 + '</th>';
    }).join('') + '</tr>';
    var rows = '';
    for (var n = 1; n <= 10; n++) {
      var p = L.periods[n - 1];
      rows += '<tr><td class="hr">' + p.s + '<br>' + p.e + '</td>';
      for (var d = 1; d <= 7; d++) {
        var cell = vis.filter(function (c) { return c.day === d && c.p0 === n; });
        rows += '<td class="' + (d === today ? 'is-today' : '') + '" style="height:36px">';
        cell.forEach(function (c) {
          rows += '<button type="button" class="crs" data-noop style="--thread:' + threadOf(c.thread) + '">' +
            '<b>' + esc(c.title) + '</b><span>' + esc(c.room) + '</span></button>';
        });
        rows += '</td>';
      }
      rows += '</tr>';
    }
    return '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">' +
      '<button type="button" class="act" data-week="-1">‹ 上一周</button>' +
      '<span class="tg" style="height:26px;display:inline-flex;align-items:center;padding:0 10px">第 ' + st.week + ' 周 · ' + (odd ? '单' : '双') + '</span>' +
      '<button type="button" class="act" data-week="1">下一周 ›</button></div>' +
      '<table class="tbl"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
  }

  function monthGrid() {
    var now = new Date();
    var base = new Date(now.getFullYear(), now.getMonth() + st.calOffset, 1);
    var y = base.getFullYear(), m = base.getMonth();
    var startDow = (base.getDay() + 6) % 7;
    var days = new Date(y, m + 1, 0).getDate();
    var cells = [];
    for (var i = 0; i < startDow; i++) cells.push({ out: true });
    for (var d = 1; d <= days; d++) cells.push({ n: d });
    while (cells.length % 7) cells.push({ out: true });

    var dow = ['一', '二', '三', '四', '五', '六', '日'].map(function (x) { return '<div class="mday" style="text-align:center;color:var(--ink-3)">' + x + '</div>'; }).join('');
    var body = cells.map(function (c) {
      var isToday = !c.out && st.calOffset === 0 && c.n === now.getDate();
      var mk = c.out ? '' : L.items.filter(function (it) {
        return (it.anchor.type === 'weekly' && (it.anchor.weekdays || []).indexOf(c.n % 7) >= 0) ||
          (it.anchor.type === 'deadline' && it.anchor.date === 'today' && c.n === now.getDate());
      }).slice(0, 2).map(function (it) { return '<s>' + esc(it.title.slice(0, 5)) + '</s>'; }).join('');
      return '<div class="mday' + (c.out ? ' is-out' : '') + (isToday ? ' is-today' : '') + '">' +
        '<b>' + (c.out ? '' : c.n) + '</b>' + mk + '</div>';
    }).join('');

    return '<div style="display:flex;gap:6px;margin-bottom:10px">' +
      '<button type="button" class="act" data-month="-1">‹</button>' +
      '<span class="tg" style="height:26px;display:inline-flex;align-items:center;padding:0 10px">' + y + ' 年 ' + (m + 1) + ' 月</span>' +
      '<button type="button" class="act" data-month="1">›</button></div>' +
      '<div class="months">' + dow + body + '</div>';
  }

  /* ── 路由 ─────────────────────────────────────────────── */

  function paint() {
    paintPeer();
    var pg = PG.pages.filter(function (p) { return p.id === st.page; })[0];
    // 只有「能注册却没注册」才算被关；挂起 / 未实装的插件仍然要能开，用来解释它为什么不可用
    var susp = pg && PG.list.filter(function (x) { return x.id === pg.owner; })[0];
    var off = pg && !(pg.core || PG.isOn(pg.owner)) && !(susp && (susp.suspended || susp.missing)) && !(pg && pg.owner === 'course-import');
    if (off) {
      relay.innerHTML = '<div class="void"><h2>' + esc(pg.name) + ' · 已关闭</h2>' +
        '<p>它的页面、命令和位置都一起消失了。到「插件」里再打开就能回来。</p></div>';
      titleEl.textContent = pg.name + ' · 已关闭';
      subEl.textContent = pg.owner;
      drawMinimal('closed');
      dcTime.textContent = '—';
      dcLabel.textContent = '关';
      dcCount.innerHTML = '';
      markSub.textContent = '第 ' + st.week + ' 周';
      return;
    }
    if (st.page === 'today') renderToday();
    else renderOther();
    markSub.textContent = '第 ' + st.week + ' 周 · ' + L.weekdayName();
    document.body.dataset.page = st.page;
    if (location.hash.slice(1) !== st.page) history.replaceState(null, '', '#' + st.page);
  }

  function go(id) {
    if (!id || id === st.page) { paint(); return; }
    var pg = PG.pages.filter(function (p) { return p.id === id; })[0];
    if (!pg) return;
    var reduce2 = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce2) { st.page = id; paint(); return; }
    // 转场：环收拢再展开
    var dial = document.querySelector('.dial');
    dial.style.transition = 'transform .42s cubic-bezier(.16,1,.3,1), opacity .42s';
    dial.style.transform = 'scale(.94)';
    dial.style.opacity = '0';
    setTimeout(function () {
      st.page = id;
      paint();
      dial.style.transition = 'none';
      dial.style.transform = 'scale(1.04)';
      requestAnimationFrame(function () {
        dial.style.transition = 'transform .62s cubic-bezier(.16,1,.3,1), opacity .5s';
        dial.style.transform = 'none';
        dial.style.opacity = '1';
      });
    }, 440);
  }

  /* ── 划掉 ─────────────────────────────────────────────── */
  function toggleDone(id) {
    var s = L.todaySlips().filter(function (x) { return x.id === id; })[0];
    var it = L.items.filter(function (x) { return x.id === id; })[0];
    var before = st.done[id] != null ? st.done[id] : (s ? s.done : (it ? it.done : false));
    st.done[id] = !before;
    undo = { id: id, before: before };
    if (s) s.done = !before;
    if (it) it.done = !before;
    paint();
    note(before ? '又放回来了' : '划掉了 · Ctrl Z 可撤回');
  }

  /* ── 命令 ─────────────────────────────────────────────── */
  function src() {
    var out = PG.visible().map(function (p) { return { own: '页', name: p.name, run: function () { go(p.id); } }; });
    L.items.forEach(function (it) { out.push({ own: '事项', name: it.title, run: function () { go('items'); } }); });
    L.objects.forEach(function (o) { out.push({ own: '对象', name: o.name, run: function () { go('objects'); } }); });
    PG.list.forEach(function (p) {
      if (p.suspended || p.missing) return;
      var on = !!PG.state[p.id];
      out.push({ own: '插件', name: (on ? '关掉 ' : '打开 ') + p.name, run: function () { power(p.id, !on); } });
    });
    return out;
  }
  function paintCmd(q) {
    q = (q || '').trim().toLowerCase();
    var all = src();
    cmdRows = q ? all.filter(function (r) { return (r.own + r.name).toLowerCase().indexOf(q) >= 0; }).slice(0, 9) : all.slice(0, 8);
    cmdIndex = 0;
    cmdList.innerHTML = cmdRows.length ? cmdRows.map(function (r, i) {
      return '<li class="ci' + (i === 0 ? ' is-on' : '') + '" data-i="' + i + '"><span class="own">' + esc(r.own) + '</span>' + esc(r.name) + '</li>';
    }).join('') : '<li class="ci" style="color:var(--ink-3)">环上没有这一项。</li>';
  }
  function openCmd() { cmd.classList.add('is-on'); cmd.removeAttribute('inert'); cmdInput.value = ''; paintCmd(''); setTimeout(function () { cmdInput.focus(); }, 30); }
  function closeCmd() { cmd.classList.remove('is-on'); cmd.setAttribute('inert', ''); }
  function runCmd() { var r = cmdRows[cmdIndex]; if (!r) return; closeCmd(); r.run(); }

  function power(id, on) {
    var p = PG.list.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (p.suspended) { note('「' + p.name + '」挂起'); return; }
    if (p.missing) { note('「' + p.name + '」未实装'); return; }
    PG.set(id, on);
    var here = PG.pages.filter(function (x) { return x.id === st.page; })[0];
    var susp = here && PG.list.filter(function (x) { return x.id === here.owner; })[0];
    if (here && !(here.core || PG.isOn(here.owner)) && !(susp && (susp.suspended || susp.missing)) && !(pg && pg.owner === 'course-import')) st.page = 'today';
    paint();
    note('「' + p.name + '」' + (on ? '已打开' : '已关掉'));
  }

  /* ── 事件 ─────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-seg],[data-done],[data-filter],[data-pick],[data-plug],[data-week],[data-month],[data-scale],[data-noop]');
    if (!t) return;
    if (t.dataset.noop !== undefined) { note('这一处在候选稿里没有接行为'); return; }
    if (t.dataset.go) { go(t.dataset.go); return; }
    if (t.dataset.seg) { st.sel = t.dataset.seg; paint(); return; }
    if (t.dataset.done) { toggleDone(t.dataset.done); return; }
    if (t.dataset.filter) { st.filter = t.dataset.filter; paint(); return; }
    if (t.dataset.pick) { st.sel2 = t.dataset.pick; paint(); return; }
    if (t.dataset.plug) { var p = PG.list.filter(function (x) { return x.id === t.dataset.plug; })[0]; if (p) power(p.id, !PG.state[p.id]); return; }
    if (t.dataset.week) { st.week = Math.max(1, Math.min(20, st.week + (+t.dataset.week))); paint(); return; }
    if (t.dataset.month) { st.calOffset += (+t.dataset.month); paint(); return; }
    if (t.dataset.scale) {
      st.scale = t.dataset.scale;
      Array.prototype.forEach.call(document.querySelectorAll('#scales button'), function (b) {
        b.setAttribute('aria-current', String(b.dataset.scale === st.scale));
      });
      if (st.scale === 'day') { st.page = 'today'; }
      else if (st.scale === 'week') { st.page = 'courses'; }
      else { st.page = 'calendar'; }
      paint();
      return;
    }
  });

  // 环上的扇区：键盘也能选
  svg.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var seg = e.target.closest('[data-seg]');
    if (seg) { e.preventDefault(); st.sel = seg.dataset.seg; paint(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (cmd.classList.contains('is-on')) { closeCmd(); return; }
      if (help.classList.contains('is-on')) { help.classList.remove('is-on'); help.setAttribute('inert', ''); return; }
      return;
    }
    if (cmd.classList.contains('is-on')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdIndex = (cmdIndex + 1) % Math.max(1, cmdRows.length); Array.prototype.forEach.call(cmdList.children, function (el, i) { el.classList.toggle('is-on', i === cmdIndex); }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdIndex = (cmdIndex - 1 + cmdRows.length) % Math.max(1, cmdRows.length); Array.prototype.forEach.call(cmdList.children, function (el, i) { el.classList.toggle('is-on', i === cmdIndex); }); return; }
      if (e.key === 'Enter') { e.preventDefault(); runCmd(); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (!undo) return;
      e.preventDefault();
      st.done[undo.id] = undo.before;
      var s = L.todaySlips().filter(function (x) { return x.id === undo.id; })[0];
      var it = L.items.filter(function (x) { return x.id === undo.id; })[0];
      if (s) s.done = undo.before;
      if (it) it.done = undo.before;
      undo = null; paint(); note('已撤回'); return;
    }
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    if (e.key === '?') { e.preventDefault(); help.classList.add('is-on'); help.removeAttribute('inert'); return; }
    if (st.page === 'today' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      var slips = L.todaySlips();
      var i = slips.map(function (x) { return x.id; }).indexOf(st.sel);
      if (i < 0) i = 0;
      e.preventDefault();
      st.sel = slips[(i + (e.key === 'ArrowRight' ? 1 : slips.length - 1)) % slips.length].id;
      paint();
      return;
    }
    if (e.key === ' ') {
      if (st.page === 'today' && st.sel) { e.preventDefault(); toggleDone(st.sel); }
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { openCmd(); return; }
  });

  document.getElementById('cmd-open').addEventListener('click', openCmd);
  document.getElementById('help-open').addEventListener('click', function () { help.classList.add('is-on'); help.removeAttribute('inert'); });
  document.getElementById('help-close').addEventListener('click', function () { help.classList.remove('is-on'); help.setAttribute('inert', ''); });
  cmd.addEventListener('click', function (e) {
    if (e.target === cmd) { closeCmd(); return; }
    var li = e.target.closest('.ci[data-i]');
    if (li) { cmdIndex = +li.dataset.i; runCmd(); }
  });
  cmdInput.addEventListener('input', function () { paintCmd(cmdInput.value); });

  window.addEventListener('hashchange', function () {
    var id = location.hash.slice(1);
    if (id && id !== st.page && PG.pages.some(function (p) { return p.id === id; })) { st.page = id; paint(); }
  });

  /* ── 起手 ─────────────────────────────────────────────── */
  var start = location.hash.slice(1);
  if (PG.pages.some(function (p) { return p.id === start; })) st.page = start;
  paint();

  if (!reduce.matches) dust = L.installDust({ count: 13, tint: 'rgba(217,169,92,' });
  reduce.addEventListener('change', function () {
    if (dust) { dust.dispose(); dust = null; }
    if (!reduce.matches) dust = L.installDust({ count: 13, tint: 'rgba(217,169,92,' });
  });

  setInterval(function () {
    if (st.page === 'today') renderToday();
  }, 60000);
})(window);
