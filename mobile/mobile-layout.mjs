// Presentation-only adaptation. Fields, IDs, forms and delegated actions stay intact.
export function installMobileLayout() {
  const narrow = () => innerWidth < 800;
  const iconPaths = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/>',
    link: '<path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/>',
    open: '<path d="M14 3h7v7M21 3 10 14M10 4H4v16h16v-6"/>',
    archive: '<path d="M4 8h16v13H4zM3 3h18v5H3zM9 12h6"/>',
    import: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M4 13v8h16v-8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    layers: '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 21h14V7"/>',
    list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M13 5H5v14h14v-8M10 14l1-4 8-8 3 3-8 8Z"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    week: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11m6-11v11M8 2v4m8-4v4"/>',
    day: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 2v4m8-4v4M7 13h10M7 17h7"/>',
    today: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 2v4m8-4v4"/><circle cx="12" cy="14.5" r="2"/>',
    export: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
    clear: '<path d="m14 3 7 7-10 10H6l-4-4L14 3ZM8 10l7 7M11 20h10"/>',
    left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  const iconControl = (node, name, label) => {
    if (!node || (node.dataset.mobileIcon === name && node.querySelector('svg'))) return;
    label ||= node.getAttribute('aria-label') || node.textContent.trim();
    node.classList.add('mobile-icon-control'); node.dataset.mobileIcon = name;
    node.setAttribute('aria-label', label); node.title = label;
    node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
  };
  const disposers = [];
  const observe = (node, callback, options) => {
    if (!node) return;
    const observer = new MutationObserver(callback); observer.observe(node, options); disposers.push(() => observer.disconnect());
  };
  const extra = (title, nodes, parent, before = null) => {
    const details = document.createElement('details'); details.className = 'mobile-optional-fields wide';
    const summary = document.createElement('summary'); summary.textContent = title;
    const body = document.createElement('div'); body.className = 'mobile-optional-body';
    parent.insertBefore(details, before); body.append(...nodes.filter(Boolean)); details.append(summary, body); return details;
  };
  const plan = document.querySelector('#desktop-plan-form');
  const planFields = ['goal', 'completionCriteria', 'objectId'].map(name => plan?.elements[name]?.closest('label'));
  const planExtra = plan && extra('目标、完成标准与所属对象', planFields, plan.querySelector('.desktop-item-fields'));
  const note = document.querySelector('#desktop-journal-form');
  const noteFields = ['date', 'kind', 'title', 'tags'].map(name => note?.elements[name]?.closest('label'));
  const noteHint = note?.querySelector('.desktop-journal-fields > .desktop-section-copy');
  const noteExtra = note && extra('日期、用途、标题与标签', [...noteFields, noteHint], note.querySelector('.desktop-item-fields'));
  const course = document.querySelector('#desktop-course-editor');
  const table = document.querySelector('#desktop-timetable');
  const daySelect = document.querySelector('#desktop-course-day');
  document.querySelector('.desktop-course-page-head').append(document.querySelector('#desktop-course-summary'));

  const courseControls = document.querySelector('.desktop-timetable-controls');
  const courseOptions = document.createElement('details'); courseOptions.className = 'mobile-course-options';
  const optionsTitle = document.createElement('summary'); optionsTitle.textContent = '更多';
  const optionsBody = document.createElement('div'); optionsBody.className = 'mobile-course-option-list';
  courseOptions.append(optionsTitle, optionsBody); courseControls.append(courseOptions);
  const addCourse = document.querySelector('#desktop-add-course');
  addCourse.append(document.createTextNode('添加课程')); optionsBody.append(addCourse, document.querySelector('.desktop-week-options'));
  const settingsButton = document.querySelector('#desktop-open-course-settings');
  settingsButton.lastChild.textContent = '设置'; settingsButton.setAttribute('aria-label', '课表设置');
  const hint = document.querySelector('.desktop-timetable-hint'); hint.textContent = '左右滑动换周 · 点星期查看当天';
  document.querySelector('[data-course-view="week"]').textContent = '整周';
  document.querySelector('[data-course-view="day"]').textContent = '单日';
  const tabNames = { 'desktop-tab-semester': '课表', 'desktop-open-import': '导入导出', 'desktop-open-batch': '批量编辑', 'desktop-tab-schedule': '作息' };
  for (const [id, text] of Object.entries(tabNames)) { const tab = document.getElementById(id); if (tab) tab.textContent = text; }
  const notice = document.querySelector('#desktop-course-notice');
  const quietNavigation = () => { if (/^已切换到周|^已返回整周课表/.test(document.querySelector('#desktop-course-feedback').textContent)) notice.hidden = true; };
  observe(document.querySelector('#desktop-course-feedback'), quietNavigation, { childList: true });
  const adaptTimetable = () => {
    const dayMode = document.querySelector('[data-course-view="day"]').getAttribute('aria-pressed') === 'true';
    table.dataset.mobileView = dayMode ? 'day' : 'week';
    const body = table.querySelector('.desktop-timetable-body');
    for (const header of table.querySelectorAll('.desktop-timetable-day')) {
      header.setAttribute('aria-label', header.title);
      if (header.firstChild?.nodeType === Node.TEXT_NODE) header.firstChild.textContent = header.firstChild.textContent.replace(/^周/, '');
    }

    if (body && narrow() && !dayMode) {
      for (const card of body.querySelectorAll('.desktop-timetable-course')) {
        const description = [card.querySelector('strong')?.textContent, ...[...card.querySelectorAll('.desktop-course-card-meta > span')].map(node => node.textContent)].filter(Boolean).join('，');
        card.setAttribute('aria-label', description); card.title = description;
        const room = card.querySelector('.desktop-course-card-meta > span:nth-child(2)');
        if (room) {
          const pieces = room.textContent.replace(/^教室：/, '').split(/(\d+)/);
          room.replaceChildren(...pieces.filter(Boolean).map(part => {
            if (!/^\d+$/.test(part)) return document.createTextNode(part);
            const number = document.createElement('span'); number.className = 'mobile-room-number'; number.textContent = part; return number;
          }));
        }
      }
    }
    if (!body || !narrow() || !dayMode || body.querySelector('.mobile-course-agenda')) return;
    const agenda = document.createElement('div'); agenda.className = 'mobile-course-agenda';
    const periods = [...body.querySelectorAll('.desktop-timetable-period')];
    for (const card of body.querySelectorAll('.desktop-timetable-course')) {
      const row = document.createElement('div'); row.className = 'mobile-agenda-row';
      const time = document.createElement('div'); time.className = 'mobile-course-time';
      const meta = card.querySelector('.desktop-course-card-meta');
      const periodText = meta?.children[3]?.textContent || '';
      const [start, end = start] = (periodText.match(/\d+/g) || []).map(Number);
      const label = document.createElement('strong'); label.textContent = periodText.replace('节次：', '');
      const clock = document.createElement('span');
      const first = periods[start - 1]?.querySelector('small')?.innerHTML.split(/<br\s*\/?\s*>/i)[0];
      const last = periods[end - 1]?.querySelector('small')?.innerHTML.split(/<br\s*\/?\s*>/i).at(-1);
      clock.textContent = [first, last].filter(Boolean).join(' – '); time.append(label, clock);
      row.append(time, card); agenda.append(row);
    }
    body.replaceChildren(agenda);
  };
  adaptTimetable(); observe(table, adaptTimetable, { childList: true });
  let phoneLayout = narrow();
  const reflowCourses = () => {
    if (phoneLayout === narrow()) return;
    phoneLayout = narrow(); document.querySelector('[data-course-view][aria-pressed="true"]').click();
  };
  addEventListener('resize', reflowCourses); disposers.push(() => removeEventListener('resize', reflowCourses));
  const closeCourseOptions = event => { if (event.target.closest('button')) courseOptions.open = false; };
  courseOptions.addEventListener('click', closeCourseOptions);
  const scroll = document.querySelector('#desktop-timetable-scroll');
  let touch = null, swiped = false;
  const touchStart = event => { const p = event.touches[0]; touch = event.touches.length === 1 ? { x: p.clientX, y: p.clientY } : null; swiped = false; };
  const touchEnd = event => {
    if (!touch || !narrow()) return;
    const p = event.changedTouches[0], dx = p.clientX - touch.x, dy = p.clientY - touch.y; touch = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 40) return;
    swiped = true; const next = dx < 0;
    if (table.dataset.mobileView === 'day') {
      const day = Number(daySelect.value), target = day + (next ? 1 : -1);
      if (target < 1 || target > 7) {
        const week = document.querySelector(next ? '#desktop-next-week' : '#desktop-prev-week'); if (week.disabled) return; week.click();
      }
      daySelect.value = String(target < 1 ? 7 : target > 7 ? 1 : target); daySelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else document.querySelector(next ? '#desktop-next-week' : '#desktop-prev-week').click();
  };
  const stopSwipeClick = event => { if (swiped) { event.preventDefault(); event.stopImmediatePropagation(); swiped = false; } };
  scroll.addEventListener('touchstart', touchStart, { passive: true }); scroll.addEventListener('touchend', touchEnd, { passive: true }); scroll.addEventListener('click', stopSwipeClick, true);
  disposers.push(() => { scroll.removeEventListener('touchstart', touchStart); scroll.removeEventListener('touchend', touchEnd); scroll.removeEventListener('click', stopSwipeClick, true); });
  // Editing is the row's primary action; destructive actions remain in its editor.
  const items = document.querySelector('.desktop-items-panel');
  const adaptItems = () => {
    for (const content of items?.querySelectorAll('.desktop-planning-item .desktop-list-item > div') || []) {
      content.tabIndex = 0; content.setAttribute('role', 'button'); content.setAttribute('aria-label', `编辑${content.querySelector('strong')?.textContent || '事项'}`);
    }
  };
  const editItem = event => {
    if (!narrow() || (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) || event.target.closest('button,a,input,select,summary')) return;
    const content = event.target.closest('.desktop-planning-item .desktop-list-item > div');
    if (content) { event.preventDefault(); content.parentElement.querySelector('[data-item-action="edit"]').click(); }
  };
  items?.addEventListener('click', editItem); items?.addEventListener('keydown', editItem);
  adaptItems(); observe(items, adaptItems, { childList: true, subtree: true });
  disposers.push(() => { items?.removeEventListener('click', editItem); items?.removeEventListener('keydown', editItem); });
  const color = course?.querySelector('.desktop-course-color-choices')?.closest('fieldset');
  const courseExtra = color && extra('课程配色', [color], color.parentElement, color);
  const weeks = course?.querySelector('.desktop-course-week-detail');
  if (weeks) extra('逐周选择 · 精确调整', [weeks], weeks.parentElement, weeks);
  const filters = document.querySelector('.desktop-journal-filters');
  if (filters) {
    const controls = [...filters.children].filter(child => !child.contains(document.querySelector('#desktop-journal-search')));
    extra('按日期和用途筛选', controls, filters);
  }
  const journalList = document.querySelector('#desktop-journal-list');
  const editNote = event => {
    if (!narrow() || (event.type === 'keydown' && !['Enter', ' '].includes(event.key))) return;
    const body = event.target.closest('.desktop-journal-body'); if (!body) return;
    event.preventDefault(); body.closest('.desktop-journal-entry').querySelector('[data-journal-edit]')?.click();
  };
  journalList.addEventListener('click', editNote); journalList.addEventListener('keydown', editNote);
  disposers.push(() => { journalList.removeEventListener('click', editNote); journalList.removeEventListener('keydown', editNote); });

  const adaptNotes = () => {
    for (const button of journalList.querySelectorAll('[data-note-extract]')) iconControl(button, 'list', '提炼为事项');
    for (const button of journalList.querySelectorAll('[data-note-action]')) iconControl(button, 'open', button.textContent.trim());

    for (const body of journalList.querySelectorAll('.desktop-journal-body')) {
      body.tabIndex = 0; body.setAttribute('role', 'button'); body.setAttribute('aria-label', '阅读全文与编辑');
    }

    for (const button of journalList.querySelectorAll('[data-journal-edit]')) iconControl(button, 'edit', '阅读全文与编辑');
    for (const actions of journalList.querySelectorAll('.desktop-journal-entry > .desktop-journal-actions:last-child')) {
      const secondary = [...actions.querySelectorAll(':scope > [data-journal-action]')];
      if (!secondary.length || actions.querySelector('.mobile-note-actions')) continue;
      const menu = document.createElement('details'); menu.className = 'mobile-note-actions';
      const summary = document.createElement('summary'); summary.textContent = '更多';
      const body = document.createElement('div'); body.append(...secondary); menu.append(summary, body); actions.append(menu);
      iconControl(summary, 'more', '更多笔记操作');
    }
  };
  adaptNotes(); observe(journalList, adaptNotes, { childList: true });
  const calendarFilters = document.querySelector('.desktop-calendar-filters');
  if (calendarFilters) extra('显示内容与图例', [calendarFilters], calendarFilters.parentElement, calendarFilters);
  const capture = document.querySelector('.desktop-web-entry');
  if (capture) {
    const note = document.createElement('details'); note.className = 'mobile-capture-help';
    const summary = document.createElement('summary'); summary.textContent = '网页资料使用说明';
    note.append(summary, ...capture.childNodes); capture.append(note);
  }
  // Editors have a fixed header/action area and one scrollable content area.
  for (const form of document.querySelectorAll('.desktop-course-dialog-body > form')) {
    const header = form.querySelector(':scope > .panel-head');
    const actions = form.querySelector(':scope > .desktop-form-actions, :scope > .desktop-course-editor-actions');
    if (!header || !actions) continue;
    const body = document.createElement('div'); body.className = 'mobile-sheet-scroll';
    const content = [...form.children].filter(node => node !== header && node !== actions);
    body.append(...content); form.replaceChildren(header, body, actions); form.classList.add('mobile-sheet-form');
  }
  for (const dialog of document.querySelectorAll('dialog')) observe(dialog, () => {
    if (!dialog.open) {
      if (narrow() && !document.querySelector('dialog[open]') && document.activeElement === document.body) document.querySelector('#mobile-primary-action:not([hidden])')?.focus({ preventScroll: true });
      return;
    }
    dialog.querySelectorAll('.mobile-sheet-scroll').forEach(body => { body.scrollTop = 0; });
    if (planExtra && dialog.contains(planExtra)) planExtra.open = !narrow() || planFields.some(node => node.querySelector('input,select,textarea')?.value);
    if (noteExtra && dialog.contains(noteExtra)) noteExtra.open = !narrow() || ['title', 'tags'].some(name => note.elements[name].value.trim());
    if (courseExtra && dialog.contains(courseExtra)) courseExtra.open = !narrow() || Boolean(course.elements.color.value);
  }, { attributes: true, attributeFilter: ['open'] });
  const detail = document.querySelector('#desktop-object-detail');
  const expanded = new Map();
  const adaptObject = () => {
    const actions = detail?.querySelector('.desktop-object-heading .desktop-button-row');
    if (actions && !actions.querySelector('.mobile-object-actions')) {
      const menu = document.createElement('details'); menu.className = 'mobile-object-actions';
      const title = document.createElement('summary'); title.textContent = '更多操作';
      const body = document.createElement('div'); body.append(...[...actions.children].slice(1)); menu.append(title, body); actions.append(menu);
      iconControl(title, 'more', '更多对象操作');
    }
    for (const [selector, name, label] of [['[data-object-link]','link','关联已有内容'],['[data-object-add-item]','plus','添加关联事项'],['[data-object-edit]','edit','编辑对象'],['[data-object-archive]','archive',null],['[data-object-record]','open','在原功能中打开'],['[data-object-unlink]','clear','解除关联']]) {
      for (const button of detail?.querySelectorAll(selector) || []) iconControl(button, name, label);
    }
    const scope = detail?.querySelector('.desktop-object-scope');
    if (scope && !scope.closest('details')) extra('功能说明', [scope], scope.parentElement);
    for (const section of detail?.querySelectorAll('.desktop-object-section') || []) {
      if (section.querySelector(':scope > details')) continue;
      const heading = section.querySelector('.desktop-section-head'); if (!heading) continue;
      const key = heading.querySelector('h3')?.textContent || '';
      const fold = document.createElement('details'); fold.className = 'mobile-object-section';
      fold.open = expanded.get(key) ?? ['上课安排', '事项与计划'].includes(key);
      const summary = document.createElement('summary'); summary.append(...heading.childNodes); heading.remove();
      fold.append(summary, ...section.childNodes); section.replaceChildren(fold);
      fold.addEventListener('toggle', () => expanded.set(key, fold.open));
    }
  };
  adaptObject(); observe(detail, adaptObject, { childList: true });
  const setCourseView = event => {
    const button = event.target.closest('[data-course-view]');
    if (button) try { sessionStorage.setItem('jiwei-mobile-course-view-v2', button.dataset.courseView); } catch {}
  };
  document.addEventListener('click', setCourseView); disposers.push(() => document.removeEventListener('click', setCourseView));
  if (narrow()) {
    let view = 'week'; try { view = sessionStorage.getItem('jiwei-mobile-course-view-v2') || view; } catch {}
    document.querySelector(`[data-course-view="${view === 'week' ? 'week' : 'day'}"]`)?.click();
  }
  const viewport = () => {
    const field = document.activeElement;
    if (field?.matches('input:not([type="checkbox"]):not([type="radio"]),textarea') && field.closest('dialog[open]')) field.scrollIntoView({ block: 'nearest' });
  };
  window.visualViewport?.addEventListener('resize', viewport);
  disposers.push(() => window.visualViewport?.removeEventListener('resize', viewport));
  for (const [selector, name, label] of [
    ['#desktop-open-course-settings', 'settings', '课表设置'],
    ['.mobile-course-options > summary', 'more', '更多课表操作'],
    ['[data-course-view="week"]', 'week', '整周课表'], ['[data-course-view="day"]', 'day', '单日课程'],
    ['#desktop-add-plan', 'plus', '添加事项'], ['#desktop-journal-new', 'edit', '记一笔'],
    ['#desktop-new-object', 'plus', '新建对象'], ['[data-page="calendar"] .desktop-page-actions [data-cal-add]', 'plus', '添加事项'],
    ['#desktop-journal-export', 'export', '导出筛选结果'],
    ['#desktop-journal-clear', 'clear', '清除筛选'],
    ['[data-cal-step="-1"]', 'left', '上一段日期'], ['[data-cal-step="1"]', 'right', '下一段日期'],
    ['[data-cal-today]', 'today', '回到今天'],
    ['#desktop-object-form .panel-head [data-object-close]', 'close', '关闭对象编辑'],
  ]) iconControl(document.querySelector(selector), name, label);
  for (const [view, label] of [['week', '整周'], ['day', '单日']]) {
    const button = document.querySelector('[data-course-view="' + view + '"]');
    const caption = document.createElement('span'); caption.className = 'mobile-view-label'; caption.textContent = label; button.append(caption);
  }
  // Move static guidance out of the reading flow. Errors, status and user content stay visible.
  const help = (nodes, parent, label = '使用说明') => {
    if (!nodes.length) return;
    const fold = extra(label, nodes, parent); fold.classList.add('mobile-help');
    iconControl(fold.querySelector('summary'), 'info', label);
    return fold;
  };
  for (const head of document.querySelectorAll('.intro.desktop-page-head')) {
    const copy = [...head.querySelectorAll(':scope > div:first-child > p')];
    help(copy, head, '页面说明');
  }
  for (const section of document.querySelectorAll('[data-page="settings"] .desktop-settings-section')) {
    const copy = [...section.querySelectorAll(':scope > p:not([role])')];
    help(copy, section);
  }
  for (const button of document.querySelectorAll('[data-load-example],#desktop-journal-example')) iconControl(button, 'import', '导入示例（开发者模式）');
  for (const button of document.querySelectorAll('.mobile-sheet-form > .panel-head > button')) iconControl(button, 'close', button.getAttribute('aria-label') || button.textContent.trim());
  for (const [selector, name, label] of [
    ['#desktop-export-data','share','导出迁移包'],['#desktop-import-data','import','导入迁移包'],
    ['#desktop-export-csv','share','导出 CSV'],['#desktop-export-ics','share','导出日历 ICS'],
    ['#desktop-journal-resume','edit','继续写草稿'],
  ]) iconControl(document.querySelector(selector),name,label);
  for (const summary of document.querySelectorAll('.mobile-optional-fields:not(.mobile-help) > summary')) {
    const label = summary.textContent; summary.setAttribute('aria-label',label);
    summary.textContent = /筛选|图例/.test(label) ? '筛选' : /功能说明/.test(label) ? '说明' : '更多选项';
    summary.title = label;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('aria-hidden','true');
    svg.innerHTML = /筛选|图例/.test(label) ? iconPaths.filter : iconPaths.more;
    summary.prepend(svg);
  }
  for (const [id,name,label] of [['desktop-tab-semester','layers','课表'],['desktop-open-import','import','导入'],['desktop-open-batch','list','批量'],['desktop-tab-schedule','clock','作息']]) {
    const button = document.getElementById(id); iconControl(button,name,button.getAttribute('aria-label') || label);
    button.classList.add('mobile-tab-control'); const caption=document.createElement('span');caption.textContent=label;button.append(caption);
  }
  if (hint) { courseOptions.querySelector('.mobile-course-option-list').append(hint); hint.classList.add('mobile-menu-hint'); }
  const schoolImport = document.querySelector('.desktop-school-import');
  if (schoolImport) {
    const instructions = [...schoolImport.querySelectorAll(':scope > .mobile-capability-note,:scope > .desktop-section-copy')];
    help(instructions, schoolImport, '导入说明');
    const origin = schoolImport.querySelector('.desktop-section-head p');
    if (origin) { origin.title = origin.textContent; origin.textContent = '南邮 · WebVPN'; }
    for (const [index,step] of [...schoolImport.querySelectorAll('.desktop-import-steps li')].entries()) {
      step.title = step.textContent; step.textContent = ['登录','查询课表','导入'][index];
    }
    const message = document.querySelector('#desktop-course-message');
    if (message) message.textContent = '登录后打开学生课表，再点击导入。';
  }
  const fileTransfer = document.querySelector('.desktop-file-transfer');
  const fileCopy = fileTransfer?.querySelector(':scope > div > p');
  if (fileCopy) help([fileCopy], fileTransfer, '文件说明');
  const settingsHeadCopy = document.querySelector('.desktop-course-settings > .panel-head p');
  if (settingsHeadCopy) help([settingsHeadCopy], settingsHeadCopy.parentElement, '课表设置说明');
  for (const copy of document.querySelectorAll('.desktop-settings-pane > .desktop-course-settings-note')) help([copy], copy.parentElement);
  for (const [id,name,label,caption] of [
    ['desktop-open-portal','open','打开 WebVPN 登录','登录'],
    ['desktop-capture-course','import','抓取课表并导入','导入'],
    ['desktop-import-csv','import','导入 CSV / ICS 文件','文件'],
  ]) {
    const button = document.getElementById(id); iconControl(button,name,label);
    button.classList.add('mobile-action-label');
    const text = document.createElement('span'); text.textContent=caption;button.append(text);
  }
  const calendarHelp = document.querySelector('.desktop-calendar-footnote');
  if (calendarHelp) help([calendarHelp], calendarHelp.parentElement, '日历说明');
  const calendarDetail = document.querySelector('#desktop-calendar-detail');
  const adaptCalendar = () => {
    for (const [selector,name] of [['[data-cal-edit]','edit'],['[data-cal-course-edit]','edit'],['[data-cal-course-adjust]','clock']])
      for (const button of calendarDetail.querySelectorAll(selector)) iconControl(button,name,button.textContent.trim());
  };
  adaptCalendar(); observe(calendarDetail,adaptCalendar,{childList:true});
  addEventListener('pagehide', () => disposers.forEach(dispose => dispose()), { once: true });
}
