/* 四个候选共用的示例资料与工具。只在内存里，不写存储、不连真实工作区。
   覆盖已经实现的那些能力：课程表、今天、事项（含目标/完成标准/阶段/执行时段）、
   日历、笔记、对象、网页采集、查找、插件开关、全局助手、提醒、设置。 */
(function (global) {
  'use strict';

  var MIN = 60;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(m) {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    return pad(Math.floor(m / MIN)) + ':' + pad(m % MIN);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clockNow() { var d = new Date(); return d.getHours() * MIN + d.getMinutes(); }
  function weekdayName(d) { return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][(d || new Date()).getDay()]; }

  /* ── 课程表（多课表、周次、单双周、连堂、逐学期作息） ───────── */
  var semesters = [
    { id: 's2', name: '2026 秋', weeks: 20, current: 44, start: '2026-09-07' },
    { id: 's1', name: '2026 春', weeks: 20, current: 0, start: '2026-02-23' }
  ];

  // day 1=周一 … 7=周日；period 起止节次；week 描述单双周
  var courses = [
    { id: 'c1', title: '高等数学', teacher: '张建国', room: '三教 302', day: 1, p0: 1, p1: 2, weeks: '1-16', thread: 'indigo', color: 'indigo' },
    { id: 'c2', title: '线性代数', teacher: '王强', room: '二教 108', day: 2, p0: 1, p1: 2, weeks: '1-16', thread: 'moss' },
    { id: 'c3', title: '大学英语', teacher: '李梅', room: '外语楼 305', day: 1, p0: 3, p1: 4, weeks: '1-16 单', thread: 'madder' },
    { id: 'c4', title: '大学物理', teacher: '陈志远', room: '理科楼 402', day: 3, p0: 3, p1: 4, weeks: '1-16', thread: 'wisteria' },
    { id: 'c5', title: '数据结构', teacher: '刘伟', room: '计算机楼 501', day: 3, p0: 5, p1: 6, weeks: '1-16', thread: 'moss' },
    { id: 'c6', title: '体育（篮球）', teacher: '赵敏', room: '东操场', day: 4, p0: 5, p1: 6, weeks: '1-16 双', thread: 'clay' },
    { id: 'c7', title: '毛泽东思想概论', teacher: '孙立', room: '文科楼 210', day: 5, p0: 1, p1: 2, weeks: '1-16', thread: 'turmeric' }
  ];

  // 作息：第 n 节的下课、上课钟点
  var periods = [
    { n: 1, s: '08:00', e: '08:45' }, { n: 2, s: '08:55', e: '09:40' },
    { n: 3, s: '10:00', e: '10:45' }, { n: 4, s: '10:55', e: '11:40' },
    { n: 5, s: '14:00', e: '14:45' }, { n: 6, s: '14:55', e: '15:40' },
    { n: 7, s: '16:00', e: '16:45' }, { n: 8, s: '16:55', e: '17:40' },
    { n: 9, s: '19:00', e: '19:45' }, { n: 10, s: '19:55', e: '20:40' }
  ];

  /* 一次调整（调课/停课），课表与今天同源 */
  var adjustments = [
    { id: 'adj1', courseId: 'c2', date: 'today', status: 'moved', note: '调到周五第 3-4 节' }
  ];

  /* ── 事项：待办 / 事件 / 考试 / 计划，含目标、完成标准、阶段、执行时段 ── */
  var items = [
    {
      id: 'i1', kind: 'task', title: '交数据结构实验二', done: false,
      anchor: { type: 'deadline', date: 'today', time: '23:59' },
      goal: '把「图的最短路径」跑通并写清结论',
      completionCriteria: '报告含三组对照数据、代码可复跑、提交到课程平台',
      objectId: 'o2', source: { kind: 'course', courseId: 'c5', date: 'today' },
      phases: [
        { id: 'p1', title: '补完最后一组数据', done: true },
        { id: 'p2', title: '写图注与结论', done: false }
      ],
      slots: [{ id: 'sl1', label: '写报告', start: 'todayT09:50', end: 'todayT10:40' }],
      note: '只差报告最后一段图注。交之前再跑一次样例。'
    },
    {
      id: 'i2', kind: 'plan', title: '中期报告', done: false,
      anchor: { type: 'range', start: 'm-21', end: 'd+12' },
      goal: '把前三个月的实验收成一份能送审的稿子',
      completionCriteria: '导师点头，格式过院系模板',
      objectId: 'o3',
      phases: [
        { id: 'p3', title: '提纲一稿', done: true },
        { id: 'p4', title: '方法一节', done: true },
        { id: 'p5', title: '初稿', done: false },
        { id: 'p6', title: '回信给导师', done: false }
      ],
      slots: [
        { id: 'sl2', label: '写方法', start: 'd-3T15:30', end: 'd-3T17:00' },
        { id: 'sl3', label: '组会讲稿', start: 'todayT15:30', end: 'todayT16:30' }
      ],
      note: '讲 6 分钟。把「还没做」的部分说清楚，比藏起来好。'
    },
    {
      id: 'i3', kind: 'event', title: '组会 · 中期进度', done: false,
      anchor: { type: 'absolute', start: 'todayT15:30', end: 'todayT16:30' },
      objectId: 'o3', eventType: 'meeting', note: '线上，会议室号在邮件里。'
    },
    {
      id: 'i4', kind: 'task', title: '给导师回信', done: false,
      anchor: { type: 'deadline', date: 'today', time: '15:00' },
      goal: '确认中期检查的时间',
      completionCriteria: '发出邮件，附上这版提纲',
      objectId: 'o4',
      note: '三点前必须发出。'
    },
    {
      id: 'i5', kind: 'task', title: '读《技术与时间》第二章', done: false,
      anchor: { type: 'floating' },
      objectId: 'o7',
      slots: [{ id: 'sl4', label: '读书', start: 'todayT19:30', end: 'todayT21:00' }],
      note: '重点看「已经在此」那一段，和上周笔记里的疑问对照。'
    },
    {
      id: 'i6', kind: 'task', title: '跑 5 公里', done: false,
      anchor: { type: 'absolute', start: 'todayT17:00', end: 'todayT17:40' },
      objectId: 'o6', note: '慢一点，昨天腿还紧。'
    },
    {
      id: 'i7', kind: 'task', title: '写三行复盘', done: false,
      anchor: { type: 'weekly', weekdays: [7], startDate: 'm-30', startTime: '22:00', endTime: '22:20' },
      objectId: 'o8', note: '今天做成了什么、卡在哪、明天第一件事。'
    },
    {
      id: 'i8', kind: 'event', title: '期中考试', done: false,
      anchor: { type: 'absolute', start: 'd+21T09:00', end: 'd+21T11:00' },
      objectId: 'o1', eventType: 'exam', note: '闭卷，带计算器。'
    },
    {
      id: 'i9', kind: 'task', title: '和沈岳吃午饭', done: true,
      anchor: { type: 'absolute', start: 'todayT12:10', end: 'todayT13:00' },
      objectId: 'o5', note: '他说想聊实习的事。'
    }
  ];

  /* ── 对象（Beta）：课程、项目、主题 ──────────────────── */
  var objects = [
    { id: 'o1', name: '高等数学', kind: '课程', thread: 'indigo', goal: '期末拿到 85 以上', n: 6 },
    { id: 'o2', name: '数据结构', kind: '课程', thread: 'moss', goal: '把五个实验都跑通', n: 4 },
    { id: 'o3', name: '中期报告', kind: '项目', thread: 'madder', goal: '十一月前交出初稿', n: 9 },
    { id: 'o4', name: '导师', kind: '主题', thread: 'wisteria', goal: '保持每两周一次汇报', n: 5 },
    { id: 'o5', name: '与沈岳', kind: '主题', thread: 'clay', goal: '', n: 3 },
    { id: 'o6', name: '体能', kind: '主题', thread: 'celadon', goal: '每周三次有氧', n: 7 },
    { id: 'o7', name: '阅读', kind: '主题', thread: 'slate', goal: '', n: 12 },
    { id: 'o8', name: '论文', kind: '项目', thread: 'turmeric', goal: '十二月投出去', n: 8 }
  ];

  /* ── 笔记：见闻 / 感受 / 想法 / 摘录 / 复盘 ────────────── */
  var notes = [
    { id: 'n1', title: '', kind: '想法', date: 'today', time: '07:40', tags: ['写作'], objectId: 'o3',
      body: '「已经在此」不是地点，是我们无法退回的时间。今天想把它写成报告开头的一句话。' },
    { id: 'n2', title: '组会前记', kind: '复盘', date: 'd-1', time: '21:10', tags: ['组会', '中期'], objectId: 'o3',
      body: '上次讲太久在背景上。这次前 90 秒就说清楚做了什么、还差什么。' },
    { id: 'n3', title: '', kind: '摘录', date: 'd-2', time: '19:20', tags: ['阅读'], objectId: 'o7',
      body: '「技术的本质不是工具，而是揭示的方式。」—— 记于第二章页边。' },
    { id: 'n4', title: '跑完步的想法', kind: '感受', date: 'd-3', time: '17:50', tags: ['体能'], objectId: 'o6',
      body: '跑到第三公里时忽然不喘了。有些事情就是过了某个点才成立。' }
  ];

  /* ── 网页采集：原文、重点、行动草稿 ──────────────────── */
  var captures = [
    { id: 'w1', title: '关于期中检查的通知', url: 'https://example.edu/notice/1213', host: 'example.edu',
      at: 'd-1', highlights: ['第十周提交中期检查材料', '需导师签字'], draft: '把提纲发给导师，约他签字',
      objectId: 'o3', linked: false },
    { id: 'w2', title: '图的遍历与最短路径（课程讲义）', url: 'https://example.edu/course/ds', host: 'example.edu',
      at: 'd-2', highlights: ['Dijkstra 只适用于非负权'], draft: '', objectId: 'o2', linked: true }
  ];

  /* ── 提醒：定时 / 静默 / 长期注意 ─────────────────────── */
  var reminders = [
    { id: 'r1', type: 'timed', title: '取快递', at: 'todayT18:30', done: false },
    { id: 'r2', type: 'silent', title: '今天有 3 件截止', at: 'today', done: false },
    { id: 'r3', type: 'attention', title: '中期报告还没初稿', until: 'd+12', done: false }
  ];

  /* ── 插件开关（与桌面端 builtinModules 对应） ─────────── */
  var modules = [
    { id: 'assistant', name: '全局助手', desc: '文字、语音、图片与可编辑的行动草稿', on: true },
    { id: 'reminders', name: '提醒', desc: '定时通知、今天的静默提示与长期注意', on: true },
    { id: 'notes', name: '笔记', desc: '见闻、感受、想法、摘录与复盘', on: true },
    { id: 'objects', name: '对象视图 Beta', desc: '按课程、项目或主题集中查看', on: true },
    { id: 'today', name: '今天', desc: '汇总今日课程、计划与待办', on: true },
    { id: 'courses', name: '课程表', desc: '多课表、周次切换、课程编辑与独立作息', on: true },
    { id: 'plans', name: '事项', desc: '待办、事件、考试与阶段计划', on: true },
    { id: 'calendar', name: '日历', desc: '按月、周、日查看期限与区间', on: true },
    { id: 'web-capture', name: '网页采集', desc: '公开网页、重点整理与待确认草稿', on: true },
    { id: 'course-import', name: '教务导入', desc: '南邮 WebVPN，手动登录后抓取课表', on: false }
  ];

  /* ── 助手：一次可编辑草稿 ─────────────────────────────── */
  var assistantDraft = {
    input: '明天下午 2 点到 3 点讨论项目，顺便提醒我把中期提纲发给导师',
    steps: [
      { id: 'a1', cmd: 'items.edit', title: '新建事项「讨论项目」', time: '明天 14:00–15:00', guessed: false, ok: true },
      { id: 'a2', cmd: 'items.edit', title: '新建事项「把中期提纲发给导师」', time: '明天 14:00', guessed: true },
      { id: 'a3', cmd: 'reminders.add', title: '加一个提醒', time: '明天 13:50', guessed: true }
    ]
  };

  /* ── 主题与主题色（与桌面端一致的毛线八色） ──────────── */
  var threads = {
    indigo: '#3a4c86', madder: '#9a3b4e', turmeric: '#8a6717', moss: '#46664a',
    wisteria: '#6b4a85', clay: '#9c5a2e', celadon: '#2f6c68', slate: '#4d5560'
  };

  var themes = [
    { id: 'linen', name: '澄纸', accent: '#3a4a93', bg: '#f1efe9', text: '#1b1d21' },
    { id: 'mist', name: '雾青', accent: '#2f6b60', bg: '#edf0ee', text: '#171b1a' },
    { id: 'sand', name: '暖砂', accent: '#8b6034', bg: '#eae5dd', text: '#2a241c' },
    { id: 'lavender', name: '浅紫', accent: '#6a4a8c', bg: '#e8e5ef', text: '#2b2438' },
    { id: 'rose', name: '玫灰', accent: '#9e4c68', bg: '#eee5e8', text: '#3a2530' },
    { id: 'ink', name: '墨夜', accent: '#9daaee', bg: '#101218', text: '#eae7e0' },
    { id: 'graphite', name: '石墨', accent: '#bacddd', bg: '#191d21', text: '#e7ebef' },
    { id: 'ocean', name: '深海', accent: '#8bd4ce', bg: '#102b32', text: '#e1f0f1' }
  ];

  /* ── 派生：今天的安排 ─────────────────────────────────── */
  function todaySlips() {
    var now = clockNow();
    var out = [];
    items.forEach(function (it) {
      var a = it.anchor;
      var start = null, dur = 0;
      if (a.type === 'absolute' && a.start.indexOf('today') === 0) {
        start = toMin(a.start.slice(6));
        dur = a.end && a.end.indexOf('today') === 0 ? toMin(a.end.slice(6)) - start : 0;
      } else if (a.type === 'deadline' && a.date === 'today') {
        start = toMin(a.time || '23:59');
      } else if (a.type === 'weekly' && (a.weekdays || []).indexOf(new Date().getDay() || 7) >= 0 && a.startTime) {
        start = toMin(a.startTime);
        dur = toMin(a.endTime) - start;
      }
      (it.slots || []).forEach(function (s) {
        if (s.start.indexOf('today') === 0) {
          if (start === null) { start = toMin(s.start.slice(6)); dur = toMin(s.end.slice(6)) - start; }
        }
      });
      if (start !== null) {
        var obj = objects.filter(function (o) { return o.id === it.objectId; })[0];
        out.push({
          id: it.id, title: it.title, kind: it.kind, at: start, dur: Math.max(0, dur),
          thread: obj ? obj.thread : 'slate', obj: obj ? obj.name : '',
          note: it.note || '', done: !!it.done, goal: it.goal, criteria: it.completionCriteria,
          phases: it.phases || [], slots: it.slots || [], source: it.source, ref: it
        });
      }
    });
    return out.sort(function (a, b) { return a.at - b.at; });
  }

  function toMin(t) {
    if (!t) return 0;
    var p = String(t).split(':');
    return (+p[0]) * MIN + (+(p[1] || 0));
  }

  function weekGrid() {
    var grid = [[], [], [], [], [], [], []];
    courses.forEach(function (c) {
      var p = periods[c.p0 - 1];
      grid[c.day - 1].push({
        id: c.id, title: c.title, at: toMin(p.s), end: toMin(p.e),
        thread: c.thread, room: c.room, teacher: c.teacher, weeks: c.weeks, kind: 'course'
      });
    });
    return grid;
  }

  /* ── 轻柔粒子：只做氛围，不奖励鼠标 ─────────────────────
     慢速漂移的微尘，靠近指针时被极轻地推开（不是吸附、不是爆发）。
     密度低、寿命长、透明度极浅；减少动态效果时完全不创建。 */
  function installDust(opts) {
    opts = opts || {};
    var reduce = global.matchMedia('(prefers-reduced-motion: reduce)');
    var canvas = null, ctx = null, frame = 0, last = 0, dots = [], disposed = false;
    var count = opts.count || 18;
    var tint = opts.tint || 'rgba(90,84,70,';
    var pointer = { x: -9999, y: -9999 };

    function size() {
      if (!canvas) return;
      var d = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = innerWidth * d;
      canvas.height = innerHeight * d;
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }

    function seed() {
      dots = [];
      for (var i = 0; i < count; i++) {
        dots.push({
          x: Math.random() * innerWidth,
          y: Math.random() * innerHeight,
          vx: (Math.random() - .5) * 6,
          vy: -2.4 - Math.random() * 4.2,
          r: .9 + Math.random() * 1.3,
          a: .12 + Math.random() * .2,
          t: Math.random() * Math.PI * 2,
          life: 1
        });
      }
    }

    function draw(now) {
      frame = 0;
      if (disposed) return;
      if (reduce.matches || document.hidden) { ctx && ctx.clearRect(0, 0, innerWidth, innerHeight); return; }
      var dt = Math.min((now - last) / 1000, .05);
      last = now;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (var i = 0; i < dots.length; i++) {
        var p = dots[i];
        p.t += dt;
        // 漂移
        p.x += (p.vx + Math.sin(p.t * .5) * 3) * dt;
        p.y += p.vy * dt;
        // 指针只是轻轻推开，不吸附
        var dx = p.x - pointer.x, dy = p.y - pointer.y;
        var d2 = dx * dx + dy * dy;
        if (d2 < 24000 && d2 > 1) {
          var f = (1 - d2 / 24000) * 26 * dt;
          var len = Math.sqrt(d2);
          p.x += (dx / len) * f;
          p.y += (dy / len) * f;
        }
        // 出界则从底部重生，保持数量恒定
        if (p.y < -20) { p.y = innerHeight + 16; p.x = Math.random() * innerWidth; }
        if (p.x < -20) p.x = innerWidth + 16;
        if (p.x > innerWidth + 20) p.x = -16;
        ctx.beginPath();
        ctx.fillStyle = tint + (p.a * (0.65 + Math.sin(p.t * .8) * .35)) + ')';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    }

    function start() {
      if (disposed || canvas || reduce.matches) return;
      canvas = document.createElement('canvas');
      canvas.className = 'ambient-dust';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
      size(); seed(); last = performance.now();
      frame = requestAnimationFrame(draw);
    }

    function stop() {
      cancelAnimationFrame(frame); frame = 0;
      if (canvas) { canvas.remove(); canvas = null; ctx = null; }
      dots = [];
    }

    function onPointer(e) { pointer.x = e.clientX; pointer.y = e.clientY; }
    function onLeave() { pointer.x = -9999; pointer.y = -9999; }
    function onResize() { if (canvas) { size(); seed(); } }
    function onVisibility() { if (document.hidden) cancelAnimationFrame(frame), frame = 0; else if (canvas && !frame) { last = performance.now(); frame = requestAnimationFrame(draw); } }
    function onReduce() { if (reduce.matches) stop(); else start(); }

    reduce.addEventListener('change', onReduce);
    global.addEventListener('pointermove', onPointer, { passive: true });
    global.addEventListener('pointerleave', onLeave);
    global.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    start();

    return {
      stop: stop,
      dispose: function () {
        disposed = true;
        stop();
        reduce.removeEventListener('change', onReduce);
        global.removeEventListener('pointermove', onPointer);
        global.removeEventListener('pointerleave', onLeave);
        global.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }

  global.Lab = {
    MIN: MIN, pad: pad, hm: hm, esc: esc, clockNow: clockNow, weekdayName: weekdayName,
    semesters: semesters, courses: courses, periods: periods, adjustments: adjustments,
    items: items, objects: objects, notes: notes, captures: captures, reminders: reminders,
    modules: modules, assistantDraft: assistantDraft, threads: threads, themes: themes,
    todaySlips: todaySlips, weekGrid: weekGrid, toMin: toMin, installDust: installDust
  };
})(window);
