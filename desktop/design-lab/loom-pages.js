/* 织机 · 页面清单
   每一页只负责把自己的内容画出来；壳、路由、插件启停都在 loom.js。
   资料全部来自 shared.js，这里只补现有功能里还没进共用资料的那几段。 */

(function (global) {
  var L = global.Lab;
  var esc = L.esc;
  var hm = L.hm;

  /* ── 补：现有实现里还没进共用资料的几段 ───────────────── */

  // 群消息（真实项目里这个插件是挂起的）
  var chatMessages = [
    { id: 'm1', who: '班级群', at: '11-02 08:12', body: '本周五的<b>实验课</b>调到周四第 5-6 节，地点不变。', kw: ['实验课'] },
    { id: 'm2', who: '导师', at: '11-02 09:40', body: '中期检查定在下周三下午，<b>提前两天</b>把材料发我。', kw: ['提前两天'] },
    { id: 'm3', who: '项目组', at: '11-02 10:05', body: '服务器迁移到新集群，<b>今晚八点</b>停机一小时。', kw: ['今晚八点'] },
    { id: 'm4', who: '班级群', at: '11-01 21:33', body: '奖学金材料 <b>11 月 8 日</b>截止，交到学工办。', kw: ['11 月 8 日'] }
  ];

  // 教务导入：依赖课程表插件
  var importSteps = [
    { t: '选择学校入口', d: '默认南邮 WebVPN；也可以在设置里改成手动粘贴。' },
    { t: '在弹出的窗口里手动登录', d: '账号密码不经过几微，抓完即关，不留存。' },
    { t: '核对抓到的课表', d: '周次、单双周、连堂会先列出来给你逐条确认，不直接写库。' },
    { t: '选择合并还是新建课表', d: '合并只补缺失项，已有的改动和完成状态保留。' },
    { t: '写入并切到新周次', d: '写完立刻刷新今天与日历。' },
    { t: '备选：CSV 导入', d: '不依赖这个插件；课表设置里随时可用。' }
  ];

  // 布局：现有桌面端的七种排布
  var layouts = [
    { id: 'rail', name: '侧栏', d: '默认。左栏固定，内容随宽度收放。' },
    { id: 'top', name: '顶栏', d: '导航横置，内容占满。' },
    { id: 'split', name: '双栏', d: '内容与详情并排。' },
    { id: 'stack', name: '单栏', d: '一列到底，窄窗友好。' },
    { id: 'cover', name: '封面', d: '首屏只给今天，其余收起。' },
    { id: 'dense', name: '紧凑', d: '行高与留白压到最小。' },
    { id: 'wide', name: '宽屏', d: '两列并排，适合大屏。' }
  ];

  // 开发者诊断（只在开发者模式显示）
  var diagnostics = [
    ['运行时', 'Electron 44 · Chromium 152'],
    ['工作区', '本地文件 · 已连接（示例）'],
    ['数据库', 'schema 3 · 无迁移待办'],
    ['IPC 校验', '全部命令通过参数校验'],
    ['资源', '2 个定时器 · 1 个在途请求'],
    ['最近错误', '无']
  ];

  /* ── 页面清单（分组只决定条带里的位置；后装插件自动落进「新装」） ── */

  var groupOrder = ['home', 'now', 'record', 'help', 'system', 'more'];
  var groups = {
    home: { name: '总览' },
    now: { name: '此刻' },
    record: { name: '记录' },
    help: { name: '助手' },
    system: { name: '系统' },
    more: { name: '新装' }
  };

  var pages = [
    { id: 'today', owner: 'today', name: '今天', group: 'home', thread: 'turmeric' },
    { id: 'items', owner: 'plans', name: '事项', group: 'record', thread: 'madder' },
    { id: 'courses', owner: 'courses', name: '课程表', group: 'now', thread: 'indigo' },
    { id: 'calendar', owner: 'calendar', name: '日历', group: 'now', thread: 'celadon' },
    { id: 'notes', owner: 'notes', name: '笔记', group: 'record', thread: 'wisteria' },
    { id: 'objects', owner: 'objects', name: '对象', group: 'record', thread: 'moss' },
    { id: 'web', owner: 'web-capture', name: '网页', group: 'record', thread: 'clay' },
    { id: 'reminders', owner: 'reminders', name: '提醒', group: 'help', thread: 'madder' },
    { id: 'assistant', owner: 'assistant', name: '助手', group: 'help', thread: 'slate' },
    { id: 'chat', owner: 'chat-monitor', name: '群消息', group: 'help', thread: 'wisteria' },
    { id: 'import', owner: 'course-import', name: '导入', group: 'now', thread: 'clay' },
    { id: 'plugins', owner: 'plugins', name: '插件', group: 'system', core: true },
    { id: 'settings', owner: 'settings', name: '设置', group: 'system', core: true }
  ];

  /* ── 插件清单（与桌面端 builtinModules 对齐） ─────────── */

  var plugins = [
    { id: 'today', name: '今天', desc: '汇总已开启功能里的今日课程、计划、待办与静默提醒。', on: true, thread: 'turmeric' },
    { id: 'plans', name: '事项', desc: '统一管理待办、事件、考试、阶段计划与重复安排。', on: true, covers: 'items', thread: 'madder' },
    { id: 'courses', name: '课程表', desc: '多课表、周次切换、课程编辑与独立作息。', on: true, thread: 'indigo' },
    { id: 'calendar', name: '日历', desc: '按月、周、日查看待办期限、计划区间与阶段。', on: true, thread: 'celadon' },
    { id: 'notes', name: '笔记', desc: '记录见闻、感受、想法、摘录与复盘，按日期、用途或标签查找。', on: true, thread: 'wisteria' },
    { id: 'objects', name: '对象视图 Beta', desc: '围绕课程、项目或主题集中查看安排、事项、笔记与网页资料。', on: true, thread: 'moss' },
    { id: 'web-capture', name: '网页采集', desc: '公开网页、重点整理与待确认的行动草稿。', on: true, thread: 'clay' },
    { id: 'reminders', name: '提醒', desc: '定时通知、今天的静默提示和长期注意事项。', on: true, thread: 'madder' },
    { id: 'assistant', name: '全局助手', desc: '文字、语音、图片与可编辑的行动草稿；API 设置随此插件启停。', on: true, thread: 'slate' },
    { id: 'course-import', name: '教务导入', desc: '默认南邮 WebVPN，手动登录后抓取课表。CSV 不受此开关影响。', on: false, requires: 'courses', thread: 'clay' },
    { id: 'chat-monitor', name: '群消息', desc: '本地群消息收件箱、关键词与待确认事项。QQ/微信适配器需另行配置。', on: false, suspended: true, thread: 'wisteria' },
    { id: 'ledger', name: '记账', desc: '导航里还留着一个位置，但功能尚未实装。', on: false, missing: true }
  ];

  /* ── 后装插件：演示「装多少都接得住」，只在这次打开期间有效 ── */

  var extraThreads = ['turmeric', 'moss', 'indigo', 'clay', 'wisteria', 'celadon', 'madder', 'slate'];
  var extraTemplates = [
    { slug: 'focus', name: '专注计时', desc: '一个计时页，结束时可以把这段时间记到对象上。', pages: [{ slug: 'timer', name: '计时' }] },
    { slug: 'reading', name: '阅读摘录', desc: '读到哪里、摘了哪句、之后要做什么。', pages: [{ slug: 'now', name: '在读' }, { slug: 'quotes', name: '摘录' }] },
    { slug: 'lab', name: '实验记录', desc: '步骤、参数与照片放在同一条记录里。', pages: [{ slug: 'log', name: '实验' }, { slug: 'protocols', name: '流程' }] },
    { slug: 'vocab', name: '词汇卡', desc: '每天一组，按遗忘曲线自动排。', pages: [{ slug: 'cards', name: '卡片' }] },
    { slug: 'weekly', name: '周报', desc: '把这一周完成的事项和笔记收成一页。', pages: [{ slug: 'report', name: '周报' }] },
    { slug: 'feeds', name: '订阅', desc: '只收公开源，读完再决定要不要留下。', pages: [{ slug: 'inbox', name: '收件' }] }
  ];
  var extraSeq = 0;
  var extraPlugins = [];
  var extraPages = [];

  /* ── 状态：只在这一次打开期间有效 ─────────────────────── */

  var state = {
    done: {},
    week: L.semesters[0].current,
    parity: 'all',
    itemFilter: 'all',
    noteFilter: 'all',
    noteSel: null,
    objSel: null,
    webSel: null,
    calMode: 'month',
    calOffset: 0,
    theme: 'linen',
    skin: 'paper',
    developer: false,
    modules: {}
  };
  plugins.forEach(function (p) { state.modules[p.id] = !!p.on; });

  function isOn(id) {
    var p = plugins.filter(function (x) { return x.id === id; })[0];
    if (!p) return true;
    if (p.requires && !state.modules[p.requires]) return false;
    return !!state.modules[id];
  }
  function threadOf(key) { return L.threads[key] || 'var(--accent)'; }
  function objById(id) { return L.objects.filter(function (o) { return o.id === id; })[0]; }
  function objName(id) { var o = objById(id); return o ? o.name : ''; }

  /* ── 小件 ─────────────────────────────────────────────── */

  function ph(title, sub, right) {
    return '<div class="ph"><div class="ph-l"><h1>' + esc(title) + '</h1>' +
      (sub ? '<p>' + sub + '</p>' : '') + '</div>' +
      (right ? '<div class="ph-r">' + right + '</div>' : '') + '</div>';
  }
  function tag(text, thread) {
    return '<span class="tag">' + (thread ? '<i class="tag-dot" style="--thread:' + threadOf(thread) + '"></i>' : '') + esc(text) + '</span>';
  }
  function btn(label, act, extra) {
    return '<button type="button" class="btn' + (extra ? ' ' + extra : '') + '" data-act="' + act + '">' + label + '</button>';
  }
  function empty(text) { return '<p class="empty">' + esc(text) + '</p>'; }

  // 装一批演示插件：插件表、页面表、开关三处一起长，壳只负责把它们排进去。
  function installBatch() {
    var batch = extraSeq + 1, addedPages = 0;
    extraTemplates.forEach(function (t) {
      var pid = 'extra-' + batch + '-' + t.slug;
      var thread = extraThreads[extraPlugins.length % extraThreads.length];
      plugins.push({
        id: pid, name: t.name + (batch > 1 ? ' ' + batch : ''), desc: t.desc,
        on: true, thread: thread, synthetic: true
      });
      state.modules[pid] = true;
      extraPlugins.push(pid);
      t.pages.forEach(function (page) {
        var id = pid + '-' + page.slug;
        pages.push({ id: id, owner: pid, name: page.name, group: 'more', thread: thread, synthetic: true });
        extraPages.push(id);
        addedPages += 1;
      });
    });
    extraSeq = batch;
    return { plugins: extraTemplates.length, pages: addedPages };
  }

  function resetBatch() {
    var badPlugins = Object.fromEntries(extraPlugins.map(function (id) { return [id, true]; }));
    var badPages = Object.fromEntries(extraPages.map(function (id) { return [id, true]; }));
    for (var i = plugins.length - 1; i >= 0; i--) {
      if (badPlugins[plugins[i].id]) { delete state.modules[plugins[i].id]; plugins.splice(i, 1); }
    }
    for (var j = pages.length - 1; j >= 0; j--) {
      if (badPages[pages[j].id]) pages.splice(j, 1);
    }
    extraPlugins = [];
    extraPages = [];
    extraSeq = 0;
  }

  function renderExtra(page) {
    var plug = plugins.filter(function (p) { return p.id === page.owner; })[0] || { name: '后装插件', desc: '' };
    return ph(page.name, plug.name + ' 装进来的页面；目录、条带和命令面板都从插件表生成。', tag('后装插件', page.thread)) +
      '<div class="card" style="padding:20px 22px">' +
        '<div style="font-family:var(--disp);font-size:17px;color:var(--ink)">' + esc(plug.name) + '</div>' +
        '<p style="margin:8px 0 0;font-size:12.5px;line-height:1.75;color:var(--ink3)">' + esc(plug.desc) + '</p>' +
        '<p style="margin:10px 0 0;font-size:12px;line-height:1.7;color:var(--ink3)">这一页没有业务数据，只用来说明：后装插件不需要改四套布局，也会被条带接住。</p>' +
        '<div style="margin-top:16px"><button type="button" class="btn" data-go="plugins">回到插件</button></div>' +
      '</div>';
  }

  var KIND = { task: '待办', event: '事件', exam: '考试', plan: '计划' };

  /* ── 今天 ─────────────────────────────────────────────── */

  function renderToday() {
    var now = L.clockNow();
    var slips = L.todaySlips();
    if (!slips.length) return ph('今天', '把已开启功能里的今日安排叠在一条线上。', '') + empty('今天没有排定的安排。');

    var rows = '', placedNow = false, done = 0;
    slips.forEach(function (s) {
      if (!placedNow && s.at > now) {
        rows += '<div class="now-line"><b>此刻 ' + hm(now) + '</b></div>';
        placedNow = true;
      }
      var isDone = state.done[s.id] != null ? state.done[s.id] : s.done;
      if (isDone) done++;
      rows += '<div class="warp-row">' +
        '<div class="warp-time"><b>' + hm(s.at) + '</b>' + (s.dur ? '<span>' + hm(s.at + s.dur) + '</span>' : '') + '</div>' +
        '<div class="warp-gutter">' +
          '<button type="button" class="knot' + (isDone ? ' is-done' : '') + '" data-act="done" data-id="' + s.id + '"' +
          ' role="checkbox" aria-checked="' + (isDone ? 'true' : 'false') + '" aria-label="完成 ' + esc(s.title) + '"></button>' +
        '</div>' +
        '<button type="button" class="slip' + (isDone ? ' is-done' : '') + '" data-act="open-item" data-id="' + s.id + '">' +
          '<span class="slip-main">' +
            '<span class="slip-title">' + esc(s.title) + '</span>' +
            (s.goal ? '<span class="slip-sub">' + esc(s.goal) + '</span>' : (s.note ? '<span class="slip-sub">' + esc(s.note) + '</span>' : '')) +
            '<span class="slip-meta">' + tag(KIND[s.kind] || '事项') +
              (s.obj ? tag(s.obj, s.thread) : '') +
              (s.phases && s.phases.length ? tag(s.phases.filter(function (p) { return p.done; }).length + '/' + s.phases.length + ' 阶段') : '') +
              (s.source && s.source.kind === 'course' ? tag('课次布置') : '') +
            '</span>' +
          '</span>' +
          '<span class="slip-margin">' +
            '<b>' + (s.dur ? s.dur + ' 分钟' : (s.kind === 'task' ? '截止 ' + hm(s.at) : '点')) + '</b>' +
            '<span>' + (s.obj ? esc(s.obj) : '未归属对象') + '</span>' +
            (s.criteria ? '<span>有完成标准</span>' : '') +
          '</span>' +
        '</button></div>';
    });
    if (!placedNow) rows += '<div class="now-line"><b>此刻 ' + hm(now) + '</b></div>';

    var sub = '第 ' + state.week + ' 周 · ' + L.weekdayName() + ' · ' + slips.length + ' 件安排' + (done ? '，已完成 ' + done + ' 件' : '') + '。点线上的结就完成，<kbd>Ctrl Z</kbd> 撤回。';
    return ph('今天', sub, btn('回到此刻', 'scroll-now', 'btn-quiet')) +
      '<div class="warp">' + rows + '</div>';
  }

  /* ── 事项 ─────────────────────────────────────────────── */

  function renderItems() {
    var f = state.itemFilter;
    var list = L.items.filter(function (it) { return f === 'all' || it.kind === f || (f === 'task' && it.kind === 'task'); });
    var counts = { all: L.items.length };
    ['task', 'event', 'exam', 'plan'].forEach(function (k) { counts[k] = L.items.filter(function (i) { return i.kind === k; }).length; });

    var chips = '<div class="filters">' +
      ['all', 'task', 'event', 'exam', 'plan'].map(function (k) {
        var label = k === 'all' ? '全部 ' + counts.all : (KIND[k] || k) + ' ' + counts[k];
        return '<button type="button" class="chip" data-act="item-filter" data-k="' + k + '" aria-pressed="' + (f === k) + '">' + label + '</button>';
      }).join('') + '</div>';

    var body = list.map(function (it) {
      var isDone = state.done[it.id] != null ? state.done[it.id] : it.done;
      var ph2 = it.phases || [];
      var pct = ph2.length ? Math.round(ph2.filter(function (p) { return p.done; }).length / ph2.length * 100) : 0;
      var a = it.anchor;
      var when = a.type === 'deadline' ? '截止 ' + (a.date === 'today' ? '今天 ' : '') + (a.time || '')
        : a.type === 'floating' ? '无期限'
        : a.type === 'weekly' ? '每周 ' + (a.weekdays || []).map(function (d) { return '日一二三四五六'[d % 7]; }).join('、') + ' ' + (a.startTime || '')
        : a.type === 'range' ? '区间中' : '已排定';

      return '<button type="button" class="item' + (isDone ? ' is-done' : '') + '" data-act="open-item" data-id="' + it.id + '">' +
        '<span>' +
          '<span class="item-title">' + esc(it.title) + '</span>' +
          (it.goal ? '<span class="item-goal">' + esc(it.goal) + '</span>' : '') +
          '<span class="item-meta">' + tag(KIND[it.kind] || '事项') +
            (it.objectId ? tag(objName(it.objectId), (objById(it.objectId) || {}).thread) : '') +
            (it.source ? tag('来自课次') : '') +
            (it.slots && it.slots.length ? tag(it.slots.length + ' 段执行时段') : '') +
            (it.completionCriteria ? tag('有完成标准') : '') +
          '</span>' +
          (ph2.length ? '<span class="bar"><i style="width:' + pct + '%"></i></span>' : '') +
        '</span>' +
        '<span class="item-side"><b>' + esc(when) + '</b>' +
          (ph2.length ? '<span>阶段 ' + ph2.filter(function (p) { return p.done; }).length + '/' + ph2.length + '</span>' : '') +
          (it.note ? '<span>' + esc(it.note.slice(0, 18)) + (it.note.length > 18 ? '…' : '') + '</span>' : '') +
        '</span></button>';
    }).join('');

    return ph('事项', '待办、事件、考试与阶段计划放在一起。每条都能带目标、完成标准和执行时段。',
      btn('新增', 'noop', 'btn-quiet')) + chips + '<div class="list">' + (body || empty('这个筛选下没有事项。')) + '</div>';
  }

  /* ── 课程表 ───────────────────────────────────────────── */

  function renderCourses() {
    var sem = L.semesters[0];
    var today = new Date().getDay() || 7;
    var odd = state.week % 2 === 1;
    var visible = L.courses.filter(function (c) {
      if (state.parity === 'all') return true;
      var single = c.weeks.indexOf('单') >= 0, dual = c.weeks.indexOf('双') >= 0;
      if (single && !dual) return odd;
      if (dual && !single) return !odd;
      return true;
    });

    var head = '<div class="tt-head"><div></div>' +
      ['一', '二', '三', '四', '五', '六', '日'].map(function (d, i) {
        return '<div class="' + (i + 1 === today ? 'is-today' : '') + '">周' + d + '</div>';
      }).join('') + '</div>';

    var rows = '';
    for (var n = 1; n <= 10; n += 1) {
      var p = L.periods[n - 1];
      rows += '<div class="tt-row"><div class="tt-hour"><b>' + p.s + '</b>' + p.e + '</div>';
      for (var d = 1; d <= 7; d += 1) {
        var cell = visible.filter(function (c) { return c.day === d && c.p0 === n; });
        rows += '<div class="tt-cell' + (d === today ? ' is-today' : '') + '">';
        cell.forEach(function (c) {
          var moved = L.adjustments.some(function (a) { return a.courseId === c.id && a.status === 'moved'; });
          var span = c.p1 - c.p0 + 1;
          rows += '<button type="button" class="tt-course' + (moved ? ' is-moved' : '') + '" data-act="open-course" data-id="' + c.id + '"' +
            ' style="--thread:' + threadOf(c.thread) + ';--span:' + span + '">' +
            '<b>' + esc(c.title) + '</b><span>' + esc(c.teacher) + ' · ' + esc(c.room) + '</span><em>' + esc(c.weeks) + ' · ' + span + ' 节</em></button>';
        });
        rows += '</div>';
      }
      rows += '</div>';
    }

    var strip = '<div class="week-strip">' +
      btn('‹', 'week-prev', 'btn-quiet') +
      '<span class="tag" style="height:27px;padding:0 11px">第 ' + state.week + ' 周 · ' + (odd ? '单' : '双') + '</span>' +
      btn('›', 'week-next', 'btn-quiet') +
      '<span style="width:14px"></span>' +
      ['all', 'odd', 'even'].map(function (k) {
        var label = k === 'all' ? '全部' : (k === 'odd' ? '只看单周' : '只看双周');
        return '<button type="button" class="chip" data-act="parity" data-k="' + k + '" aria-pressed="' + (state.parity === k) + '">' + label + '</button>';
      }).join('') +
      '<span style="flex:1"></span>' +
      tag('当前课表 ' + sem.name) + tag(sem.weeks + ' 周') + tag(L.courses.length + ' 门课') +
      '</div>';

    var adj = L.adjustments.length
      ? '<div class="sect"><div class="sect-h"><h2>调课记录</h2><small>与「今天」同源</small></div>' +
        L.adjustments.map(function (a) {
          var c = L.courses.filter(function (x) { return x.id === a.courseId; })[0];
          return '<div style="display:flex;gap:12px;align-items:center;padding:10px 2px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent)">' +
            tag(a.status === 'moved' ? '调出' : '停课', (c || {}).thread) +
            '<span style="font-size:13px;color:var(--ink2)">' + esc((c || {}).title || '') + '</span>' +
            '<span style="font-size:12px;color:var(--ink3)">' + esc(a.note || '') + '</span></div>';
        }).join('') + '</div>'
      : '';

    return ph('课程表', '多课表、周次与单双周、连堂、逐学期作息。单次调课会同时改课程表和今天。',
      btn('课程设置', 'noop', 'btn-quiet') + btn('导入', 'goto-import', 'btn-quiet')) +
      strip + '<div class="tt">' + head + rows + '</div>' + adj;
  }

  /* ── 日历 ─────────────────────────────────────────────── */

  function renderCalendar() {
    var now = new Date();
    var base = new Date(now.getFullYear(), now.getMonth() + state.calOffset, 1);
    var y = base.getFullYear(), m = base.getMonth();
    var first = new Date(y, m, 1);
    var startDow = (first.getDay() + 6) % 7;
    var daysIn = new Date(y, m + 1, 0).getDate();
    var cells = [];

    for (var i = 0; i < startDow; i += 1) cells.push({ out: true, n: new Date(y, m, 0).getDate() - startDow + i + 1 });
    for (var d = 1; d <= daysIn; d += 1) cells.push({ out: false, n: d });
    while (cells.length % 7 !== 0) cells.push({ out: true, n: cells.length - startDow - daysIn + 1 });

    var todayN = now.getDate(), sameMonth = state.calOffset === 0;

    // 每一天挂什么：用绝对日期/截止/区间推
    function marksFor(day) {
      var out = [];
      L.items.forEach(function (it) {
        var a = it.anchor;
        if (a.type === 'deadline' && a.date === 'today' && day === todayN && sameMonth) out.push({ t: it.title, k: 'deadline', thread: (objById(it.objectId) || {}).thread });
        if (a.type === 'absolute' && a.start.indexOf('today') === 0 && day === todayN && sameMonth) out.push({ t: it.title, k: 'event', thread: (objById(it.objectId) || {}).thread });
        if (a.type === 'absolute' && a.start.indexOf('d+21') === 0 && day === todayN + 21) out.push({ t: it.title, k: 'exam', thread: (objById(it.objectId) || {}).thread });
        if (a.type === 'weekly' && (a.weekdays || []).indexOf(day % 7) >= 0) out.push({ t: it.title, k: 'weekly', thread: (objById(it.objectId) || {}).thread });
      });
      return out.slice(0, 3);
    }

    var body = cells.map(function (c) {
      var isToday = !c.out && sameMonth && c.n === todayN;
      var mk = c.out ? [] : marksFor(c.n);
      return '<button type="button" class="cal-cell' + (c.out ? ' is-out' : '') + (isToday ? ' is-today' : '') + '" data-act="noop">' +
        '<span class="cal-n">' + c.n + '</span>' +
        '<span class="cal-marks">' + mk.map(function (x) {
          return '<span class="cal-mark"><i style="--thread:' + threadOf(x.thread) + '"></i>' + esc(x.t) + '</span>';
        }).join('') + '</span></button>';
    }).join('');

    var modes = ['month', 'week', 'day'];
    var right = '<div class="filters" style="margin:0">' + modes.map(function (k) {
      var label = k === 'month' ? '月' : (k === 'week' ? '周' : '日');
      return '<button type="button" class="chip" data-act="cal-mode" data-k="' + k + '" aria-pressed="' + (state.calMode === k) + '">' + label + '</button>';
    }).join('') + '</div>';

    var head = '<div class="ph-r" style="margin-bottom:16px">' +
      btn('‹', 'cal-prev', 'btn-quiet') +
      '<span class="tag" style="height:27px;padding:0 11px">' + y + ' 年 ' + (m + 1) + ' 月</span>' +
      btn('›', 'cal-next', 'btn-quiet') + '</div>';

    return ph('日历', '月、周、日三种看法。<b>Ctrl K</b> 里可以直接跳到某一天。', right) + head +
      '<div class="cal-grid">' +
      ['一', '二', '三', '四', '五', '六', '日'].map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('') +
      body + '</div>';
  }

  /* ── 笔记 ─────────────────────────────────────────────── */

  function renderNotes() {
    var kinds = ['all', '见闻', '感受', '想法', '摘录', '复盘'];
    var counts = { all: L.notes.length };
    kinds.slice(1).forEach(function (k) { counts[k] = L.notes.filter(function (n) { return n.kind === k; }).length; });

    var chips = '<div class="filters">' + kinds.map(function (k) {
      return '<button type="button" class="chip" data-act="note-filter" data-k="' + k + '" aria-pressed="' + (state.noteFilter === k) + '">' +
        (k === 'all' ? '全部 ' + counts.all : k + ' ' + (counts[k] || 0)) + '</button>';
    }).join('') + '</div>';

    var list = L.notes.filter(function (n) { return state.noteFilter === 'all' || n.kind === state.noteFilter; });
    var sel = L.notes.filter(function (n) { return n.id === state.noteSel; })[0] || list[0];

    var rows = list.map(function (n) {
      var o = objById(n.objectId);
      return '<button type="button" class="note-row' + (sel && sel.id === n.id ? ' is-on' : '') + '" data-act="note-sel" data-id="' + n.id + '">' +
        '<span class="note-h"><strong>' + esc(n.title || n.kind + ' · ' + (o ? o.name : '未归属')) + '</strong>' +
        '<time>' + esc(n.date === 'today' ? '今天 ' + n.time : n.date + ' ' + n.time) + '</time>' +
        tag(n.kind, o ? o.thread : null) + '</span>' +
        '<span class="note-body">' + esc(n.body.slice(0, 64)) + (n.body.length > 64 ? '…' : '') + '</span></button>';
    }).join('');

    var reader = sel ? '<aside class="reader"><div class="meta">' + esc(sel.date === 'today' ? '今天 ' + sel.time : sel.date + ' ' + sel.time) + ' · ' + sel.kind + '</div>' +
      (sel.title ? '<h3>' + esc(sel.title) + '</h3>' : '') +
      '<p>' + esc(sel.body) + '</p>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      (sel.tags || []).map(function (t) { return tag('#' + t); }).join('') +
      (sel.objectId ? tag(objName(sel.objectId), (objById(sel.objectId) || {}).thread) : '') +
      '</div></aside>' : '';

    return ph('笔记', '见闻、感受、想法、摘录与复盘，都可以挂到一个对象上。',
      btn('新笔记', 'noop', 'btn-quiet')) + chips +
      '<div class="journal"><div>' + (rows || empty('这一类还没有记录。')) + '</div>' + reader + '</div>';
  }

  /* ── 对象 ─────────────────────────────────────────────── */

  function renderObjects() {
    var grid = L.objects.map(function (o) {
      return '<button type="button" class="obj' + (state.objSel === o.id ? ' is-on' : '') + '" data-act="obj-sel" data-id="' + o.id + '">' +
        '<span class="obj-k"><i class="kn" style="--thread:' + threadOf(o.thread) + '"></i>' + esc(o.kind) + '</span>' +
        '<span class="obj-n">' + esc(o.name) + '</span>' +
        '<span class="obj-g">' + esc(o.goal || '还没有写目的') + '</span>' +
        '<span class="obj-c">' + o.n + ' 条关联</span></button>';
    }).join('');

    var sel = objById(state.objSel);
    var detail = '';
    if (sel) {
      var items = L.items.filter(function (i) { return i.objectId === sel.id; });
      var notes = L.notes.filter(function (n) { return n.objectId === sel.id; });
      var caps = L.captures.filter(function (c) { return c.objectId === sel.id; });
      detail = '<div class="sect"><div class="sect-h"><h2>' + esc(sel.name) + '</h2><small>' + items.length + ' 件事 · ' + notes.length + ' 则笔记 · ' + caps.length + ' 条网页</small></div>' +
        (items.length ? items.map(function (i) {
          return '<div style="display:flex;gap:12px;align-items:center;padding:10px 2px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent)">' +
            tag(KIND[i.kind] || '事项') + '<span style="font-size:13px;color:var(--ink2)">' + esc(i.title) + '</span></div>';
        }).join('') : '') +
        (notes.length ? '<div style="margin-top:12px">' + notes.map(function (n) {
          return '<p style="margin:0 0 8px;font-size:12.5px;color:var(--ink3);line-height:1.7">' + esc(n.body.slice(0, 60)) + '…</p>';
        }).join('') + '</div>' : '') +
        (!items.length && !notes.length ? empty('这个对象下还没有内容。') : '') + '</div>';
    }

    return ph('对象', '课程、项目、主题各算一块。点一块，把散在各个功能里的东西收回来。',
      btn('新建对象', 'noop', 'btn-quiet')) +
      '<div class="objs">' + grid + '</div>' + detail;
  }

  /* ── 网页采集 ─────────────────────────────────────────── */

  function renderWeb() {
    var list = '<div class="web-list">' + L.captures.map(function (c) {
      return '<button type="button" class="web-item' + (state.webSel === c.id ? ' is-on' : '') + '" data-act="web-sel" data-id="' + c.id + '">' +
        '<strong>' + esc(c.title) + '</strong><small>' + esc(c.host) + ' · ' + esc(c.at) + '</small></button>';
    }).join('') + '</div>';

    var c = L.captures.filter(function (x) { return x.id === state.webSel; })[0] || L.captures[0];
    var doc = c ? '<div class="web-doc"><h3>' + esc(c.title) + '</h3>' +
      '<div class="url">' + esc(c.url) + '</div>' +
      '<ul>' + (c.highlights || []).map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>' +
      (c.draft ? '<div class="draft"><div style="font-size:10.5px;letter-spacing:.1em;color:var(--accent);margin-bottom:6px">待确认的行动</div>' +
        '<div style="font-size:13.5px;color:var(--ink)">' + esc(c.draft) + '</div>' +
        '<div style="margin-top:12px;display:flex;gap:6px">' + btn('收下', 'noop') + btn('丢掉', 'noop', 'btn-quiet') + '</div></div>'
        : '<p style="margin-top:18px;font-size:12px;color:var(--ink3)">这条已经整理过了，没有待确认的行动。</p>') +
      '</div>' : empty('还没有采集过网页。');

    return ph('网页采集', '公开网页的原文、重点，以及一条待确认的行动草稿。草稿不确认就不落地。',
      btn('采集', 'noop', 'btn-quiet') + btn('打开文件夹', 'noop', 'btn-quiet')) +
      '<div class="web">' + list + doc + '</div>';
  }

  /* ── 提醒 ─────────────────────────────────────────────── */

  function renderReminders() {
    var groups = [
      { k: 'timed', name: '定时通知', d: '到点点一下，过了就不再响。' },
      { k: 'silent', name: '今天的静默提示', d: '只在「今天」里露一行，不弹窗。' },
      { k: 'attention', name: '长期注意事项', d: '一直挂到那件事结束。' }
    ];
    var body = groups.map(function (g) {
      var rows = L.reminders.filter(function (r) { return r.type === g.k; });
      return '<div><h3>' + g.name + '</h3><p>' + g.d + '</p>' +
        (rows.length ? rows.map(function (r) {
          return '<div style="padding:9px 0;border-top:1px solid color-mix(in srgb,var(--line) 60%,transparent);font-size:13px;color:var(--ink2)">' +
            '<div>' + esc(r.title) + '</div>' +
            '<div style="font-family:var(--num);font-size:10.5px;color:var(--ink3);margin-top:2px">' + esc(r.at || r.until || '') + '</div></div>';
        }).join('') : '<p style="font-size:11.5px;color:var(--ink3)">没有。</p>') +
        '</div>';
    }).join('');

    return ph('提醒', '定时、静默、长期三种；关掉这个插件只暂停系统通知，记录都还在。',
      btn('通知诊断', 'noop', 'btn-quiet')) +
      '<div class="tri">' + body + '</div>' +
      '<div class="sect"><div class="sect-h"><h2>系统提醒</h2><small>当前设备</small></div>' +
      '<dl class="kv"><dt>通知权限</dt><dd>已授权（示例）</dd>' +
      '<dt>定时任务</dt><dd>1 个在等 · 18:30 取快递</dd>' +
      '<dt>静默提示</dt><dd>今天 3 条，只在「今天」显示</dd>' +
      '<dt>关闭插件时</dt><dd>暂停系统通知，保留全部记录；重开后不会补发已过期的那几条</dd></dl></div>';
  }

  /* ── 助手 ─────────────────────────────────────────────── */

  function renderAssistant() {
    var d = L.assistantDraft;
    var steps = d.steps.map(function (s, i) {
      return '<li class="' + (i === 0 ? 'is-now' : '') + '"><b>' + esc(s.title) + '</b>' +
        '<small>' + esc(s.time) + (s.guessed ? ' · 这一条是猜的，可以改' : '') + '</small></li>';
    }).join('');

    return ph('助手', '说一句人话，它给出可编辑的行动草稿。标了「猜」的地方要你自己看一眼。',
      btn('API 设置', 'noop', 'btn-quiet')) +
      '<div class="card" style="padding:18px 20px">' +
        '<div style="font-size:10.5px;letter-spacing:.1em;color:var(--ink3);margin-bottom:8px">你说</div>' +
        '<div style="font-family:var(--disp);font-size:19px;line-height:1.6;color:var(--ink)">' + esc(d.input) + '</div>' +
      '</div>' +
      '<div class="sect"><div class="sect-h"><h2>它会做这些</h2><small>' + d.steps.length + ' 步 · ' + d.steps.filter(function (s) { return s.guessed; }).length + ' 步是推测</small></div>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<div style="display:flex;gap:8px;margin-top:6px">' + btn('就这样写进去', 'noop') + btn('全部改一遍', 'noop', 'btn-quiet') + btn('不要', 'noop', 'btn-quiet') + '</div></div>' +
      '<div class="sect"><div class="sect-h"><h2>能力</h2><small>关掉助手，API 设置一起收起</small></div>' +
      '<dl class="kv"><dt>输入</dt><dd>文字、语音、图片（本地转写）</dd>' +
      '<dt>输出</dt><dd>可编辑的行动草稿，逐条确认后才落地</dd>' +
      '<dt>不做什么</dt><dd>不自动写库、不替你点确认、不把内容传出去</dd></dl></div>';
  }

  /* ── 群消息（挂起） ───────────────────────────────────── */

  function renderChat() {
    var msgs = chatMessages.map(function (m) {
      var body = esc(m.body).replace(/&lt;b&gt;(.+?)&lt;\/b&gt;/g, '<em>$1</em>');
      return '<div class="msg"><div class="msg-who">' + esc(m.who) + '<br>' + esc(m.at.slice(6)) + '</div>' +
        '<div class="msg-body">' + body + '</div></div>';
    }).join('');

    return ph('群消息', '本地收件箱、关键词与待确认事项。QQ / 微信适配器需要另行配置。',
      '<span class="tag">已暂停</span>') +
      '<div class="card" style="padding:16px 18px;border-style:dashed;margin-bottom:26px">' +
        '<div style="font-size:13px;color:var(--ink2);line-height:1.7">这个插件在正式版本里是<strong>挂起</strong>状态：界面在，开关不生效，也不注册任何命令。下面是它为接通之后准备的收件箱样子。</div>' +
      '</div>' +
      '<div class="sect"><div class="sect-h"><h2>关键词命中</h2><small>「实验课」「提前两天」「今晚八点」「11 月 8 日」</small></div>' +
      msgs + '</div>' +
      '<div class="sect"><div class="sect-h"><h2>待确认</h2><small>命中的消息不会自动变成事项</small></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + tag('周五实验课调课', 'moss') + tag('中期材料提前两天', 'madder') + tag('今晚八点停机', 'wisteria') + '</div></div>';
  }

  /* ── 教务导入 ─────────────────────────────────────────── */

  function renderImport() {
    if (!isOn('courses')) {
      return ph('教务导入', '这个插件依赖课程表。课程表关掉的时候，它也不会出现。', '') +
        '<div class="empty">先到「插件」里把课程表打开。</div>';
    }
    if (!state.modules['course-import']) {
      return ph('教务导入', '抓课表要经过学校入口，所以默认不开启。要用的时候在下面打开。', '') +
        '<div class="card" style="padding:22px 24px">' +
          '<div style="font-size:14px;color:var(--ink);margin-bottom:6px">教务导入还没开启</div>' +
          '<p style="margin:0 0 16px;font-size:12.5px;color:var(--ink3);line-height:1.7">开启后这里给出六个步骤；账号密码不经过几微。CSV 导入不受这个开关影响，随时可用。</p>' +
          '<button type="button" class="btn" data-act="power" data-id="course-import">开启教务导入</button>' +
        '</div>';
    }
    var steps = importSteps.map(function (s, i) {
      return '<li class="' + (i === 0 ? 'is-now' : '') + '"><b>' + esc(s.t) + '</b><small>' + esc(s.d) + '</small></li>';
    }).join('');
    return ph('教务导入', '默认南邮 WebVPN。手动登录之后才抓，抓完即关。',
      tag('依赖课程表') + tag('CSV 可用')) +
      '<ol class="steps">' + steps + '</ol>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' + btn('开始', 'noop') + btn('改用 CSV', 'noop', 'btn-quiet') + '</div>';
  }

  /* ── 插件管理 ─────────────────────────────────────────── */

  function renderPlugins() {
    var cards = plugins.map(function (p) {
      var on = !!state.modules[p.id];
      var blocked = p.requires && !state.modules[p.requires];
      var cls = 'plug' + (on && !blocked ? '' : ' is-off') + (blocked ? ' is-blocked' : '') + (p.missing ? ' is-blocked' : '');
      var ownPages = pages.filter(function (page) { return page.owner === p.id; });
      var sw = '<button type="button" class="sw" role="switch" aria-checked="' + (on && !blocked) + '" data-act="power" data-id="' + p.id + '"' +
        (p.suspended || p.missing ? ' disabled' : '') + ' aria-label="开关 ' + esc(p.name) + '"></button>';
      return '<div class="' + cls + '">' +
        '<div>' +
          '<div class="plug-head"><i class="plug-thread" style="--thread:' + threadOf(p.thread) + '" aria-hidden="true"></i>' +
            '<h3>' + esc(p.name) +
              (p.suspended ? '<span class="tag">挂起</span>' : '') +
              (p.missing ? '<span class="tag">未实装</span>' : '') +
              (p.covers ? '<span class="tag">合并 ' + p.covers + '</span>' : '') +
            '</h3></div>' +
          '<p>' + esc(p.desc) + '</p>' +
          '<p class="plug-pages">' + (ownPages.length
            ? '入口 · ' + ownPages.map(function (page) { return esc(page.name); }).join(' / ')
            : '还没有贡献页面，开关只影响它自己的服务') + '</p>' +
          (blocked ? '<p class="why">课程表关掉时，这个插件不出现也不注册命令</p>' : '') +
          (p.suspended ? '<p class="why">正式版本里挂起：界面在，开关不生效</p>' : '') +
        '</div>' + sw + '</div>';
    }).join('');

    var onCount = plugins.filter(function (p) { return state.modules[p.id] && !p.suspended && !p.missing; }).length;
    var stress = '<div class="stress"><div><strong>装得下多少？</strong>' +
      '<p>再装一批演示插件：每个插件带自己的线色和一到两个页面，直接落进「新装」。不用改布局，条带自己接住。</p></div>' +
      '<div class="stress-acts">' +
        (extraPlugins.length ? '<span class="tag">' + extraPlugins.length + ' 个后装插件 · ' + extraPages.length + ' 个页面</span>' : '') +
        btn(extraSeq ? '再装一批' : '装一批试试', 'stress-install') +
        (extraPlugins.length ? btn('恢复目录', 'stress-reset', 'btn-quiet') : '') +
      '</div></div>';

    return ph('插件', '整个壳由这张表生成。每装一个插件，它的页面自动进分组与命令面板，不需要改布局。',
      '<span class="tag">' + onCount + ' / ' + (plugins.length - 2) + ' 已启用</span>') +
      '<div class="plug-grid">' + cards + '</div>' + stress +
      '<div class="sect"><div class="sect-h"><h2>插件能给壳什么</h2><small>后装插件只用到前四条</small></div>' +
      '<dl class="kv"><dt>一组页面</dt><dd>注册路由与进入/退出，自动落进对应分组；装到「新装」也仍然可达</dd>' +
      '<dt>一组命令</dt><dd>按 owner 归到插件名下，命令面板里带分组和插件名</dd>' +
      '<dt>一个开关</dt><dd>关掉即不可达；可以声明依赖别的插件</dd>' +
      '<dt>一个线色</dt><dd>条带、页面标签和插件卡用同一条线色认人</dd>' +
      '<dt>（未用）一块工作区挂件</dt><dd>比如在「今天」里插一段自己的内容</dd>' +
      '<dt>（未用）一个数据源</dt><dd>提供给别人查询，自己不知道谁在用</dd></dl></div>';
  }

  /* ── 设置 ─────────────────────────────────────────────── */

  function renderSettings() {
    var skins = [
      { id: 'paper', name: '纸', d: '经纬的暖纸。偏编辑、偏静。', bg: '#f2efe7', panel: '#fbf9f4', acc: '#2b5a63', ink: '#1a1712' },
      { id: 'water', name: '水', d: '涟漪的冷青。偏清透、偏轻。', bg: '#eef2f4', panel: '#f8fbfc', acc: '#2f6b8c', ink: '#16232a' },
      { id: 'map', name: '图', d: '舆图的土绿赭石。偏实、偏旧。', bg: '#f4f0e6', panel: '#faf7ee', acc: '#4a5a3f', ink: '#2c2418' },
      { id: 'house', name: '场', d: '夜场的深紫与铜金。偏暗、偏重。', bg: '#0e0d13', panel: '#17151f', acc: '#b8956a', ink: '#ece9f2' }
    ];

    var skinCards = skins.map(function (s) {
      // 预览用 SVG：不依赖容器尺寸，任何宽度都不塌
      var prev = '<svg viewBox="0 0 200 74" preserveAspectRatio="none" aria-hidden="true" style="display:block;width:100%;height:74px">' +
        '<rect width="200" height="74" fill="' + s.bg + '"/>' +
        '<rect x="16" y="22" width="104" height="7" rx="1" fill="' + s.ink + '" opacity=".86"/>' +
        '<rect x="16" y="37" width="66" height="4" rx="1" fill="' + s.ink + '" opacity=".3"/>' +
        '<rect x="16" y="48" width="132" height="16" rx="2" fill="' + s.panel + '" stroke="' + s.ink + '" stroke-opacity=".14"/>' +
        '<rect x="16" y="48" width="2" height="16" fill="' + s.acc + '"/>' +
        '<circle cx="180" cy="58" r="5" fill="' + s.acc + '"/>' +
        '<rect x="126" y="22" width="58" height="7" rx="1" fill="' + s.acc + '" opacity=".38"/>' +
        '</svg>';
      return '<button type="button" class="skin-card' + (state.skin === s.id ? ' is-on' : '') + '" data-act="skin" data-k="' + s.id + '">' +
        '<span class="skin-preview">' + prev + '</span>' +
        '<span class="skin-meta"><strong>' + s.name + '</strong><small>' + s.d + '</small></span></button>';
    }).join('');

    var inUse = skins.filter(function (s) { return s.id === state.skin; })[0] || skins[0];
    var onCount = plugins.filter(function (p) { return state.modules[p.id] && !p.suspended && !p.missing; }).length;
    var nowCard = '<div class="skin-now">' +
      '<strong>现在这套</strong>' +
      '<p>' + inUse.name + ' 材质 · ' + (L.themes.filter(function (t) { return t.id === state.theme; })[0] || { name: '澄纸' }).name +
        ' 主题 · ' + onCount + ' 个插件在用</p>' +
      '<div class="chips">' + tag('骨架不变') + tag('可换材质') + tag('换完立刻保存') + '</div>' +
      '</div>';

    var themeDots = L.themes.map(function (t) {
      return '<button type="button" class="theme-dot' + (state.theme === t.id ? ' is-on' : '') + '" data-act="theme" data-k="' + t.id + '" title="' + esc(t.name) + '" aria-label="' + esc(t.name) + '" style="background:linear-gradient(135deg,' + t.accent + ' 0 50%,' + t.bg + ' 50% 100%)"></button>';
    }).join('');

    var layoutRows = layouts.map(function (l, i) {
      return '<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--line) 58%,transparent)">' +
        '<span style="font-family:var(--num);font-size:10.5px;color:var(--ink3);width:18px">' + (i + 1) + '</span>' +
        '<span style="font-size:13px;color:var(--ink);width:64px">' + esc(l.name) + '</span>' +
        '<span style="font-size:12px;color:var(--ink3)">' + esc(l.d) + '</span>' +
        (i === 0 ? '<span style="margin-left:auto">' + tag('当前') + '</span>' : '') + '</div>';
    }).join('');

    var skeletonRows = '<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--line) 58%,transparent)">' +
        '<span style="font-size:13px;color:var(--ink);width:64px">经纬</span>' +
        '<span style="font-size:12px;color:var(--ink3)">四套样式 · 纸面与毛线的阅读动线</span>' +
        '<span style="margin-left:auto">' + tag('当前') + '</span></div>' +
        '<div style="display:flex;align-items:center;gap:12px;padding:9px 0">' +
        '<span style="font-size:13px;color:var(--ink);width:64px">工作台</span>' +
        '<span style="font-size:12px;color:var(--ink3)">七种排布 · 侧栏、顶栏、Dock、悬浮岛、专注</span>' +
        '<a href="../design-demo/index.html" style="margin-left:auto;font-size:12px;color:var(--accent);text-decoration:none">打开示例</a></div>';

    var dev = state.developer
      ? '<dl class="kv" style="margin-top:12px">' + diagnostics.map(function (d) {
          return '<dt>' + esc(d[0]) + '</dt><dd><code>' + esc(d[1]) + '</code></dd>';
        }).join('') + '</dl>'
      : '<p style="font-size:12px;color:var(--ink3);margin:8px 0 0">普通页面不显示技术信息。打开后才出现运行时、IPC 与资源计数。</p>';

    return ph('设置', '骨架、材质、主题色与导出。开发者模式单独放在最后。', '') +
      '<div class="sect"><div class="sect-h"><h2>骨架</h2><small>两套独立骨架，读同一份资料</small></div>' + skeletonRows + '</div>' +
      '<div class="sect"><div class="sect-h"><h2>材质</h2><small>只换颜色与纹理，骨架不动</small></div>' +
        '<div class="skins">' + skinCards + nowCard + '</div></div>' +
      '<div class="sect"><div class="sect-h"><h2>主题色</h2><small>八套，都在材质上做二次着色</small></div>' +
        '<div class="themes">' + themeDots + '</div></div>' +
      '<div class="sect"><div class="sect-h"><h2>布局</h2><small>现有实现里的七种</small></div>' + layoutRows + '</div>' +
      '<div class="sect"><div class="sect-h"><h2>工作区</h2><small>本地文件</small></div>' +
        '<dl class="kv"><dt>位置</dt><dd><code>~/JeeWeave/workspace.json</code></dd>' +
        '<dt>大小</dt><dd><code>184 KB</code></dd>' +
        '<dt>最近写入</dt><dd>今天 08:12</dd>' +
        '<dt>备份</dt><dd>3 份，最早 10-28</dd></dl>' +
        '<div style="display:flex;gap:8px;margin-top:14px">' + btn('导出', 'noop') + btn('打开文件夹', 'noop', 'btn-quiet') + btn('导入示例', 'noop', 'btn-quiet') + '</div></div>' +
      '<div class="sect"><div class="sect-h"><h2>开发者模式</h2><small>默认关闭</small></div>' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          '<button type="button" class="sw" role="switch" aria-checked="' + state.developer + '" data-act="developer" aria-label="开发者模式"></button>' +
          '<span style="font-size:12.5px;color:var(--ink3)">打开后显示运行时与 IPC 诊断</span></div>' + dev + '</div>';
  }

  /* ── 汇总 ─────────────────────────────────────────────── */

  var renderers = {
    today: renderToday, items: renderItems, courses: renderCourses, calendar: renderCalendar,
    notes: renderNotes, objects: renderObjects, web: renderWeb, reminders: renderReminders,
    assistant: renderAssistant, chat: renderChat, import: renderImport,
    plugins: renderPlugins, settings: renderSettings
  };

  global.LoomPages = {
    pages: pages,
    plugins: plugins,
    groups: groups,
    groupOrder: groupOrder,
    state: state,
    isOn: isOn,
    threadOf: threadOf,
    installBatch: installBatch,
    resetBatch: resetBatch,
    render: function (id) {
      if (renderers[id]) return renderers[id]();
      var page = pages.filter(function (p) { return p.id === id; })[0];
      return page ? renderExtra(page) : empty('这一页还没有做。');
    },
    setPlugin: function (id, on) {
      state.modules[id] = !!on;
    }
  };
})(window);
