/* 工作台 demo 的插件表：导航、分组、线色和后装页都从这里生成。
   只服务 design-demo，不读写真实工作区；刷新即恢复默认。 */
(function (global) {
  var groupOrder = ['home', 'now', 'record', 'help', 'system', 'more'];
  var groups = {
    home: { name: '总览' },
    now: { name: '此刻' },
    record: { name: '记录' },
    help: { name: '助手' },
    system: { name: '系统' },
    more: { name: '新装' }
  };
  var threadPool = ['--t-indigo', '--t-madder', '--t-turmeric', '--t-moss', '--t-wisteria', '--t-clay', '--t-celadon', '--t-slate'];
  var fixedThreads = { today: '--t-turmeric', courses: '--t-indigo', calendar: '--t-celadon', items: '--t-madder', notes: '--t-wisteria', objects: '--t-moss', capture: '--t-clay', reminders: '--t-madder', assistant: '--t-slate', 'course-import': '--t-clay', 'chat-monitor': '--t-wisteria', ledger: '--t-slate' };
  var plugins = [
    { id: 'today', name: '今天', desc: '汇总已开启功能中的今日课程、计划与待办。', on: true },
    { id: 'courses', name: '课程表', desc: '多课表、周次切换、课程编辑与独立作息。', on: true },
    { id: 'calendar', name: '日历', desc: '按月、周、日查看待办期限、计划区间与阶段。', on: true },
    { id: 'items', name: '事项', desc: '长期、定时、重复计划与有期限或无期限的行动。', on: true },
    { id: 'notes', name: '笔记', desc: '记录见闻、感受、想法、摘录与复盘。', on: true },
    { id: 'objects', name: '对象视图', desc: '围绕课程、项目或主题集中查看安排与资料。', on: true },
    { id: 'capture', name: '网页采集', desc: '保留公开网页原文与待确认的行动草稿。', on: true },
    { id: 'reminders', name: '提醒', desc: '定时通知、静默提示和长期注意事项。', on: true },
    { id: 'assistant', name: '全局助手', desc: '在工具栏或助手页打开，先生成可编辑草稿再由你确认。', on: true, command: true },
    { id: 'course-import', name: '教务导入', desc: '默认南邮 WebVPN；手动登录后才抓，抓完即关。CSV 导入不受开关影响。', on: true, requires: 'courses' },
    { id: 'chat-monitor', name: '群消息', desc: '本地群消息收件箱、关键词与待确认事项。适配器需另行配置。', on: false, suspended: true },
    { id: 'ledger', name: '记账', desc: '功能尚未实装，插件表里先留一行状态。', on: false, missing: true }
  ];
  var pages = [
    { id: 'overview', name: '总览', group: 'home', core: true },
    { id: 'search', name: '查找', group: 'home', core: true },
    { id: 'today', name: '今天', group: 'now', owner: 'today' },
    { id: 'courses', name: '课程表', group: 'now', owner: 'courses' },
    { id: 'calendar', name: '日历', group: 'now', owner: 'calendar' },
    { id: 'import', name: '导入', group: 'now', owner: 'course-import' },
    { id: 'items', name: '事项', group: 'record', owner: 'items' },
    { id: 'notes', name: '笔记', group: 'record', owner: 'notes' },
    { id: 'objects', name: '对象', group: 'record', owner: 'objects' },
    { id: 'capture', name: '采集', group: 'record', owner: 'capture' },
    { id: 'reminders', name: '提醒', group: 'help', owner: 'reminders' },
    { id: 'assistant', name: '助手', group: 'help', owner: 'assistant' },
    { id: 'chat', name: '群消息', group: 'help', owner: 'chat-monitor' },
    { id: 'plugins', name: '插件', group: 'system', core: true },
    { id: 'settings', name: '设置', group: 'system', core: true }
  ];
  var extraTemplates = [
    { slug: 'focus', name: '专注计时', desc: '一个计时页，结束时可以把这段时间记到对象上。', pages: [['timer', '计时']] },
    { slug: 'reading', name: '阅读摘录', desc: '读到哪里、摘了哪句、之后要做什么。', pages: [['now', '在读'], ['quotes', '摘录']] },
    { slug: 'lab', name: '实验记录', desc: '步骤、参数与照片放在同一条记录里。', pages: [['log', '实验'], ['protocols', '流程']] },
    { slug: 'vocab', name: '词汇卡', desc: '每天一组，按遗忘曲线自动排。', pages: [['cards', '卡片']] },
    { slug: 'weekly', name: '周报', desc: '把这一周完成的事项和笔记收成一页。', pages: [['report', '周报']] },
    { slug: 'feeds', name: '订阅', desc: '只收公开源，读完再决定要不要留下。', pages: [['inbox', '收件']] }
  ];
  var extraPlugins = [];
  var extraPages = [];
  var extraSeq = 0;

  function pluginOf(id) { return plugins.filter(function (p) { return p.id === id; })[0] || null; }
  function pageOf(id) { return pages.filter(function (p) { return p.id === id; })[0] || null; }
  function isOn(id) {
    var p = pluginOf(id);
    if (!p) return true;
    if (p.missing || p.suspended) return false;
    if (p.requires && !isOn(p.requires)) return false;
    return !!p.on;
  }
  // 挂起页仍可进入，看它为什么停着；依赖阻塞和未实装的页不注册入口。
  function available(page) {
    if (!page) return false;
    if (page.core) return true;
    var plugin = pluginOf(page.owner);
    if (!plugin || plugin.missing) return false;
    if (plugin.suspended) return true;
    if (plugin.requires && !isOn(plugin.requires)) return false;
    return !!plugin.on;
  }
  function threadOf(owner) {
    if (!owner) return '';
    if (fixedThreads[owner]) return fixedThreads[owner];
    var text = String(owner), hash = 0;
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return threadPool[hash % threadPool.length];
  }
  function visiblePages() { return pages.filter(available); }
  function catalog() {
    return groupOrder.map(function (key) {
      return {
        id: key,
        name: groups[key].name,
        pages: visiblePages().filter(function (page) { return page.group === key; })
      };
    }).filter(function (group) { return group.pages.length; });
  }
  function setOn(id, on) {
    var plugin = pluginOf(id);
    if (!plugin || plugin.suspended || plugin.missing) return false;
    if (plugin.requires && !isOn(plugin.requires)) return false;
    plugin.on = !!on;
    return true;
  }
  function stateOf(id) {
    var plugin = pluginOf(id);
    if (!plugin) return 'unknown';
    if (plugin.missing) return 'missing';
    if (plugin.suspended) return 'suspended';
    if (plugin.requires && !isOn(plugin.requires)) return 'blocked';
    return plugin.on ? 'on' : 'off';
  }
  var stressNames = ['专注', '阅读', '实验', '词汇', '周报', '订阅', '晨间', '晚间'];
  function installStress() {
    if (extraSeq >= stressNames.length) return { plugins: 0, pages: 0 };
    var template = extraTemplates[extraSeq % extraTemplates.length];
    var label = stressNames[extraSeq];
    var owner = template.slug + '-' + (extraSeq + 1);
    var plugin = { id: owner, name: label + '·' + template.name, desc: template.desc, on: true, extra: true };
    var added = 0;
    plugins.push(plugin);
    extraPlugins.push(owner);
    template.pages.forEach(function (pair) {
      var page = { id: owner + '-' + pair[0], name: pair[1], group: 'more', owner: owner, synthetic: true };
      pages.push(page); extraPages.push(page.id); added++;
    });
    extraSeq++;
    return { plugins: 1, pages: added };
  }
  function resetStress() {
    var removed = extraPlugins.length;
    extraPlugins.forEach(function (id) {
      var at = plugins.findIndex(function (p) { return p.id === id; });
      if (at >= 0) plugins.splice(at, 1);
    });
    extraPages.forEach(function (id) {
      var at = pages.findIndex(function (p) { return p.id === id; });
      if (at >= 0) pages.splice(at, 1);
    });
    extraPlugins = []; extraPages = []; extraSeq = 0;
    return removed;
  }
  global.DemoCatalog = {
    groupOrder: groupOrder,
    groups: groups,
    plugins: plugins,
    pages: pages,
    catalog: catalog,
    pluginOf: pluginOf,
    pageOf: pageOf,
    isOn: isOn,
    setOn: setOn,
    stateOf: stateOf,
    available: available,
    visiblePages: visiblePages,
    threadOf: threadOf,
    installStress: installStress,
    resetStress: resetStress,
    stressNames: stressNames,
    get extraPlugins() { return extraPlugins; },
    get extraPages() { return extraPages; },
    get extraSeq() { return extraSeq; }
  };
})(window);
