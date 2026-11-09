/* 三栏 · 交互
   左树（结构）/ 中表（数据）/ 右检查器（选中行）。
   一行是一个单位；字段放右边，方便对比。 */

(function (global) {
  'use strict';
  var L = global.Lab, PG = global.Plugs;
  var esc = L.esc, hm = L.hm, pad = L.pad;

  var st = {
    page: 'today',
    sel: {},
    done: {},
    filter: 'all',
    week: L.semesters[0].current,
    calOffset: 0,
    sort: null
  };

  var treeBody = document.getElementById('tree-body');
  var table = document.getElementById('table');
  var insBody = document.getElementById('ins-body');
  var insTitle = document.getElementById('ins-title');
  var insMeta = document.getElementById('ins-meta');
  var crumbs = document.getElementById('crumbs');
  var mainActs = document.getElementById('main-acts');
  var stLeft = document.getElementById('st-left');
  var stMid = document.getElementById('st-mid');
  var stRight = document.getElementById('st-right');
  var treeCount = document.getElementById('tree-count');
  var cmd = document.getElementById('cmd');
  var cmdInput = document.getElementById('cmd-input');
  var cmdList = document.getElementById('cmd-list');
  var help = document.getElementById('help');
  var noteEl = document.getElementById('note');
  var noteTimer = 0;
  var cmdRows = [], cmdIndex = 0;
  var undo = null;

  function kindName(k) { return { task: '待办', plan: '计划', event: '事件', exam: '考试' }[k] || '事项'; }
  function objOf(id) { return L.objects.filter(function (o) { return o.id === id; })[0]; }
  function threadOf(k) { return L.threads[k] || '#aeb5bf'; }
  function note(t) {
    noteEl.textContent = t;
    noteEl.classList.add('is-on');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { noteEl.classList.remove('is-on'); }, 2600);
  }

  /* ── 左树 ─────────────────────────────────────────────── */

  function paintTree() {
    var vis = PG.visible();
    var groups = [
      { name: '工作', ids: ['today', 'items', 'courses', 'calendar'] },
      { name: '内容', ids: ['notes', 'objects', 'web'] },
      { name: '能力', ids: ['reminders', 'assistant', 'chat', 'import'] },
      { name: '系统', ids: ['plugins', 'settings'] }
    ];

    var html = groups.map(function (g) {
      var nodes = g.ids.map(function (id) {
        var p = vis.filter(function (x) { return x.id === id; })[0];
        if (!p) return '';
        return '<button type="button" class="tnode" data-go="' + p.id + '"' +
          (p.id === st.page ? ' aria-current="page"' : '') + '>' +
          PG.icon(p.icon, 13) + '<span class="tname">' + esc(p.name) + '</span>' +
          '<span class="tbadge">' + badge(p.id) + '</span></button>';
      }).join('');
      return nodes ? '<div class="grp">' + g.name + '</div>' + nodes : '';
    }).join('');

    // 插件细则：可展开的开关列表（就是“插件化”在树里的样子）
    var plugs = PG.list.filter(function (p) { return !p.suspended || true; }).map(function (p) {
      var on = !!PG.state[p.id];
      var blocked = p.requires && !PG.state[p.requires];
      return '<button type="button" class="tplug' + (on && !blocked ? ' is-on' : '') + (blocked ? ' is-blocked' : '') + '"' +
        ' data-plug="' + p.id + '" title="' + esc(p.desc) + '">' +
        '<span class="tdot"></span><span class="tname">' + esc(p.name) + '</span>' +
        '<span class="tstate">' + (blocked ? '待依赖' : (p.suspended ? '挂起' : (p.missing ? '未实装' : (on ? '开' : '关')))) + '</span></button>';
    }).join('');

    treeBody.innerHTML = html + '<div class="grp">插件 · ' + PG.onCount() + '/10</div>' + plugs;
    treeCount.textContent = PG.visible().length + ' 页 · ' + PG.onCount() + ' 插件';
  }

  function badge(id) {
    if (id === 'today') return String(L.todaySlips().filter(function (s) { return !(st.done[s.id] != null ? st.done[s.id] : s.done); }).length);
    if (id === 'items') return String(L.items.filter(function (i) { return !i.done; }).length);
    if (id === 'courses') return String(L.courses.length);
    if (id === 'notes') return String(L.notes.length);
    if (id === 'objects') return String(L.objects.length);
    if (id === 'web') return String(L.captures.length);
    if (id === 'reminders') return String(L.reminders.length);
    if (id === 'plugins') return String(PG.onCount());
    return '';
  }

  /* ── 中表 ─────────────────────────────────────────────── */

  function head(cols) {
    return '<div class="thead" style="grid-template-columns:' + cols + '">' +
      cols.split(' ').map(function (c, i) { return '<span>' + ['#', '名称', '时间', '对象', '类型', ''][i] + '</span>'; }).join('') +
      '</div>';
  }

  function row(cols, cells, opts) {
    opts = opts || {};
    return '<button type="button" class="trow' + (opts.on ? ' is-active' : '') + (opts.done ? ' is-done' : '') + '"' +
      ' style="grid-template-columns:' + cols + '" data-pick="' + opts.id + '">' +
      cells + '</button>';
  }

  function paintTable() {
    var page = st.page;

    if (page === 'today') {
      var slips = L.todaySlips();
      crumbs.innerHTML = '<li>今天</li><li>' + L.weekdayName() + '</li>';
      mainActs.innerHTML = '<span class="chip">第 ' + st.week + ' 周</span><span class="chip">' + slips.length + ' 件</span>';
      var cols = '40px minmax(0,1fr) 70px 90px 62px';
      var body = '<div class="thead" style="grid-template-columns:' + cols + '"><span>#</span><span>名称</span><span>时间</span><span>对象</span><span>类型</span></div>';
      body += slips.map(function (s, i) {
        var done = st.done[s.id] != null ? st.done[s.id] : s.done;
        return row(cols, [
          '<div class="tcell"><span class="c-num">' + pad(i + 1) + '</span></div>',
          '<div class="tcell"><span class="c-title">' + esc(s.title) + '</span></div>',
          '<div class="tcell"><span class="c-num">' + hm(s.at) + '</span></div>',
          '<div class="tcell">' + (s.obj ? '<span class="c-dot" style="--thread:' + threadOf(s.thread) + '"></span><span class="c-dim">' + esc(s.obj) + '</span>' : '<span class="c-dim">—</span>') + '</div>',
          '<div class="tcell"><span class="c-tag">' + kindName(s.kind) + '</span></div>'
        ].join(''), { id: s.id, done: done, on: st.sel.today === s.id });
      }).join('') || '<div class="ins-empty">今天没有安排。</div>';
      table.innerHTML = body;
      var s = slips.filter(function (x) { return x.id === st.sel.today; })[0];
      showInspector('today', s, slips);
      stLeft.textContent = '今天 · ' + slips.length + ' 件';
      stMid.textContent = '第 ' + st.week + ' 周';
      stRight.textContent = '本地 · 未保存草稿 0';
      return;
    }

    if (page === 'items') {
      var f = st.filter;
      var items = L.items.filter(function (i) { return f === 'all' || i.kind === f; });
      crumbs.innerHTML = '<li>事项</li><li>' + (f === 'all' ? '全部' : kindName(f)) + '</li>';
      mainActs.innerHTML = ['all', 'task', 'event', 'exam', 'plan'].map(function (k) {
        return '<button type="button" class="chip" data-filter="' + k + '" aria-pressed="' + (f === k) + '">' +
          (k === 'all' ? '全部' : kindName(k)) + ' ' + (k === 'all' ? L.items.length : L.items.filter(function (i) { return i.kind === k; }).length) + '</button>';
      }).join('');
      var cols2 = '34px minmax(0,1fr) 78px 100px 62px';
      var body2 = '<div class="thead" style="grid-template-columns:' + cols2 + '"><span>#</span><span>名称</span><span>时间</span><span>对象</span><span>类型</span></div>';
      body2 += items.map(function (it, i) {
        var o = objOf(it.objectId);
        var done = st.done[it.id] != null ? st.done[it.id] : it.done;
        var when = it.anchor.type === 'deadline' ? (it.anchor.time || '截止')
          : it.anchor.type === 'absolute' ? it.anchor.start.slice(6, 11)
          : it.anchor.type === 'weekly' ? '每周' : '—';
        return '<button type="button" class="trow' + (done ? ' is-done' : '') + '" style="grid-template-columns:' + cols2 + '" data-pick="' + it.id + '"' +
          (st.sel.items === it.id ? ' aria-current="true"' : '') + '>' +
          '<div class="tcell"><span class="c-num">' + pad(i + 1) + '</span></div>' +
          '<div class="tcell"><span class="c-title">' + esc(it.title) + '</span></div>' +
          '<div class="tcell"><span class="c-num">' + esc(when) + '</span></div>' +
          '<div class="tcell">' + (o ? '<span class="c-dot" style="--thread:' + threadOf(o.thread) + '"></span><span class="c-dim">' + esc(o.name) + '</span>' : '<span class="c-dim">—</span>') + '</div>' +
          '<div class="tcell"><span class="c-tag">' + kindName(it.kind) + '</span></div></button>';
      }).join('') || '<div class="ins-empty">这个筛选下没有。</div>';
      table.innerHTML = body2;
      showInspector('items', items.filter(function (x) { return x.id === st.sel.items; })[0] || items[0], items);
      stLeft.textContent = '事项 · ' + items.length + ' 行';
      stMid.textContent = f === 'all' ? '全部类型' : kindName(f);
      stRight.textContent = '已选 ' + (st.sel.items || '—');
      return;
    }

    if (page === 'courses') {
      crumbs.innerHTML = '<li>课程表</li><li>' + L.semesters[0].name + '</li>';
      mainActs.innerHTML = '<button type="button" class="chip" data-week="-1">‹</button>' +
        '<span class="chip">第 ' + st.week + ' 周 · ' + (st.week % 2 ? '单' : '双') + '</span>' +
        '<button type="button" class="chip" data-week="1">›</button>';
      var today = new Date().getDay() || 7;
      var odd = st.week % 2 === 1;
      var vis = L.courses.filter(function (c) {
        var s = c.weeks.indexOf('单') >= 0, d = c.weeks.indexOf('双') >= 0;
        if (s && !d) return odd;
        if (d && !s) return !odd;
        return true;
      });
      var rows = '';
      for (var n = 1; n <= 10; n++) {
        var p = L.periods[n - 1];
        rows += '<tr><td class="hrc">' + p.s + '<br>' + p.e + '</td>';
        for (var d = 1; d <= 7; d++) {
          var cell = vis.filter(function (c) { return c.day === d && c.p0 === n; });
          rows += '<td style="height:34px"' + (d === today ? ' class="is-today"' : '') + '>';
          cell.forEach(function (c) {
            rows += '<button type="button" class="crs" data-pick-course="' + c.id + '" style="--thread:' + threadOf(c.thread) + '">' +
              '<b>' + esc(c.title.length > 4 ? c.title.slice(0, 4) : c.title) + '</b><span>' + esc(c.room) + '</span></button>';
          });
          rows += '</td>';
        }
        rows += '</tr>';
      }
      table.innerHTML = '<table class="tt"><thead><tr><th style="width:52px"></th>' +
        ['一', '二', '三', '四', '五', '六', '日'].map(function (d2, i) {
          return '<th style="' + (i + 1 === today ? 'color:var(--accent)' : '') + '">' + d2 + '</th>';
        }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table>';
      var c = L.courses.filter(function (x) { return x.id === st.sel.course; })[0] || L.courses[0];
      showCourse(c);
      stLeft.textContent = '课程表 · ' + vis.length + ' 门';
      stMid.textContent = '第 ' + st.week + ' 周';
      stRight.textContent = L.semesters[0].name;
      return;
    }

    if (page === 'calendar') {
      var now = new Date();
      var base = new Date(now.getFullYear(), now.getMonth() + st.calOffset, 1);
      var y = base.getFullYear(), m = base.getMonth();
      var startDow = (base.getDay() + 6) % 7;
      var days = new Date(y, m + 1, 0).getDate();
      crumbs.innerHTML = '<li>日历</li><li>' + y + ' 年 ' + (m + 1) + ' 月</li>';
      mainActs.innerHTML = '<button type="button" class="chip" data-month="-1">‹</button>' +
        '<span class="chip">' + (m + 1) + ' 月</span>' +
        '<button type="button" class="chip" data-month="1">›</button>';
      var cells = [];
      for (var i = 0; i < startDow; i++) cells.push({ out: true });
      for (var dd = 1; dd <= days; dd++) cells.push({ n: dd });
      while (cells.length % 7) cells.push({ out: true });
      var dows = ['一', '二', '三', '四', '五', '六', '日'].map(function (x) { return '<div class="calh">' + x + '</div>'; }).join('');
      var body3 = cells.map(function (c2) {
        var isT = !c2.out && st.calOffset === 0 && c2.n === now.getDate();
        var mk = c2.out ? [] : L.items.filter(function (it) {
          return (it.anchor.type === 'weekly' && (it.anchor.weekdays || []).indexOf(c2.n % 7) >= 0) ||
            (it.anchor.type === 'deadline' && it.anchor.date === 'today' && c2.n === now.getDate());
        }).slice(0, 2);
        return '<div class="calc' + (c2.out ? ' is-out' : '') + (isT ? ' is-today' : '') + '">' +
          '<span class="cn">' + (c2.out ? '' : c2.n) + '</span>' +
          mk.map(function (it) { return '<span class="cm">' + esc(it.title) + '</span>'; }).join('') + '</div>';
      }).join('');
      table.innerHTML = '<div class="calgrid">' + dows + body3 + '</div>';
      insTitle.textContent = '这个月';
      insMeta.textContent = days + ' 天';
      insBody.innerHTML = '<p class="ins-kicker">' + y + ' 年 ' + (m + 1) + ' 月</p>' +
        '<h3 class="ins-h">' + (days) + ' 天</h3>' +
        '<dl class="kv">' +
        '<dt>截止</dt><dd>' + L.items.filter(function (i) { return i.anchor.type === 'deadline'; }).length + ' 处</dd>' +
        '<dt>事件</dt><dd>' + L.items.filter(function (i) { return i.anchor.type === 'absolute'; }).length + ' 处</dd>' +
        '<dt>每周</dt><dd>' + L.items.filter(function (i) { return i.anchor.type === 'weekly'; }).length + ' 处</dd>' +
        '<dt>今天</dt><dd>' + now.getDate() + ' 号</dd></dl>';
      stLeft.textContent = y + ' 年 ' + (m + 1) + ' 月';
      stMid.textContent = days + ' 天';
      stRight.textContent = '月视图';
      return;
    }

    if (page === 'notes') {
      crumbs.innerHTML = '<li>笔记</li><li>' + L.notes.length + ' 则</li>';
      mainActs.innerHTML = '<span class="chip">五类用途</span>';
      var cols4 = '34px minmax(0,1fr) 62px 96px 60px';
      var body4 = '<div class="thead" style="grid-template-columns:' + cols4 + '"><span>#</span><span>摘要</span><span>用途</span><span>对象</span><span>日期</span></div>' +
        L.notes.map(function (n, i) {
          var o = objOf(n.objectId);
          return '<button type="button" class="trow" style="grid-template-columns:' + cols4 + '" data-pick-note="' + n.id + '"' +
            (st.sel.note === n.id ? ' aria-current="true"' : '') + '>' +
            '<div class="tcell"><span class="c-num">' + pad(i + 1) + '</span></div>' +
            '<div class="tcell"><span class="c-title">' + esc(n.title || n.body.slice(0, 24)) + '</span></div>' +
            '<div class="tcell"><span class="c-tag">' + esc(n.kind) + '</span></div>' +
            '<div class="tcell">' + (o ? '<span class="c-dot" style="--thread:' + threadOf(o.thread) + '"></span><span class="c-dim">' + esc(o.name) + '</span>' : '<span class="c-dim">—</span>') + '</div>' +
            '<div class="tcell"><span class="c-num">' + esc(n.date === 'today' ? '今天' : n.date) + '</span></div></button>';
        }).join('');
      table.innerHTML = body4;
      var n = L.notes.filter(function (x) { return x.id === st.sel.note; })[0] || L.notes[0];
      showInspector('notes', n);
      stLeft.textContent = '笔记 · ' + L.notes.length + ' 则';
      stMid.textContent = '五类用途';
      stRight.textContent = '草稿 0';
      return;
    }

    if (page === 'objects') {
      crumbs.innerHTML = '<li>对象</li><li>' + L.objects.length + ' 块</li>';
      mainActs.innerHTML = '<span class="chip">课程 / 项目 / 主题</span>';
      var cols5 = '34px minmax(0,1fr) 62px 50px 50px';
      var body5 = '<div class="thead" style="grid-template-columns:' + cols5 + '"><span>#</span><span>名称</span><span>类型</span><span>事</span><span>记</span></div>' +
        L.objects.map(function (o, i) {
          var its = L.items.filter(function (x) { return x.objectId === o.id; });
          var ns = L.notes.filter(function (x) { return x.objectId === o.id; });
          return '<button type="button" class="trow" style="grid-template-columns:' + cols5 + '" data-pick-obj="' + o.id + '"' +
            (st.sel.obj === o.id ? ' aria-current="true"' : '') + '>' +
            '<div class="tcell"><span class="c-dot" style="--thread:' + threadOf(o.thread) + '"></span></div>' +
            '<div class="tcell"><span class="c-title">' + esc(o.name) + '</span></div>' +
            '<div class="tcell"><span class="c-tag">' + esc(o.kind) + '</span></div>' +
            '<div class="tcell"><span class="c-num">' + its.length + '</span></div>' +
            '<div class="tcell"><span class="c-num">' + ns.length + '</span></div></button>';
        }).join('');
      table.innerHTML = body5;
      showInspector('objects', L.objects.filter(function (x) { return x.id === st.sel.obj; })[0] || L.objects[0]);
      stLeft.textContent = '对象 · ' + L.objects.length + ' 块';
      stMid.textContent = L.items.length + ' 件关联';
      stRight.textContent = 'Beta';
      return;
    }

    if (page === 'web') {
      crumbs.innerHTML = '<li>网页</li><li>' + L.captures.length + ' 条</li>';
      mainActs.innerHTML = '<span class="chip">待确认 ' + L.captures.filter(function (c) { return c.draft; }).length + '</span>';
      var cols6 = '34px minmax(0,1fr) 100px 78px';
      var body6 = '<div class="thead" style="grid-template-columns:' + cols6 + '"><span>#</span><span>标题</span><span>来源</span><span>状态</span></div>' +
        L.captures.map(function (c, i) {
          return '<button type="button" class="trow" style="grid-template-columns:' + cols6 + '" data-pick-web="' + c.id + '">' +
            '<div class="tcell"><span class="c-num">' + pad(i + 1) + '</span></div>' +
            '<div class="tcell"><span class="c-title">' + esc(c.title) + '</span></div>' +
            '<div class="tcell"><span class="c-num">' + esc(c.host) + '</span></div>' +
            '<div class="tcell"><span class="c-tag">' + (c.draft ? '待确认' : '已整理') + '</span></div></button>';
        }).join('');
      table.innerHTML = body6;
      showInspector('web', L.captures.filter(function (x) { return x.id === st.sel.web; })[0] || L.captures[0]);
      stLeft.textContent = '网页 · ' + L.captures.length + ' 条';
      stMid.textContent = '公开静态页';
      stRight.textContent = '未连接抓取';
      return;
    }

    if (page === 'reminders') {
      crumbs.innerHTML = '<li>提醒</li><li>三类</li>';
      mainActs.innerHTML = '<span class="chip">系统通知 已授权</span>';
      var cols7 = '34px minmax(0,1fr) 78px 100px';
      var body7 = '<div class="thead" style="grid-template-columns:' + cols7 + '"><span>#</span><span>名称</span><span>类型</span><span>时间</span></div>' +
        L.reminders.map(function (r, i) {
          return '<button type="button" class="trow" style="grid-template-columns:' + cols7 + '">' +
            '<div class="tcell"><span class="c-num">' + pad(i + 1) + '</span></div>' +
            '<div class="tcell"><span class="c-title">' + esc(r.title) + '</span></div>' +
            '<div class="tcell"><span class="c-tag">' +
            ({ timed: '定时', silent: '静默', attention: '长期' }[r.type]) + '</span></div>' +
            '<div class="tcell"><span class="c-num">' + esc(r.at || r.until || '—') + '</span></div></button>';
        }).join('');
      table.innerHTML = body7;
      insTitle.textContent = '提醒';
      insMeta.textContent = '3 类';
      insBody.innerHTML = '<p class="ins-kicker">记录与通知分离</p><h3 class="ins-h">关掉插件只暂停通知</h3>' +
        '<p>记录、归档、长期注意都留在本地。重开不会补发已过期的单次提醒。</p>' +
        '<dl class="kv"><dt>通知权限</dt><dd>已授权（示例）</dd>' +
        '<dt>定时任务</dt><dd>1 个在等</dd>' +
        '<dt>静默</dt><dd>今天 ' + L.reminders.filter(function (r) { return r.type === 'silent'; }).length + ' 条</dd></dl>';
      stLeft.textContent = '提醒 · ' + L.reminders.length + ' 条';
      stMid.textContent = '3 类';
      stRight.textContent = '系统通知已授权';
      return;
    }

    if (page === 'assistant') {
      var d = L.assistantDraft;
      crumbs.innerHTML = '<li>助手</li><li>一次草稿</li>';
      mainActs.innerHTML = '<span class="chip">' + d.steps.length + ' 步</span>';
      var cols8 = '34px minmax(0,1fr) 96px 62px';
      var body8 = '<div class="thead" style="grid-template-columns:' + cols8 + '"><span>#</span><span>动作</span><span>时间</span><span>把握</span></div>' +
        d.steps.map(function (s, i) {
          return '<button type="button" class="trow" style="grid-template-columns:' + cols8 + '">' +
            '<div class="tcell"><span class="c-num">' + pad(i + 1) + '</span></div>' +
            '<div class="tcell"><span class="c-title">' + esc(s.title) + '</span></div>' +
            '<div class="tcell"><span class="c-num">' + esc(s.time) + '</span></div>' +
            '<div class="tcell"><span class="c-tag">' + (s.guessed ? '推测' : '确定') + '</span></div></button>';
        }).join('');
      table.innerHTML = body8;
      insTitle.textContent = '助手';
      insMeta.textContent = '默认可编辑';
      insBody.innerHTML = '<p class="ins-kicker">你说</p><h3 class="ins-h">' + esc(d.input) + '</h3>' +
        '<p>它给出上面那几步，标了「推测」的地方要你看一眼。确认之后才落地。</p>' +
        '<div class="ins-acts"><button type="button" class="btn btn-prime" data-noop>就这样写进去</button>' +
        '<button type="button" class="btn" data-noop>全部改一遍</button></div>';
      stLeft.textContent = '助手 · ' + d.steps.length + ' 步';
      stMid.textContent = d.steps.filter(function (s) { return s.guessed; }).length + ' 步推测';
      stRight.textContent = 'Flash-1017';
      return;
    }

    if (page === 'chat') {
      crumbs.innerHTML = '<li>群消息</li><li>挂起</li>';
      mainActs.innerHTML = '<span class="chip">不注册命令</span>';
      table.innerHTML = '<div class="ins-empty">这个插件挂起中。<br>不读消息、不建任务、不注册命令。<br>接通后这里会是一张消息表。</div>';
      insTitle.textContent = '挂起';
      insMeta.textContent = 'QQ / 微信未配';
      insBody.innerHTML = '<p class="ins-kicker">状态</p><h3 class="ins-h">挂起</h3><p>正式版本里这个插件不生效，只留一个位置。</p>';
      stLeft.textContent = '群消息 · 挂起';
      stMid.textContent = '适配器未配';
      stRight.textContent = '不注册命令';
      return;
    }

    if (page === 'import') {
      var on = PG.isOn('course-import');
      crumbs.innerHTML = '<li>导入</li><li>教务</li>';
      mainActs.innerHTML = '<span class="chip">依赖课程表</span><span class="chip">CSV 可用</span>';
      var steps = ['选择学校入口', '手动登录', '核对课表', '合并或新建', '写入并切周次', '备选 CSV'];
      table.innerHTML = on
        ? '<div class="thead" style="grid-template-columns:34px minmax(0,1fr) 78px"><span>#</span><span>步骤</span><span>必做</span></div>' +
          steps.map(function (s, i) {
            return '<button type="button" class="trow" style="grid-template-columns:34px minmax(0,1fr) 78px">' +
              '<div class="tcell"><span class="c-num">' + pad(i + 1) + '</span></div>' +
              '<div class="tcell"><span class="c-title">' + s + '</span></div>' +
              '<div class="tcell"><span class="c-tag">' + (i < 2 ? '必做' : '按需') + '</span></div></button>';
          }).join('')
        : '<div class="ins-empty">默认关闭。到左树「插件」里打开它。</div>';
      insTitle.textContent = on ? '六个步骤' : '默认关闭';
      insMeta.textContent = on ? '不会直接写库' : '依赖课程表';
      insBody.innerHTML = on
        ? '<p class="ins-kicker">流程</p><h3 class="ins-h">手动登录后抓取</h3><p>账号密码不经过几微，抓完即关。抓到之后先列给你逐条确认。</p>'
        : '<p class="ins-kicker">状态</p><h3 class="ins-h">未开启</h3><p>开启后这里给出六个步骤。CSV 导入不受这个开关影响。</p>';
      stLeft.textContent = '导入 · ' + (on ? '已开启' : '未开启');
      stMid.textContent = '依赖课程表';
      stRight.textContent = 'CSV 独立可用';
      return;
    }

    if (page === 'plugins') {
      crumbs.innerHTML = '<li>插件</li><li>' + PG.onCount() + ' 在册</li>';
      mainActs.innerHTML = '<span class="chip">' + PG.list.length + ' 个</span>';
      var cols9 = '34px minmax(0,1fr) 68px 96px 62px';
      table.innerHTML = '<div class="thead" style="grid-template-columns:' + cols9 + '"><span>#</span><span>插件</span><span>状态</span><span>提供</span><span></span></div>' +
        PG.list.map(function (p, i) {
          var on = !!PG.state[p.id];
          var blocked = p.requires && !PG.state[p.requires];
          var pages = PG.pages.filter(function (x) { return x.owner === p.id; }).length;
          return '<button type="button" class="trow" style="grid-template-columns:' + cols9 + '" data-plug="' + p.id + '">' +
            '<div class="tcell"><span class="c-num">' + pad(i + 1) + '</span></div>' +
            '<div class="tcell"><span class="c-title">' + esc(p.name) + '</span>' +
              (p.suspended ? ' <span class="c-tag">挂起</span>' : '') + (p.missing ? ' <span class="c-tag">未实装</span>' : '') + '</div>' +
            '<div class="tcell"><span class="c-tag">' + (blocked ? '待依赖' : (on ? '开' : '关')) + '</span></div>' +
            '<div class="tcell"><span class="c-num">' + (pages || '—') + '</span></div>' +
            '<div class="tcell"><span class="c-dim">' + (p.requires ? '→ ' + p.requires : '') + '</span></div></button>';
        }).join('');
      insTitle.textContent = '插件清单';
      insMeta.textContent = PG.onCount() + ' / 10';
      insBody.innerHTML = '<p class="ins-kicker">这张表就是壳</p><h3 class="ins-h">关掉即不可达</h3>' +
        '<p>树、表、命令面板三处都从这张表生成。依赖没满足时，插件显示「待依赖」且不可进入。</p>' +
        '<dl class="kv"><dt>页面</dt><dd>' + PG.pages.length + ' 个</dd>' +
        '<dt>启用</dt><dd>' + PG.onCount() + '</dd>' +
        '<dt>挂起</dt><dd>1（群消息）</dd><dt>未实装</dt><dd>1（记账）</dd></dl>';
      stLeft.textContent = '插件 · ' + PG.list.length + ' 个';
      stMid.textContent = PG.onCount() + ' 启用';
      stRight.textContent = '依赖 1 条';
      return;
    }

    if (page === 'settings') {
      crumbs.innerHTML = '<li>设置</li><li>工作区</li>';
      mainActs.innerHTML = '<span class="chip">本地</span>';
      table.innerHTML = '<div class="thead" style="grid-template-columns:120px minmax(0,1fr) 120px"><span>项</span><span>值</span><span></span></div>' +
        [['工作区位置', '~/JeeWeave/workspace.json'], ['大小', '184 KB'], ['最近写入', '今天 08:12'],
          ['备份', '3 份，最早 10-28'], ['布局', '侧栏（七种之一）'], ['主题', '澄纸'], ['材质', '纸']]
          .map(function (r) {
            return '<div class="trow" style="grid-template-columns:120px minmax(0,1fr) 120px">' +
              '<div class="tcell"><span class="c-dim">' + r[0] + '</span></div>' +
              '<div class="tcell"><span class="c-title">' + esc(r[1]) + '</span></div>' +
              '<div class="tcell"><span class="c-tag">只读</span></div></div>';
          }).join('');
      insTitle.textContent = '设置';
      insMeta.textContent = '只读项';
      insBody.innerHTML = '<p class="ins-kicker">数据</p><h3 class="ins-h">本地优先</h3>' +
        '<p>资料保存在这台设备。导出是版本化 JSON，恢复前会先备份。</p>' +
        '<div class="ins-acts"><button type="button" class="btn" data-noop>导出</button>' +
        '<button type="button" class="btn" data-noop>打开文件夹</button></div>' +
        '<div class="ins-sec"><h3>开发者模式</h3><p>默认关。普通页面不显示运行时与 IPC 诊断。</p></div>';
      stLeft.textContent = '设置 · 7 项';
      stMid.textContent = '本地';
      stRight.textContent = '只读';
      return;
    }

    crumbs.innerHTML = '<li>' + st.page + '</li>';
    table.innerHTML = '<div class="ins-empty">这一页还没有做。</div>';
    insBody.innerHTML = '';
  }

  /* ── 检查器 ───────────────────────────────────────────── */

  function showInspector(kind, rowData, list) {
    insBody.innerHTML = '';
    if (!rowData) {
      insTitle.textContent = '检查器';
      insMeta.textContent = '';
      insBody.innerHTML = '<p class="ins-empty">在中间选一行，这里给出它的全部字段。</p>';
      return;
    }
    insTitle.textContent = kind === 'today' ? '这一件' : (kind === 'items' ? '这一条' : kind);
    insMeta.textContent = list ? (list.map(function (x) { return x.id; }).indexOf(rowData.id) + 1) + ' / ' + list.length : '';

    if (kind === 'today' || kind === 'items') {
      var isDone = st.done[rowData.id] != null ? st.done[rowData.id] : rowData.done;
      var o = objOf(rowData.ref ? rowData.ref.objectId : rowData.objectId);
      var a = rowData.anchor || (rowData.ref && rowData.ref.anchor);
      insBody.innerHTML =
        '<p class="ins-kicker">' + kindName(rowData.kind) + '</p>' +
        '<h3 class="ins-h">' + esc(rowData.title) + '</h3>' +
        '<dl class="kv">' +
        '<dt>时间</dt><dd>' + (rowData.at != null ? hm(rowData.at) + (rowData.dur ? '–' + hm(rowData.at + rowData.dur) : '') : describe(a)) + '</dd>' +
        '<dt>对象</dt><dd>' + (o ? '<span class="c-dot" style="--thread:' + threadOf(o.thread) + '"></span>' + esc(o.name) : '未归属') + '</dd>' +
        '<dt>类型</dt><dd>' + kindName(rowData.kind) + '</dd>' +
        '<dt>目标</dt><dd>' + esc(rowData.goal || '未写') + '</dd>' +
        '<dt>标准</dt><dd>' + esc(rowData.criteria || rowData.completionCriteria || '未写') + '</dd>' +
        '<dt>备注</dt><dd>' + esc(rowData.note || '—') + '</dd>' +
        (rowData.source ? '<dt>来源</dt><dd>课次 · ' + esc(rowData.source.courseId) + '</dd>' : '') +
        '</dl>' +
        ((rowData.phases && rowData.phases.length)
          ? '<div class="ins-sec"><h3>阶段</h3><ul class="ins-list">' + rowData.phases.map(function (p) {
            return '<li class="' + (p.done ? 'done' : '') + '"><span class="mk">' + (p.done ? '✓' : '') + '</span>' + esc(p.title) + '</li>';
          }).join('') + '</ul></div>' : '') +
        ((rowData.slots && rowData.slots.length)
          ? '<div class="ins-sec"><h3>执行时段</h3><ul class="ins-list">' + rowData.slots.map(function (s) {
            return '<li><span class="mk"></span>' + esc(s.label || '执行') + ' · ' + esc(s.start.replace('today', '今天').replace('T', ' ')) + '</li>';
          }).join('') + '</ul></div>' : '') +
        '<div class="ins-acts">' +
        '<button type="button" class="btn btn-prime" data-done="' + rowData.id + '">' + (isDone ? '重新打开' : '划掉') + '</button>' +
        '<button type="button" class="btn" data-noop>打开原记录</button></div>';
      return;
    }

    if (kind === 'notes') {
      var n = rowData;
      var o2 = objOf(n.objectId);
      insBody.innerHTML = '<p class="ins-kicker">' + esc(n.kind) + ' · ' + esc(n.date === 'today' ? '今天 ' + n.time : n.date + ' ' + n.time) + '</p>' +
        '<h3 class="ins-h">' + esc(n.title || '无标题') + '</h3>' +
        '<p style="font-size:12.5px;line-height:1.8;color:var(--ink-2)">' + esc(n.body) + '</p>' +
        '<dl class="kv">' +
        '<dt>对象</dt><dd>' + (o2 ? '<span class="c-dot" style="--thread:' + threadOf(o2.thread) + '"></span>' + esc(o2.name) : '未归属') + '</dd>' +
        '<dt>标签</dt><dd>' + (n.tags || []).map(function (t) { return '<span class="c-tag">#' + esc(t) + '</span>'; }).join(' ') + '</dd></dl>' +
        '<div class="ins-acts"><button type="button" class="btn" data-noop>提炼成事项</button></div>';
      return;
    }

    if (kind === 'objects') {
      var ob = rowData;
      var its = L.items.filter(function (x) { return x.objectId === ob.id; });
      insBody.innerHTML = '<p class="ins-kicker">' + esc(ob.kind) + '</p><h3 class="ins-h">' + esc(ob.name) + '</h3>' +
        '<dl class="kv"><dt>目的</dt><dd>' + esc(ob.goal || '未写') + '</dd>' +
        '<dt>事项</dt><dd>' + its.length + ' 件</dd>' +
        '<dt>笔记</dt><dd>' + L.notes.filter(function (x) { return x.objectId === ob.id; }).length + ' 则</dd></dl>' +
        (its.length ? '<div class="ins-sec"><h3>事项</h3><ul class="ins-list">' + its.map(function (it) {
          return '<li><span class="mk"></span>' + esc(it.title) + '</li>';
        }).join('') + '</ul></div>' : '');
      return;
    }

    if (kind === 'web') {
      var c = rowData;
      insBody.innerHTML = '<p class="ins-kicker">' + esc(c.host) + '</p><h3 class="ins-h">' + esc(c.title) + '</h3>' +
        '<p style="font-family:var(--num);font-size:9.5px;word-break:break-all;color:var(--ink-3)">' + esc(c.url) + '</p>' +
        '<div class="ins-sec"><h3>重点</h3><ul class="ins-list">' + (c.highlights || []).map(function (h) {
          return '<li><span class="mk"></span>' + esc(h) + '</li>';
        }).join('') + '</ul></div>' +
        (c.draft ? '<div class="ins-sec"><h3>待确认的行动</h3><p>' + esc(c.draft) + '</p>' +
          '<div class="ins-acts"><button type="button" class="btn btn-prime" data-noop>收下</button>' +
          '<button type="button" class="btn" data-noop>丢掉</button></div></div>' : '');
      return;
    }

    insBody.innerHTML = '<p class="ins-empty">这一行还没有字段。</p>';
  }

  function showCourse(c) {
    insTitle.textContent = '这门课';
    insMeta.textContent = '第 ' + c.p0 + '–' + c.p1 + ' 节';
    var p0 = L.periods[c.p0 - 1], p1 = L.periods[c.p1 - 1];
    var its = L.items.filter(function (i) { return i.source && i.source.courseId === c.id; });
    insBody.innerHTML = '<p class="ins-kicker">' + esc(c.weeks) + '</p><h3 class="ins-h">' + esc(c.title) + '</h3>' +
      '<dl class="kv">' +
      '<dt>时间</dt><dd>' + p0.s + '–' + p1.e + '</dd>' +
      '<dt>星期</dt><dd>周' + '一二三四五六日'[c.day - 1] + '</dd>' +
      '<dt>节次</dt><dd>第 ' + c.p0 + '–' + c.p1 + ' 节</dd>' +
      '<dt>教师</dt><dd>' + esc(c.teacher) + '</dd>' +
      '<dt>教室</dt><dd>' + esc(c.room) + '</dd></dl>' +
      '<div class="ins-sec"><h3>布置的事</h3>' +
      (its.length ? '<ul class="ins-list">' + its.map(function (i) {
        return '<li><span class="mk"></span>' + esc(i.title) + '</li>';
      }).join('') + '</ul>' : '<p>还没有从这节课布置下来的事。</p>') + '</div>' +
      '<div class="ins-acts"><button type="button" class="btn" data-noop>编辑课程</button>' +
      '<button type="button" class="btn" data-noop>单次调课</button></div>';
  }

  function describe(a) {
    if (!a) return '—';
    if (a.type === 'floating') return '无期限';
    if (a.type === 'deadline') return (a.date === 'today' ? '今天 ' : a.date + ' ') + (a.time || '');
    if (a.type === 'absolute') return a.start.replace('today', '今天').replace('T', ' ');
    if (a.type === 'range') return '区间中';
    if (a.type === 'weekly') return '每周 ' + (a.weekdays || []).join('、');
    return '—';
  }

  /* ── 路由 ─────────────────────────────────────────────── */

  function paint() {
    paintTree();
    paintTable();
    document.body.dataset.page = st.page;
    if (location.hash.slice(1) !== st.page) history.replaceState(null, '', '#' + st.page);
  }

  function go(id) {
    if (!id || id === st.page) { paint(); return; }
    var pg = PG.pages.filter(function (p) { return p.id === id; })[0];
    if (!pg) return;
    st.page = id;
    paint();
  }

  function toggleDone(id) {
    var s = L.todaySlips().filter(function (x) { return x.id === id; })[0];
    var it = L.items.filter(function (x) { return x.id === id; })[0];
    var before = st.done[id] != null ? st.done[id] : (s ? s.done : (it ? it.done : false));
    st.done[id] = !before;
    undo = { id: id, before: before };
    if (s) s.done = !before;
    if (it) it.done = !before;
    paint();
    note(before ? '又打开了' : '划掉了 · Ctrl Z 可撤回');
  }

  function power(id, on) {
    var p = PG.list.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (p.suspended) { note('「' + p.name + '」挂起'); return; }
    if (p.missing) { note('「' + p.name + '」未实装'); return; }
    PG.set(id, on);
    var here = PG.pages.filter(function (x) { return x.id === st.page; })[0];
    var susp = here && PG.list.filter(function (x) { return x.id === here.owner; })[0];
    if (here && !(here.core || PG.isOn(here.owner)) && !(susp && (susp.suspended || susp.missing)) && !(here && here.owner === 'course-import')) st.page = 'today';
    paint();
    note('「' + p.name + '」' + (on ? '已打开' : '已关掉'));
  }

  /* ── 命令 ─────────────────────────────────────────────── */
  function src() {
    var out = PG.visible().map(function (p) { return { own: '页面', name: p.name, sub: '', run: function () { go(p.id); } }; });
    L.items.forEach(function (it) { out.push({ own: '事项', name: it.title, sub: kindName(it.kind), run: function () { st.sel.items = it.id; go('items'); } }); });
    L.objects.forEach(function (o) { out.push({ own: '对象', name: o.name, sub: o.kind, run: function () { st.sel.obj = o.id; go('objects'); } }); });
    PG.list.forEach(function (p) {
      if (p.suspended || p.missing) return;
      var on = !!PG.state[p.id];
      out.push({ own: '插件', name: (on ? '关掉 ' : '打开 ') + p.name, sub: '', run: function () { power(p.id, !on); } });
    });
    return out;
  }
  function paintCmd(q) {
    q = (q || '').trim().toLowerCase();
    var all = src();
    cmdRows = q ? all.filter(function (r) { return (r.own + r.name + r.sub).toLowerCase().indexOf(q) >= 0; }).slice(0, 9) : all.slice(0, 8);
    cmdIndex = 0;
    cmdList.innerHTML = cmdRows.length ? cmdRows.map(function (r, i) {
      return '<li class="ci' + (i === 0 ? ' is-on' : '') + '" data-i="' + i + '"><span class="own">' + esc(r.own) + '</span>' +
        esc(r.name) + '<span class="sub">' + esc(r.sub || '') + '</span></li>';
    }).join('') : '<li class="ci"><span class="own">—</span>没有这一项</li>';
  }
  function openCmd() { cmd.classList.add('is-on'); cmd.removeAttribute('inert'); cmdInput.value = ''; paintCmd(''); setTimeout(function () { cmdInput.focus(); }, 30); }
  function closeCmd() { cmd.classList.remove('is-on'); cmd.setAttribute('inert', ''); }
  function runCmd() { var r = cmdRows[cmdIndex]; if (!r) return; closeCmd(); r.run(); }

  /* ── 事件 ─────────────────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-pick],[data-pick-note],[data-pick-obj],[data-pick-web],[data-pick-course],[data-done],[data-filter],[data-plug],[data-week],[data-month],[data-noop]');
    if (!t) return;
    if (t.dataset.noop !== undefined) { note('这一处在候选稿里没有接行为'); return; }
    if (t.dataset.go) { go(t.dataset.go); return; }
    if (t.dataset.pick) { st.sel.today = t.dataset.pick; st.sel.items = t.dataset.pick; paint(); return; }
    if (t.dataset.pickNote) { st.sel.note = t.dataset.pickNote; paint(); return; }
    if (t.dataset.pickObj) { st.sel.obj = t.dataset.pickObj; paint(); return; }
    if (t.dataset.pickWeb) { st.sel.web = t.dataset.pickWeb; paint(); return; }
    if (t.dataset.pickCourse) { st.sel.course = t.dataset.pickCourse; paint(); return; }
    if (t.dataset.done) { toggleDone(t.dataset.done); return; }
    if (t.dataset.filter) { st.filter = t.dataset.filter; paint(); return; }
    if (t.dataset.plug) { var p = PG.list.filter(function (x) { return x.id === t.dataset.plug; })[0]; if (p) power(p.id, !PG.state[p.id]); return; }
    if (t.dataset.week) { st.week = Math.max(1, Math.min(20, st.week + (+t.dataset.week))); paint(); return; }
    if (t.dataset.month) { st.calOffset += (+t.dataset.month); paint(); return; }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (cmd.classList.contains('is-on')) { closeCmd(); return; }
      if (help.classList.contains('is-on')) { help.classList.remove('is-on'); help.setAttribute('inert', ''); return; }
      return;
    }
    if (cmd.classList.contains('is-on')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdIndex = Math.min(cmdRows.length - 1, cmdIndex + 1); Array.prototype.forEach.call(cmdList.children, function (el, i) { el.classList.toggle('is-on', i === cmdIndex); }); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdIndex = Math.max(0, cmdIndex - 1); Array.prototype.forEach.call(cmdList.children, function (el, i) { el.classList.toggle('is-on', i === cmdIndex); }); return; }
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
    if (e.key === 'Tab' && e.target.closest && e.target.closest('.table')) {
      // Tab 在三栏轮转：表 → 检查器 → 树 → 表
      e.preventDefault();
      var order = [document.getElementById('tree'), document.getElementById('main'), document.getElementById('inspector')];
      var i = order.indexOf(document.activeElement.closest('.tree,.main,.inspector') || order[1]);
      var next = order[(i + 1) % 3];
      (next.querySelector('button, [tabindex]') || next).focus();
      return;
    }
    if (e.key === ' ' && st.page === 'today') {
      var cur = st.sel.today || L.todaySlips()[0] && L.todaySlips()[0].id;
      if (cur) { e.preventDefault(); toggleDone(cur); }
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && st.page === 'today') {
      var slips = L.todaySlips();
      var idx = slips.map(function (x) { return x.id; }).indexOf(st.sel.today);
      if (idx < 0) idx = 0;
      e.preventDefault();
      st.sel.today = slips[(idx + (e.key === 'ArrowDown' ? 1 : slips.length - 1)) % slips.length].id;
      paint();
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
  setInterval(function () { if (st.page === 'today') paint(); }, 60000);
})(window);
