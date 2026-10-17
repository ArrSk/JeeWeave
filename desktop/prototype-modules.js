// Desktop mainline: course capture/import and the independent local workbench.
import * as calendar from '../shared/packages/core/src/semester-calendar.mjs';
import { createTimetableStore } from './timetable-store.mjs';
import { prepareCapturedCourses, parseCourseWeeks } from './course-import.mjs';
import { loadWorkbenchExamples, dataKeys, readRecords, saveWebCapture, approveWebDraft } from './workbench-data.mjs';
import { createPageMotion } from './page-motion.mjs';
(() => {
  const main = document.querySelector('.main');
  const nav = document.querySelector('[data-view="plans"]')?.parentElement;
  const addNav = (id, title, icon) => {
    if (!nav || document.querySelector(`[data-view="${id}"]`)) return;
    const button = document.createElement('button');
    button.dataset.view = id;
    const mark = document.createElement('span'); mark.className = 'nav-icon'; mark.textContent = icon;
    button.append(mark, document.createTextNode(title)); nav.append(button);
  };
  addNav('tasks', '待办', '☑'); addNav('settings', '设置', '⚙');
  addNav('web-capture', '网页采集', '');
  const webNav = document.querySelector('[data-view="web-capture"]');
  document.querySelector('#collect-nav').append(webNav);
  const iconPaths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    login: '<path d="M14 4h5v16h-5M4 12h11m-4-4 4 4-4 4"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    'web-capture': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a20 20 0 0 1 0 18 20 20 0 0 1 0-18"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    today: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    courses: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 3v4m8-4v4M9 10v11m6-11v11"/>',
    plans: '<path d="m12 3 9 9-9 9-9-9Z"/><path d="m8 12 3 3 5-6"/>',
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
    <div class="intro desktop-course-page-head">
      <div><h1 style="font-size:24px">课程表</h1><p id="desktop-course-summary"></p></div>
      <div class="desktop-course-actions"><button id="desktop-add-course" type="button" class="primary">${icon('plus')}添加课程</button><button id="desktop-open-course-settings" type="button" class="secondary" aria-expanded="false" aria-controls="desktop-course-settings">${icon('settings')}课表设置</button></div>
    </div>
    <div id="desktop-course-notice" class="desktop-course-notice" hidden><span class="desktop-notice-dot" aria-hidden="true"></span><p id="desktop-course-feedback" role="status" aria-live="polite" aria-atomic="true"></p><button type="button" id="desktop-dismiss-notice" class="icon-button" aria-label="关闭操作提示">${icon('close')}</button></div>
    <section class="panel desktop-timetable-panel">
      <div class="panel-head"><h2 id="desktop-timetable-title">本周课表</h2><span id="desktop-timetable-count">暂无课程</span></div>
      <div class="desktop-week-toolbar" aria-label="课表周次导航">
        <div class="desktop-week-navigation"><button id="desktop-prev-week" type="button" class="secondary icon-button" aria-label="上一周" title="上一周">${icon('left')}</button>
        <button id="desktop-current-week" type="button" class="desktop-week-title" title="点击回到本周"><strong id="desktop-visible-week"></strong><small id="desktop-week-position"></small></button>
        <button id="desktop-next-week" type="button" class="secondary icon-button" aria-label="下一周" title="下一周">${icon('right')}</button></div>
        <div class="desktop-week-options"><span id="desktop-week-dates"></span><label><span class="sr-only">跳至</span><select id="desktop-quick-week" aria-label="快捷选择周次"></select></label></div>
      </div>
      <div class="desktop-timetable-controls"><div class="desktop-view-switch"><button type="button" class="active" aria-pressed="true" data-course-view="week">周视图</button><button type="button" aria-pressed="false" data-course-view="day">日视图</button></div><label id="desktop-course-day-label" hidden>星期<select id="desktop-course-day">${dayNames.map((day, index) => `<option value="${index + 1}">周${day}</option>`).join('')}</select></label><span class="desktop-timetable-hint">点击星期查看单日 · 点击空白格添加课程</span><button id="desktop-load-demo" type="button" class="secondary">载入示例课表</button></div>
      <div id="desktop-timetable-empty" class="empty"><strong id="desktop-empty-title">从你的第一张课表开始</strong><p id="desktop-empty-copy">从教务系统或 CSV 导入，也可以手动添加课程。</p><button id="desktop-empty-import" type="button" class="primary">${icon('download')}导入课程</button></div>
      <div id="desktop-timetable-scroll" class="desktop-timetable-scroll" hidden>
        <div id="desktop-timetable" class="desktop-timetable"></div>
      </div>
    </section>
    <form id="desktop-course-editor" class="panel desktop-course-editor" hidden>
      <div class="panel-head"><h2 id="desktop-course-editor-title">添加课程</h2><button id="desktop-close-editor" type="button" class="secondary">取消</button></div>
      <div class="desktop-course-form-grid"><label>课程名称<input name="title" required placeholder="例如：高等数学" /></label><label>教师<input name="teacher" placeholder="可选" /></label><label>地点<input name="location" placeholder="可选" /></label><label>星期<select name="weekday">${dayNames.map((day, index) => `<option value="${index + 1}">周${day}</option>`).join('')}</select></label><label>开始节次<input name="periodStart" type="number" min="1" max="20" value="1" required /></label><label>结束节次<input name="periodEnd" type="number" min="1" max="20" value="2" required /></label><label class="wide">周次<input name="weeksText" placeholder="例如 1-16 或 1-16单" /></label></div>
      <div class="desktop-course-editor-actions"><button type="submit" class="primary">保存课程</button><button id="desktop-delete-course" type="button" class="secondary danger-button" hidden>删除课程</button></div>
    </form>
    <section id="desktop-course-settings" class="panel desktop-course-settings" hidden>
      <div class="panel-head"><div><h2>课表设置</h2><p>管理当前课表和课程资料</p></div><button id="desktop-close-course-settings" type="button" class="icon-button" aria-label="收起课表设置" title="收起课表设置">${icon('close')}</button></div>
      <div class="desktop-settings-tabs" role="tablist" aria-label="课表设置分类">
        <button id="desktop-tab-semester" type="button" role="tab" data-settings-tab="semester" aria-selected="true" aria-controls="desktop-settings-semester">课表管理</button>
        <button id="desktop-tab-week" type="button" role="tab" data-settings-tab="week" aria-selected="false" aria-controls="desktop-settings-week" tabindex="-1">周次切换</button>
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
      <section id="desktop-settings-week" class="desktop-settings-pane" role="tabpanel" aria-labelledby="desktop-tab-week" data-settings-pane="week" hidden><h3>查看教学周</h3><p class="desktop-section-copy">选择周次后，课表会显示对应日期及单双周课程。</p><div class="desktop-settings-week"><label>查看周次<select id="desktop-course-week"></select></label><button id="desktop-settings-prev-week" type="button" class="secondary">${icon('left')}上一周</button><button id="desktop-settings-current-week" type="button" class="secondary">回到本周</button><button id="desktop-settings-next-week" type="button" class="secondary">下一周${icon('right')}</button><strong id="desktop-settings-week-label"></strong></div></section>
      <section id="desktop-settings-schedule" class="desktop-settings-pane desktop-period-settings" role="tabpanel" aria-labelledby="desktop-tab-schedule" data-settings-pane="schedule" hidden><div class="desktop-section-head"><div><h3>作息时间</h3><p>独立保存到当前课表</p></div><button id="desktop-reset-schedule" type="button" class="secondary">恢复默认 12 节</button></div><div id="desktop-period-list"></div><div class="desktop-form-actions"><button id="desktop-save-schedule" type="button" class="primary">保存作息时间</button></div></section>
    </section>
    <section id="desktop-course-batch" class="desktop-settings-pane desktop-course-batch" role="tabpanel" aria-labelledby="desktop-open-batch" data-settings-pane="batch" hidden>
      <div class="desktop-section-head"><h3>批量编辑课程</h3></div>
      <p class="desktop-course-settings-note">一次修改多门课程的教师、地点和周次；课程名称与时间仍可点击课程卡片单独编辑。</p>
      <div class="desktop-batch-heading"><span>课程名称</span><span>教师</span><span>地点</span><span>周次</span></div><div id="desktop-batch-list" class="desktop-batch-list"></div>
      <div class="desktop-form-actions"><button id="desktop-save-batch" type="button" class="primary">保存批量修改</button></div>
    </section>
    <section id="desktop-course-import" class="desktop-settings-pane desktop-course-import" role="tabpanel" aria-labelledby="desktop-open-import" data-settings-pane="import" hidden>
      <div class="desktop-section-head"><div><h3>从教务系统导入</h3><p>南邮 WebVPN · 手动登录后读取当前课表</p></div></div>
      <ol class="desktop-import-steps"><li>登录 WebVPN</li><li>进入教务系统，查询课表</li><li>回到几微，抓取并导入</li></ol>
      <div class="course-toolbar"><button id="desktop-open-portal" type="button" class="secondary">${icon('login')}打开 WebVPN 登录</button><button id="desktop-capture-course" type="button" class="primary">${icon('download')}抓取并导入</button></div>
      <details class="desktop-portal-address"><summary>更换教务地址</summary><label>登录入口<input id="desktop-portal-url" value="https://vpn.njupt.edu.cn:8443/http/webvpn85b2e3dcbef5577474e4a553381b9cce/user-login/?service=B60EAE060CDD93DC0476DA6768632F86" aria-label="教务系统网址" placeholder="WebVPN 身份认证或教务系统网址" /></label></details>
      <p id="desktop-course-message" class="desktop-course-message">请在教务窗口完成必要的 VPN 和身份认证登录，再打开个人课表列表视图。</p>
      <div class="desktop-file-transfer"><div><h3>CSV 文件</h3><p>从已有文件导入，或导出当前课表</p></div><div class="desktop-button-row"><button id="desktop-import-csv" type="button" class="secondary">${icon('upload')}导入 CSV</button><button id="desktop-export-csv" type="button" class="secondary">${icon('download')}导出 CSV</button></div><input id="desktop-csv-file" type="file" accept=".csv,text/csv" hidden /></div>
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
  plansPanel.innerHTML = `<div class="intro desktop-page-head"><div><div class="eyebrow">PLANS</div><h1 style="font-size:24px">计划与待办</h1><p>把截止事项、长期目标和重复安排放在一起管理。</p></div></div><section class="panel desktop-entry-panel"><form id="desktop-plan-form" class="desktop-entry-form"><input name="title" required placeholder="添加一个计划，例如：准备英语考试" /><input name="date" type="date" aria-label="计划日期" /><button type="submit" class="primary">添加计划</button></form><div id="desktop-plan-list" class="desktop-list"></div></section>`;
  const tasksPanel = document.createElement('section');
  tasksPanel.className = 'desktop-page-panel';
  tasksPanel.hidden = true;
  tasksPanel.innerHTML = `<div class="intro desktop-page-head"><div><div class="eyebrow">TASKS</div><h1 style="font-size:24px">待办</h1><p>记录要做的事，完成后可以保留痕迹。</p></div></div><section class="panel desktop-entry-panel"><form id="desktop-task-form" class="desktop-entry-form"><input name="title" required placeholder="添加一个待办，例如：提交课程作业" /><input name="date" type="date" aria-label="截止日期（可选）" /><button type="submit" class="primary">添加待办</button></form><div id="desktop-task-list" class="desktop-list"></div></section>`;
  const settingsPanel = document.createElement('section');
  settingsPanel.className = 'desktop-page-panel';
  settingsPanel.hidden = true;
  settingsPanel.innerHTML = `<div class="intro desktop-page-head"><div><div class="eyebrow">SETTINGS</div><h1 style="font-size:24px">设置</h1><p>管理桌面端的外观和本地数据。</p></div></div><section class="panel desktop-settings-panel"><h2>主题颜色</h2><div class="desktop-theme-actions"><button type="button" data-theme="blue">蓝色</button><button type="button" data-theme="violet">紫色</button><button type="button" data-theme="forest">森林绿</button></div><h2>本地数据</h2><p>课程、计划和待办只保存在当前桌面端用户数据中。</p><button id="desktop-export-data" type="button" class="secondary">导出本地数据</button></section>`;
  main.append(todayPanel, plansPanel, tasksPanel, settingsPanel);

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
  for (const [panel,scope] of [[overviewPanel,'overview'],[todayPanel,'today'],[plansPanel,'plans'],[tasksPanel,'tasks'],[webCapture,'web']]) {
    const button=document.createElement('button'); button.type='button'; button.className='secondary'; button.dataset.loadExample=scope;
    button.id=`desktop-demo-${scope}`; button.innerHTML=`${icon('download')}导入示例`; panel.querySelector('.intro').append(button);
  }
  coursePanel.querySelector('#desktop-load-demo').dataset.loadExample='courses';
  const sampleSection=document.createElement('section'); sampleSection.className='desktop-example-settings';
  sampleSection.innerHTML=`<h2>功能示例</h2><p>导入独立示例课表，以及计划、待办和网页整理示例。重复导入只补充缺失项，保留已有内容与完成状态。</p><button type="button" id="desktop-load-all-examples" class="secondary" data-load-example="all">${icon('download')}导入全部示例</button>`;
  settingsPanel.querySelector('.desktop-settings-panel').append(sampleSection);
  const courseImport = coursePanel.querySelector('#desktop-course-import');
  const courseSettings = coursePanel.querySelector('#desktop-course-settings');
  const courseBatch = coursePanel.querySelector('#desktop-course-batch');
  courseSettings.append(courseImport, courseBatch);
  coursePanel.insertBefore(courseSettings, coursePanel.querySelector('.desktop-timetable-panel'));
  coursePanel.insertBefore(coursePanel.querySelector('#desktop-course-editor'), coursePanel.querySelector('.desktop-timetable-panel'));
  const notice = coursePanel.querySelector('#desktop-course-notice');
  main.append(notice);
  let noticeTimer;
  const feedback = (text, tone = 'info') => {
    clearTimeout(noticeTimer);
    notice.hidden = false;
    notice.dataset.tone = tone;
    notice.querySelector('#desktop-course-feedback').textContent = text;
    if (tone !== 'error') noticeTimer = setTimeout(() => { notice.hidden = true; }, 6500);
  };
  notice.querySelector('#desktop-dismiss-notice').addEventListener('click', () => { notice.hidden = true; });
  const resetCourseSubpanels = () => {
    setSettingsPane('semester');
    coursePanel.querySelector('#desktop-course-editor').hidden = true;
    coursePanel.querySelector('#desktop-new-semester-form').hidden = true;
    coursePanel.querySelector('#desktop-delete-semester-confirm').hidden = true;
    coursePanel.querySelector('#desktop-course-result').hidden = true;
    coursePanel.querySelector('#desktop-original-frame').srcdoc = '';
    coursePanel.querySelector('#desktop-debug-text').textContent = '';
  };
  const setSettingsPane = key => {
    courseSettings.querySelectorAll('[data-settings-pane]').forEach(pane => { pane.hidden = pane.dataset.settingsPane !== key; });
    courseSettings.querySelectorAll('[data-settings-tab]').forEach(tab => {
      const selected = tab.dataset.settingsTab === key;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      if (tab.hasAttribute('aria-expanded')) tab.setAttribute('aria-expanded', String(selected));
    });
    if (key === 'batch') renderBatchEditor();
  };
  const setActive = (id) => document.querySelectorAll('.nav button').forEach(item => {
    item.classList.toggle('active', item.dataset.view === id);
    if (item.dataset.view === id) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  const hideBaseViews = () => {
    notice.hidden = true;
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'false');
    document.querySelector('#view-overview')?.classList.add('hidden');
    document.querySelector('#view-detail')?.classList.add('hidden');
    if (webCapture) webCapture.hidden = true;
    coursePanel.hidden = true;
    resetCourseSubpanels();
    if (courseSettings) courseSettings.hidden = true;
    if (courseBatch) courseBatch.hidden = true;
    todayPanel.hidden = true;
    plansPanel.hidden = true;
    tasksPanel.hidden = true;
    settingsPanel.hidden = true;
  };

  const parseWeeks = value => /^(?:每周|全周|全部周次)?$/.test(String(value || '').trim()) ? [] : parseCourseWeeks(value);
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const coursePalettes = [
    { bg: '#e3f6e5', text: '#3d9c4e' },
    { bg: '#e0edff', text: '#4a7de0' },
    { bg: '#fdf6d8', text: '#b8971f' },
    { bg: '#fde3e3', text: '#e05a5a' },
    { bg: '#f1e4fb', text: '#9b59d0' },
    { bg: '#fdeadb', text: '#e08a3c' },
    { bg: '#dcf3f6', text: '#3aa6b5' },
  ];
  const courseColorSeed = [[/高数|高等数学|数学|线性代数/, 1], [/英语|外语/, 3], [/物理/, 6], [/化学/, 0], [/思想|政治|马克思|毛概|近代史|军事/, 2], [/体育|篮球|足球/, 5], [/计算机|程序|数据结构|算法|软件/, 4], [/电路|电子|信号/, 1], [/实验/, 0]];
  const coursePalette = (course) => {
    const explicit = ['green', 'blue', 'yellow', 'red', 'purple', 'orange', 'cyan'].indexOf(course.color);
    if (explicit >= 0) return coursePalettes[explicit];
    const title = String(course.title || '');
    const seeded = courseColorSeed.find(([pattern]) => pattern.test(title));
    if (seeded) return coursePalettes[seeded[1]];
    let hash = 0;
    for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) % 1000003;
    return coursePalettes[hash % coursePalettes.length];
  };
  const timetableStore = createTimetableStore(localStorage);
  const loadSemesters = () => timetableStore.list();
  const currentSemester = () => timetableStore.current();
  const loadCourses = () => timetableStore.current().courses;
  const saveCourses = courses => timetableStore.update({ courses });
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
    for (const select of [courseWeek, coursePanel.querySelector('#desktop-quick-week')]) {
      select.innerHTML = options; select.value = String(selectedWeek);
    }
    const actual = semester.startDate ? calendar.currentWeek(semester, calendar.today()) : null;
    const inTerm = actual !== null && actual >= 1 && actual <= semester.totalWeeks;
    coursePanel.querySelector('#desktop-visible-week').textContent = all ? '全部周次' : `第 ${selectedWeek} 周`;
    coursePanel.querySelector('#desktop-week-position').textContent = !semester.startDate ? '未设开学日 · 点击回第 1 周' : !inTerm ? `${actual < 1 ? '尚未开学' : '学期已结束'} · 点击回${actual < 1 ? '首' : '末'}周` : !all && Number(selectedWeek) === actual ? '本周' : `非本周 · 点击回第 ${actual} 周`;
    coursePanel.querySelector('#desktop-week-dates').textContent = semester.startDate && !all ? `${calendar.dateForWeek(semester, Number(selectedWeek), 1)} — ${calendar.dateForWeek(semester, Number(selectedWeek), 7)}` : '';
    for (const id of ['desktop-prev-week', 'desktop-settings-prev-week']) coursePanel.querySelector(`#${id}`).disabled = !all && Number(selectedWeek) <= 1;
    for (const id of ['desktop-next-week', 'desktop-settings-next-week']) coursePanel.querySelector(`#${id}`).disabled = !all && Number(selectedWeek) >= semester.totalWeeks;
    coursePanel.querySelector('#desktop-settings-week-label').textContent = all ? '全部周次' : `第 ${selectedWeek} 周 / 共 ${semester.totalWeeks} 周`;
  };
  const renderTimetable = (courses = []) => {
    if (!timetable || !timetableScroll || !timetableEmpty) return;
    const weekCourses = selectedWeek === 'all'
      ? courses
      : courses.filter(course => !(course.weeks || []).length || course.weeks.includes(Number(selectedWeek)));
    const filteredCourses = courseViewMode === 'day' ? weekCourses.filter(course => Number(course.weekday) === selectedDay) : weekCourses;
    const visibleDays = courseViewMode === 'day' ? [selectedDay] : [1, 2, 3, 4, 5, 6, 7];
    if (!filteredCourses.length) {
      timetableEmpty.hidden = false;
      coursePanel.querySelector('#desktop-empty-title').textContent = courses.length ? (courseViewMode === 'day' ? `周${dayNames[selectedDay - 1]}没有课程` : '这一周没有课程') : '从你的第一张课表开始';
      coursePanel.querySelector('#desktop-empty-copy').textContent = courses.length ? '可以切换其他周次，或点击空白格添加课程。' : '从教务系统或 CSV 导入，也可以手动添加课程。';
      coursePanel.querySelector('#desktop-empty-import').hidden = courses.length > 0;
    }
    const schedule = loadSchedule();
    const maxPeriod = Math.max(schedule.length, ...filteredCourses.map(course => Number(course.periodEnd) || Number(course.periodStart) || 1));
    const periodHeight = 64;
    const semester = currentSemester();
    const headers = visibleDays.map(day => {
      const fullDate = semester.startDate && selectedWeek !== 'all' ? calendar.dateForWeek(semester, Number(selectedWeek), day) : '';
      const isToday = fullDate === calendar.today();
      return `<button type="button" class="desktop-timetable-day${isToday ? ' is-today' : ''}" data-open-day="${day}" title="查看周${dayNames[day - 1]}的课程">周${dayNames[day - 1]}${isToday ? ' · 今天' : ''}<small>${fullDate.slice(5).replace('-', '/')}</small></button>`;
    }).join('');
    const labels = Array.from({ length: maxPeriod }, (_, index) => { const period = schedule.find(item => item.index === index + 1); return `<div class="desktop-timetable-period"><span>${index + 1}</span>${period ? `<small>${period.start}<br>${period.end}</small>` : ''}</div>`; }).join('');
    const columns = visibleDays.map(day => {
      const dayCourses = filteredCourses.filter(course => Number(course.weekday) === day);
      const slots = Array.from({ length: maxPeriod }, (_, index) => `<button type="button" class="desktop-timetable-slot" data-add-day="${day}" data-add-period="${index + 1}" aria-label="周${dayNames[day - 1]}第 ${index + 1} 节添加课程" title="点击添加课程"><span>添加课程</span></button>`).join('');
      const blocks = dayCourses.map(course => {
        const start = Math.max(1, Number(course.periodStart) || 1);
        const end = Math.max(start, Number(course.periodEnd) || start);
        const height = Math.max(1, end - start + 1) * periodHeight - 8;
        const top = (start - 1) * periodHeight + 4;
        const meta = `第 ${start}-${end} 节 · ${course.weekText || (course.weeks || []).join('、') || '周次未填'}`;
        const palette = coursePalette(course);
        return `<button type="button" class="desktop-timetable-course" data-course-id="${escapeHtml(course.id)}" title="${escapeHtml(`${course.title} · ${meta} · 点击编辑`)}" style="top:${top}px;height:${height}px;background:${palette.bg};color:${palette.text};border-color:${palette.text}"><strong>${escapeHtml(course.title)}</strong><span>${escapeHtml(course.location || '地点未填')}</span><small>${escapeHtml(course.teacher || '教师未填')} · ${escapeHtml(meta)}</small></button>`;
      }).join('');
      return `<div class="desktop-timetable-column">${slots}${blocks}</div>`;
    }).join('');
    timetable.innerHTML = `<div class="desktop-timetable-header" style="grid-template-columns:48px repeat(${visibleDays.length},minmax(100px,1fr))"><div>节次</div>${headers}</div><div class="desktop-timetable-body"><div class="desktop-timetable-periods">${labels}</div><div class="desktop-timetable-columns" style="--period-count:${maxPeriod};grid-template-columns:repeat(${visibleDays.length},minmax(100px,1fr))">${columns}</div></div>`;
    timetableScroll.hidden = false;
    timetableEmpty.hidden = filteredCourses.length > 0;
    if (timetableCount) timetableCount.textContent = `${filteredCourses.length} 门课程${filteredCourses.length !== courses.length ? ` · 共 ${courses.length} 门` : ''}`;
  };
  const renderCourses = (courses = loadCourses()) => {
    renderWeekControls();
    const semester = currentSemester();
    coursePanel.querySelector('#desktop-course-summary').textContent = `${semester.name} · 共 ${semester.totalWeeks} 周${semester.startDate ? ` · ${semester.startDate} 开学` : ' · 尚未设置开学日'}`;
    coursePanel.querySelector('#desktop-timetable-title').textContent = selectedWeek === 'all' ? `${semester.name} · 全部周次` : `${semester.name} · 第 ${selectedWeek} 周`;
    renderTimetable(courses);
  };
  const courseEditor = coursePanel.querySelector('#desktop-course-editor');
  const courseEditorTitle = coursePanel.querySelector('#desktop-course-editor-title');
  const courseDelete = coursePanel.querySelector('#desktop-delete-course');
  let editingCourseId = null;
  const openCourseEditor = (course = null) => {
    if (!courseEditor) return;
    courseSettings.hidden = true;
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'false');
    editingCourseId = course?.id || null;
    courseEditor.hidden = false;
    if (courseEditorTitle) courseEditorTitle.textContent = course?.id ? '编辑课程' : '添加课程';
    if (courseDelete) courseDelete.hidden = !course?.id;
    const fields = courseEditor.elements;
    fields.title.value = course?.title || '';
    fields.teacher.value = course?.teacher || '';
    fields.location.value = course?.location || '';
    fields.weekday.value = String(course?.weekday || 1);
    fields.periodStart.value = String(course?.periodStart || 1);
    fields.periodEnd.value = String(course?.periodEnd || course?.periodStart || 2);
    fields.weeksText.value = course?.weekText || (course?.weeks || []).join(',');
    fields.title.focus();
    feedback(course?.id ? `正在编辑「${course.title}」，保存后更新当前课表。` : `正在添加课程 · 周${dayNames[Number(fields.weekday.value) - 1]} · 第 ${fields.periodStart.value}–${fields.periodEnd.value} 节。`);
  };
  const closeCourseEditor = (restoreFocus = true) => {
    const wasOpen = courseEditor && !courseEditor.hidden;
    editingCourseId = null; if (courseEditor) courseEditor.hidden = true;
    if (wasOpen && restoreFocus) coursePanel.querySelector('#desktop-add-course').focus();
  };
  coursePanel.querySelector('#desktop-add-course')?.addEventListener('click', () => openCourseEditor());
  coursePanel.querySelector('#desktop-close-editor')?.addEventListener('click', closeCourseEditor);
  coursePanel.addEventListener('click', (event) => {
    const day = event.target.closest('[data-open-day]');
    if (day) { selectedDay = Number(day.dataset.openDay); setCourseView('day'); return; }
    const slot = event.target.closest('[data-add-day]');
    if (slot) {
      const start = Number(slot.dataset.addPeriod);
      openCourseEditor({ weekday: Number(slot.dataset.addDay), periodStart: start, periodEnd: start, weekText: selectedWeek === 'all' ? '' : String(selectedWeek) });
      return;
    }
    const block = event.target.closest('[data-course-id]');
    if (!block || !timetable.contains(block)) return;
    const course = loadCourses().find(item => item.id === block.dataset.courseId);
    if (course) openCourseEditor(course);
  });
  courseEditor?.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = courseEditor.elements;
    const title = String(fields.title.value || '').trim();
    const periodStart = Number(fields.periodStart.value);
    const periodEnd = Number(fields.periodEnd.value);
    if (!title || !Number.isInteger(periodStart) || !Number.isInteger(periodEnd) || periodEnd < periodStart) {
      fields.title.setCustomValidity(title ? '结束节次必须不小于开始节次' : '请填写课程名称');
      fields.title.reportValidity();
      fields.title.setCustomValidity('');
      return;
    }
    const weeksText = String(fields.weeksText.value || '').trim();
    const next = {
      id: editingCourseId || `course_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      teacher: String(fields.teacher.value || '').trim(),
      location: String(fields.location.value || '').trim(),
      weekday: Number(fields.weekday.value),
      periodStart,
      periodEnd,
      weeks: parseWeeks(weeksText),
      weekText: weeksText || '每周',
    };
    const courses = loadCourses();
    const wasEditing = Boolean(editingCourseId);
    const updated = editingCourseId ? courses.map(item => item.id === editingCourseId ? { ...item, ...next } : item) : [...courses, next];
    saveCourses(updated);
    renderCourses(updated);
    closeCourseEditor();
    feedback(`已${wasEditing ? '更新' : '添加'}「${title}」 · 周${dayNames[next.weekday - 1]}第 ${periodStart}–${periodEnd} 节。`, 'success');
  });
  courseDelete?.addEventListener('click', () => {
    if (!editingCourseId) return;
    const course = loadCourses().find(item => item.id === editingCourseId);
    if (course && window.confirm(`删除课程“${course.title}”？`)) {
      const updated = loadCourses().filter(item => item.id !== editingCourseId);
      saveCourses(updated); renderCourses(updated); closeCourseEditor(); feedback(`已删除「${course.title}」。`, 'success');
    }
  });
  const setCourseView = mode => {
    courseViewMode = mode;
    coursePanel.querySelectorAll('[data-course-view]').forEach(item => { const active = item.dataset.courseView === mode; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
    if (courseDayLabel) courseDayLabel.hidden = courseViewMode !== 'day';
    courseDay.value = String(selectedDay);
    renderCourses();
    feedback(mode === 'day' ? `已切换到周${dayNames[selectedDay - 1]} · 点击“周视图”返回整周。` : '已返回整周课表。');
  };
  coursePanel.querySelectorAll('[data-course-view]').forEach(button => button.addEventListener('click', () => setCourseView(button.dataset.courseView)));
  courseWeek?.addEventListener('change', () => changeWeek(courseWeek.value === 'all' ? 'all' : Number(courseWeek.value)));
  coursePanel.querySelector('#desktop-quick-week').addEventListener('change', event => changeWeek(event.target.value === 'all' ? 'all' : Number(event.target.value)));
  courseDay?.addEventListener('change', () => { selectedDay = Number(courseDay.value) || 1; setCourseView('day'); });
  if (courseDay) courseDay.value = String(selectedDay);
  const readList = (key) => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const writeList = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const defaultSchedule = () => timetableStore.defaultSchedule();
  const loadSemester = () => currentSemester();
  const saveSemester = value => timetableStore.update(value);
  const loadSchedule = () => timetableStore.current().schedule;
  const saveSchedule = schedule => timetableStore.update({ schedule });
  const renderCourseSettings = () => {
    const semester = loadSemester();
    const semesterSelect = courseSettings?.querySelector('#desktop-semester-select');
    if (semesterSelect) { semesterSelect.innerHTML = loadSemesters().map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join(''); semesterSelect.value = semester.id; }
    const form = courseSettings?.querySelector('#desktop-semester-form');
    if (form) { form.elements.name.value = semester.name || ''; form.elements.startDate.value = semester.startDate || ''; form.elements.totalWeeks.value = semester.totalWeeks || 20; }
    const weekLabel = courseSettings?.querySelector('#desktop-settings-week-label');
    if (weekLabel) weekLabel.textContent = selectedWeek === 'all' ? '全部周次' : `第 ${selectedWeek} 周 / 共 ${semester.totalWeeks || 20} 周`;
    courseSettings.querySelector('#desktop-settings-prev-week').disabled = selectedWeek !== 'all' && Number(selectedWeek) <= 1;
    courseSettings.querySelector('#desktop-settings-next-week').disabled = selectedWeek !== 'all' && Number(selectedWeek) >= semester.totalWeeks;
    const list = courseSettings?.querySelector('#desktop-period-list');
    if (list) list.innerHTML = loadSchedule().map(period => `<label><span>第 ${period.index} 节</span><input data-period-index="${period.index}" data-period-part="start" aria-label="第 ${period.index} 节开始时间" type="time" value="${escapeHtml(period.start)}" /><input data-period-index="${period.index}" data-period-part="end" aria-label="第 ${period.index} 节结束时间" type="time" value="${escapeHtml(period.end)}" /></label>`).join('');
  };
  const renderBatchEditor = () => {
    const list = courseBatch?.querySelector('#desktop-batch-list');
    if (!list) return;
    const courses = loadCourses();
    list.innerHTML = courses.length ? courses.map(course => `<div class="desktop-batch-row" data-course-id="${escapeHtml(course.id)}"><strong>${escapeHtml(course.title)}</strong><input data-field="teacher" aria-label="${escapeHtml(course.title)}的教师" value="${escapeHtml(course.teacher || '')}" placeholder="教师" /><input data-field="location" aria-label="${escapeHtml(course.title)}的地点" value="${escapeHtml(course.location || '')}" placeholder="地点" /><input data-field="weekText" aria-label="${escapeHtml(course.title)}的周次" value="${escapeHtml(course.weekText || '')}" placeholder="周次" /></div>`).join('') : '<p class="empty">还没有课程可以批量编辑。</p>';
  };
  const renderToday = () => {
    const list = todayPanel.querySelector('#desktop-today-list');
    const count = todayPanel.querySelector('#desktop-today-count');
    const today=calendar.today(), weekday=calendar.weekdayOf(today), semester=currentSemester();
    const week=semester.startDate?calendar.currentWeek(semester,today):1;
    const courses = loadCourses().filter(course => Number(course.weekday) === weekday && week>=1 && week<=semester.totalWeeks && (!(course.weeks || []).length || course.weeks.includes(week)));
    const tasks = readList('jiwei-desktop-tasks').filter(task => !task.done && (!task.date || task.date<=today));
    const plans = readList('jiwei-desktop-plans').filter(plan=>!plan.done && plan.date===today);
    const dateTitle = todayPanel.querySelector('#desktop-today-date');
    if (dateTitle) dateTitle.textContent = `今天 · 周${dayNames[weekday - 1]} · ${today}`;
    if (count) count.textContent = `${courses.length} 门课 · ${tasks.length} 条待办 · ${plans.length} 项计划`;
    if (!list) return;
    const courseHtml = courses.sort((a, b) => (Number(a.periodStart) || 0) - (Number(b.periodStart) || 0)).map(course => `<article class="desktop-list-item"><span class="desktop-list-icon">${icon('courses')}</span><div><strong>${escapeHtml(course.title)}</strong><small>第 ${course.periodStart}-${course.periodEnd} 节 · ${escapeHtml(course.location || '地点未填')} · ${escapeHtml(course.teacher || '教师未填')}</small></div></article>`).join('');
    const taskHtml = tasks.map(task => `<article class="desktop-list-item"><span class="desktop-list-icon">${icon('tasks')}</span><div><strong>${escapeHtml(task.title)}</strong><small>${task.date ? `截止 ${escapeHtml(task.date)}` : '长期待办'}</small></div></article>`).join('');
    const planHtml=plans.map(plan=>`<article class="desktop-list-item"><span class="desktop-list-icon">${icon('plans')}</span><div><strong>${escapeHtml(plan.title)}</strong><small>今日计划</small></div><button type="button" class="secondary" data-view="plans">查看计划</button></article>`).join('');
    list.innerHTML = courseHtml + taskHtml + planHtml || '<p class="empty">今天没有课程或待处理事项，可以导入示例体验。</p>';
  };
  const renderPlans = () => {
    const list = plansPanel.querySelector('#desktop-plan-list');
    if (!list) return;
    const plans = readList('jiwei-desktop-plans');
    list.innerHTML = plans.length ? plans.map(plan => `<article class="desktop-list-item ${plan.done ? 'is-done' : ''}"><button type="button" class="desktop-check" data-plan-toggle="${escapeHtml(plan.id)}">${plan.done ? '✓' : ''}</button><div><strong>${escapeHtml(plan.title)}</strong><small>${plan.date ? `日期：${escapeHtml(plan.date)}` : '长期计划'}</small></div><button type="button" class="desktop-inline-delete" data-plan-delete="${escapeHtml(plan.id)}">删除</button></article>`).join('') : '<p class="empty">还没有计划。</p>';
  };
  const renderTasks = () => {
    const list = tasksPanel.querySelector('#desktop-task-list');
    if (!list) return;
    const tasks = readList('jiwei-desktop-tasks');
    const active = tasks.filter(task => !task.done);
    const done = tasks.filter(task => task.done);
    const group = (title, items) => items.length ? `<h3 class="desktop-list-heading">${title} · ${items.length}</h3>${items.map(task => `<article class="desktop-list-item ${task.done ? 'is-done' : ''}"><button type="button" class="desktop-check" data-task-toggle="${escapeHtml(task.id)}">${task.done ? '✓' : ''}</button><div><strong>${escapeHtml(task.title)}</strong><small>${task.date ? `截止 ${escapeHtml(task.date)}` : '无截止日期'}</small></div><button type="button" class="desktop-inline-delete" data-task-delete="${escapeHtml(task.id)}">删除</button></article>`).join('')}` : '';
    list.innerHTML = group('未完成', active) + group('已完成', done) || '<p class="empty">还没有待办。</p>';
  };
  plansPanel.querySelector('#desktop-plan-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(form.elements.title.value || '').trim();
    if (!title) return;
    writeList('jiwei-desktop-plans', [...readList('jiwei-desktop-plans'), { id: `plan_${Date.now()}`, title, date: form.elements.date.value || '', done: false }]);
    form.reset(); renderPlans();
  });
  plansPanel.addEventListener('click', event => {
    const toggle = event.target.closest('[data-plan-toggle]');
    const remove = event.target.closest('[data-plan-delete]');
    if (toggle) { writeList('jiwei-desktop-plans', readList('jiwei-desktop-plans').map(item => item.id === toggle.dataset.planToggle ? { ...item, done: !item.done } : item)); renderPlans(); }
    if (remove) { writeList('jiwei-desktop-plans', readList('jiwei-desktop-plans').filter(item => item.id !== remove.dataset.planDelete)); renderPlans(); }
  });
  tasksPanel.querySelector('#desktop-task-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(form.elements.title.value || '').trim();
    if (!title) return;
    writeList('jiwei-desktop-tasks', [...readList('jiwei-desktop-tasks'), { id: `task_${Date.now()}`, title, date: form.elements.date.value || '', done: false }]);
    form.reset(); renderTasks();
  });
  tasksPanel.addEventListener('click', event => {
    const toggle = event.target.closest('[data-task-toggle]');
    const remove = event.target.closest('[data-task-delete]');
    if (toggle) { writeList('jiwei-desktop-tasks', readList('jiwei-desktop-tasks').map(item => item.id === toggle.dataset.taskToggle ? { ...item, done: !item.done } : item)); renderTasks(); }
    if (remove) { writeList('jiwei-desktop-tasks', readList('jiwei-desktop-tasks').filter(item => item.id !== remove.dataset.taskDelete)); renderTasks(); }
  });
  const syncThemeButtons = () => document.querySelectorAll('button[data-theme]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.theme === document.documentElement.dataset.theme));
  });
  document.querySelectorAll('button[data-theme]').forEach(button => button.addEventListener('click', () => {
    document.documentElement.dataset.theme = button.dataset.theme;
    localStorage.setItem('jiwei-theme', button.dataset.theme); syncThemeButtons();
  }));
  syncThemeButtons();
  settingsPanel.querySelector('#desktop-export-data')?.addEventListener('click', () => {
    const payload = { exportedAt: new Date().toISOString(), timetables: timetableStore.snapshot(), courses: loadCourses(), plans: readList('jiwei-desktop-plans'), tasks: readList('jiwei-desktop-tasks'), webCaptures:readRecords(localStorage,dataKeys.captures) };
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); anchor.download = 'jiwei-desktop-data.json'; anchor.click(); URL.revokeObjectURL(anchor.href);
  });
  const renderCapture = (courses, imported, skipped, result) => {
    const resultBox = coursePanel.querySelector('#desktop-course-result');
    const count = coursePanel.querySelector('#desktop-course-count');
    const output = coursePanel.querySelector('#desktop-course-list');
    if (!resultBox || !count || !output) return;
    resultBox.hidden = false;
    count.textContent = `识别 ${courses.length} 条 · 新增 ${imported} 条 · 重复 ${skipped} 条`;
    output.innerHTML = courses.map(course => `<div class="desktop-course-row"><strong>${escapeHtml(course.title)}</strong><span>周${course.weekday} · 第 ${course.periodStart}-${course.periodEnd} 节 · ${escapeHtml(course.location || '地点未填')} · ${escapeHtml(course.teacher || '教师未填')} · 周次：${escapeHtml(course.weekText || (course.weeks || []).join('、'))}</span></div>`).join('');
    const original = coursePanel.querySelector('#desktop-original-source');
    const originalFrame = coursePanel.querySelector('#desktop-original-frame');
    if (original && originalFrame) { original.hidden = !result.sourceHtml; originalFrame.srcdoc = result.sourceHtml || ''; }
    const debug = coursePanel.querySelector('#desktop-debug-source');
    const debugText = coursePanel.querySelector('#desktop-debug-text');
    const mode = coursePanel.querySelector('#desktop-crawler-mode');
    if (mode) mode.textContent = result.debug ? '调试模式' : '本地模式';
    if (debug && debugText) { debug.hidden = !(result.debug && result.debugText); debug.open = !debug.hidden; debugText.textContent = result.debug ? result.debugText || '' : ''; }
  };

  const pages={overview:overviewPanel,courses:coursePanel,today:todayPanel,plans:plansPanel,tasks:tasksPanel,settings:settingsPanel,'web-capture':webCapture};
  for(const [id,page] of Object.entries(pages)) page.dataset.page=id;
  let currentView='overview';
  const scrollPositions=new Map(), playPageMotion=createPageMotion();
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    const id = button.dataset.view;
    if(id===currentView) return;
    scrollPositions.set(currentView,main.scrollTop);
    const order=[...document.querySelectorAll('.nav [data-view]')].map(item=>item.dataset.view);
    const direction=order.indexOf(id)>=order.indexOf(currentView)?1:-1;
    hideBaseViews();
    const target=pages[id] || document.querySelector('#view-detail');
    target.hidden=false; target.classList.remove('hidden');
    if(id==='courses') renderCourses();
    if(id==='today') renderToday();
    if(id==='plans') renderPlans();
    if(id==='tasks') renderTasks();
    if(id==='web-capture') renderWebCollection();
    if(id==='overview') renderOverview();
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
    courseSettings.hidden = false; renderCourseSettings(); setSettingsPane('import');
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'true');
    coursePanel.querySelector('#desktop-open-import').focus();
  });
  coursePanel.querySelector('#desktop-open-course-settings')?.addEventListener('click', () => {
    closeCourseEditor(false);
    courseSettings.hidden = !courseSettings.hidden;
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', String(!courseSettings.hidden));
    if (!courseSettings.hidden) { renderCourseSettings(); courseSettings.querySelector('[role="tab"][aria-selected="true"]').focus(); }
  });
  coursePanel.querySelector('#desktop-close-course-settings')?.addEventListener('click', () => {
    if (courseSettings) courseSettings.hidden = true;
    coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded', 'false');
    coursePanel.querySelector('#desktop-open-course-settings').focus();
  });
  courseSettings.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); coursePanel.querySelector('#desktop-close-course-settings').click(); }
  });
  const afterSemesterChange = () => { selectedWeek = thisWeek(); editingCourseId = null; resetCourseSubpanels(); renderCourses(); renderCourseSettings(); };
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
    renderCourses();
    feedback(selectedWeek === 'all' ? '正在查看全部周次，单双周课程会同时显示。' : `已切换到第 ${selectedWeek} 周 · ${coursePanel.querySelector('#desktop-week-dates').textContent || '可在课表设置中填写开学日'}。`);
  };
  for (const prefix of ['desktop', 'desktop-settings']) {
    coursePanel.querySelector(`#${prefix}-prev-week`).addEventListener('click', () => changeWeek((selectedWeek === 'all' ? thisWeek() : Number(selectedWeek)) - 1));
    coursePanel.querySelector(`#${prefix}-current-week`).addEventListener('click', () => changeWeek(thisWeek()));
    coursePanel.querySelector(`#${prefix}-next-week`).addEventListener('click', () => changeWeek((selectedWeek === 'all' ? thisWeek() : Number(selectedWeek)) + 1));
  }
  coursePanel.querySelector('#desktop-save-batch')?.addEventListener('click', () => {
    const courses = loadCourses();
    const updated = courses.map(course => {
      const row = courseBatch?.querySelector(`[data-course-id="${CSS.escape(course.id)}"]`);
      if (!row) return course;
      const field = name => row.querySelector(`[data-field="${name}"]`)?.value?.trim() || '';
      const weekText = field('weekText');
      return { ...course, teacher: field('teacher'), location: field('location'), weekText: weekText || '每周', weeks: parseWeeks(weekText) };
    });
    saveCourses(updated); renderCourses(updated); if (courseBatch) courseBatch.hidden = true;
    coursePanel.querySelector('#desktop-open-batch').setAttribute('aria-expanded', 'false');
    feedback(`已保存 ${updated.length} 门课程的批量修改。`, 'success');
  });
  coursePanel.querySelector('#desktop-semester-form')?.addEventListener('submit', event => {
    event.preventDefault();
    try { saveSemester(readSemesterForm(event.currentTarget)); if (selectedWeek !== 'all') selectedWeek = Math.min(selectedWeek, currentSemester().totalWeeks); renderCourses(); renderCourseSettings(); feedback('课表信息已保存。'); } catch (error) { feedback(error.message); }
  });
  coursePanel.querySelector('#desktop-reset-schedule')?.addEventListener('click', () => { saveSchedule(defaultSchedule()); renderCourseSettings(); renderCourses(); feedback('当前课表已恢复默认作息。'); });
  coursePanel.querySelector('#desktop-save-schedule')?.addEventListener('click', () => {
    const periods = [...coursePanel.querySelectorAll('#desktop-period-list [data-period-index]')].reduce((result, input) => {
      const index = Number(input.dataset.periodIndex); const current = result.find(item => item.index === index) || { index, start: '', end: '' }; current[input.dataset.periodPart] = input.value; if (!result.includes(current)) result.push(current); return result;
    }, []);
    if (periods.some(item => !item.start || !item.end || item.end <= item.start)) { feedback('每节课的结束时间必须晚于开始时间，尚未保存。'); return; }
    if (periods.length) saveSchedule(periods);
    renderCourseSettings(); renderCourses(); feedback('当前课表作息已保存。');
  });
  const splitCsvLine = (line) => { const cells = []; let cell = ''; let quoted = false; for (let i = 0; i < line.length; i += 1) { const char = line[i]; if (char === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i += 1; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { cells.push(cell.trim()); cell = ''; } else cell += char; } cells.push(cell.trim()); return cells; };
  const importCsvText = (text) => {
    const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
    if (lines.length && /title|课程名称/i.test(lines[0])) lines.shift();
    const imported = lines.map((line, index) => { const [title, teacher, location, weekdayRaw, start, end, weeksText] = splitCsvLine(line); const weekday = Number(weekdayRaw) || dayNames.indexOf(String(weekdayRaw || '').replace(/^周/, '')) + 1; return { id: `course_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`, title: String(title || '').trim(), teacher: String(teacher || '').trim(), location: String(location || '').trim(), weekday, periodStart: Number(start), periodEnd: Number(end), weeks: parseWeeks(weeksText), weekText: String(weeksText || '').trim() || '每周' }; }).filter(course => course.title && course.weekday >= 1 && course.weekday <= 7 && course.periodStart > 0 && course.periodEnd >= course.periodStart);
    const existing = loadCourses();
    const keys = new Set(existing.map(course => JSON.stringify([course.title, course.teacher, course.location, course.weekday, course.periodStart, course.periodEnd, course.weeks])));
    const additions = imported.filter(course => !keys.has(JSON.stringify([course.title, course.teacher, course.location, course.weekday, course.periodStart, course.periodEnd, course.weeks])));
    saveCourses([...existing, ...additions]); renderCourses([...existing, ...additions]);
    feedback(`CSV 导入完成：新增 ${additions.length} 门，跳过 ${imported.length - additions.length} 门重复课程。`, 'success');
  };
  coursePanel.querySelector('#desktop-import-csv')?.addEventListener('click', () => coursePanel.querySelector('#desktop-csv-file')?.click());
  coursePanel.querySelector('#desktop-csv-file')?.addEventListener('change', async event => {
    const input = event.currentTarget; const file = input.files?.[0]; if (!file) return;
    const semesterId = currentSemester().id;
    try { const text = await file.text(); if (currentSemester().id !== semesterId) throw new Error('读取文件期间已切换课表，请重新选择文件。'); importCsvText(text); }
    catch (error) { feedback(error.message); }
    finally { input.value = ''; }
  });
  coursePanel.querySelector('#desktop-export-csv')?.addEventListener('click', () => { const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`; const rows = ['title,teacher,location,weekday,periodStart,periodEnd,weeks', ...loadCourses().map(course => [course.title, course.teacher, course.location, course.weekday, course.periodStart, course.periodEnd, course.weekText || (course.weeks || []).join(',')].map(csvEscape).join(','))]; const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })); anchor.download = 'jiwei-courses.csv'; anchor.click(); URL.revokeObjectURL(anchor.href); });
  const urlInput = coursePanel.querySelector('#desktop-portal-url');
  const message = coursePanel.querySelector('#desktop-course-message');
  window.jiweiDesktop?.onPortalStatus?.(status => {
    message.textContent = status.message;
    if (status.phase === 'error' || status.phase === 'slow') feedback(status.message, 'error');
  });
  coursePanel.querySelector('#desktop-open-portal')?.addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '正在打开…';
    try {
      const result = await window.jiweiDesktop?.open(urlInput.value.trim());
      message.textContent = result?.message || '无法打开教务登录页';
    } catch (error) { message.textContent = `打开失败：${error?.message || error}`; }
    finally { button.disabled = false; button.removeAttribute('aria-busy'); button.innerHTML = `${icon('login')}打开 WebVPN 登录`; }
  });
  coursePanel.querySelector('#desktop-capture-course')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '抓取中…'; message.textContent = '正在读取当前教务页面…';
    coursePanel.querySelector('#desktop-course-result').hidden = true;
    coursePanel.querySelector('#desktop-original-frame').srcdoc = '';
    coursePanel.querySelector('#desktop-debug-text').textContent = '';
    const targetSemesterId = currentSemester().id;
    try {
      const result = await window.jiweiDesktop?.captureNow?.();
      if (currentSemester().id !== targetSemesterId) throw new Error('读取期间已切换课表，请重新抓取。');
      if (!result?.ok || !result.text) {
        if (result?.sourceHtml || (result?.debug && result.debugText)) renderCapture([], 0, 0, result);
        throw new Error(result?.message || '没有读取到课表内容');
      }
      renderCapture([], 0, 0, result);
      const existing = loadCourses();
      const { courses, additions, skipped } = prepareCapturedCourses(result, existing);
      if (additions.length) saveCourses([...existing, ...additions]);
      renderCourses(); renderCapture(courses, additions.length, skipped, result);
      message.textContent = `已向「${currentSemester().name}」导入 ${additions.length} 门课程${skipped ? `，跳过 ${skipped} 门重复课程` : ''}。`;
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
  const captures=()=>readRecords(localStorage,dataKeys.captures);
  const renderOverview=()=>{
    const pending=captures().flatMap(record=>record.drafts.filter(draft=>draft.status==='pending').map(draft=>({record,draft})));
    overviewPanel.querySelector('#desktop-overview-drafts').innerHTML=pending.length?pending.slice(0,6).map(({record,draft})=>`<article class="desktop-list-item"><div><strong>${escapeHtml(draft.title)}</strong><small>${escapeHtml(record.title)} · ${draft.date?escapeHtml(draft.date):'日期待确认'}</small></div><button type="button" class="secondary" data-open-capture="${escapeHtml(record.id)}">整理</button></article>`).join(''):'<p class="empty">没有待确认的网页行动。可以采集网页，或导入示例体验。</p>';
    const rows=[['课程表',`${loadSemesters().length} 张课表`,'courses'],['计划',`${readList(dataKeys.plans).filter(item=>!item.done).length} 项未完成`,'plans'],['待办',`${readList(dataKeys.tasks).filter(item=>!item.done).length} 项未完成`,'tasks'],['网页采集',`${captures().length} 条记录 · ${pending.length} 项待确认`,'web-capture']];
    overviewPanel.querySelector('#desktop-overview-summary').innerHTML=rows.map(([name,count,view])=>`<article class="desktop-list-item"><div><strong>${name}</strong><small>${count}</small></div><button type="button" class="secondary" data-view="${view}">查看</button></article>`).join('');
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
    webCapture.querySelector('#collect-source').textContent=selected.url;
    webCapture.querySelector('#desktop-web-example').hidden=!selected.example;
    webCapture.querySelector('#collect-highlights').innerHTML=selected.highlights.map(text=>`<li>${escapeHtml(text)}</li>`).join('');
    webCapture.querySelector('#collect-drafts').innerHTML=selected.drafts.length?selected.drafts.map(draft=>{
      const fields=draftEdits.get(`${selected.id}/${draft.id}`) || draft;
      return `<form class="desktop-web-draft" data-approve-draft="${escapeHtml(draft.id)}" data-capture="${escapeHtml(selected.id)}"><div class="desktop-draft-fields"><label>待办名称<input name="title" required maxlength="160" value="${escapeHtml(fields.title)}" ${draft.status==='added'?'disabled':''} /></label><label>截止日期<input name="date" type="date" value="${escapeHtml(fields.date)}" ${draft.status==='added'?'disabled':''} /></label><button type="submit" class="secondary" ${draft.status==='added'?'disabled':''}>${draft.status==='added'?'已加入待办':'确认加入待办'}</button></div><blockquote>${escapeHtml(draft.evidence)}</blockquote>${draft.dateInferred?'<p class="desktop-web-hint">原文未写完整日期，已按采集当天推算，请核对。</p>':''}</form>`;
    }).join(''):'<p class="desktop-section-copy">未识别到明确行动。重点与原文已保留，不会自动创建待办。</p>';
    collectPreview.textContent=selected.text;
    collectPath.textContent=selected.directory?`原文保存位置：${selected.directory}`:'示例保存在本机应用数据中，没有实际访问示例网址。';
    collectFolder.hidden=!selected.directory;
    webCapture.querySelector('#collect-links').innerHTML=(selected.links || []).filter(link=>/^https?:\/\//i.test(link.href)).map(link=>`<p><a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.text)}</a></p>`).join('');
  };
  document.addEventListener('click',event=>{
    const sample=event.target.closest('[data-load-example]');
    if(sample){
      try{
        const scope=sample.dataset.loadExample;
        loadWorkbenchExamples(localStorage,scope,calendar.today());
        if(['all','overview','today','courses'].includes(scope)) {afterSemesterChange();courseSettings.hidden=true;coursePanel.querySelector('#desktop-open-course-settings').setAttribute('aria-expanded','false');}
        if(scope==='web') selectedCaptureId='demo-web-notice';
        renderToday();renderPlans();renderTasks();renderOverview();renderWebCollection();
        feedback(`示例已导入。仅补充缺失项，已有修改与完成状态已保留。${['all','overview','today','courses'].includes(scope)?'课表设置可切回原课表。':''}`,'success');
      }catch(error){feedback(`示例导入失败：${error.message}`,'error');}
    }
    const open=event.target.closest('[data-open-capture]');
    if(open){selectedCaptureId=open.dataset.openCapture;webNav.click();renderWebCollection();}
  });
  webCapture.addEventListener('click',event=>{
    const selected=event.target.closest('[data-select-capture]');
    if(selected){selectedCaptureId=selected.dataset.selectCapture;renderWebCollection();}
  });
  webCapture.addEventListener('input',event=>{
    const form=event.target.closest('[data-approve-draft]');
    if(form)draftEdits.set(`${form.dataset.capture}/${form.dataset.approveDraft}`,{title:form.elements.title.value,date:form.elements.date.value});
  });
  webCapture.addEventListener('submit',event=>{
    const form=event.target.closest('[data-approve-draft]');
    if(!form)return;
    event.preventDefault();
    try{
      const result=approveWebDraft(localStorage,form.dataset.capture,form.dataset.approveDraft,{title:form.elements.title.value,date:form.elements.date.value});
      draftEdits.delete(`${form.dataset.capture}/${form.dataset.approveDraft}`);
      renderWebCollection();renderOverview();
      feedback(result.added?'已加入待办，可在“待办”和“今天”页面查看。':'该行动已在待办中，未重复添加。','success');
    }catch(error){feedback(error.message,'error');}
  });
  webCapture.querySelector('#desktop-web-form').addEventListener('submit', async event => {
    event.preventDefault();
    if(collectSubmit.disabled)return;
    collectSubmit.disabled = true; collectSubmit.setAttribute('aria-busy','true'); collectSubmit.textContent = '正在抓取…';
    const status=webCapture.querySelector('#collect-status'); status.textContent='正在读取公开网页并整理重点…';
    try {
      if(!window.jiweiDesktop?.collectPage)throw new Error('请在桌面端使用网页抓取功能。');
      const result = await window.jiweiDesktop.collectPage(collectUrl.value.trim());
      if (!result?.ok) throw new Error(result?.message || '无法抓取网页');
      const record=saveWebCapture(localStorage,result,calendar.today());
      selectedCaptureId=record.id;renderWebCollection();renderOverview();
      status.textContent=`已整理 ${record.highlights.length} 条重点、${record.drafts.length} 项行动草稿。确认后才会加入待办。`;
      feedback('网页抓取与整理完成。','success');
    } catch (error) {status.textContent=`抓取失败：${error.message}`;feedback(status.textContent,'error');}
    finally { collectSubmit.disabled = false;collectSubmit.removeAttribute('aria-busy'); collectSubmit.innerHTML = `${icon('download')}抓取并整理`; }
  });
  collectFolder.addEventListener('click',async()=>{try{const result=await window.jiweiDesktop?.openCollectorFolder();if(!result?.ok||result.error)throw new Error(result?.error || '无法打开保存目录');}catch(error){feedback(error.message,'error');}});
  renderCourses();renderOverview();renderWebCollection();main.dataset.activeView='overview';
})();
