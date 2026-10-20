import { projectCourseOccurrences, courseTimes, todayCourseState, courseOccurs } from './course-occurrences.mjs';
import { buildCourseBatch, exportCourseIcs, exportCourseCsv } from './course-files.mjs';
import { createCourseTools } from './course-tools-ui.mjs';
import { applyReading, normalizeReading, readingKey, createReadingUI } from './reading.mjs';
// Desktop mainline: course capture/import and the independent local workbench.
import * as calendar from '../shared/packages/core/src/semester-calendar.mjs';
import { createTimetableStore } from './timetable-store.mjs';
import { prepareCapturedCourses, parseCourseWeeks, capturedSchoolSchedule } from './course-import.mjs';
import { loadWorkbenchExamples, dataKeys, readRecords, saveWebCapture, approveWebDraft } from './workbench-data.mjs';
import { createPageMotion } from './page-motion.mjs';
import { createPlanningUI } from './planning-ui.mjs';
import { normalizeItem, isOnDate, isComplete, describeItem } from './planning.mjs';
import { createWorkspaceStorage, readWorkspaceBackup } from './workspace-format.mjs';
import { applyAppearance, readAppearance, courseColors } from './appearance.mjs';
import { createAppearanceUI } from './appearance-ui.mjs';
import { createScheduleEditor } from './schedule-ui.mjs';
import { readModules, isModuleEnabled, isModuleAvailable } from './modules.mjs';
import { createModulesUI } from './modules-ui.mjs';
import { createCourseOverlay } from './course-overlay.mjs';
import { paletteForCourse } from './course-colors.mjs';
import { groupCourseIntervals } from './course-layout.mjs';
import { createCourseFormControls } from './course-editor.mjs';
import { createCalendarUI } from './calendar-ui.mjs';
import { createChatMonitorUI } from './chat-monitor-ui.mjs';
import { visibleRecords } from './examples.mjs';
import { readObjects, refKey } from './object-view.mjs';
import { createObjectUI } from './object-view-ui.mjs';
import { escapeHtml } from './ui-text.mjs';
(async () => {
  let workspace;
  try { workspace = await createWorkspaceStorage(localStorage, window.jeeWeaveDesktop); }
  catch (error) {
    document.querySelector('.main').replaceChildren();
    const message = document.createElement('p'); message.className = 'desktop-form-error'; message.setAttribute('role', 'alert');
    message.textContent = `无法载入本地数据：${error.message} 原文件未覆盖。请保留 data 文件夹后重试，必要时使用 workspace.previous.json 恢复。`;
    document.querySelector('.main').append(message); return;
  }
  const storage = workspace.storage;
  let modulePreferences = readModules(storage);
  const enabled = id => isModuleAvailable(id) && isModuleEnabled(modulePreferences, id);
  const subviewMotion = createPageMotion(undefined, 'desktop-subview-change');
  let developerMode = storage.getItem('jiwei-desktop-developer-mode') === 'true';
  applyAppearance(readAppearance(storage), document.documentElement);
  applyReading(normalizeReading(JSON.parse(storage.getItem(readingKey)||'null')), document.documentElement);
  const main = document.querySelector('.main');
  const nav = document.querySelector('[data-view="plans"]')?.parentElement;
  const addNav = (id, title, icon) => {
    if (!nav || document.querySelector(`[data-view="${id}"]`)) return;
    const button = document.createElement('button');
    button.dataset.view = id;
    const mark = document.createElement('span'); mark.className = 'nav-icon'; mark.textContent = icon;
    button.append(mark, document.createTextNode(title)); nav.append(button);
  };
  addNav('objects', '对象视图 Beta', ''); addNav('calendar', '日历', ''); addNav('settings', '设置', '⚙');
  addNav('web-capture', '网页采集', '');
  const webNav = document.querySelector('[data-view="web-capture"]');
  document.querySelector('#collect-nav').append(webNav);
  if (isModuleAvailable('chat-monitor')) { addNav('chat-monitor', '群消息', ''); document.querySelector('#collect-nav').append(document.querySelector('[data-view="chat-monitor"]')); }
  const iconPaths = {
    objects: '<rect x="8" y="8" width="8" height="8" rx="2"/><path d="M12 3v5m0 8v5M3 12h5m8 0h5"/><circle cx="12" cy="3" r="1"/><circle cx="12" cy="21" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="21" cy="12" r="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    login: '<path d="M14 4h5v16h-5M4 12h11m-4-4 4 4-4 4"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    'web-capture': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a20 20 0 0 1 0 18 20 20 0 0 1 0-18"/>',
    'chat-monitor': '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z"/><path d="M7 10h10M7 14h6"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    courses: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 3v4m8-4v4M9 10v11m6-11v11"/>',
    plans: '<path d="m12 3 9 9-9 9-9-9Z"/><path d="m8 12 3 3 5-6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2"/>',
    tasks: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>',
    notes: '<path d="M12 4H4v16h16v-8M10 14l1-5 8-8 4 4-8 8Z"/>',
    ledger: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h3m-3 4h3m4-4h1m-1 4h1"/>',
    ai: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
    plugins: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7m-3.5-3.5v7"/>',
  };
  const icon = name => `<svg class="desktop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.courses}</svg>`;
  document.querySelectorAll('.nav [data-view] .nav-icon').forEach(mark => { mark.innerHTML = icon(mark.parentElement.dataset.view === 'overview' ? 'home' : mark.parentElement.dataset.view); });
  const dayNames = ['一', '二', '三', '四', '五', '六', '日'];

  const coursePanel = document.createElement('section');
  coursePanel.className = 'desktop-course-panel';
  coursePanel.hidden = true;
  coursePanel.innerHTML = `
    <div class="intro desktop-page-head"><div><h1>课程表</h1></div></div>
    <header class="desktop-course-page-head">
      <div class="desktop-course-heading"><button id="desktop-manage-timetable" type="button" title="管理和切换课表"><span id="desktop-timetable-name"></span><span aria-hidden="true">⌄</span></button><p id="desktop-course-summary"></p></div>
      <div class="desktop-course-actions"><div><button id="desktop-add-course" type="button" class="secondary icon-button" aria-label="添加课程" title="添加课程">${icon('plus')}</button><button id="desktop-open-course-settings" type="button" class="secondary" aria-expanded="false" aria-controls="desktop-course-settings">${icon('settings')}课表设置</button></div><small id="desktop-week-dates"></small></div>
    </header>
    <div id="desktop-course-notice" class="desktop-course-notice" hidden><span class="desktop-notice-dot" aria-hidden="true"></span><p id="desktop-course-feedback" role="status" aria-live="polite" aria-atomic="true"></p><button type="button" id="desktop-dismiss-notice" class="icon-button" aria-label="关闭操作提示">${icon('close')}</button></div>
    <section class="panel desktop-timetable-panel">
      <h2 id="desktop-timetable-title" class="sr-only">本周课表</h2>
      <div class="desktop-timetable-controls"><div class="desktop-view-switch"><button type="button" class="active" aria-pressed="true" data-course-view="week">周视图</button><button type="button" aria-pressed="false" data-course-view="day">日视图</button></div><label id="desktop-course-day-label" hidden>星期<select id="desktop-course-day">${dayNames.map((day, index) => `<option value="${index + 1}">周${day}</option>`).join('')}</select></label><span class="desktop-timetable-hint">点星期查看单日 · 点空白格添加课程</span><div class="desktop-week-options"><span id="desktop-timetable-count">暂无课程</span><label><span class="sr-only">查看周次</span><select id="desktop-course-week" aria-label="查看周次"></select></label><button id="desktop-load-demo" type="button" class="secondary">载入示例课表</button></div></div>
      <div id="desktop-timetable-empty" class="empty"><strong id="desktop-empty-title">这张课表还没有课程</strong><p id="desktop-empty-copy">导入教务课表或 CSV，或手动添加第一门课程。</p><div class="desktop-empty-actions"><button id="desktop-empty-import" type="button" class="primary">${icon('download')}导入课程</button><button id="desktop-empty-add" type="button" class="secondary">${icon('plus')}手动添加</button></div></div>
      <div id="desktop-timetable-scroll" class="desktop-timetable-scroll" hidden>
        <div id="desktop-timetable" class="desktop-timetable"></div>
      </div>
      <details id="desktop-unplaced-courses" class="desktop-unplaced-courses" hidden><summary id="desktop-unplaced-count">待安排课程</summary><p class="desktop-section-copy">学校未提供星期和节次，按原文保留，不计入每周网格。</p><div id="desktop-unplaced-list" class="desktop-list"></div></details>
    </section>
    <form id="desktop-course-editor" class="panel desktop-course-editor" hidden>
      <div class="panel-head"><h2 id="desktop-course-editor-title">添加课程</h2><button id="desktop-close-editor" type="button" class="icon-button" aria-label="关闭课程编辑">${icon('close')}</button></div>
      <div class="desktop-course-form-grid"><label>课程名称<input name="title" required placeholder="例如：高等数学" /></label><label>教师<input name="teacher" placeholder="可选" /></label><label>地点<input name="location" placeholder="可选" /></label><label>星期<select name="weekday">${dayNames.map((day, index) => `<option value="${index + 1}">周${day}</option>`).join('')}</select></label><label>开始节次<input name="periodStart" type="number" min="1" max="20" value="1" required /></label><label>结束节次<input name="periodEnd" type="number" min="1" max="20" value="2" required /></label><label class="wide">周次<input name="weeksText" placeholder="例如 1-16 或 1-16单" /></label></div>
      <div class="desktop-course-editor-actions"><button type="button" class="secondary" id="desktop-adjust-course" hidden>调整 / 停课这一次</button><button id="desktop-delete-course" type="button" class="secondary danger-button" hidden>删除课程</button><button id="desktop-cancel-course" type="button" class="secondary">取消</button><button type="submit" class="primary">保存课程</button></div>
    </form>
    <section id="desktop-course-settings" class="panel desktop-course-settings" hidden>
      <div class="panel-head"><div><h2 id="desktop-course-settings-title">课表设置</h2><p>管理当前课表和课程资料</p></div><button id="desktop-close-course-settings" type="button" class="icon-button" aria-label="收起课表设置" title="收起课表设置">${icon('close')}</button></div>
      <div class="desktop-settings-tabs" role="tablist" aria-label="课表设置分类">
        <button id="desktop-tab-semester" type="button" role="tab" data-settings-tab="semester" aria-selected="true" aria-controls="desktop-settings-semester">课表管理</button>
        <button id="desktop-open-import" type="button" role="tab" data-settings-tab="import" aria-selected="false" aria-expanded="false" aria-controls="desktop-course-import" tabindex="-1">导入 / 导出</button>
        <button id="desktop-open-batch" type="button" role="tab" data-settings-tab="batch" aria-selected="false" aria-expanded="false" aria-controls="desktop-course-batch" tabindex="-1">批量编辑</button>
        <button id="desktop-tab-schedule" type="button" role="tab" data-settings-tab="schedule" aria-selected="false" aria-controls="desktop-settings-schedule" tabindex="-1">作息时间</button>
      </div>
      <section id="desktop-settings-semester" class="desktop-settings-pane" role="tabpanel" aria-labelledby="desktop-tab-semester" data-settings-pane="semester">
        <div class="desktop-semester-switch"><label>当前课表<select id="desktop-semester-select"></select></label><button id="desktop-new-semester" type="button" class="secondary">${icon('plus')}新建课表</button></div>
        <form id="desktop-new-semester-form" class="desktop-settings-form desktop-inline-form" hidden><label>新课表名称<input name="name" required maxlength="60" /></label><label>第 1 周周一<input name="startDate" type="date" required /></label><label>总周数<input name="totalWeeks" type="number" min="1" max="30" value="20" required /></label><div class="desktop-form-actions"><button id="desktop-cancel-new-semester" type="button" class="secondary">取消</button><button type="submit" class="primary">创建课表</button></div></form>
        <form id="desktop-semester-form" class="desktop-settings-form"><label>课表名称<input name="name" placeholder="例如：2026 春季学期" /></label><label>开学日（第 1 周周一）<input name="startDate" type="date" /></label><label>总周数<input name="totalWeeks" type="number" min="1" max="30" /></label><div class="desktop-form-actions"><button type="submit" class="primary">保存课表信息</button></div></form>
        <div class="desktop-danger-zone"><span>删除当前课表及其中的课程</span><button id="desktop-delete-semester" type="button" class="secondary danger-button">删除课表</button></div>
        <div id="desktop-delete-semester-confirm" class="desktop-delete-confirm" hidden><p id="desktop-delete-semester-copy"></p><div class="desktop-form-actions"><button id="desktop-cancel-delete-semester" type="button" class="secondary">取消</button><button id="desktop-confirm-delete-semester" type="button" class="primary danger-button">确认删除课表和课程</button></div></div>
      </section>
      <section id="desktop-settings-schedule" class="desktop-settings-pane desktop-period-settings" role="tabpanel" aria-labelledby="desktop-tab-schedule" data-settings-pane="schedule" hidden><div class="desktop-section-head"><div><h3>作息时间</h3><p>独立保存到当前课表</p></div><button id="desktop-reset-schedule" type="button" class="secondary">恢复默认 12 节</button></div><div id="desktop-period-list"></div><div class="desktop-form-actions"><button id="desktop-save-schedule" type="button" class="primary">保存作息时间</button></div></section>
    </section>
    <section id="desktop-course-batch" class="desktop-settings-pane desktop-course-batch" role="tabpanel" aria-labelledby="desktop-open-batch" data-settings-pane="batch" hidden>
      <div class="desktop-section-head"><h3>批量编辑课程</h3></div>
      <p class="desktop-course-settings-note">批量修改名称、教师、地点、星期、起止节次和周次；保存全部时一次写入，取消不修改。</p>
      <div id="desktop-batch-list" class="desktop-batch-list"></div>
      <div class="desktop-form-actions"><button id="desktop-save-batch" type="button" class="primary">保存批量修改</button></div>
    </section>
    <section id="desktop-course-import" class="desktop-settings-pane desktop-course-import" role="tabpanel" aria-labelledby="desktop-open-import" data-settings-pane="import" hidden>
      <div class="desktop-school-import">
      <div class="desktop-section-head"><div><h3>从教务系统导入</h3><p>默认：南邮（南京邮电大学） · WebVPN 登录后读取课表</p></div></div>
      <ol class="desktop-import-steps"><li>登录 WebVPN</li><li>进入教务系统，查询课表</li><li>回到几微，抓取并导入</li></ol>
      <div class="course-toolbar"><button id="desktop-open-portal" type="button" class="secondary">${icon('login')}打开 WebVPN 登录</button><button id="desktop-capture-course" type="button" class="primary">${icon('download')}抓取并导入</button></div>
      <details class="desktop-portal-address"><summary>更换教务地址</summary><label>登录入口<input id="desktop-portal-url" value="https://vpn.njupt.edu.cn:8443/http/webvpn85b2e3dcbef5577474e4a553381b9cce/user-login/?service=B60EAE060CDD93DC0476DA6768632F86" aria-label="教务系统网址" placeholder="WebVPN 身份认证或教务系统网址" /></label></details>
      <p id="desktop-course-message" class="desktop-course-message">请在教务窗口完成必要的 VPN 和身份认证登录，再打开个人课表列表视图。</p>
      <p class="desktop-section-copy">导入后请在“作息时间”核对本校上课时间，并在“课表管理”核对第 1 周周一；这些信息不会根据课程节次自动推算。</p>
      </div><p id="desktop-school-import-disabled" class="desktop-section-copy" hidden>教务导入已关闭，可在插件管理中开启；CSV 导入仍可使用。</p>
      <div class="desktop-file-transfer"><div><h3>课程文件</h3><p>CSV / ICS 先预览再导入；ICS 按实际课次导出，包含单次调整结果。</p></div><div class="desktop-button-row"><button id="desktop-import-csv" type="button" class="secondary">${icon('upload')}导入 CSV / ICS</button><button id="desktop-export-ics" type="button" class="secondary">导出到日历（ICS）</button><button id="desktop-export-csv" type="button" class="secondary">${icon('download')}导出 CSV</button></div><input id="desktop-csv-file" type="file" accept=".csv,.ics,text/csv,text/calendar" hidden /></div>
      <div id="desktop-course-result" class="desktop-course-result" hidden>
        <div class="panel-head"><h2>本次解析</h2><span id="desktop-course-count"></span></div>
        <div id="desktop-course-list" class="desktop-course-list"></div>
        <details id="desktop-original-source" class="desktop-original-source" hidden>
          <summary>查看原始课表页面</summary>
          <iframe id="desktop-original-frame" title="原始课表页面" sandbox></iframe>
        </details>
        <details id="desktop-debug-source" class="desktop-debug-source" hidden>
          <summary>调试：查看原始抓取文本</summary>
          <pre id="desktop-debug-text"></pre>
        </details>
      </div>
    </section>`;
  main.append(coursePanel);

  const todayPanel = document.createElement('section');
  todayPanel.className = 'desktop-page-panel';
  todayPanel.hidden = true;
  todayPanel.innerHTML = `<div class="intro desktop-page-head"><div><div class="eyebrow">TODAY</div><h1 style="font-size:24px">今天</h1><p>只看今天的课程和待办，快速知道下一步。</p></div></div><section class="panel"><div class="panel-head"><h2 id="desktop-today-date">今天</h2><span id="desktop-today-count"></span></div><div id="desktop-today-list" class="desktop-list"></div></section>`;
  const plansPanel = document.createElement('section');
  plansPanel.className = 'desktop-page-panel';
  plansPanel.hidden = true;
  const settingsPanel = document.createElement('section');
  settingsPanel.className = 'desktop-page-panel';
  settingsPanel.hidden = true;
  settingsPanel.innerHTML = `<div class="intro desktop-page-head"><div><h1 style="font-size:24px">设置</h1><p>管理桌面端的外观和本地数据。</p></div></div><section class="panel desktop-settings-panel"><section class="desktop-settings-section"><h2>本地数据</h2><p>课程、计划、待办、日历偏好与设置统一保存在 workspace.json。升级时先关闭应用，再把整个 data 文件夹复制到新版本，登录状态和采集原文也会一并迁移。</p><p id="desktop-data-path" class="desktop-data-path"></p><div class="desktop-button-row"><button id="desktop-open-data-folder" type="button" class="secondary">打开数据文件夹</button><button id="desktop-export-data" type="button" class="secondary">导出业务数据</button><button id="desktop-import-data" type="button" class="secondary">恢复业务数据</button><input id="desktop-data-file" type="file" accept=".json,application/json" hidden /></div><p>JSON 导出包含业务资料与历史扩展数据，不含教务登录状态、接入密钥和独立原文文件；完整迁移请复制 data 文件夹。</p><div id="desktop-restore-preview" class="desktop-restore-preview" hidden><p id="desktop-restore-summary"></p><p>确认后替换当前业务数据，现有文件会先单独备份。取消不会修改资料。</p><div class="desktop-button-row"><button id="desktop-cancel-restore" type="button" class="secondary">取消</button><button id="desktop-confirm-restore" type="button" class="primary">确认恢复</button></div></div></section><section class="desktop-settings-section"><h2>开发者模式</h2><label class="desktop-developer-toggle"><input id="desktop-developer-mode" type="checkbox" aria-describedby="desktop-developer-copy" /><span>启用开发者模式</span></label><p id="desktop-developer-copy">开启后显示各功能的示例导入按钮，并可查看教务抓取原文。关闭会隐藏这些入口，不会删除已导入的示例。</p></section></section>`;
  main.append(todayPanel, plansPanel, settingsPanel);
  const pluginsPanel = document.createElement('section'); pluginsPanel.className = 'desktop-page-panel'; pluginsPanel.hidden = true; main.append(pluginsPanel);

  const webCapture = document.querySelector('.capture-panel');
  webCapture.className = 'desktop-page-panel capture-panel';
  webCapture.innerHTML = `
    <div class="intro desktop-page-head"><div><h1 style="font-size:24px">网页采集</h1><p>读取公开网页，整理重点，并把确认后的行动加入待办。</p></div></div>
    <section class="panel desktop-web-entry"><form id="desktop-web-form" class="collect-box"><label class="sr-only" for="collect-url">公开网页地址</label><input id="collect-url" type="url" required placeholder="粘贴通知或文章的网址，例如 https://example.com" /><button id="collect-submit" type="submit" class="primary">${icon('download')}抓取并整理</button></form><p class="desktop-web-hint">公开静态网页 · 在本机整理 · 原文单独保存</p><p id="collect-status" class="desktop-web-status" role="status" aria-live="polite"></p></section>
    <div class="desktop-web-workspace"><aside class="panel desktop-web-history"><div class="panel-head"><h2>已采集网页</h2><span id="desktop-web-total"></span></div><div id="desktop-web-history"></div></aside>
    <section id="collect-result" class="panel desktop-web-detail" hidden><div class="panel-head"><div><h2 id="collect-title"></h2><p id="collect-source"></p></div><span id="desktop-web-example" class="tag" hidden>示例</span></div>
      <div class="desktop-web-body"><section><h3>重点信息</h3><ul id="collect-highlights" class="desktop-web-highlights"></ul></section><section><div class="desktop-section-head"><h3>行动草稿</h3><span>本地规则识别，确认后加入待办</span></div><div id="collect-drafts"></div></section>
      <details class="desktop-web-original"><summary>查看原文与来源链接</summary><pre id="collect-preview"></pre><div id="collect-links"></div><p id="collect-path"></p><button id="collect-folder" type="button" class="secondary">打开原文保存目录</button></details></div>
    </section><section id="desktop-web-empty" class="panel empty"><strong>把网页整理成下一步</strong><p>粘贴公开网页地址，或导入示例查看重点、草稿和确认流程。</p></section></div>`;
  const overviewPanel = document.querySelector('#view-overview');
  overviewPanel.className = 'desktop-page-panel';
  overviewPanel.innerHTML = `<div class="intro desktop-page-head"><div><h1 style="font-size:24px">总览</h1><p>查看本地内容，继续整理待确认的网页行动。</p></div></div><div class="grid"><section class="panel"><div class="panel-head"><h2>待确认的网页行动</h2><button type="button" class="secondary" data-view="web-capture">继续整理</button></div><div id="desktop-overview-drafts" class="desktop-list"></div></section><section class="panel"><div class="panel-head"><h2>本地工作区</h2></div><div id="desktop-overview-summary" class="desktop-list"></div></section></div>`;
  const planningUI = createPlanningUI({ plansPanel, storage, enabled, feedback: (...args) => feedback(...args), onChange: () => { renderToday(); renderOverview(); calendarUI.refresh(); } });
  const { render: renderItems, resetEditors: resetPlanningEditors } = planningUI;
  const calendarPanel = document.createElement('section'); main.append(calendarPanel);
  const calendarUI = createCalendarUI({ panel: calendarPanel, storage, enabled, getCourseTable:()=>currentSemester(), onCourseAdjust:(id,date)=>{document.querySelector('.nav [data-view="courses"]').click();courseTools.openAdjustment(id,date);}, onCourseEdit:(id,date)=>{document.querySelector('.nav [data-view="courses"]').click();openCourseEditor(loadCourses().find(c=>c.id===id),undefined,date);}, feedback: (...args) => feedback(...args), onChange: () => { renderItems(); renderToday(); renderOverview(); }, onEdit: (kind, id) => { document.querySelector('[data-view="plans"]').click(); planningUI.openItem(kind, id); }, onAdd: (kind, date) => { document.querySelector('[data-view="plans"]').click(); planningUI.openItem(kind, null, date); } });
  const objectPanel=document.createElement('section');main.append(objectPanel);
  const objectUI=createObjectUI({panel:objectPanel,main,storage,enabled,feedback:(...args)=>feedback(...args),onChange:()=>{renderItems();renderOverview();},onAddItem:id=>{document.querySelector('.nav [data-view="plans"]').click();planningUI.openItem('task',null,undefined,'deadline',id);},onOpenRecord:ref=>{
    if(ref.collection==='courseEntry'){timetableStore.select(ref.containerId);document.querySelector('.nav [data-view="courses"]').click();afterSemesterChange();const course=loadCourses().find(c=>c.id===ref.id);if(course)openCourseEditor(course);else feedback('这是待安排课程，请在课表中核对原始信息。');}
    else if(ref.collection==='capture'){selectedCaptureId=ref.id;webNav.click();renderWebCollection();}
    else{document.querySelector('.nav [data-view="plans"]').click();planningUI.openItem(ref.collection,ref.id);}
  }});
  for (const [panel,scope] of [[overviewPanel,'overview'],[todayPanel,'today'],[plansPanel,'items'],[webCapture,'web']]) {
    const button=document.createElement('button'); button.type='button'; button.className='secondary'; button.dataset.loadExample=scope;
    button.id=`desktop-demo-${scope==='items'?'plans':scope}`; button.innerHTML=`${icon('download')}导入示例`;
    const head = panel.querySelector('.intro'), actions = document.createElement('div'); actions.className = 'desktop-page-actions';
    for (const action of [...head.children].filter(element => element.tagName === 'BUTTON')) actions.append(action);
    actions.append(button); head.append(actions);
  }
  coursePanel.querySelector('#desktop-load-demo').dataset.loadExample='courses';
  const sampleSection=document.createElement('section'); sampleSection.className='desktop-example-settings';
  sampleSection.innerHTML=`<h2>功能示例</h2><p>导入独立示例课表，以及计划、待办和网页整理示例。重复导入只补充缺失项，保留已有内容与完成状态。</p><button type="button" id="desktop-load-all-examples" class="secondary" data-load-example="all">${icon('download')}导入全部示例</button>`;
  settingsPanel.querySelector('.desktop-settings-panel').append(sampleSection);
  const resetSection=document.createElement('section');resetSection.className='desktop-settings-section desktop-reset-section';resetSection.hidden=true;
  resetSection.innerHTML='<h2>重置本地数据</h2><p>开发调试时恢复为空白状态，包含真实记录与示例。执行前会保留本地完整备份，应用随后重新启动。</p><button type="button" class="secondary danger-button" id="desktop-open-reset">清空所有数据</button>';
  settingsPanel.querySelector('.desktop-settings-panel').append(resetSection);
  const resetForm=document.createElement('form');resetForm.className='panel desktop-item-editor';resetForm.id='desktop-reset-form';resetForm.hidden=true;
  resetForm.innerHTML='<div class="panel-head"><h2 id="desktop-reset-title">清空所有本地数据</h2><button type="button" class="secondary" data-reset-close>关闭</button></div><div class="desktop-item-fields"><p class="wide desktop-section-copy">此操作会清空课程、待安排记录、事项、对象及关联、网页原文、登录状态、设置和缓存。应用会重启，开发者模式也会关闭。</p><p id="desktop-reset-summary" class="wide desktop-section-copy"></p><p class="wide desktop-section-copy">重启时先把旧数据移入 data/backups/before-clear-…/data，历史备份保留。恢复业务记录可使用其中的 workspace.json；恢复整个环境请先关闭应用，再恢复备份文件夹内容。</p><label class="desktop-checkbox-label"><input type="checkbox" id="desktop-reset-ack" required />我确认清空当前数据，并重新启动应用</label></div><p class="desktop-form-error" role="alert" hidden></p><div class="desktop-form-actions"><button type="button" class="secondary" data-reset-close>取消</button><button type="submit" class="primary danger-button" id="desktop-confirm-reset" disabled>备份、清空并重启</button></div>';
  settingsPanel.append(resetForm);
  let resetRevision=null;
  const resetOverlay=createCourseOverlay({surface:settingsPanel,main,panels:[resetForm],id:'desktop-reset-dialog',fitViewport:true,onClose:()=>{resetRevision=null;}});
  resetSection.querySelector('button').addEventListener('click',()=>{
    if(storage.getItem('jiwei-desktop-developer-mode')!=='true'){feedback('请先开启开发者模式。');return;}
    const snapshot=workspace.snapshot(),data=snapshot.data;resetRevision=snapshot.revision;resetForm.reset();resetForm.querySelector('[role=alert]').hidden=true;resetForm.querySelector('[type=submit]').disabled=true;
    resetForm.querySelector('#desktop-reset-summary').textContent=`当前共 ${data.timetables?.tables.length||0} 张课表、${data.tasks.length+data.plans.length} 项事项、${data.objectView?.objects.length||0} 个对象、${data.webCaptures.length} 条网页记录（包括隐藏的示例）。`;
    resetOverlay.show(resetForm,{labelledBy:'desktop-reset-title',focus:resetForm.querySelector('[data-reset-close]')});
  });
  resetForm.querySelector('#desktop-reset-ack').addEventListener('change',event=>{resetForm.querySelector('[type=submit]').disabled=!event.target.checked;});
  resetForm.querySelectorAll('[data-reset-close]').forEach(button=>button.addEventListener('click',()=>resetOverlay.close()));
  resetForm.addEventListener('submit',async event=>{
    event.preventDefault();const submit=resetForm.querySelector('[type=submit]'),error=resetForm.querySelector('[role=alert]');
    try{
      if(storage.getItem('jiwei-desktop-developer-mode')!=='true'||!resetForm.querySelector('#desktop-reset-ack').checked)throw Error('请先开启开发者模式并确认清空范围。');
      if(!window.jeeWeaveDesktop?.resetWorkspace)throw Error('此操作需要桌面主程序，请使用 desktop/debug.cmd 启动。');
      submit.disabled=true;submit.setAttribute('aria-busy','true');
      const result=await window.jeeWeaveDesktop.resetWorkspace({confirmation:'清空所有数据',revision:resetRevision});
      if(!result.ok)throw Error(result.message);feedback(`正在重新启动，旧数据将备份至 ${result.backupPath}`,'success');
    }catch(e){error.textContent=e.message;error.hidden=false;submit.disabled=!resetForm.querySelector('#desktop-reset-ack').checked;submit.removeAttribute('aria-busy');}
  });
  const syncDeveloperMode = () => {
    document.querySelectorAll('[data-load-example], [data-chat-example]').forEach(button => { button.hidden = !developerMode; });
    sampleSection.hidden = !developerMode;
    resetSection.hidden = !developerMode;
    if(!developerMode)resetOverlay.close({restoreFocus:false});
    settingsPanel.querySelector('#desktop-developer-mode').checked = developerMode;
    document.querySelector('.brand-mark').title = developerMode ? '几微 · JeeWeave · 开发者模式' : '几微 · JeeWeave';
    webCapture.querySelector('#desktop-web-empty p').textContent = developerMode ? '粘贴公开网页地址，或导入示例查看重点、草稿和确认流程。' : '粘贴公开网页地址，查看重点、草稿和确认流程。';
    if (!developerMode) { const raw = coursePanel.querySelector('#desktop-debug-source'); raw.hidden = true; raw.open = false; coursePanel.querySelector('#desktop-debug-text').textContent = ''; }
  };
  syncDeveloperMode();
  settingsPanel.querySelector('#desktop-developer-mode').addEventListener('change', event => {
    try { storage.setItem('jiwei-desktop-developer-mode', String(event.target.checked)); developerMode = event.target.checked; syncDeveloperMode();afterSemesterChange();renderItems();renderToday();renderOverview();renderWebCollection();calendarUI.refresh();objectUI.render(); feedback(developerMode ? '开发者模式已开启，示例与导入入口已显示。' : '开发者模式已关闭，示例已隐藏；原示例数据仍保留。', 'success'); }
    catch (error) { syncDeveloperMode(); feedback(error.message, 'error'); }
  });
  const courseImport = coursePanel.querySelector('#desktop-course-import');
  const courseSettings = coursePanel.querySelector('#desktop-course-settings');
  const courseBatch = coursePanel.querySelector('#desktop-course-batch');
  courseSettings.append(courseImport, courseBatch);
  const weekSection = document.createElement('div'); weekSection.className = 'desktop-week-toolbar'; weekSection.setAttribute('aria-label', '课表周次导航');
  weekSection.innerHTML = `<div class="desktop-week-navigation"><button id="desktop-prev-week" type="button" class="icon-button" aria-label="上一周">${icon('left')}</button><button id="desktop-current-week" type="button" class="desktop-week-title" aria-label="回到本周" title="点击回到本周"><strong id="desktop-week-label"></strong><small id="desktop-week-position"></small></button><button id="desktop-next-week" type="button" class="icon-button" aria-label="下一周">${icon('right')}</button></div>`;
  coursePanel.querySelector('.desktop-course-actions').before(weekSection);
  const notice = coursePanel.querySelector('#desktop-course-notice');
  const timetablePanel = coursePanel.querySelector('.desktop-timetable-panel');
  timetablePanel.prepend(coursePanel.querySelector('.desktop-course-page-head'));
  const courseOverlay = createCourseOverlay({ surface: timetablePanel, main, panels: [courseSettings, coursePanel.querySelector('#desktop-course-editor')], onClose: () => { coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'false'); } });
  const setCourseSettingsOpen = (open, focus = false) => {
    if (open) notice.hidden = true;
    if (open) courseOverlay.show(courseSettings, { labelledBy: 'desktop-course-settings-title', focus: focus ? courseSettings.querySelector('[role="tab"][aria-selected="true"]') : courseSettings.querySelector('#desktop-close-course-settings'), returnFocus: coursePanel.querySelector('#desktop-open-course-settings') });
    else if (courseOverlay.activePanel === courseSettings) courseOverlay.close();
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', String(open));
  };
  main.append(notice);
  let noticeTimer;
  const feedback = (text, tone = 'info') => {
    clearTimeout(noticeTimer);
    notice.hidden = false;
    notice.dataset.tone = tone;
    notice.querySelector('#desktop-course-feedback').textContent = text;
    courseOverlay.feedback(text, tone);
    if (tone !== 'error') noticeTimer = setTimeout(() => { notice.hidden = true; }, 6500);
  };
  notice.querySelector('#desktop-dismiss-notice').addEventListener('click', () => { notice.hidden = true; });
  const resetCourseSubpanels = () => {
    if (courseOverlay.activePanel?.id === 'desktop-course-editor') courseOverlay.close({ restoreFocus: false });
    setSettingsPane('semester');
    coursePanel.querySelector('#desktop-course-editor').hidden = true;
    coursePanel.querySelector('#desktop-new-semester-form').hidden = true;
    coursePanel.querySelector('#desktop-delete-semester-confirm').hidden = true;
    coursePanel.querySelector('#desktop-course-result').hidden = true;
    coursePanel.querySelector('#desktop-original-frame').srcdoc = '';
    coursePanel.querySelector('#desktop-debug-text').textContent = '';
  };
  const setSettingsPane = key => {
    courseSettings.parentElement.scrollTop = 0;
    courseOverlay.clearFeedback(); notice.hidden = true;
    courseSettings.querySelectorAll('[data-settings-pane]').forEach(pane => { pane.hidden = pane.dataset.settingsPane !== key; });
    courseSettings.querySelectorAll('[data-settings-tab]').forEach(tab => {
      const selected = tab.dataset.settingsTab === key;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      if (tab.hasAttribute('aria-expanded')) tab.setAttribute('aria-expanded', String(selected));
    });
    if (key === 'batch') renderBatchEditor();
    subviewMotion(courseSettings.querySelector(`[data-settings-pane="${key}"]`));
  };
  const setActive = (id) => document.querySelectorAll('.nav button').forEach(item => {
    item.classList.toggle('active', item.dataset.view === id);
    if (item.dataset.view === id) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  const hideBaseViews = () => {
    resetOverlay.close({restoreFocus:false});
    resetPlanningEditors();
    courseTools.close();
    courseOverlay.close({ restoreFocus: false });
    notice.hidden = true;
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'false');
    document.querySelector('#view-overview')?.classList.add('hidden');
    document.querySelector('#view-detail')?.classList.add('hidden');
    if (webCapture) webCapture.hidden = true;
    coursePanel.hidden = true;
    resetCourseSubpanels();
    setCourseSettingsOpen(false);
    if (courseBatch) courseBatch.hidden = true;
    todayPanel.hidden = true;
    plansPanel.hidden = true;
    settingsPanel.hidden = true;
    pluginsPanel.hidden = true;
    calendarPanel.hidden = true;
    objectPanel.hidden = true; objectUI.hide();
    document.querySelector('.desktop-chat-panel')?.setAttribute('hidden', '');
  };

  const parseWeeks = value => /^(?:每周|全周|全部周次)?$/.test(String(value || '').trim()) ? [] : parseCourseWeeks(value);
  const coursePalette = course => courseColors(paletteForCourse(course), readAppearance(storage));
  const timetableStore = createTimetableStore(storage);
  const loadSemesters = () => timetableStore.list();
  const currentSemester = () => timetableStore.current();
  const loadCourses = () => timetableStore.current().courses;
  const saveCourses = courses => timetableStore.update({ courses, adjustments:(currentSemester().adjustments||[]).filter(a=>courses.some(c=>c.id===a.courseId)) });
  const timetable = coursePanel.querySelector('#desktop-timetable');
  const timetableScroll = coursePanel.querySelector('#desktop-timetable-scroll');
  const timetableEmpty = coursePanel.querySelector('#desktop-timetable-empty');
  const timetableCount = coursePanel.querySelector('#desktop-timetable-count');
  const courseWeek = coursePanel.querySelector('#desktop-course-week');
  const courseDay = coursePanel.querySelector('#desktop-course-day');
  const courseDayLabel = coursePanel.querySelector('#desktop-course-day-label');
  let courseViewMode = 'week';
  const thisWeek = () => {
    const semester = currentSemester();
    return semester.startDate ? Math.max(1, Math.min(semester.totalWeeks, calendar.currentWeek(semester, calendar.today()))) : 1;
  };
  let selectedWeek = thisWeek();
  let selectedDay = new Date().getDay() || 7;
  const renderWeekControls = () => {
    const semester = currentSemester();
    const all = selectedWeek === 'all';
    const options = `<option value="all">全部周次</option>${Array.from({ length: semester.totalWeeks }, (_, index) => `<option value="${index + 1}">第 ${index + 1} 周</option>`).join('')}`;
    for (const select of [courseWeek]) {
      select.innerHTML = options; select.value = String(selectedWeek);
    }
    const actual = semester.startDate ? calendar.currentWeek(semester, calendar.today()) : null;
    const inTerm = actual !== null && actual >= 1 && actual <= semester.totalWeeks;
    coursePanel.querySelector('#desktop-week-position').textContent = !semester.startDate ? '未设开学日，默认第 1 周' : !inTerm ? `${actual < 1 ? '尚未开学' : '学期已结束'}` : !all && Number(selectedWeek) === actual ? '正在查看本周' : `当前为第 ${actual} 周`;
    coursePanel.querySelector('#desktop-week-dates').textContent = semester.startDate && !all ? `${calendar.dateForWeek(semester, Number(selectedWeek), 1)} — ${calendar.dateForWeek(semester, Number(selectedWeek), 7)}` : '';
    coursePanel.querySelector('#desktop-prev-week').disabled = !all && Number(selectedWeek) <= 1;
    coursePanel.querySelector('#desktop-next-week').disabled = !all && Number(selectedWeek) >= semester.totalWeeks;
    coursePanel.querySelector('#desktop-week-label').textContent = all ? '全部周次' : `第 ${selectedWeek} 周`;
  };
  const renderTimetable = (courses = []) => {
    if (!timetable || !timetableScroll || !timetableEmpty) return;
    const table = currentSemester();
    const weekCourses = selectedWeek === 'all' || !table.startDate
      ? (selectedWeek === 'all' ? courses : courses.filter(course => !(course.weeks || []).length || course.weeks.includes(Number(selectedWeek))))
      : projectCourseOccurrences({ ...table, courses }, { start: calendar.dateForWeek(table,Number(selectedWeek),1), end: calendar.dateForWeek(table,Number(selectedWeek),7) });
    const filteredCourses = courseViewMode === 'day' ? weekCourses.filter(course => Number(course.weekday) === selectedDay) : weekCourses;
    const visibleDays = courseViewMode === 'day' ? [selectedDay] : [1, 2, 3, 4, 5, 6, 7];
    if (!filteredCourses.length) {
      timetableEmpty.hidden = false;
      coursePanel.querySelector('#desktop-empty-title').textContent = courses.length ? (courseViewMode === 'day' ? `周${dayNames[selectedDay - 1]}没有课程` : '这一周没有课程') : '这张课表还没有课程';
      coursePanel.querySelector('#desktop-empty-copy').textContent = courses.length ? '可以切换其他周次，或点击空白格添加课程。' : '导入教务课表或 CSV，或手动添加第一门课程。';
      coursePanel.querySelector('#desktop-empty-import').hidden = courses.length > 0;
      coursePanel.querySelector('#desktop-empty-add').hidden = courses.length > 0;
    }
    const schedule = loadSchedule();
    const maxPeriod = Math.max(schedule.length, ...filteredCourses.map(course => Number(course.periodEnd) || Number(course.periodStart) || 1));
    const semester = currentSemester();
    const headers = visibleDays.map(day => {
      const fullDate = semester.startDate && selectedWeek !== 'all' ? calendar.dateForWeek(semester, Number(selectedWeek), day) : '';
      const isToday = fullDate === calendar.today();
      return `<button type="button" class="desktop-timetable-day${isToday ? ' is-today' : ''}" data-open-day="${day}" title="查看周${dayNames[day - 1]}的课程">周${dayNames[day - 1]}${isToday ? ' · 今天' : ''}<small>${fullDate.slice(5).replace('-', '/')}</small></button>`;
    }).join('');
    const labels = Array.from({ length: maxPeriod }, (_, index) => { const period = schedule.find(item => item.index === index + 1); return `<div class="desktop-timetable-period" style="grid-column:1;grid-row:${index+1}"><span>${index + 1}</span>${period ? `<small>${period.start}<br>${period.end}</small>` : ''}</div>`; }).join('');
    const columns = visibleDays.map((day, dayIndex) => {
      const dayCourses = filteredCourses.filter(course => Number(course.weekday) === day), column = dayIndex + 2;
      const slots = Array.from({ length: maxPeriod }, (_, index) => `<button type="button" class="desktop-timetable-slot" style="grid-column:${column};grid-row:${index+1}" data-add-day="${day}" data-add-period="${index + 1}" aria-label="周${dayNames[day - 1]}第 ${index + 1} 节添加课程" title="点击添加课程"><span>添加课程</span></button>`).join('');
      const blocks = groupCourseIntervals(dayCourses).map(group => {
        const cards = group.items.map(({ course, start, end, lane }) => {
          const weeks = course.weekText || (course.weeks || []).join('、') || '每周', palette = coursePalette(course);
          return `<button type="button" class="desktop-timetable-course ${course.status==='cancelled'||course.status==='moved'?'is-course-inactive':''}" data-course-id="${escapeHtml(course.id)}" data-original-date="${escapeHtml(course.originalDate||'')}" data-occurrence-status="${course.status||'normal'}" title="点击编辑课程或调整这一次" style="grid-column:${lane+1};grid-row:${start-group.start+1}/span ${end-start+1};background:${palette.bg};color:${palette.text}"><strong>${escapeHtml(course.title)}</strong><span class="desktop-course-card-meta"><span>教师：${escapeHtml(course.teacher || '未填写')}</span><span>教室：${escapeHtml(course.location || '未填写')}</span><span>周次：${escapeHtml(weeks)}</span><span>节次：第 ${start}–${end} 节</span>${course.status==='cancelled'?'<span>本次停课 · 点击可恢复</span>':course.status==='moved'?`<span>本次调出 → ${escapeHtml(course.adjustment.target.date)} 第 ${course.adjustment.target.periodStart}–${course.adjustment.target.periodEnd} 节</span>`:course.isMovedIn?`<span>本次调入 · 原 ${escapeHtml(course.originalDate)}</span>`:''}</span></button>`;
        }).join('');
        return `<div class="desktop-course-group" style="grid-column:${column};grid-row:${group.start}/span ${group.end-group.start+1};grid-template-columns:repeat(${group.laneCount},minmax(0,1fr))">${cards}</div>`;
      }).join('');
      return slots + blocks;
    }).join('');
    const widths = visibleDays.map(day=>Math.max(120,...groupCourseIntervals(filteredCourses.filter(c=>Number(c.weekday)===day)).map(group=>group.laneCount*96)));
    const template = '48px '+widths.map(width=>`minmax(${width}px,1fr)`).join(' ');
    timetable.style.minWidth = `${48+widths.reduce((sum,width)=>sum+width,0)}px`;
    timetable.style.setProperty('--day-count',visibleDays.length);
    timetable.innerHTML = `<div class="desktop-timetable-header" style="grid-template-columns:${template}"><div>节次</div>${headers}</div><div class="desktop-timetable-body" style="grid-template-columns:${template};grid-template-rows:repeat(${maxPeriod},minmax(var(--desktop-period-height),auto))">${labels}${columns}</div>`;
    timetableScroll.hidden = courses.length === 0;
    timetablePanel.dataset.empty = String(courses.length === 0);
    timetableEmpty.classList.toggle('is-filter-empty', courses.length > 0);
    courseOverlay.updatePosition();
    timetableEmpty.hidden = filteredCourses.length > 0;
    if (timetableCount) {const markers=filteredCourses.filter(c=>c.status&&c.status!=='normal').length;timetableCount.textContent = selectedWeek==='all'||!semester.startDate ? `${filteredCourses.length} 门课程` : `${filteredCourses.length-markers} 次课${markers?` · ${markers} 个调整标记`:''} · 共 ${courses.length} 门课程`;}
  };
  const renderCourses = (courses = loadCourses()) => {
    renderWeekControls();
    const semester = currentSemester();
    coursePanel.querySelector('#desktop-timetable-name').textContent = semester.name;
    coursePanel.querySelector('#desktop-manage-timetable').title = `${semester.name} · 管理和切换课表`;
    coursePanel.querySelector('#desktop-course-summary').textContent = `共 ${semester.totalWeeks} 周 · ${courses.length} 门课程${semester.startDate ? '' : ' · 未设开学日'}`;
    const unplaced = semester.unplacedCourses || [];
    coursePanel.querySelector('#desktop-unplaced-courses').hidden = !unplaced.length;
    coursePanel.querySelector('#desktop-unplaced-count').textContent = `待安排课程 · ${unplaced.length} 项`;
    coursePanel.querySelector('#desktop-unplaced-list').innerHTML = unplaced.map(course => `<article class="desktop-list-item"><div><strong>${escapeHtml(course.title)}</strong><small>周次：${escapeHtml(course.weekText)} · 星期与节次待定</small><small>原文：${escapeHtml(course.raw)}</small></div></article>`).join('');
    coursePanel.querySelector('#desktop-timetable-title').textContent = selectedWeek === 'all' ? `${semester.name} · 全部周次` : `${semester.name} · 第 ${selectedWeek} 周`;
    renderTimetable(courses);
  };
  const courseTools = createCourseTools({ surface:coursePanel, main, getTable:currentSemester, updateTable:patch=>timetableStore.update(patch), beforeOpen:()=>courseOverlay.close({restoreFocus:false}), onChange:()=>{renderCourses();renderToday();calendarUI.refresh();}, feedback });
  const courseEditor = coursePanel.querySelector('#desktop-course-editor');
  const courseFormControls = createCourseFormControls({ form: courseEditor, getTable: currentSemester, storage });
  const courseEditorTitle = coursePanel.querySelector('#desktop-course-editor-title');
  const courseDelete = coursePanel.querySelector('#desktop-delete-course');
  const courseObject=document.createElement('button');courseObject.type='button';courseObject.className='secondary';courseObject.id='desktop-course-open-object';courseObject.hidden=true;courseObject.textContent='查看对象全貌';courseEditor.querySelector('.desktop-course-editor-actions').prepend(courseObject);
  let editingCourseId = null, editingOriginalDate = '';
  const openCourseEditor = (course = null, returnFocus = coursePanel.querySelector('#desktop-add-course'), originalDate = '') => {
    if (!courseEditor) return;
    setCourseSettingsOpen(false);
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'false');
    editingCourseId = course?.id || null;
    editingOriginalDate = originalDate || (course?.id && currentSemester().startDate && selectedWeek!=='all' ? calendar.dateForWeek(currentSemester(),Number(selectedWeek),Number(course.weekday)) : '');
    coursePanel.querySelector('#desktop-adjust-course').hidden = !course?.id || !courseOccurs(currentSemester(),course,editingOriginalDate);
    if (courseEditorTitle) courseEditorTitle.textContent = course?.id ? '编辑课程' : '添加课程';
    if (courseDelete) courseDelete.hidden = !course?.id;
    const owner=readObjects(storage).links.find(l=>refKey(l.ref)===refKey({collection:'courseEntry',containerId:currentSemester().id,id:course?.id}));
    courseObject.dataset.openObject=owner?.objectId||'';courseObject.hidden=!enabled('objects')||!visibleRecords(storage,readObjects(storage).objects).some(o=>o.id===owner?.objectId);
    courseFormControls.load(course);
    const fields = courseEditor.elements;
    courseOverlay.show(courseEditor, { labelledBy: 'desktop-course-editor-title', focus: fields.title, returnFocus });
    notice.hidden = true;
  };
  const closeCourseEditor = (restoreFocus = true) => {
    editingCourseId = null; if (courseEditor) courseEditor.hidden = true;
    if (courseOverlay.activePanel === courseEditor) courseOverlay.close({ restoreFocus: Boolean(restoreFocus) });
  };
  coursePanel.querySelector('#desktop-add-course')?.addEventListener('click', () => openCourseEditor());
  coursePanel.querySelector('#desktop-empty-add').addEventListener('click', event => openCourseEditor(null, event.currentTarget));
  coursePanel.querySelector('#desktop-close-editor')?.addEventListener('click', closeCourseEditor);
  coursePanel.querySelector('#desktop-cancel-course').addEventListener('click', closeCourseEditor);
  coursePanel.addEventListener('click', (event) => {
    const day = event.target.closest('[data-open-day]');
    if (day) { selectedDay = Number(day.dataset.openDay); setCourseView('day'); return; }
    const slot = event.target.closest('[data-add-day]');
    if (slot) {
      const start = Number(slot.dataset.addPeriod);
      openCourseEditor({ weekday: Number(slot.dataset.addDay), periodStart: start, periodEnd: start, weekText: selectedWeek === 'all' ? '' : String(selectedWeek) }, slot);
      return;
    }
    const block = event.target.closest('[data-course-id]');
    if (!block || !timetable.contains(block)) return;
    const course = loadCourses().find(item => item.id === block.dataset.courseId);
    if (course) openCourseEditor(course, block, block.dataset.originalDate);
  });
  courseEditor?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const values = courseFormControls.value(), courses = loadCourses(), wasEditing = Boolean(editingCourseId);
      const next = { ...values, id: editingCourseId || `course_${Date.now()}_${Math.random().toString(36).slice(2,7)}` };
      if (!wasEditing) next.createdAt = new Date().toISOString();
      const updated = wasEditing ? courses.map(item => item.id === editingCourseId ? { ...item, ...next } : item) : [...courses, next];
      saveCourses(updated); renderCourses(updated); renderToday(); closeCourseEditor();
      feedback(`已${wasEditing ? '更新' : '添加'}「${values.title}」 · 周${dayNames[values.weekday - 1]}第 ${values.periodStart}–${values.periodEnd} 节。`, 'success');
    } catch (error) { courseFormControls.error(error.message); feedback(error.message, 'error'); }
  });
  coursePanel.querySelector('#desktop-adjust-course').addEventListener('click',()=>{try{courseTools.openAdjustment(editingCourseId,editingOriginalDate);}catch(error){feedback(error.message,'error');}});
  courseDelete?.addEventListener('click', () => {
    if (!editingCourseId) return;
    const course = loadCourses().find(item => item.id === editingCourseId);
    if (course && window.confirm(`删除课程“${course.title}”？`)) {
      const updated = loadCourses().filter(item => item.id !== editingCourseId);
      saveCourses(updated); renderCourses(updated); renderToday(); closeCourseEditor(); feedback(`已删除「${course.title}」。`, 'success');
    }
  });
  const setCourseView = mode => {
    courseViewMode = mode;
    coursePanel.querySelectorAll('[data-course-view]').forEach(item => { const active = item.dataset.courseView === mode; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
    if (courseDayLabel) courseDayLabel.hidden = courseViewMode !== 'day';
    courseDay.value = String(selectedDay);
    renderCourses(); subviewMotion(coursePanel.querySelector('.desktop-timetable-panel'));
    feedback(mode === 'day' ? `已切换到周${dayNames[selectedDay - 1]} · 点击“周视图”返回整周。` : '已返回整周课表。');
  };
  coursePanel.querySelectorAll('[data-course-view]').forEach(button => button.addEventListener('click', () => setCourseView(button.dataset.courseView)));
  courseWeek?.addEventListener('change', () => changeWeek(courseWeek.value === 'all' ? 'all' : Number(courseWeek.value)));
  courseDay?.addEventListener('change', () => { selectedDay = Number(courseDay.value) || 1; setCourseView('day'); });
  if (courseDay) courseDay.value = String(selectedDay);
  const readList = (key) => { try { const value = JSON.parse(storage.getItem(key) || '[]'); return Array.isArray(value) ? visibleRecords(storage,value) : []; } catch { return []; } };
  const defaultSchedule = () => timetableStore.defaultSchedule();
  const loadSemester = () => currentSemester();
  const saveSemester = value => timetableStore.update(value);
  const loadSchedule = () => timetableStore.current().schedule;
  const scheduleEditor = createScheduleEditor({ section: courseSettings.querySelector('#desktop-settings-schedule'), getTable: () => timetableStore.current(), updateTable: patch => timetableStore.update(patch), refreshTimetable: () => {renderCourses();renderToday();}, feedback, defaultSchedule });
  const renderCourseSettings = () => {
    const semester = loadSemester();
    const semesterSelect = courseSettings?.querySelector('#desktop-semester-select');
    if (semesterSelect) { semesterSelect.innerHTML = loadSemesters().map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join(''); semesterSelect.value = semester.id; }
    const form = courseSettings?.querySelector('#desktop-semester-form');
    if (form) { form.elements.name.value = semester.name || ''; form.elements.startDate.value = semester.startDate || ''; form.elements.totalWeeks.value = semester.totalWeeks || 20; }
    scheduleEditor.refresh();
  };
  const renderBatchEditor = () => {
    const list = courseBatch?.querySelector('#desktop-batch-list');
    if (!list) return;
    const courses = loadCourses();
    list.innerHTML = courses.length ? courses.map(course => `<section class="desktop-batch-course" data-course-id="${escapeHtml(course.id)}"><div class="desktop-item-fields">${[['title','课程名称',course.title],['teacher','教师',course.teacher],['location','地点',course.location],['weekday','星期（1–7）',course.weekday],['periodStart','开始节次',course.periodStart],['periodEnd','结束节次',course.periodEnd],['weekText','周次',course.weekText||(course.weeks||[]).join(',')]].map(([key,label,value])=>`<label>${label}<input data-field="${key}" aria-label="${escapeHtml(course.title)}的${label}" value="${escapeHtml(value||'')}" /></label>`).join('')}</div></section>`).join('') : '<p class="empty">还没有课程可以批量编辑。</p>';
    courseBatch.dataset.snapshot=JSON.stringify(courses);
  };
  const renderToday = () => {
    const list = todayPanel.querySelector('#desktop-today-list');
    const count = todayPanel.querySelector('#desktop-today-count');
    const today=calendar.today(), weekday=calendar.weekdayOf(today), semester=currentSemester();
    const time = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
    const state = enabled('courses') ? todayCourseState(semester,today,time) : {entries:[],ongoing:[],next:null};
    const courses = state.entries;
    const tasks = enabled('tasks') ? readList('jiwei-desktop-tasks').map(item => normalizeItem(item, 'task')).filter(task => !isComplete(task, today) && (task.anchor.type === 'floating' || isOnDate(task, today))) : [];
    const plans = enabled('plans') ? readList('jiwei-desktop-plans').map(item => normalizeItem(item, 'plan')).filter(plan => plan.anchor.type === 'floating' ? !isComplete(plan, today) : isOnDate(plan, today)) : [];
    const dateTitle = todayPanel.querySelector('#desktop-today-date');
    if (dateTitle) dateTitle.textContent = `今天 · 周${dayNames[weekday - 1]} · ${today}`;
    if (count) count.textContent = `${courses.filter(c=>c.status==='normal').length} 次课 · ${tasks.length + plans.length} 项事项`;
    if (!list) return;
    const statusHtml = !enabled('courses') ? '' : `<article id="desktop-today-course-state" class="desktop-today-course-state"><strong>${!semester.startDate?'请设置开学日以计算今天的课次':state.ongoing.length?'上课中 · '+escapeHtml(state.ongoing.map(e=>e.title).join('、')):state.next?'下一节 · '+escapeHtml(state.next.title):courses.some(c=>c.status==='normal')?'今天的课程已结束':'今天没有课程'}</strong>${state.ongoing.length?state.ongoing.map(e=>`<small>${escapeHtml(courseTimes(semester,e).start)}–${escapeHtml(courseTimes(semester,e).end)} · ${escapeHtml(e.location||'地点未填')}</small>`).join(''):state.next?`<small>${escapeHtml(courseTimes(semester,state.next).start)}–${escapeHtml(courseTimes(semester,state.next).end)} · ${escapeHtml(state.next.location||'地点未填')}</small>`:''}</article>`;
    const courseHtml = courses.map(course => {const times=courseTimes(semester,course);return `<article class="desktop-list-item ${course.status!=='normal'?'is-course-inactive':''}"><span class="desktop-list-icon">${icon('courses')}</span><div><strong>${escapeHtml(course.title)}${course.status==='cancelled'?' · 本次停课':course.status==='moved'?' · 本次调出':course.isMovedIn?' · 本次调入':''}</strong><small>${times?`${times.start}–${times.end} · `:''}第 ${course.periodStart}–${course.periodEnd} 节 · ${escapeHtml(course.location||'地点未填')} · ${escapeHtml(course.teacher||'教师未填')}</small></div><button class="secondary" type="button" data-today-adjust="${escapeHtml(course.courseId)}" data-original-date="${escapeHtml(course.originalDate)}">调整 / 恢复</button></article>`;}).join('');
    const taskHtml = tasks.map(task => `<article class="desktop-list-item"><span class="desktop-list-icon">${icon('tasks')}</span><div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(describeItem(task))}</small></div><button type="button" class="secondary" data-view="tasks">查看事项</button></article>`).join('');
    const planHtml=plans.map(plan=>`<article class="desktop-list-item"><span class="desktop-list-icon">${icon('plans')}</span><div><strong>${escapeHtml(plan.title)}</strong><small>${escapeHtml(describeItem(plan))}</small></div><button type="button" class="secondary" data-view="plans">查看事项</button></article>`).join('');
    list.innerHTML = statusHtml + courseHtml + taskHtml + planHtml || '<p class="empty">今天没有课程或待处理事项。</p>';
  };
  todayPanel.addEventListener('click',event=>{const button=event.target.closest('[data-today-adjust]');if(!button)return;try{document.querySelector('.nav [data-view="courses"]').click();courseTools.openAdjustment(button.dataset.todayAdjust,button.dataset.originalDate);}catch(error){feedback(error.message,'error');}});
  setInterval(()=>{if(!todayPanel.hidden)renderToday();},30000);
  const appearanceUI = createAppearanceUI({ container: settingsPanel.querySelector('.desktop-settings-panel'), storage, feedback, onChange: () => renderCourses() });
  const readingUI = createReadingUI({container:settingsPanel.querySelector('.desktop-settings-panel'),storage,onChange:()=>{renderCourses();renderToday();calendarUI.refresh();},feedback});
  const syncThemeButtons = () => { appearanceUI.refresh(); readingUI.refresh(); };
  settingsPanel.querySelector('#desktop-data-path').textContent = workspace.info?.root || '请从桌面端启动以使用统一数据文件夹。';
  settingsPanel.querySelector('#desktop-open-data-folder').addEventListener('click', async () => {
    try { const result = await window.jeeWeaveDesktop?.openDataFolder?.(); if (!result?.ok) throw new Error(result?.message || '请从桌面端打开数据目录。'); }
    catch (error) { feedback(error.message, 'error'); }
  });
  let restoreCandidate = null;
  const restorePreview = settingsPanel.querySelector('#desktop-restore-preview');
  const restoreInput = settingsPanel.querySelector('#desktop-data-file');
  settingsPanel.querySelector('#desktop-import-data').addEventListener('click', () => { restoreInput.value = ''; restoreInput.click(); });
  restoreInput.addEventListener('change', async () => {
    restoreCandidate = null; restorePreview.hidden = true;
    try {
      const file = restoreInput.files[0]; if (!file) return;
      if (file.size > 32 * 1024 * 1024) throw new Error('文件超过 32 MiB，请检查是否选择了业务数据备份。');
      restoreCandidate = readWorkspaceBackup(JSON.parse(await file.text()), workspace.snapshot());
      const data = restoreCandidate.data;
      settingsPanel.querySelector('#desktop-restore-summary').textContent = `将恢复 ${data.timetables?.tables.length || 0} 张课表、${data.plans.length} 项计划、${data.tasks.length} 条待办、${data.webCaptures.length} 条网页记录，以及设置与历史扩展数据。`;
      restorePreview.hidden = false;
    } catch (error) { feedback(`无法恢复：${error.message}`, 'error'); }
  });
  settingsPanel.querySelector('#desktop-cancel-restore').addEventListener('click', () => { restoreCandidate = null; restorePreview.hidden = true; });
  settingsPanel.querySelector('#desktop-confirm-restore').addEventListener('click', () => {
    if (!restoreCandidate) return;
    try {
      workspace.restore(restoreCandidate); restoreCandidate = null; restorePreview.hidden = true;
      resetPlanningEditors();
    courseTools.close();
      if (!storage.getItem(dataKeys.tables)) createTimetableStore(storage);
      developerMode = storage.getItem('jiwei-desktop-developer-mode') === 'true'; syncDeveloperMode();
      document.documentElement.dataset.theme = storage.getItem('jiwei-theme') || 'blue'; syncThemeButtons();
      modulePreferences = readModules(storage); syncModules(); modulesUI.refresh();
      chatUI.reset(); chatUI.refresh(); calendarUI.reset();
      afterSemesterChange(); objectUI.hide(); objectUI.render(); renderToday(); renderItems(); renderOverview(); renderWebCollection();
      feedback('业务数据已恢复。教务登录资料未修改。', 'success');
    } catch (error) { feedback(`恢复失败：${error.message}`, 'error'); }
  });
  settingsPanel.querySelector('#desktop-export-data')?.addEventListener('click', async () => {
    if (window.jeeWeaveDesktop?.exportWorkspace) {
      try { const result = await window.jeeWeaveDesktop.exportWorkspace(); if (!result.ok) throw new Error(result.message); feedback(`已导出到 ${result.path}`, 'success'); }
      catch (error) { feedback(`导出失败：${error.message}`, 'error'); }
      return;
    }
    const payload = workspace.snapshot();
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); anchor.download = 'JeeWeave-desktop-data.json'; anchor.click(); URL.revokeObjectURL(anchor.href);
  });
  const renderCapture = (courses, imported, skipped, result) => {
    const resultBox = coursePanel.querySelector('#desktop-course-result');
    const count = coursePanel.querySelector('#desktop-course-count');
    const output = coursePanel.querySelector('#desktop-course-list');
    if (!resultBox || !count || !output) return;
    resultBox.hidden = false;
    const unplaced = result.unplacedCourses || [];
    count.textContent = `识别 ${courses.length} 条 · 新增 ${imported} 条 · 重复 ${skipped} 条${unplaced.length ? ` · 待安排 ${unplaced.length} 项` : ''}`;
    output.innerHTML = courses.map(course => `<div class="desktop-course-row"><strong>${escapeHtml(course.title)}</strong><span>周${course.weekday} · 第 ${course.periodStart}-${course.periodEnd} 节 · ${escapeHtml(course.location || '地点未填')} · ${escapeHtml(course.teacher || '教师未填')} · 周次：${escapeHtml(course.weekText || (course.weeks || []).join('、'))}</span></div>`).join('') + unplaced.map(course => `<div class="desktop-course-row"><strong>${escapeHtml(course.title)}</strong><span>待安排 · 周次：${escapeHtml(course.weekText)} · 原文：${escapeHtml(course.raw)}</span></div>`).join('');
    const original = coursePanel.querySelector('#desktop-original-source');
    const originalFrame = coursePanel.querySelector('#desktop-original-frame');
    if (original && originalFrame) { original.hidden = !result.sourceHtml; originalFrame.srcdoc = result.sourceHtml || ''; }
    const debug = coursePanel.querySelector('#desktop-debug-source');
    const debugText = coursePanel.querySelector('#desktop-debug-text');
    const mode = coursePanel.querySelector('#desktop-crawler-mode');
    if (mode) mode.textContent = result.debug ? '调试模式' : '本地模式';
    if (debug && debugText) { debug.hidden = !(developerMode && result.debug && result.debugText); debug.open = !debug.hidden; debugText.textContent = developerMode && result.debug ? result.debugText || '' : ''; }
  };

  const chatPanel = document.createElement('section'); chatPanel.hidden = true; main.append(chatPanel);
  const chatUI = isModuleAvailable('chat-monitor') ? createChatMonitorUI({ panel: chatPanel, storage, bridge: window.jeeWeaveDesktop, feedback, onChange: () => { renderItems(); renderToday(); renderOverview(); } }) : { refresh() {}, hide() {}, reset() {} };
  const modulesUI = createModulesUI({ panel: pluginsPanel, storage, feedback, onChange: next => { modulePreferences = next; syncModules(); renderItems(); renderToday(); renderOverview(); renderWebCollection(); chatUI.refresh(); calendarUI.refresh(); } });
  const syncModules = () => {
    document.querySelectorAll('[data-view]').forEach(button => { button.hidden = !enabled(button.dataset.view === 'plans' || button.dataset.view === 'tasks' ? 'items' : button.dataset.view) || ['ledger', 'notes', 'ai'].includes(button.dataset.view); });
    coursePanel.querySelector('.desktop-school-import').hidden = !enabled('course-import');
    coursePanel.querySelector('#desktop-school-import-disabled').hidden = enabled('course-import');
    if (!enabled('course-import')) { coursePanel.querySelector('#desktop-course-result').hidden = true; coursePanel.querySelector('#desktop-original-frame').srcdoc = ''; coursePanel.querySelector('#desktop-debug-text').textContent = ''; }
  };
  const pages={overview:overviewPanel,objects:objectPanel,courses:coursePanel,today:todayPanel,plans:plansPanel,calendar:calendarPanel,settings:settingsPanel,plugins:pluginsPanel,'web-capture':webCapture,'chat-monitor':chatPanel};
  for(const [id,page] of Object.entries(pages)) page.dataset.page=id;
  let currentView='overview';
  const scrollPositions=new Map(), playPageMotion=createPageMotion();
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    const id = button.dataset.view === 'tasks' ? 'plans' : button.dataset.view;
    if (!enabled(id === 'plans' ? 'items' : id)) { feedback('该功能已关闭，可在插件管理中重新开启。'); return; }
    if(id===currentView) return;
    scrollPositions.set(currentView,main.scrollTop);
    const order=[...document.querySelectorAll('.nav [data-view]')].map(item=>item.dataset.view);
    const direction=order.indexOf(id)>=order.indexOf(currentView)?1:-1;
    hideBaseViews();
    const target=pages[id] || document.querySelector('#view-detail');
    target.hidden=false; target.classList.remove('hidden');
    if(id==='courses') renderCourses();
    if(id==='today') renderToday();
    if(id==='plans') renderItems();
    if(id==='calendar') calendarUI.refresh();
    if(id==='objects') objectUI.render();
    if(id==='web-capture') renderWebCollection();
    if(id==='overview') renderOverview();
    if(id==='plugins') modulesUI.refresh();
    if(id==='chat-monitor') chatUI.refresh(); else chatUI.hide();
    if (!pages[id]) {
      const title = document.querySelector('#detail-title');
      const copy = document.querySelector('#detail-copy');
      if (title) title.textContent = button.textContent.trim();
      if (copy) copy.textContent = '此功能尚未实现，当前没有可导入的示例。';
    }
    currentView=id; main.dataset.activeView=id;
    main.scrollTop=scrollPositions.get(id) || 0;
    setActive(id);
    playPageMotion(target,direction);
  });
  coursePanel.querySelector('#desktop-manage-timetable').addEventListener('click', () => { renderCourseSettings(); setSettingsPane('semester'); setCourseSettingsOpen(true, true); });

  const settingsTabs = courseSettings.querySelector('[role="tablist"]');
  settingsTabs.addEventListener('click', event => {
    const tab = event.target.closest('[data-settings-tab]');
    if (tab) setSettingsPane(tab.dataset.settingsTab);
  });
  settingsTabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...settingsTabs.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement); if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setSettingsPane(tabs[next].dataset.settingsTab); tabs[next].focus();
  });
  coursePanel.querySelector('#desktop-empty-import').addEventListener('click', () => {
    renderCourseSettings(); setSettingsPane('import'); setCourseSettingsOpen(true);
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'true');
    coursePanel.querySelector('#desktop-open-import').focus();
  });
  coursePanel.querySelector('#desktop-open-course-settings')?.addEventListener('click', () => {
    closeCourseEditor(false);
    const open = courseSettings.hidden;
    if (open) renderCourseSettings();
    setCourseSettingsOpen(open, true);
  });
  coursePanel.querySelector('#desktop-close-course-settings')?.addEventListener('click', () => {
    setCourseSettingsOpen(false);
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'false');
    coursePanel.querySelector('#desktop-open-course-settings').focus();
  });
  courseSettings.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); coursePanel.querySelector('#desktop-close-course-settings').click(); }
  });
  const afterSemesterChange = () => { timetableStore.ensureVisibleSelection(); selectedWeek = thisWeek(); editingCourseId = null; resetCourseSubpanels(); renderCourses(); renderCourseSettings(); };
  coursePanel.querySelector('#desktop-semester-select')?.addEventListener('change', event => {
    timetableStore.select(event.target.value);
    afterSemesterChange(); feedback(`已切换到「${currentSemester().name}」`);
  });
  coursePanel.querySelector('#desktop-new-semester')?.addEventListener('click', () => {
    const form = coursePanel.querySelector('#desktop-new-semester-form'); form.hidden = false;
    form.elements.namedItem('name').value = `课表 ${loadSemesters().length + 1}`;
    form.elements.namedItem('startDate').value = calendar.mondayOf(calendar.today());
    form.elements.namedItem('name').focus();
  });
  const readSemesterForm = form => {
    const name = form.elements.namedItem('name').value.trim();
    const startDate = form.elements.namedItem('startDate').value;
    const totalWeeks = Number(form.elements.namedItem('totalWeeks').value);
    if (!name || !Number.isInteger(totalWeeks) || totalWeeks < 1 || totalWeeks > 30) throw new Error('请填写名称，总周数需为 1–30 的整数。');
    if (startDate && calendar.weekdayOf(startDate) !== 1) throw new Error('开学日请填第 1 周的周一。');
    return { name, startDate, totalWeeks };
  };
  coursePanel.querySelector('#desktop-new-semester-form').addEventListener('submit', event => {
    event.preventDefault();
    try { timetableStore.create(readSemesterForm(event.currentTarget)); afterSemesterChange(); feedback('新课表已创建，作息沿用原课表，课程从空白开始。'); } catch (error) { feedback(error.message); }
  });
  coursePanel.querySelector('#desktop-cancel-new-semester').addEventListener('click', () => { coursePanel.querySelector('#desktop-new-semester-form').hidden = true; });
  coursePanel.querySelector('#desktop-delete-semester')?.addEventListener('click', () => {
    if (loadSemesters().length <= 1) { feedback('请先新建另一张课表，再删除当前课表。'); return; }
    coursePanel.querySelector('#desktop-delete-semester-copy').textContent = `确认删除「${currentSemester().name}」及其中 ${loadCourses().length} 门课程？此操作无法撤销。`;
    coursePanel.querySelector('#desktop-delete-semester-confirm').hidden = false;
  });
  coursePanel.querySelector('#desktop-confirm-delete-semester').addEventListener('click', () => {
    timetableStore.remove(currentSemester().id); afterSemesterChange(); feedback('课表已删除，已切换到剩余课表。');
  });
  coursePanel.querySelector('#desktop-cancel-delete-semester').addEventListener('click', () => { coursePanel.querySelector('#desktop-delete-semester-confirm').hidden = true; });
  const changeWeek = value => {
    selectedWeek = value === 'all' ? 'all' : Math.max(1, Math.min(currentSemester().totalWeeks, Number(value)));
    renderCourses(); subviewMotion(coursePanel.querySelector('.desktop-timetable-panel'));
    feedback(selectedWeek === 'all' ? '正在查看全部周次，单双周课程会同时显示。' : `已切换到第 ${selectedWeek} 周 · ${coursePanel.querySelector('#desktop-week-dates').textContent || '可在课表设置中填写开学日'}。`);
  };
  for (const prefix of ['desktop']) {
    coursePanel.querySelector(`#${prefix}-prev-week`).addEventListener('click', () => changeWeek((selectedWeek === 'all' ? thisWeek() : Number(selectedWeek)) - 1));
    coursePanel.querySelector(`#${prefix}-current-week`).addEventListener('click', () => changeWeek(thisWeek()));
    coursePanel.querySelector(`#${prefix}-next-week`).addEventListener('click', () => changeWeek((selectedWeek === 'all' ? thisWeek() : Number(selectedWeek)) + 1));
  }
  coursePanel.querySelector('#desktop-save-batch')?.addEventListener('click', () => {
    try {
      const table=currentSemester(),courses=loadCourses();
      if(courseBatch.dataset.snapshot!==JSON.stringify(courses))throw Error('课程已变化，请重新打开批量编辑。');
      const rows=[...courseBatch.querySelectorAll('.desktop-batch-course')].map(row=>{const old=courses.find(c=>c.id===row.dataset.courseId);const fields=Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value]));return{id:row.dataset.courseId,fields:{...fields,weeksText:fields.weekText,color:old?.color||''}};});
      const updated=buildCourseBatch(courses,rows,table); saveCourses(updated); renderCourses(); renderToday(); courseOverlay.close(); feedback('已保存全部课程的批量修改。','success');
    } catch(error) { feedback(error.message,'error'); }
  });
  coursePanel.querySelector('#desktop-semester-form')?.addEventListener('submit', event => {
    event.preventDefault();
    try { saveSemester(readSemesterForm(event.currentTarget)); if (selectedWeek !== 'all') selectedWeek = Math.min(selectedWeek, currentSemester().totalWeeks); renderCourses(); renderCourseSettings(); feedback('课表信息已保存。'); } catch (error) { feedback(error.message); }
  });
  coursePanel.querySelector('#desktop-import-csv').addEventListener('click',()=>coursePanel.querySelector('#desktop-csv-file').click());
  coursePanel.querySelector('#desktop-csv-file').addEventListener('change',async event=>{
    const input=event.currentTarget,file=input.files?.[0];if(!file)return;const snapshot=JSON.stringify(currentSemester());
    try {if(file.size>4*1024*1024)throw Error('课程文件超过 4 MiB，请拆分后导入。');const text=await file.text();if(snapshot!==JSON.stringify(currentSemester()))throw Error('读取期间课表已变化，请重新选择文件。');courseTools.previewText(text,file.name);}catch(error){feedback(error.message,'error');}finally{input.value='';}
  });
  const downloadCourseFile=(name,text,type)=>{const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  coursePanel.querySelector('#desktop-export-csv').addEventListener('click',()=>{try{downloadCourseFile('JeeWeave-courses.csv',exportCourseCsv(currentSemester()),'text/csv;charset=utf-8');feedback('已导出课程模板 CSV；单次调停课请使用 ICS 或完整业务备份。','success');}catch(error){feedback(error.message,'error');}});
  coursePanel.querySelector('#desktop-export-ics').addEventListener('click',()=>{try{downloadCourseFile('JeeWeave-courses.ics',exportCourseIcs(currentSemester()),'text/calendar;charset=utf-8');feedback('已导出有效课次 ICS，停课和调出不重复导出。','success');}catch(error){feedback(error.message,'error');}});
  const urlInput = coursePanel.querySelector('#desktop-portal-url');
  const message = coursePanel.querySelector('#desktop-course-message');
  window.jeeWeaveDesktop?.onPortalStatus?.(status => {
    if (!enabled('course-import')) return;
    message.textContent = status.message;
    if (status.phase === 'error' || status.phase === 'slow') feedback(status.message, 'error');
  });
  coursePanel.querySelector('#desktop-open-portal')?.addEventListener('click', async event => {
    if (!enabled('course-import')) { feedback('请先在插件管理中开启教务导入。'); return; }
    const button = event.currentTarget; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '正在打开…';
    try {
      const result = await window.jeeWeaveDesktop?.open(urlInput.value.trim());
      message.textContent = result?.message || '无法打开教务登录页';
    } catch (error) { message.textContent = `打开失败：${error?.message || error}`; }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); button.innerHTML = `${icon('login')}打开 WebVPN 登录`; }
  });
  coursePanel.querySelector('#desktop-capture-course')?.addEventListener('click', async (event) => {
    if (!enabled('course-import')) { feedback('请先在插件管理中开启教务导入。'); return; }
    const button = event.currentTarget; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '抓取中…'; message.textContent = '正在读取当前教务页面…';
    coursePanel.querySelector('#desktop-course-result').hidden = true;
    coursePanel.querySelector('#desktop-original-frame').srcdoc = '';
    coursePanel.querySelector('#desktop-debug-text').textContent = '';
    const targetSemesterId = currentSemester().id;
    try {
      const result = await window.jeeWeaveDesktop?.captureNow?.();
      if (!enabled('course-import')) throw new Error('教务导入已关闭，本次读取未写入。');
      if (currentSemester().id !== targetSemesterId) throw new Error('读取期间已切换课表，请重新抓取。');
      if (!result?.ok || !result.text) {
        if (result?.sourceHtml || (result?.debug && result.debugText)) renderCapture([], 0, 0, result);
        throw new Error(result?.message || '没有读取到课表内容');
      }
      renderCapture([], 0, 0, result);
      const existing = loadCourses();
      const existingUnplaced = currentSemester().unplacedCourses || [];
      const { courses, additions, skipped, unplacedCourses, unplacedAdditions, unplacedSkipped } = prepareCapturedCourses(result, existing, existingUnplaced);
      const schoolSchedule = capturedSchoolSchedule(result, loadSchedule(), defaultSchedule(), Boolean(currentSemester().scheduleBatch));
      if (additions.length || unplacedAdditions.length || schoolSchedule) timetableStore.update({ courses: [...existing, ...additions], unplacedCourses: [...existingUnplaced, ...unplacedAdditions], ...(schoolSchedule ? { schedule: schoolSchedule } : {}) });
      renderCourses(); renderCapture(courses, additions.length, skipped, { ...result, unplacedCourses });
      message.textContent = `已向「${currentSemester().name}」导入 ${additions.length} 门课程${skipped ? `，跳过 ${skipped} 门重复课程` : ''}。`;
      if (unplacedCourses.length) message.textContent += `待安排课程新增 ${unplacedAdditions.length} 项${unplacedSkipped ? `，跳过 ${unplacedSkipped} 项重复记录` : ''}，可在课表下方查看。`;
      if (schoolSchedule) message.textContent += '已按南邮官方时间表校正默认作息。';
      message.textContent += '请核对作息时间与第 1 周周一。';
      const lastWeek = Math.max(...courses.flatMap(course => course.weeks));
      if (lastWeek > currentSemester().totalWeeks) message.textContent += `课程包含第 ${lastWeek} 周，请在课表信息中将总周数设为至少 ${lastWeek} 周。`;
      feedback(message.textContent, 'success');
    } catch (error) { message.textContent = `抓取失败：${error?.message || error}`; feedback(message.textContent, 'error'); }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); button.innerHTML = `${icon('download')}抓取并导入`; }
  });

  const collectSubmit = document.querySelector('#collect-submit');
  const collectUrl = document.querySelector('#collect-url');
  const collectResult = document.querySelector('#collect-result');
  const collectTitle = document.querySelector('#collect-title');
  const collectPath = document.querySelector('#collect-path');
  const collectPreview = document.querySelector('#collect-preview');
  const collectFolder = document.querySelector('#collect-folder');
  let selectedCaptureId;
  const draftEdits=new Map();
  const captures=()=>visibleRecords(storage,readRecords(storage,dataKeys.captures));
  const renderOverview=()=>{
    const pending=captures().flatMap(record=>record.drafts.filter(draft=>draft.status==='pending').map(draft=>({record,draft})));
    overviewPanel.querySelector('#desktop-overview-drafts').innerHTML=pending.length?pending.slice(0,6).map(({record,draft})=>`<article class="desktop-list-item"><div><strong>${escapeHtml(draft.title)}</strong><small>${escapeHtml(record.title)} · ${draft.date?escapeHtml(draft.date):'日期待确认'}</small></div><button type="button" class="secondary" data-open-capture="${escapeHtml(record.id)}">整理</button></article>`).join(''):'<p class="empty">没有待确认的网页行动。可以采集网页，或导入示例体验。</p>';
    const rows=[['课程表',`${loadSemesters().length} 张课表`,'courses'],['事项',`${(enabled('plans')?readList(dataKeys.plans).filter(item=>!item.done).length:0)+(enabled('tasks')?readList(dataKeys.tasks).filter(item=>!item.done).length:0)} 项未完成`,'plans'],['网页采集',`${captures().length} 条记录 · ${pending.length} 项待确认`,'web-capture']];
    overviewPanel.querySelector('#desktop-overview-drafts').closest('.panel').hidden = !enabled('web-capture');
    overviewPanel.querySelector('#desktop-overview-summary').innerHTML=rows.filter(([, , view]) => enabled(view==='plans'?'items':view)).map(([name,count,view])=>`<article class="desktop-list-item"><div><strong>${name}</strong><small>${count}</small></div><button type="button" class="secondary" data-view="${view}">查看</button></article>`).join('') || '<p class="empty">暂未开启工作区功能，可在插件管理中选择。</p>';
  };
  const renderWebCollection=()=>{
    const records=captures();
    let selected=records.find(item=>item.id===selectedCaptureId) || records[0];
    selectedCaptureId=selected?.id;
    webCapture.querySelector('#desktop-web-total').textContent=`${records.length} 条`;
    webCapture.querySelector('#desktop-web-history').innerHTML=records.length?records.map(record=>`<button type="button" class="desktop-web-record" data-select-capture="${escapeHtml(record.id)}" aria-pressed="${record.id===selectedCaptureId}"><strong>${escapeHtml(record.title)}</strong><small>${record.example?'虚构示例 · ':''}${record.drafts.filter(d=>d.status==='pending').length} 项待确认</small></button>`).join(''):'<p class="empty">采集的网页会保留在这里。</p>';
    collectResult.hidden=!selected;
    webCapture.querySelector('#desktop-web-empty').hidden=Boolean(selected);
    if(!selected) return;
    collectTitle.textContent=selected.title;
    let objectButton=webCapture.querySelector('#desktop-capture-open-object');
    if(!objectButton){objectButton=document.createElement('button');objectButton.id='desktop-capture-open-object';objectButton.type='button';objectButton.className='desktop-object-context';collectTitle.parentElement.append(objectButton);}
    const objectState=readObjects(storage),owner=objectState.links.find(l=>refKey(l.ref)===refKey({collection:'capture',id:selected.id})),object=visibleRecords(storage,objectState.objects).find(o=>o.id===owner?.objectId);
    objectButton.hidden=!object||!enabled('objects');objectButton.dataset.openObject=object?.id||'';objectButton.textContent=object?`所属：${object.title} · 查看全貌`:'';
    webCapture.querySelector('#collect-source').textContent=selected.url;
    webCapture.querySelector('#desktop-web-example').hidden=!selected.example;
    webCapture.querySelector('#collect-highlights').innerHTML=selected.highlights.map(text=>`<li>${escapeHtml(text)}</li>`).join('');
    webCapture.querySelector('#collect-drafts').innerHTML=selected.drafts.length?selected.drafts.map(draft=>{
      const fields=draftEdits.get(`${selected.id}/${draft.id}`) || draft;
      return `<form class="desktop-web-draft" data-approve-draft="${escapeHtml(draft.id)}" data-capture="${escapeHtml(selected.id)}"><div class="desktop-draft-fields"><label>待办名称<input name="title" required maxlength="160" value="${escapeHtml(fields.title)}" ${draft.status==='added'?'disabled':''} /></label><label>截止日期<input name="date" type="date" value="${escapeHtml(fields.date)}" ${draft.status==='added'?'disabled':''} /></label><button type="submit" class="secondary" ${draft.status==='added' || !enabled('tasks')?'disabled':''}>${draft.status==='added'?'已加入事项':enabled('tasks')?'确认加入事项':'需先开启事项'}</button></div><blockquote>${escapeHtml(draft.evidence)}</blockquote>${draft.dateInferred?'<p class="desktop-web-hint">原文未写完整日期，已按采集当天推算，请核对。</p>':''}</form>`;
    }).join(''):'<p class="desktop-section-copy">未识别到明确行动。重点与原文已保留，不会自动创建待办。</p>';
    collectPreview.textContent=selected.text;
    collectPath.textContent=selected.directory?`原文保存位置：${selected.directory.startsWith('captures/') && workspace.info?.root ? `${workspace.info.root}/${selected.directory}` : selected.directory}`:'示例保存在本机应用数据中，没有实际访问示例网址。';
    collectFolder.hidden=!selected.directory;
    webCapture.querySelector('#collect-links').innerHTML=(selected.links || []).filter(link=>/^https?:\/\//i.test(link.href)).map(link=>`<p><a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.text)}</a></p>`).join('');
  };
  document.addEventListener('click',event=>{
    const context=event.target.closest('[data-open-object]');
    if(context){try{if(!enabled('objects'))throw Error('对象视图已关闭，可在插件管理中开启。');document.querySelector('.nav [data-view="objects"]').click();objectUI.open(context.dataset.openObject);}catch(error){feedback(error.message,'error');}return;}
    const sample=event.target.closest('[data-load-example]');
    if(sample){
      if (!developerMode) { feedback('请先在设置中开启开发者模式。'); return; }
      try{
        const scope=sample.dataset.loadExample;
        loadWorkbenchExamples(storage,scope,calendar.today());
        if(['all','overview','today','courses'].includes(scope)) {afterSemesterChange();setCourseSettingsOpen(false);}
        if(scope==='web') selectedCaptureId='demo-web-notice';
        syncDeveloperMode();renderToday();renderItems();renderOverview();renderWebCollection();calendarUI.refresh();objectUI.render();
        feedback(`示例已导入。仅补充缺失项，已有修改与完成状态已保留。${['all','overview','today','courses'].includes(scope)?'课表设置可切回原课表。':''}`,'success');
      }catch(error){feedback(`示例导入失败：${error.message}`,'error');}
    }
    const open=event.target.closest('[data-open-capture]');
    if(open){selectedCaptureId=open.dataset.openCapture;webNav.click();renderWebCollection();}
  });
  webCapture.addEventListener('click',event=>{
    const selected=event.target.closest('[data-select-capture]');
    if(selected){selectedCaptureId=selected.dataset.selectCapture;renderWebCollection();subviewMotion(collectResult);}
  });
  webCapture.addEventListener('input',event=>{
    const form=event.target.closest('[data-approve-draft]');
    if(form)draftEdits.set(`${form.dataset.capture}/${form.dataset.approveDraft}`,{title:form.elements.title.value,date:form.elements.date.value});
  });
  webCapture.addEventListener('submit',event=>{
    const form=event.target.closest('[data-approve-draft]');
    if(!form)return;
    event.preventDefault();
    if (!enabled('tasks') || !enabled('web-capture')) { feedback('请先在插件管理中开启网页采集与事项。'); return; }
    try{
      const result=approveWebDraft(storage,form.dataset.capture,form.dataset.approveDraft,{title:form.elements.title.value,date:form.elements.date.value});
      draftEdits.delete(`${form.dataset.capture}/${form.dataset.approveDraft}`);
      renderWebCollection();renderOverview();
      feedback(result.added?'已加入事项，可在“待办”和“今天”页面查看。':'该行动已在待办中，未重复添加。','success');
    }catch(error){feedback(error.message,'error');}
  });
  webCapture.querySelector('#desktop-web-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!enabled('web-capture')) { feedback('请先在插件管理中开启网页采集。'); return; }
    if(collectSubmit.disabled)return;
    collectSubmit.disabled = true; collectSubmit.setAttribute('aria-busy','true'); collectSubmit.textContent = '正在抓取…';
    const status=webCapture.querySelector('#collect-status'); status.textContent='正在读取公开网页并整理重点…';
    try {
      if(!window.jeeWeaveDesktop?.collectPage)throw new Error('请在桌面端使用网页抓取功能。');
      const result = await window.jeeWeaveDesktop.collectPage(collectUrl.value.trim());
      if (!enabled('web-capture')) throw new Error('网页采集已关闭，本次结果未加入工作区。');
      if (!result?.ok) throw new Error(result?.message || '无法抓取网页');
      const record=saveWebCapture(storage,result,calendar.today());
      selectedCaptureId=record.id;renderWebCollection();renderOverview();
      status.textContent=`已整理 ${record.highlights.length} 条重点、${record.drafts.length} 项行动草稿。确认后才会加入待办。`;
      feedback('网页抓取与整理完成。','success');
    } catch (error) {status.textContent=`抓取失败：${error.message}`;feedback(status.textContent,'error');}
    finally { collectSubmit.disabled = false;collectSubmit.removeAttribute('aria-busy'); collectSubmit.innerHTML = `${icon('download')}抓取并整理`; }
  });
  collectFolder.addEventListener('click',async()=>{try{const result=await window.jeeWeaveDesktop?.openCollectorFolder();if(!result?.ok||result.error)throw new Error(result?.error || '无法打开保存目录');}catch(error){feedback(error.message,'error');}});
  syncModules();renderCourses();renderOverview();renderWebCollection();main.dataset.activeView='overview';
})();
