import { installAssistant } from './assistant-ui.mjs';
import { createMobileBridge } from './native-bridge.mjs';
import { installMobileLayout } from './mobile-layout.mjs';
const native = window.JeeWeaveNative;
// LAN HTTP previews lack randomUUID, but still provide secure random bytes.
if (!native && !crypto.randomUUID) Object.defineProperty(crypto, 'randomUUID', { value: () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}});
window.jeeWeaveDesktop = createMobileBridge(native);
window.jeeWeaveMobileResult = (id, result) => window.jeeWeaveDesktop.resolve(id, result);
await import('./desktop/prototype-modules.js');

function installShell() {
  const main = document.querySelector('.main'), sidebar = document.querySelector('.sidebar'), shell = document.querySelector('.shell');
  shell.classList.remove('is-sidebar-collapsed');
  const svg = path => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${path}</svg>`;
  const header = document.createElement('header'); header.className = 'mobile-topbar';
  header.innerHTML = `<button type="button" id="mobile-menu" aria-label="打开功能目录" aria-expanded="false">${svg('<path d="M4 6h16M4 12h12M4 18h16"/>')}</button><div><strong id="mobile-page-title">今天</strong><span>JeeWeave · 几微</span></div><button type="button" id="mobile-search" aria-label="查找与整理">${svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>')}</button>`;
  document.body.prepend(header);
  const quick = document.createElement('nav'); quick.className = 'mobile-quickbar'; quick.ariaLabel = '常用功能';
  const destinations = [
    ['today', '今天', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    ['courses', '课表', '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4m8-4v4"/>'],
    ['plans', '事项', '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>'],
    ['notes', '笔记', '<path d="M12 4H4v16h16v-8M10 14l1-5 8-8 4 4-8 8Z"/>'],
  ];
  quick.innerHTML = destinations.map(([view, label, path]) => '<button type="button" data-view="' + view + '"' + (view === 'notes' ? ' id="mobile-quick-note"' : '') + '>' + svg(path) + '<span>' + label + '</span></button>').join('');
  document.body.append(quick);
  const primary = document.createElement('button'); primary.type = 'button'; primary.id = 'mobile-primary-action'; primary.className = 'mobile-primary-action';
  document.body.append(primary);
  const primaryActions = {
    today: ['plans', '#desktop-add-plan', '添加事项'], plans: ['plans', '#desktop-add-plan', '添加事项'],
    calendar: ['calendar', '.desktop-calendar-panel .desktop-page-actions [data-cal-add]', '添加事项'],
    courses: ['courses', '#desktop-add-course', '添加课程'], notes: ['notes', '#desktop-journal-new', '记一笔'],
    objects: ['objects', '#desktop-new-object', '新建对象'],
  };
  const syncQuick = () => {
    for (const button of quick.querySelectorAll('[data-view]')) {
      const link = document.querySelector('.nav [data-view="' + button.dataset.view + '"]');
      button.hidden = !link || link.hidden;
      button.setAttribute('aria-current', button.dataset.view === main.dataset.activeView ? 'page' : 'false');
    }
    const action = primaryActions[main.dataset.activeView];
    const link = action && document.querySelector('.nav [data-view="' + action[0] + '"]');
    primary.hidden = !action || !link || link.hidden;
    if (action) { primary.setAttribute('aria-label', action[2]); primary.title = action[2]; primary.innerHTML = svg(main.dataset.activeView === 'notes' ? '<path d="M12 4H4v16h16v-8M10 14l1-5 8-8 4 4-8 8Z"/>' : '<path d="M12 5v14M5 12h14"/>') + '<span>' + action[2] + '</span>'; }
  };
  primary.onclick = () => {
    if (primary.hidden || document.querySelector('dialog[open]')) return;
    const action = primaryActions[main.dataset.activeView];
    const link = document.querySelector('.nav [data-view="' + action[0] + '"]');
    if (!link || link.hidden) return;
    if (action[0] !== main.dataset.activeView) link.click();
    document.querySelector(action[1])?.click();
  };
  new MutationObserver(syncQuick).observe(sidebar, {subtree:true,attributes:true,attributeFilter:['hidden']});
  const backdrop = document.createElement('button'); backdrop.className = 'mobile-drawer-backdrop'; backdrop.ariaLabel = '关闭功能目录'; backdrop.hidden = true;
  document.body.append(backdrop);
  sidebar.id = 'mobile-directory'; header.querySelector('#mobile-menu').setAttribute('aria-controls', sidebar.id);
  const close = document.createElement('button'); close.type = 'button'; close.className = 'mobile-drawer-close'; close.ariaLabel = '关闭功能目录'; close.innerHTML = svg('<path d="m6 6 12 12M6 18 18 6"/>'); sidebar.prepend(close);
  let opened = false;
  const drawer = value => {
    opened = value; document.body.classList.toggle('mobile-drawer-open', value); backdrop.hidden = !value;
    header.querySelector('#mobile-menu').setAttribute('aria-expanded', String(value));
    if (innerWidth < 800) sidebar.inert = !value;
    main.inert = value && innerWidth < 800;
    if (value) close.focus(); else header.querySelector('#mobile-menu').focus({ preventScroll: true });
  };
  close.onclick = backdrop.onclick = () => drawer(false);
  header.querySelector('#mobile-menu').onclick = () => drawer(!opened);
  header.querySelector('#mobile-search').onclick = () => document.querySelector('#desktop-search-open').click();
  sidebar.addEventListener('click', event => { if (event.target.closest('[data-view],[data-command],#desktop-search-open')) { if (opened) drawer(false); } }, true);
  const titles = { today: '今天', overview: '总览', courses: '课程表', plans: '事项', calendar: '日历', notes: '笔记', objects: '对象', plugins: '插件管理', settings: '设置', 'web-capture': '网页资料' };
  const navigation = [];
  let previous = main.dataset.activeView, goingBack = false;
  new MutationObserver(() => {
    const view = main.dataset.activeView;
    if (previous !== view) { if (!goingBack) navigation.push(previous); goingBack = false; previous = view; }
    header.querySelector('#mobile-page-title').textContent = titles[view] || '几微';
    syncQuick();
  }).observe(main, { attributes: true, attributeFilter: ['data-active-view'] });
  window.jeeWeaveMobileBack = () => {
    const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
    if (dialog) { if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close(); return; }
    if (opened) { drawer(false); return; }
    const last = navigation.pop();
    if (last && last !== main.dataset.activeView) { const link = document.querySelector(`.nav [data-view="${last}"]:not([hidden])`); if (link) { goingBack = true; link.click(); return; } }
    if (native) native.finishApp();
  };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && opened) { event.preventDefault(); drawer(false); } });
  addEventListener('resize', () => { sidebar.inert = innerWidth < 800 && !opened; main.inert = innerWidth < 800 && opened; });
  sidebar.inert = innerWidth < 800;
  // Remote login is hosted separately from the local workspace bridge.
  const school = document.querySelector('.desktop-school-import');
  if (school) {
    document.querySelector('#desktop-portal-url').value = 'https://vpn.njupt.edu.cn:8443/';
    const message = document.createElement('p'); message.className = 'mobile-capability-note';
    message.textContent = native ? '从 VPN 首页登录，再进入教务系统查询课表。若提示 404，在“更多”中选择“VPN 首页”重新进入。' : '电脑预览展示手机布局；手机端从 VPN 首页登录后进入教务系统。旧登录深层地址已返回 404，不再作为默认入口。'; school.prepend(message);
  }
  const collection = document.querySelector('#desktop-web-form');
  if (collection) { collection.hidden = true; const note = document.createElement('p'); note.className = 'mobile-capability-note'; note.textContent = '这里可查看已迁入的网页资料、关联对象并整理行动；在线抓取请先在桌面端完成。'; collection.after(note); }
  const captureCopy = document.querySelector('[data-page="web-capture"] .intro p');
  if (captureCopy) captureCopy.textContent = '查看网页资料与重点，把确认的行动加入事项。';
  const dataPath = document.querySelector('#desktop-data-path'); if (dataPath) dataPath.textContent = native ? '应用私有目录 / data / workspace.json（卸载前请导出）' : '浏览器隔离预览；安装 APK 后在本机文件中保存';
  const settingsPage = dataPath?.closest('[data-page="settings"]');
  if (settingsPage) {
    settingsPage.querySelector('.intro p').textContent = '管理手机端的外观和本地数据。';
    const paragraphs = dataPath.parentElement.querySelectorAll(':scope > p');
    paragraphs[0].textContent = '换版本或换手机前导出工作区文件。在新设备选择导入，核对内容后确认替换。';
    paragraphs[2].textContent = '迁移包包含课程、事项、笔记、对象、设置与网页原文附件。登录状态不迁移；卸载前请导出。';
    settingsPage.querySelector('#desktop-export-data').textContent = '导出迁移包';
    settingsPage.querySelector('#desktop-developer-copy').textContent = '开启后显示虚构示例导入按钮；关闭会隐藏示例，不删除已有资料。';
  }
  for (const id of ['desktop-open-data-folder', 'desktop-import-folder', 'desktop-open-reset', 'collect-folder']) { const el = document.getElementById(id); if (el) el.hidden = true; }
  document.querySelector('.local-card small').textContent = native ? 'Android · 离线可用' : 'Android 布局预览';
  const initial = document.querySelector('.nav [data-view="today"]:not([hidden])'); goingBack = true; initial?.click(); navigation.length = 0;
  header.querySelector('#mobile-page-title').textContent = titles[main.dataset.activeView] || '几微';
  syncQuick();
  installMobileLayout();
  installAssistant(native);
  document.documentElement.dataset.mobileReady = 'true';
}
// Desktop starts asynchronously after the authoritative workspace read.
if (document.querySelector('#desktop-developer-mode')) installShell();
else {
  const observer = new MutationObserver(() => { if (document.querySelector('#desktop-developer-mode')) { observer.disconnect(); queueMicrotask(installShell); } });
  observer.observe(document.querySelector('.main'), { childList: true, subtree: true });
}
