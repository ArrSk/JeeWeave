/* 三套新骨架共用的插件清单。
   织机（loom）保持自己的那份不动；这里给书页 / 环时 / 三栏用。
   与 desktop/modules.mjs 的 builtinModules 对齐，另加「记账」如实标未实装。 */

(function (global) {
  var L = global.Lab;

  var list = [
    { id: 'today', name: '今天', icon: 'sun', desc: '汇总已开启功能里的今日课程、计划、待办与静默提醒。' },
    { id: 'plans', name: '事项', icon: 'diamond', desc: '统一管理待办、事件、考试、阶段计划与重复安排。', covers: 'items' },
    { id: 'courses', name: '课程表', icon: 'grid', desc: '多课表、周次切换、课程编辑与独立作息。' },
    { id: 'calendar', name: '日历', icon: 'cal', desc: '按月、周、日查看待办期限、计划区间与阶段。' },
    { id: 'notes', name: '笔记', icon: 'pen', desc: '记录见闻、感受、想法、摘录与复盘，按日期、用途或标签查找。' },
    { id: 'objects', name: '对象视图 Beta', icon: 'cube', desc: '围绕课程、项目或主题集中查看安排、事项、笔记与网页资料。' },
    { id: 'web-capture', name: '网页采集', icon: 'link', desc: '公开网页、重点整理与待确认的行动草稿。' },
    { id: 'reminders', name: '提醒', icon: 'bell', desc: '定时通知、今天的静默提示和长期注意事项。' },
    { id: 'assistant', name: '全局助手', icon: 'spark', desc: '文字、语音、图片与可编辑的行动草稿；API 设置随此插件启停。' },
    { id: 'course-import', name: '教务导入', icon: 'down', desc: '默认南邮 WebVPN，手动登录后抓取课表。CSV 不受此开关影响。', requires: 'courses' },
    { id: 'chat-monitor', name: '群消息', icon: 'chat', desc: '本地群消息收件箱、关键词与待确认事项。QQ/微信适配器需另行配置。', suspended: true },
    { id: 'ledger', name: '记账', icon: 'coin', desc: '导航里还留着一个位置，但功能尚未实装。', missing: true }
  ];

  // 每个插件贡献的页（id 与各骨架的渲染表对应）
  var pages = [
    { id: 'today', owner: 'today', name: '今天', icon: 'sun' },
    { id: 'items', owner: 'plans', name: '事项', icon: 'diamond' },
    { id: 'courses', owner: 'courses', name: '课程表', icon: 'grid' },
    { id: 'calendar', owner: 'calendar', name: '日历', icon: 'cal' },
    { id: 'notes', owner: 'notes', name: '笔记', icon: 'pen' },
    { id: 'objects', owner: 'objects', name: '对象', icon: 'cube' },
    { id: 'web', owner: 'web-capture', name: '网页', icon: 'link' },
    { id: 'reminders', owner: 'reminders', name: '提醒', icon: 'bell' },
    { id: 'assistant', owner: 'assistant', name: '助手', icon: 'spark' },
    { id: 'chat', owner: 'chat-monitor', name: '群消息', icon: 'chat' },
    { id: 'import', owner: 'course-import', name: '导入', icon: 'down' },
    { id: 'plugins', owner: 'plugins', name: '插件', icon: 'plug', core: true },
    { id: 'settings', owner: 'settings', name: '设置', icon: 'gear', core: true }
  ];

  var state = {};
  list.forEach(function (p) {
    state[p.id] = p.id !== 'course-import' && p.id !== 'chat-monitor' && p.id !== 'ledger';
  });

  function isOn(id) {
    var p = list.filter(function (x) { return x.id === id; })[0];
    if (!p) return true;
    if (p.requires && !state[p.requires]) return false;
    return !!state[id];
  }
  function set(id, on) { state[id] = !!on; }
  function visible() {
    return pages.filter(function (p) { return p.core || isOn(p.owner); });
  }
  function onCount() {
    return list.filter(function (p) { return state[p.id] && !p.suspended && !p.missing; }).length;
  }

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
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5h5M9.5 13.5h5"/>'
  };

  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 15) + '" height="' + (size || 15) +
      '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || ICONS.sun) + '</svg>';
  }

  global.Plugs = {
    list: list, pages: pages, state: state,
    isOn: isOn, set: set, visible: visible, onCount: onCount, icon: icon
  };
})(window);
