/* 书页 · 交互
   左页：这一章的全貌（索引）。右页：正在读的那一页。
   翻章有一页纸扫过去；点左页的索引，右页换那一页。 */

(function (global) {
  'use strict';
  var L = global.Lab, PG = global.Plugs;
  var esc = L.esc, hm = L.hm, pad = L.pad;

  var st = {
    page: 'today',
    sel: {},          // 每章当前选中的那一条
    done: {},
    week: L.semesters[0].current,
    parity: 'all',
    filter: 'all',
    calOffset: 0
  };

  var left = document.getElementById('leaf-l');
  var right = document.getElementById('leaf-r');
  var tabs = document.getElementById('tabs');
  var turn = document.getElementById('turn');
  var folioL = document.getElementById('folio-l');
  var folioR = document.getElementById('folio-r');
  var folioMid = document.getElementById('folio-mid');
  var cmd = document.getElementById('cmd');
  var cmdInput = document.getElementById('cmd-input');
  var cmdList = document.getElementById('cmd-list');
  var help = document.getElementById('help');
  var noteEl = document.getElementById('note');
  var noteTimer = 0;
  var cmdRows = [], cmdIndex = 0, cmdOn = false;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var undo = null;
  var dust = null;

  /* ── 小字 ─────────────────────────────────────────────── */
  function kindName(k) { return { task: '待办', plan: '计划', event: '事件', exam: '考试' }[k] || '事项'; }
  function objOf(id) { return L.objects.filter(function (o) { return o.id === id; })[0]; }
  function threadOf(key) { return L.threads[key] || '#7a7261'; }
  function note(text) {
    noteEl.textContent = text;
    noteEl.classList.add('is-on');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { noteEl.classList.remove('is-on'); }, 2800);
  }

  /* ── 书脊：章 ─────────────────────────────────────────── */
  function paintTabs() {
    tabs.innerHTML = PG.visible().map(function (p) {
      return '<button type="button" class="tab" data-go="' + p.id + '"' +
        (p.id === st.page ? ' aria-current="page"' : '') + '>' +
        PG.icon(p.icon, 14) + '<span>' + esc(p.name) + '</span></button>';
    }).join('');
  }

  /* ── 每章：左页索引 + 右页正文 ─────────────────────────── */

  var CHAPTERS = {

    today: {
      title: '今天', sub: '把已开启功能里的今日安排按时间叠在一页上。',
      build: function () {
        var slips = L.todaySlips();
        var now = L.clockNow();
        var sel = st.sel.today || (slips.filter(function (s) { return s.at >= now; })[0] || slips[0] || {}).id;
        if (!st.sel.today) st.sel.today = sel;

        var index = slips.map(function (s, i) {
          var done = st.done[s.id] != null ? st.done[s.id] : s.done;
          return '<button type="button" class="ix" data-pick="' + s.id + '"' +
            (s.id === sel ? ' aria-current="true"' : '') + '>' +
            '<span class="ix-n">' + pad(i + 1) + '</span>' +
            '<span class="ix-t">' + esc(s.title) +
              '<small>' + (s.goal || s.note || '') + '</small></span>' +
            '<span class="ix-d">' + hm(s.at) + (done ? ' · 已划' : '') + '</span></button>';
        }).join('');

        var done = slips.filter(function (s) { return st.done[s.id] != null ? st.done[s.id] : s.done; }).length;
        var lede = '<p class="lede"><b>' + slips.length + '</b> 件安排在册，已划掉 <b>' + done + '</b> 件。<em>' +
          hm(now) + '</em> 这一刻，' +
          (slips.filter(function (s) { return s.at >= now && !(st.done[s.id] != null ? st.done[s.id] : s.done); }).length
            ? '还剩 <b>' + slips.filter(function (s) { return s.at >= now && !(st.done[s.id] != null ? st.done[s.id] : s.done); }).length + '</b> 件没走。'
            : '今天的都走完了。') + '</p>';

        return {
          left: kicks('今天', L.weekdayName() + ' · 第 ' + st.week + ' 周') +
            '<h1 class="chap-title">今天</h1><p class="chap-sub">点左栏任一条，右页翻到那一页。</p>' +
            lede + '<ul class="index">' + (index || '<li class="chap-foot">今天没有安排。</li>') + '</ul>' +
            chapFoot([['安排', slips.length], ['已划', done], ['剩', slips.length - done]]),
          right: function () {
            var s = slips.filter(function (x) { return x.id === st.sel.today; })[0] || slips[0];
            if (!s) return '<div class="page-head"><h2>今天</h2><small>空白页</small></div><p class="entry-body">没有安排。</p>';
            var isDone = st.done[s.id] != null ? st.done[s.id] : s.done;
            var o = L.objects.filter(function (x) { return x.name === s.obj; })[0];
            return '<div class="page-head"><h2>' + esc(s.title) + '</h2><small>' + hm(s.at) +
              (s.dur ? ' – ' + hm(s.at + s.dur) : '') + '</small></div>' +
              '<div class="entry">' +
                '<div class="entry-time"><b>' + (s.dur ? s.dur + ' 分钟' : '节点') + '</b> · ' + (s.source ? '课次布置' : '手动记录') + '</div>' +
                (s.goal ? '<p class="entry-body"><b>为什么：</b>' + esc(s.goal) + '</p>' : '') +
                (s.criteria ? '<p class="entry-body"><b>怎样算做好：</b>' + esc(s.criteria) + '</p>' : '') +
                (s.note ? '<p class="entry-body">' + esc(s.note) + '</p>' : '') +
                '<div class="entry-marks">' +
                  '<span class="mark">' + kindName(s.kind) + '</span>' +
                  (o ? '<span class="mark thread" style="--thread:' + threadOf(o.thread) + '">' + esc(o.name) + '</span>' : '') +
                  (s.phases.length ? '<span class="mark">阶段 ' + s.phases.filter(function (p) { return p.done; }).length + '/' + s.phases.length + '</span>' : '') +
                  (s.slots.length ? '<span class="mark">执行 ' + s.slots.length + ' 段</span>' : '') +
                '</div>' +
                '<div class="entry-acts">' +
                  '<button type="button" class="tick tick-prime" data-done="' + s.id + '">' + (isDone ? '取消划线' : '划掉') + '</button>' +
                  (s.slots.length ? '<button type="button" class="tick" data-noop>看执行时段</button>' : '') +
                '</div>' +
              '</div>' +
              (s.phases.length ? '<div class="marginalia"><b>阶段</b>' +
                s.phases.map(function (p) { return (p.done ? '✓ ' : '· ') + esc(p.title); }).join('<br>') + '</div>' : '');
          }
        };
      }
    },

    items: {
      title: '事项', sub: '待办、事件、考试与计划。每条都带目标与完成标准。',
      build: function () {
        var f = st.filter;
        var items = L.items.filter(function (i) { return f === 'all' || i.kind === f; });
        var counts = { all: L.items.length };
        ['task', 'event', 'exam', 'plan'].forEach(function (k) {
          counts[k] = L.items.filter(function (i) { return i.kind === k; }).length;
        });
        var sel = st.sel.items || items[0].id;
        st.sel.items = sel;

        var index = items.map(function (it, i) {
          var o = objOf(it.objectId);
          var done = st.done[it.id] != null ? st.done[it.id] : it.done;
          return '<button type="button" class="ix" data-pick="' + it.id + '"' +
            (it.id === sel ? ' aria-current="true"' : '') + '>' +
            '<span class="ix-n">' + pad(i + 1) + '</span>' +
            '<span class="ix-t">' + esc(it.title) + '<small>' + esc(it.goal || '未写目的') + '</small></span>' +
            '<span class="ix-d">' + kindName(it.kind) + '</span></button>';
        }).join('');

        var filterRow = '<div class="chapter-kicker" style="border:0;padding:0;margin-bottom:8px;flex-wrap:wrap;gap:6px">' +
          ['all', 'task', 'event', 'exam', 'plan'].map(function (k) {
            var label = k === 'all' ? '全部 ' + counts.all : kindName(k) + ' ' + counts[k];
            return '<button type="button" class="mark" data-filter="' + k + '" style="cursor:default;' +
              (f === k ? 'border-color:var(--accent);color:var(--accent)' : '') + '">' + label + '</button>';
          }).join('') + '</div>';

        return {
          left: kicks('事项', PG.onCount() + ' 个插件在册') +
            '<h1 class="chap-title">事项</h1><p class="chap-sub">按类型筛，点条目翻到右页读全文。</p>' +
            filterRow + '<ul class="index">' + index + '</ul>' +
            chapFoot([['在册', L.items.length], ['未完成', L.items.filter(function (i) { return !i.done; }).length]]),
          right: function () {
            var it = L.items.filter(function (x) { return x.id === st.sel.items; })[0] || items[0];
            if (!it) return '<div class="page-head"><h2>事项</h2></div><p class="entry-body">这个筛选下没有。</p>';
            var o = objOf(it.objectId);
            var done = st.done[it.id] != null ? st.done[it.id] : it.done;
            var anchor = describe(it.anchor);
            return '<div class="page-head"><h2>' + esc(it.title) + '</h2><small>' + kindName(it.kind) + '</small></div>' +
              '<div class="entry">' +
                '<div class="entry-time">' + esc(anchor) + '</div>' +
                '<h3 class="entry-h' + (done ? ' is-done' : '') + '">' + esc(it.title) + '</h3>' +
                (it.goal ? '<p class="entry-body"><b>为什么：</b>' + esc(it.goal) + '</p>' : '') +
                (it.completionCriteria ? '<p class="entry-body"><b>怎样算做好：</b>' + esc(it.completionCriteria) + '</p>' : '') +
                (it.note ? '<p class="entry-body">' + esc(it.note) + '</p>' : '') +
                '<div class="entry-marks">' +
                  (o ? '<span class="mark thread" style="--thread:' + threadOf(o.thread) + '">' + esc(o.name) + '</span>' : '') +
                  (it.phases && it.phases.length ? '<span class="mark">阶段 ' + it.phases.filter(function (p) { return p.done; }).length + '/' + it.phases.length + '</span>' : '') +
                  (it.slots && it.slots.length ? '<span class="mark">执行 ' + it.slots.length + ' 段</span>' : '') +
                '</div>' +
                '<div class="entry-acts"><button type="button" class="tick tick-prime" data-done="' + it.id + '">' + (done ? '重新打开' : '划掉') + '</button>' +
                '<button type="button" class="tick" data-noop>安排时段</button></div>' +
              '</div>' +
              (it.phases && it.phases.length ? '<div class="marginalia"><b>阶段</b>' +
                it.phases.map(function (p) { return (p.done ? '✓ ' : '· ') + esc(p.title); }).join('<br>') + '</div>' : '');
          }
        };
      }
    },

    courses: {
      title: '课程表', sub: '周次、单双周、连堂。调课会同时改这里和今天。',
      build: function () {
        var today = new Date().getDay() || 7;
        var odd = st.week % 2 === 1;
        var visible = L.courses.filter(function (c) {
          if (st.parity === 'all') return true;
          var s = c.weeks.indexOf('单') >= 0, d = c.weeks.indexOf('双') >= 0;
          if (s && !d) return odd;
          if (d && !s) return !odd;
          return true;
        });
        var sel = st.sel.courses || L.courses[0].id;
        st.sel.courses = sel;

        return {
          left: kicks('课程表', L.semesters[0].name + ' · ' + L.semesters[0].weeks + ' 周') +
            '<h1 class="chap-title">课程表</h1><p class="chap-sub">' +
            (odd ? '单周' : '双周') + '，第 ' + st.week + ' 周。点左边的课，右页给这门课的详情。</p>' +
            '<div class="chapter-kicker" style="border:0;padding:0;margin-bottom:10px;gap:6px;flex-wrap:wrap;display:flex">' +
              '<button type="button" class="mark" data-week="-1">‹ 上一周</button>' +
              '<button type="button" class="mark" style="border-color:var(--accent);color:var(--accent)">第 ' + st.week + ' 周</button>' +
              '<button type="button" class="mark" data-week="1">下一周 ›</button>' +
              ['all', 'odd', 'even'].map(function (k) {
                return '<button type="button" class="mark" data-parity="' + k + '" style="' +
                  (st.parity === k ? 'border-color:var(--accent);color:var(--accent)' : '') + '">' +
                  (k === 'all' ? '全部' : (k === 'odd' ? '单周' : '双周')) + '</button>';
              }).join('') +
            '</div>' +
            '<ul class="index">' + visible.map(function (c, i) {
              return '<button type="button" class="ix" data-pick="' + c.id + '"' +
                (c.id === sel ? ' aria-current="true"' : '') + '>' +
                '<span class="ix-n">' + pad(i + 1) + '</span>' +
                '<span class="ix-t">' + esc(c.title) + '<small>' + esc(c.teacher) + ' · ' + esc(c.room) + '</small></span>' +
                '<span class="ix-d">周' + '一二三四五六日'[c.day - 1] + '</span></button>';
            }).join('') + '</ul>' +
            chapFoot([['这门课表', visible.length + ' 门'], ['本周', (odd ? '单' : '双') + '周']]),
          right: function () {
            var c = L.courses.filter(function (x) { return x.id === st.sel.courses; })[0] || L.courses[0];
            var p0 = L.periods[c.p0 - 1], p1 = L.periods[c.p1 - 1];
            return '<div class="page-head"><h2>' + esc(c.title) + '</h2><small>第 ' + c.p0 + '–' + c.p1 + ' 节</small></div>' +
              '<table class="grid-table" style="margin-bottom:18px">' +
              '<tbody><tr><td class="cell-hour">时间</td><td style="padding:8px 10px;font-size:12px">' +
              p0.s + '–' + p1.e + ' · 周' + '一二三四五六日'[c.day - 1] + '</td></tr>' +
              '<tr><td class="cell-hour">教师</td><td style="padding:8px 10px;font-size:12px">' + esc(c.teacher) + '</td></tr>' +
              '<tr><td class="cell-hour">教室</td><td style="padding:8px 10px;font-size:12px">' + esc(c.room) + '</td></tr>' +
              '<tr><td class="cell-hour">周次</td><td style="padding:8px 10px;font-size:12px">' + esc(c.weeks) + '</td></tr>' +
              '</tbody></table>' +
              '<div class="entry"><h3 class="entry-h">这一门牵着的</h3>' +
              '<p class="entry-body">' +
              L.items.filter(function (i) { return i.source && i.source.courseId === c.id; })
                .map(function (i) { return esc(i.title); }).join('、') || '还没有从这节课布置下来的事。' +
              '</p>' +
              '<div class="entry-acts"><button type="button" class="tick" data-noop>编辑课程</button>' +
              '<button type="button" class="tick" data-noop>单次调课</button></div></div>' +
              '<div class="marginalia"><b>作息</b>全天 ' + L.periods.length + ' 节，' + L.periods[0].s + ' 起，' + L.periods[9].e + ' 止。</div>';
          }
        };
      }
    },

    calendar: {
      title: '日历', sub: '月 / 周 / 日。今天单独印一个记号。',
      build: function () {
        var now = new Date();
        var base = new Date(now.getFullYear(), now.getMonth() + st.calOffset, 1);
        var y = base.getFullYear(), m = base.getMonth();
        var startDow = (base.getDay() + 6) % 7;
        var days = new Date(y, m + 1, 0).getDate();
        var cells = [];
        for (var i = 0; i < startDow; i++) cells.push({ out: true });
        for (var d = 1; d <= days; d++) cells.push({ out: false, n: d });
        while (cells.length % 7) cells.push({ out: true });
        var sel = st.sel.calendar || (st.calOffset === 0 ? now.getDate() : 1);
        st.sel.calendar = sel;

        var rows = '';
        for (var r = 0; r < cells.length / 7; r++) {
          rows += '<tr>';
          for (var c2 = 0; c2 < 7; c2++) {
            var cell = cells[r * 7 + c2];
            var isToday = !cell.out && st.calOffset === 0 && cell.n === now.getDate();
            rows += '<td class="' + (isToday ? 'is-today' : '') + '">' +
              '<button type="button" style="width:100%;padding:6px 7px;text-align:left;font-family:var(--num);font-size:11px;' +
              (cell.out ? 'color:var(--ink-3);opacity:.55' : '') + (sel === cell.n && !cell.out ? 'background:var(--accent-soft)' : '') +
              '"' + (cell.out ? ' disabled' : ' data-day="' + cell.n + '"') + '>' + (cell.out ? '' : cell.n) + '</button></td>';
          }
          rows += '</tr>';
        }

        return {
          left: kicks('日历', y + ' 年 ' + (m + 1) + ' 月') +
            '<h1 class="chap-title">' + (m + 1) + ' 月</h1><p class="chap-sub">点某一天，右页给那天有什么。</p>' +
            '<div class="chapter-kicker" style="border:0;padding:0;margin-bottom:12px;display:flex;gap:6px">' +
              '<button type="button" class="mark" data-month="-1">‹</button>' +
              '<button type="button" class="mark" data-month="1">›</button>' +
            '</div>' +
            '<table class="grid-table"><thead><tr>' +
            ['一', '二', '三', '四', '五', '六', '日'].map(function (d2) { return '<th>' + d2 + '</th>'; }).join('') +
            '</tr></thead><tbody>' + rows + '</tbody></table>' +
            chapFoot([['本月', days + ' 天'], ['今天', now.getDate() + ' 号']]),
          right: function () {
            var day = sel;
            var marks = [];
            L.items.forEach(function (it) {
              var a = it.anchor;
              if (a.type === 'weekly' && (a.weekdays || []).indexOf(day % 7) >= 0) marks.push(it);
              if (a.type === 'absolute' && a.start.indexOf('d+21') === 0 && day === now.getDate() + 21) marks.push(it);
              if (a.type === 'deadline' && a.date === 'today' && day === now.getDate()) marks.push(it);
            });
            return '<div class="page-head"><h2>' + (m + 1) + ' 月 ' + day + ' 日</h2><small>' + L.weekdayName(new Date(y, m, day)) + '</small></div>' +
              (marks.length ? marks.map(function (it) {
                var o = objOf(it.objectId);
                return '<div class="entry"><div class="entry-time">' +
                  (it.anchor.type === 'weekly' ? '每周重复' : (it.anchor.type === 'deadline' ? '截止' : '已排定')) + '</div>' +
                  '<h3 class="entry-h">' + esc(it.title) + '</h3>' +
                  (it.goal ? '<p class="entry-body">' + esc(it.goal) + '</p>' : '') +
                  '<div class="entry-marks">' + (o ? '<span class="mark thread" style="--thread:' + threadOf(o.thread) + '">' + esc(o.name) + '</span>' : '') + '</div></div>';
              }).join('') : '<p class="entry-body">这天没有排定的东西。</p>') +
              '<div class="marginalia"><b>提醒</b>' + L.reminders.filter(function (r) { return r.type === 'silent'; })
                .map(function (r) { return esc(r.title); }).join('、') + '</div>';
          }
        };
      }
    },

    notes: {
      title: '笔记', sub: '见闻、感受、想法、摘录、复盘。都可以挂在一个对象上。',
      build: function () {
        var sel = st.sel.notes || L.notes[0].id;
        st.sel.notes = sel;
        var list = L.notes.map(function (n, i) {
          var o = objOf(n.objectId);
          return '<button type="button" class="ix" data-pick="' + n.id + '"' +
            (n.id === sel ? ' aria-current="true"' : '') + '>' +
            '<span class="ix-n">' + pad(i + 1) + '</span>' +
            '<span class="ix-t">' + esc(n.title || n.body.slice(0, 16) + '…') +
            '<small>' + esc(n.body.slice(0, 30)) + '…</small></span>' +
            '<span class="ix-d">' + esc(n.kind) + '</span></button>';
        }).join('');
        return {
          left: kicks('笔记', L.notes.length + ' 则') +
            '<h1 class="chap-title">笔记</h1><p class="chap-sub">点一则，右页摊开它。</p>' +
            '<ul class="index">' + list + '</ul>' +
            chapFoot([['在册', L.notes.length], ['草稿', 0]]),
          right: function () {
            var n = L.notes.filter(function (x) { return x.id === sel; })[0] || L.notes[0];
            var o = objOf(n.objectId);
            return '<div class="page-head"><h2>' + esc(n.title || n.kind) + '</h2><small>' +
              (n.date === 'today' ? '今天 ' + n.time : n.date + ' ' + n.time) + '</small></div>' +
              '<h3 class="entry-h">' + esc(n.title || '') + '</h3>' +
              '<p class="entry-body" style="font-family:var(--serif);font-size:15px;line-height:1.95;max-width:34ch">' + esc(n.body) + '</p>' +
              '<div class="entry-marks">' +
                (n.tags || []).map(function (t) { return '<span class="mark">#' + esc(t) + '</span>'; }).join('') +
                (o ? '<span class="mark thread" style="--thread:' + threadOf(o.thread) + '">' + esc(o.name) + '</span>' : '') +
              '</div>' +
              '<div class="marginalia"><b>可以提炼</b>这则笔记可以变成一件事，也可以只是留着。</div>';
          }
        };
      }
    },

    objects: {
      title: '对象', sub: '课程、项目、主题各算一块。',
      build: function () {
        var sel = st.sel.objects || L.objects[0].id;
        st.sel.objects = sel;
        var list = L.objects.map(function (o, i) {
          var items = L.items.filter(function (x) { return x.objectId === o.id; });
          return '<button type="button" class="ix" data-pick="' + o.id + '"' +
            (o.id === sel ? ' aria-current="true"' : '') + '>' +
            '<span class="ix-n">' + pad(i + 1) + '</span>' +
            '<span class="ix-t">' + esc(o.name) + '<small>' + esc(o.kind) + ' · ' + (o.goal || '还没有写目的') + '</small></span>' +
            '<span class="ix-d">' + items.length + ' 件</span></button>';
        }).join('');
        return {
          left: kicks('对象', L.objects.length + ' 块') +
            '<h1 class="chap-title">对象</h1><p class="chap-sub">点一块，右页把散落的东西收回来。</p>' +
            '<ul class="index">' + list + '</ul>' +
            chapFoot([['对象', L.objects.length], ['关联', L.items.length + ' 件事']]),
          right: function () {
            var o = L.objects.filter(function (x) { return x.id === sel; })[0] || L.objects[0];
            var items = L.items.filter(function (x) { return x.objectId === o.id; });
            var notes = L.notes.filter(function (n) { return n.objectId === o.id; });
            var caps = L.captures.filter(function (c) { return c.objectId === o.id; });
            return '<div class="page-head"><h2>' + esc(o.name) + '</h2><small>' + esc(o.kind) + '</small></div>' +
              '<p class="entry-body" style="font-family:var(--serif);font-size:15px">' + esc(o.goal || '还没有写目的。') + '</p>' +
              '<div class="entry-marks"><span class="mark thread" style="--thread:' + threadOf(o.thread) + '">' + items.length + ' 件事</span>' +
              '<span class="mark">' + notes.length + ' 则笔记</span><span class="mark">' + caps.length + ' 条网页</span></div>' +
              (items.length ? '<div class="entry" style="margin-top:20px"><h3 class="entry-h">事项</h3>' +
                items.map(function (it) { return '<p class="entry-body">· ' + esc(it.title) + '</p>'; }).join('') + '</div>' : '') +
              (notes.length ? '<div class="entry"><h3 class="entry-h">笔记</h3>' +
                notes.map(function (n) { return '<p class="entry-body">· ' + esc(n.body.slice(0, 40)) + '…</p>'; }).join('') + '</div>' : '');
          }
        };
      }
    },

    web: {
      title: '网页', sub: '原文、重点，以及一条待确认的行动。',
      build: function () {
        var sel = st.sel.web || L.captures[0].id;
        st.sel.web = sel;
        var list = L.captures.map(function (c, i) {
          return '<button type="button" class="ix" data-pick="' + c.id + '"' +
            (c.id === sel ? ' aria-current="true"' : '') + '>' +
            '<span class="ix-n">' + pad(i + 1) + '</span>' +
            '<span class="ix-t">' + esc(c.title) + '<small>' + esc(c.host) + ' · ' + esc(c.at) + '</small></span>' +
            '<span class="ix-d">' + (c.draft ? '待确认' : '已整理') + '</span></button>';
        }).join('');
        return {
          left: kicks('网页', L.captures.length + ' 条') +
            '<h1 class="chap-title">网页</h1><p class="chap-sub">草稿不确认就不落地。</p>' +
            '<ul class="index">' + list + '</ul>' +
            chapFoot([['记录', L.captures.length], ['待确认', L.captures.filter(function (c) { return c.draft; }).length]]),
          right: function () {
            var c = L.captures.filter(function (x) { return x.id === sel; })[0] || L.captures[0];
            return '<div class="page-head"><h2>' + esc(c.title) + '</h2><small>' + esc(c.at) + '</small></div>' +
              '<p class="entry-body" style="font-family:var(--num);font-size:10.5px;word-break:break-all">' + esc(c.url) + '</p>' +
              '<div class="entry"><h3 class="entry-h">重点</h3>' +
              (c.highlights || []).map(function (h) { return '<p class="entry-body">· ' + esc(h) + '</p>'; }).join('') + '</div>' +
              (c.draft ? '<div class="marginalia"><b>待确认的行动</b>' + esc(c.draft) +
                '<div class="entry-acts"><button type="button" class="tick tick-prime" data-noop>收下</button>' +
                '<button type="button" class="tick" data-noop>丢掉</button></div></div>'
                : '<div class="marginalia"><b>已整理</b>这条没有待确认的行动。</div>');
          }
        };
      }
    },

    reminders: {
      title: '提醒', sub: '定时、静默、长期。关掉插件只暂停，不删记录。',
      build: function () {
        var groups = [
          { k: 'timed', n: '定时通知', d: '到点点一下' },
          { k: 'silent', n: '今天的静默提示', d: '只在今天露一行' },
          { k: 'attention', n: '长期注意', d: '挂到那件事结束' }
        ];
        var all = groups.map(function (g) {
          return '<div class="entry"><div class="entry-time">' + g.n + ' · ' + g.d + '</div>' +
            L.reminders.filter(function (r) { return r.type === g.k; }).map(function (r) {
              return '<h3 class="entry-h" style="font-size:16px">' + esc(r.title) + '</h3>' +
                '<div class="entry-time" style="margin-top:2px">' + esc(r.at || r.until || '') + '</div>';
            }).join('') + '</div>';
        }).join('');
        return {
          left: kicks('提醒', '3 类') +
            '<h1 class="chap-title">提醒</h1><p class="chap-sub">系统通知与记录是两件事：关掉只停前者。</p>' +
            '<ul class="index">' + groups.map(function (g, i) {
              return '<button type="button" class="ix" data-pick="' + g.k + '"' +
                (i === 0 ? ' aria-current="true"' : '') + '><span class="ix-n">' + pad(i + 1) + '</span>' +
                '<span class="ix-t">' + g.n + '<small>' + g.d + '</small></span>' +
                '<span class="ix-d">' + L.reminders.filter(function (r) { return r.type === g.k; }).length + '</span></button>';
            }).join('') + '</ul>' +
            chapFoot([['三类', 3], ['在册', L.reminders.length]]),
          right: function () { return '<div class="page-head"><h2>提醒</h2><small>三类</small></div>' + all; }
        };
      }
    },

    assistant: {
      title: '助手', sub: '一句人话，一页可编辑的草稿。',
      build: function () {
        var d = L.assistantDraft;
        return {
          left: kicks('助手', '默认 Flash-1017') +
            '<h1 class="chap-title">助手</h1><p class="chap-sub">它先写草稿，你逐条看，再落地。</p>' +
            '<p class="lede">「' + esc(d.input) + '」</p>' +
            '<ul class="index">' + d.steps.map(function (s, i) {
              return '<button type="button" class="ix"><span class="ix-n">' + pad(i + 1) + '</span>' +
                '<span class="ix-t">' + esc(s.title) + '<small>' + esc(s.time) + (s.guessed ? ' · 猜的' : '') + '</small></span>' +
                '<span class="ix-d">' + (s.guessed ? '推测' : '确定') + '</span></button>';
            }).join('') + '</ul>' +
            chapFoot([['步骤', d.steps.length], ['推测', d.steps.filter(function (s) { return s.guessed; }).length]]),
          right: '<div class="page-head"><h2>它会做这些</h2><small>' + d.steps.length + ' 步</small></div>' +
            d.steps.map(function (s, i) {
              return '<div class="entry"><div class="entry-time">第 ' + (i + 1) + ' 步' + (s.guessed ? ' · 推测，可改' : '') + '</div>' +
                '<h3 class="entry-h">' + esc(s.title) + '</h3><p class="entry-body">' + esc(s.time) + '</p></div>';
            }).join('') +
            '<div class="entry-acts"><button type="button" class="tick tick-prime" data-noop>就这样写进去</button>' +
            '<button type="button" class="tick" data-noop>全部改一遍</button></div>' +
            '<div class="marginalia"><b>不做</b>不自动写库、不替你点确认、不把内容传出去。</div>'
        };
      }
    },

    chat: {
      title: '群消息', sub: '挂起状态。界面在，开关不生效。',
      build: function () {
        return {
          left: kicks('群消息', '已挂起') +
            '<h1 class="chap-title">群消息</h1><p class="chap-sub">正式版本里挂起：锁屏、命令都不注册。</p>' +
            '<p class="lede">下面是它为接通之后准备的收件箱样子，是<em>示意</em>。</p>' +
            chapFoot([['状态', '挂起'], ['适配器', '未配']]),
          right: '<div class="page-head"><h2>收件箱</h2><small>示意</small></div>' +
            '<div class="entry"><h3 class="entry-h">班级群</h3><p class="entry-body">本周五实验课调到周四第 5-6 节。</p></div>' +
            '<div class="entry"><h3 class="entry-h">导师</h3><p class="entry-body">中期检查下周三，提前两天把材料发我。</p></div>' +
            '<div class="entry"><h3 class="entry-h">项目组</h3><p class="entry-body">服务器迁移，今晚八点停机一小时。</p></div>' +
            '<div class="marginalia"><b>待确认</b>命中的消息不会自动变成事项。</div>'
        };
      }
    },

    import: {
      title: '导入', sub: '教务导入依赖课程表；CSV 不受开关影响。',
      build: function () {
        var on = PG.isOn('course-import');
        return {
          left: kicks('教务导入', on ? '已开启' : '默认关闭') +
            '<h1 class="chap-title">导入</h1><p class="chap-sub">账号密码不经过几微，抓完即关。</p>' +
            '<ul class="index">' + (on ? [
              '选择学校入口', '手动登录', '核对课表', '合并或新建', '写入并切周次', '备选 CSV'
            ].map(function (t, i) {
              return '<button type="button" class="ix"><span class="ix-n">' + pad(i + 1) + '</span>' +
                '<span class="ix-t">' + t + '</span><span class="ix-d">' + (i < 2 ? '必做' : '按需') + '</span></button>';
            }).join('') : '' ) + '</ul>' +
            (on ? '' : '<p class="lede">这个插件默认不开启。<em>开启后</em>这里给出六个步骤。</p>') +
            chapFoot([['依赖', '课程表'], ['状态', on ? '已开' : '未开']]),
          right: on
            ? '<div class="page-head"><h2>六个步骤</h2><small>不会直接写库</small></div>' +
              ['选择学校入口 · 默认南邮 WebVPN',
               '在弹出的窗口手动登录 · 账号密码不经过几微',
               '核对抓到的课表 · 周次、单双周、连堂先列给你确认',
               '合并还是新建 · 合并只补缺失项',
               '写入并切到新周次 · 写完刷新今天与日历',
               '备选 CSV · 不依赖这个插件'
              ].map(function (t, i) {
                return '<div class="entry"><div class="entry-time">第 ' + (i + 1) + ' 步</div><h3 class="entry-h">' + esc(t.split(' · ')[0]) + '</h3>' +
                  '<p class="entry-body">' + esc(t.split(' · ')[1] || '') + '</p></div>';
              }).join('')
            : '<div class="page-head"><h2>还没开启</h2><small>关着</small></div>' +
              '<p class="entry-body">开启后这里给出六个步骤。也可以直接去插件页打开它。</p>'
        };
      }
    },

    plugins: {
      title: '插件', sub: '整本书的章节由这张表生成。',
      build: function () {
        var list = PG.list.map(function (p) {
          var on = !!PG.state[p.id];
          var blocked = p.requires && !PG.state[p.requires];
          return '<button type="button" class="ix" data-plug="' + p.id + '"' +
            (!on || blocked ? ' style="opacity:.62"' : '') + '>' +
            '<span class="ix-n">' + (on && !blocked ? '●' : '○') + '</span>' +
            '<span class="ix-t">' + esc(p.name) +
              (p.suspended ? ' <span class="mark">挂起</span>' : '') +
              (p.missing ? ' <span class="mark">未实装</span>' : '') +
              '<small>' + esc(p.desc) + '</small></span>' +
            '<span class="ix-d">' + (blocked ? '待依赖' : (on ? '开' : '关')) + '</span></button>';
        }).join('');
        return {
          left: kicks('插件', PG.onCount() + ' / 10 在册') +
            '<h1 class="chap-title">插件</h1><p class="chap-sub">点一条切换。关掉的章节会从书脊消失。</p>' +
            '<ul class="index">' + list + '</ul>' +
            chapFoot([['已启用', PG.onCount()], ['全部', PG.list.length]]),
          right: '<div class="page-head"><h2>插件能给书什么</h2><small>现在只用了前三条</small></div>' +
            '<div class="entry"><h3 class="entry-h">一章</h3><p class="entry-body">注册到书脊与目录；关掉即不可达。</p></div>' +
            '<div class="entry"><h3 class="entry-h">一组命令</h3><p class="entry-body">命令面板里带 owner 前缀。</p></div>' +
            '<div class="entry"><h3 class="entry-h">一个开关</h3><p class="entry-body">可以声明依赖别的插件；依赖关掉时它也不出现。</p></div>' +
            '<div class="marginalia"><b>未用</b>工作区挂件、数据源两项还没有示例。</div>'
        };
      }
    },

    settings: {
      title: '设置', sub: '排版、主题、布局、导出。',
      build: function () {
        var skins = [
          ['paper', '纸', '暖纸、墨色、朱印'],
          ['water', '水', '冷青、清透'],
          ['map', '图', '土绿、赭石'],
          ['house', '场', '深紫、铜金']
        ];
        return {
          left: kicks('设置', PG.onCount() + ' 个插件在册') +
            '<h1 class="chap-title">设置</h1><p class="chap-sub">书页、主题、布局、导出。</p>' +
            '<ul class="index">' + skins.map(function (s, i) {
              return '<button type="button" class="ix" data-skin="' + s[0] + '">' +
                '<span class="ix-n">' + pad(i + 1) + '</span>' +
                '<span class="ix-t">' + s[1] + '<small>' + s[2] + '</small></span>' +
                '<span class="ix-d">' + (s[0] === 'paper' ? '用着' : '') + '</span></button>';
            }).join('') +
            '<button type="button" class="ix"><span class="ix-n">05</span><span class="ix-t">布局 · 七种<small>侧栏 / 顶栏 / 双栏 / 单栏 …</small></span><span class="ix-d">侧栏</span></button>' +
            '<button type="button" class="ix"><span class="ix-n">06</span><span class="ix-t">导出<small>版本化备份</small></span><span class="ix-d">JSON</span></button>' +
            '</ul>' +
            chapFoot([['工作区', '184 KB'], ['备份', '3 份']]),
          right: '<div class="page-head"><h2>书页</h2><small>当前排版</small></div>' +
            '<div class="entry"><h3 class="entry-h">对开</h3><p class="entry-body">左页给这一章的全貌，右页给正在读的那一页。窄窗时只留一页。</p></div>' +
            '<div class="entry"><h3 class="entry-h">翻页</h3><p class="entry-body">换章时一页纸从左扫到右，不是淡入淡出。减弱动态效果时直接换。</p></div>' +
            '<div class="entry"><h3 class="entry-h">打印</h3><p class="entry-body">字号 14/16/19，标题用衬线，正文行宽 32–40 字。</p></div>' +
            '<div class="marginalia"><b>开发者模式</b>默认关。普通页面不显示运行时信息。</div>'
        };
      }
    }
  };

  function kicks(a, b) {
    return '<div class="chap-kicker"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>';
  }
  function chapFoot(pairs) {
    return '<div class="chap-foot">' + pairs.map(function (p) {
      return esc(p[0]) + ' <b>' + esc(p[1]) + '</b>';
    }).join('　·　') + '</div>';
  }
  function describe(a) {
    if (!a) return '';
    if (a.type === 'floating') return '无期限';
    if (a.type === 'deadline') return '截止 ' + (a.date === 'today' ? '今天' : a.date) + ' ' + (a.time || '');
    if (a.type === 'absolute') return a.start.replace('today', '今天').replace('T', ' ') + ' 起';
    if (a.type === 'range') return '区间中';
    if (a.type === 'weekly') return '每周 ' + (a.weekdays || []).join('、');
    return '';
  }

  /* ── 画 ───────────────────────────────────────────────── */

  function paint() {
    var ch = CHAPTERS[st.page];
    if (!ch) return;
    var built = ch.build();
    left.innerHTML = built.left;
    right.innerHTML = typeof built.right === 'function' ? built.right() : built.right;
    document.body.dataset.page = st.page;
    paintTabs();
    var idx = PG.visible().map(function (p) { return p.id; }).indexOf(st.page);
    folioL.textContent = (idx + 1) + ' / ' + PG.visible().length;
    folioR.textContent = ch.title;
    folioMid.textContent = '几 微';
    if (location.hash.slice(1) !== st.page) history.replaceState(null, '', '#' + st.page);
    left.scrollTop = 0;
    right.scrollTop = 0;
  }

  function go(id, dir) {
    if (!id || id === st.page) { paint(); return; }
    var ch = CHAPTERS[id];
    if (!ch) return;
    st.page = id;
    if (reduce.matches) { paint(); return; }
    // 翻页：一页纸扫过去，然后换内容
    turn.classList.remove('is-on', 'is-back');
    void turn.offsetWidth;
    if (dir < 0) turn.classList.add('is-back');
    turn.classList.add('is-on');
    setTimeout(function () {
      paint();
      turn.classList.remove('is-on');
    }, 420);
  }

  /* ── 命令 ─────────────────────────────────────────────── */
  function cmdSource() {
    var out = PG.visible().map(function (p) {
      return { own: '章', name: p.name, run: function () { go(p.id); } };
    });
    L.items.forEach(function (it) {
      out.push({ own: '事项', name: it.title, run: function () { st.sel.items = it.id; go('items'); } });
    });
    L.objects.forEach(function (o) {
      out.push({ own: '对象', name: o.name, run: function () { st.sel.objects = o.id; go('objects'); } });
    });
    PG.list.forEach(function (p) {
      if (p.suspended || p.missing) return;
      var on = !!PG.state[p.id];
      out.push({ own: '插件', name: (on ? '关掉 ' : '打开 ') + p.name, run: function () { power(p.id, !on); } });
    });
    return out;
  }

  function paintCmd(q) {
    q = (q || '').trim().toLowerCase();
    var all = cmdSource();
    cmdRows = q ? all.filter(function (r) { return (r.own + r.name).toLowerCase().indexOf(q) >= 0; }).slice(0, 9) : all.slice(0, 8);
    cmdIndex = 0;
    cmdList.innerHTML = cmdRows.length ? cmdRows.map(function (r, i) {
      return '<li class="ci' + (i === 0 ? ' is-on' : '') + '" data-i="' + i + '"><span class="own">' + esc(r.own) + '</span>' + esc(r.name) + '</li>';
    }).join('') : '<li class="ci" style="color:var(--ink-3)">翻不到。试试「今天」「课程表」。</li>';
  }
  function openCmd() {
    cmd.classList.add('is-on');
    cmd.removeAttribute('inert');
    cmdInput.value = '';
    paintCmd('');
    setTimeout(function () { cmdInput.focus(); }, 30);
  }
  function closeCmd() {
    cmd.classList.remove('is-on');
    cmd.setAttribute('inert', '');
  }
  function moveCmd(d) {
    if (!cmdRows.length) return;
    cmdIndex = (cmdIndex + d + cmdRows.length) % cmdRows.length;
    Array.prototype.forEach.call(cmdList.children, function (el, i) { el.classList.toggle('is-on', i === cmdIndex); });
  }
  function runCmd() {
    var r = cmdRows[cmdIndex];
    if (!r) return;
    closeCmd();
    r.run();
  }

  /* ── 插件开关 ─────────────────────────────────────────── */
  function power(id, on) {
    var p = PG.list.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (p.suspended) { note('「' + p.name + '」挂起，开关不生效'); return; }
    if (p.missing) { note('「' + p.name + '」还没实装'); return; }
    PG.set(id, on);
    paintTabs();
    var here = PG.pages.filter(function (x) { return x.id === st.page; })[0];
    var susp = here && PG.list.filter(function (x) { return x.id === here.owner; })[0];
    if (here && !PG.isOn(here.owner) && !(susp && (susp.suspended || susp.missing)) && !(here && here.owner === 'course-import')) { st.page = 'today'; paint(); }
    else paint();
    note('「' + p.name + '」' + (on ? '已打开' : '已关掉'));
  }

  /* ── 事件 ─────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-pick],[data-done],[data-filter],[data-plug],[data-week],[data-parity],[data-month],[data-day],[data-skin],[data-noop]');
    if (!t) return;

    if (t.dataset.go) { go(t.dataset.go); return; }
    if (t.dataset.noop !== undefined) { note('这一处在候选稿里没有接行为'); return; }

    if (t.dataset.pick) {
      st.sel[st.page] = t.dataset.pick;
      paint();
      return;
    }
    if (t.dataset.done) { toggleDone(t.dataset.done); return; }
    if (t.dataset.filter) { st.filter = t.dataset.filter; st.sel.items = null; paint(); return; }
    if (t.dataset.plug) {
      var p = PG.list.filter(function (x) { return x.id === t.dataset.plug; })[0];
      if (p) power(p.id, !PG.state[p.id]);
      return;
    }
    if (t.dataset.week) { st.week = Math.max(1, Math.min(20, st.week + (+t.dataset.week))); paint(); return; }
    if (t.dataset.parity) { st.parity = t.dataset.parity; paint(); return; }
    if (t.dataset.month) { st.calOffset += (+t.dataset.month); st.sel.calendar = null; paint(); return; }
    if (t.dataset.day) { st.sel.calendar = +t.dataset.day; paint(); return; }
    if (t.dataset.skin) {
      var map = { paper: 'paper', water: 'water', map: 'map', house: 'house' };
      document.body.dataset.skin = map[t.dataset.skin] || 'paper';
      note('换到 ' + t.dataset.skin);
      return;
    }
  });

  function toggleDone(id) {
    var s = L.todaySlips().filter(function (x) { return x.id === id; })[0];
    var it = L.items.filter(function (x) { return x.id === id; })[0];
    var before = st.done[id] != null ? st.done[id] : (s ? s.done : (it ? it.done : false));
    st.done[id] = !before;
    undo = { id: id, before: before };
    if (s) s.done = !before;
    if (it) it.done = !before;
    paint();
    note(before ? '又划回来了 · Ctrl Z 可退' : '划掉了 · Ctrl Z 可撤回');
  }

  /* ── 键盘 ─────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (cmd.classList.contains('is-on')) { closeCmd(); return; }
      if (help.classList.contains('is-on')) { help.classList.remove('is-on'); help.setAttribute('inert', ''); return; }
      return;
    }
    if (cmd.classList.contains('is-on')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCmd(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveCmd(-1); return; }
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
      undo = null;
      paint();
      note('已撤回');
      return;
    }
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    if (e.key === '?') { e.preventDefault(); help.classList.add('is-on'); help.removeAttribute('inert'); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      var list = PG.visible();
      var i = list.map(function (p) { return p.id; }).indexOf(st.page);
      e.preventDefault();
      var next = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
      if (next) go(next.id, e.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { openCmd(); return; }
  });

  document.getElementById('cmd-open').addEventListener('click', openCmd);
  document.getElementById('help-open').addEventListener('click', function () {
    help.classList.add('is-on'); help.removeAttribute('inert');
  });
  document.getElementById('help-close').addEventListener('click', function () {
    help.classList.remove('is-on'); help.setAttribute('inert', '');
  });
  cmd.addEventListener('click', function (e) {
    if (e.target === cmd) { closeCmd(); return; }
    var li = e.target.closest('.ci[data-i]');
    if (li) { cmdIndex = +li.dataset.i; runCmd(); }
  });
  cmdInput.addEventListener('input', function () { paintCmd(cmdInput.value); });

  window.addEventListener('hashchange', function () {
    var id = location.hash.slice(1);
    if (id && id !== st.page && CHAPTERS[id]) { st.page = id; paint(); }
  });

  /* ── 起手 ─────────────────────────────────────────────── */
  var start = location.hash.slice(1);
  if (CHAPTERS[start]) st.page = start;
  paint();

  if (!reduce.matches) {
    dust = L.installDust({ count: 12, tint: 'rgba(122,59,46,' });
  }
  reduce.addEventListener('change', function () {
    if (dust) { dust.dispose(); dust = null; }
    if (!reduce.matches) dust = L.installDust({ count: 12, tint: 'rgba(122,59,46,' });
  });

  setInterval(function () {
    if (st.page === 'today') paint();
  }, 60000);
})(window);
