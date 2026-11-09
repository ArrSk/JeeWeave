import { readSkeleton, saveSkeleton } from './skeleton.mjs';
import { createLoomNav, loomDestinations } from './loom-nav.mjs';
import { createLoomRenderer } from './loom-render.mjs';
import { createChromeSync } from './loom-material.mjs';
import { blockedPage } from './loom-pages.mjs';
import { completionDatesOnDate, itemTimeParts } from './planning.mjs';
import { moveStep, moveStamp, snapDelta, clampDelta } from './item-move.mjs';
import { markHomework } from './homework.mjs';
import { today } from '../shared/packages/core/src/semester-calendar.mjs';

export function createSkeletonRuntime({ root, main, host, getPage, modules, storage, bindings, feedback, onChange, onWorkbench, beforeChange, search, context, homework }) {
  const surface = main.querySelector('#loom-surface'), content = document.createElement('div');
  content.className = 'loom-content'; surface.replaceChildren(content);
  // B 方案：这些页不再搬移旧 section，经纬视图直接作为宿主接公共命令。
  const independentPages = new Set(['overview', 'today', 'courses', 'calendar', 'plans', 'notes', 'objects', 'web-capture', 'settings', 'plugins', 'reminders']);
  const loomHosts = new Map();
  const loomHostFor = page => {
    const id = page.dataset.page;
    let host_ = loomHosts.get(id);
    if (!host_) { host_ = document.createElement('section'); host_.className = 'loom-independent'; host_.dataset.page = id; loomHosts.set(id, host_); }
    return host_;
  };
  const positions = new Map(), searchPanel = document.querySelector('#desktop-search-panel');
  const renderer = createLoomRenderer({ host, bindings, context, loomLayout: () => state.loomLayout, homework });
  const scrollPositions = new Map();
  let searchMarker, state = readSkeleton(storage), disposed = false, started = false, workbenchScroll = 0;
  const nav = createLoomNav({ host, surface, bindings, modules, feedback, active: () => main.dataset.activeView || 'overview', openSearch: button => search.open(button), blocked: page => showBlocked(page) });
  // 点到一个关掉或挂起的页：停下来把原因写在页里，而不是只闪一行字或悄悄跳走。
  const showBlocked = page => {
    if (disposed) return;
    try {
      renderer.setActive(null);
      // 先把被搬进内容的旧 section 放回原位，再整体换掉内容，工作台模式下才不会丢页。
      for (const old of positions.keys()) restore(old);
      for (const host_ of loomHosts.values()) host_.remove();
      const section = document.createElement('section');
      section.className = 'loom-independent loom-blocked-page';
      section.dataset.page = 'blocked';
      section.innerHTML = blockedPage(page);
      content.replaceChildren(section);
      enter(section);
      nav.setLocation(`${page.name} · ${page.status}`);
      section.querySelector('h1')?.focus({ preventScroll: true });
    } catch (error) { nav.report(error); }
  };
  // 窗口底色与标题条只有材质说了算：经纬读该布局的纸色与正文色，回工作台交还给用户保存的配色。
  const chrome = createChromeSync({
    skeleton: () => state.skeleton,
    readTokens: () => { try { const style = getComputedStyle(root); return Object.fromEntries(['--canvas', '--sidebar', '--ink-1', '--text'].map(key => [key, style.getPropertyValue(key)])); } catch { return {}; } },
    setWindowAppearance: globalThis.window?.jeeWeaveDesktop?.setWindowAppearance,
  });
  const restore = page => {
    const marker = positions.get(page); if (!marker) return;
    // Removed dynamic plugin pages must not be resurrected.
    if (page.isConnected && marker.isConnected) marker.before(page);
    marker.remove(); positions.delete(page);
  };
  // 换页只加一段短升起：不加遮罩、不碰数据，减少动态时由 CSS 直接落位。
  const enter = element => {
    if (!element) return;
    element.classList.remove('is-entering');
    void element.offsetWidth;
    element.classList.add('is-entering');
    element.addEventListener('animationend', () => element.classList.remove('is-entering'), { once: true });
  };
  const mount = page => {
    if (!page || state.skeleton !== 'loom' || disposed) return;
    // 说明卡只是临时内容，真正回到某一页时先把它撤掉，避免同屏两张页头。
    content.querySelector(':scope > .loom-blocked-page')?.remove();
    scrollPositions.set(main.dataset.activeView || 'overview', surface.scrollTop);
    const pageId = page.dataset.page || '';
    if (independentPages.has(pageId)) {
      for (const old of positions.keys()) restore(old);
      for (const [id, host_] of loomHosts) if (id !== pageId) host_.remove();
      const loomHost = loomHostFor(page);
      renderer.setActive(loomHost);
      content.append(loomHost);
      enter(loomHost);
      return;
    }
    // 经纬下每一页都有自己的呈现，不再只处理今天。
    renderer.setActive(page);
    for (const old of positions.keys()) if (old !== page) restore(old);
    for (const host_ of loomHosts.values()) host_.remove();
    if (!positions.has(page)) { const marker = document.createComment('loom-page-home'); page.before(marker); positions.set(page, marker); }
    content.append(page);
    enter(page);
  };
  const apply = (next, focus = false) => {
    if (disposed) return;
    const changed = state.skeleton !== next.skeleton || !root.dataset.workspaceSkeleton, scroll = main.scrollTop;
    const wasLoom = root.dataset.workspaceSkeleton === 'loom';
    if (!wasLoom && next.skeleton === 'loom') workbenchScroll = scroll;
    if (wasLoom) scrollPositions.set(main.dataset.activeView || 'overview', surface.scrollTop);
    nav.close(); beforeChange?.(); state = next;
    root.dataset.workspaceSkeleton = next.skeleton;
    if (next.skeleton === 'loom') root.dataset.loomLayout = next.loomLayout; else delete root.dataset.loomLayout;
    // 四套经纬布局各自决定导航条带；先落根节点属性，CSS 才能只显示当前那几条。
    nav.setLayout(state.loomLayout);
    chrome();
    surface.hidden = next.skeleton !== 'loom';
    if (next.skeleton === 'loom') {
      if (!searchMarker) { searchMarker = document.createComment('loom-search-home'); searchPanel.before(searchMarker); }
      nav.searchHome.append(searchPanel);
      mount(getPage(main.dataset.activeView || 'overview'));
    } else {
      renderer.setActive(null);
      content.querySelector(':scope > .loom-blocked-page')?.remove();
      for (const page of positions.keys()) restore(page);
      for (const host_ of loomHosts.values()) host_.remove();
      if (searchMarker) { searchMarker.before(searchPanel); searchMarker.remove(); searchMarker = null; }
    }
    onChange?.(state); nav.render();
    if (next.skeleton === 'workbench') onWorkbench?.(focus && changed);
    if (next.skeleton === 'loom') surface.scrollTop = scrollPositions.get(main.dataset.activeView || 'overview') || 0;
    else main.scrollTop = wasLoom ? workbenchScroll : scroll;
    if (focus && next.skeleton === 'loom') nav.focusPage();
  };
  const choose = patch => {
    if (disposed) return false;
    try {
      if (document.querySelector('dialog[open]')) throw Error('请先保存或关闭当前编辑面板，再切换骨架。');
      const next = saveSkeleton(storage, { ...state, ...patch }); apply(next, true); return true;
    } catch (error) { nav.report(error); return false; }
  };
  const select = skeleton => skeleton === state.skeleton || choose({ skeleton });
  // 换布局时若还在工作台，先进经纬；已经在经纬里就只改 loomLayout。
  const selectLayout = layout => choose(state.skeleton === 'loom' ? { loomLayout: layout } : { skeleton: 'loom', loomLayout: layout });
  const beforeShow = (_id, page) => { if (started) mount(page); };
  const afterShow = id => { if (started) { nav.render(); renderer.render(); if (state.skeleton === 'loom') surface.scrollTop = scrollPositions.get(id) || 0; } };
  const sync = () => {
    if (!started) return;
    if (state.skeleton === 'loom' && !host.inventory().pages.includes(main.dataset.activeView || 'overview')) {
      // 当前页被关掉时仍回总览（和工作台一致），但把原因留在状态行，不静默跳走。
      const gone = loomDestinations(modules(), host.inventory()).find(page => page.id === (main.dataset.activeView || ''));
      host.navigate('overview');
      if (gone?.status) nav.notice(`「${gone.name}」${gone.status}，已回到总览。记录仍在本机。`);
    }
    nav.render(); renderer.render();
  };
  const start = () => {
    if (started || disposed) return;
    started = true; apply(readSkeleton(storage));
  };
  const refresh = () => { if (started) apply(readSkeleton(storage)); };
  /* ── 拖动改期 ────────────────────────────────────────────────
     拖拽只平移今天已有的时段；落点、撤销和读屏提示都复用同一条公共接口。
     拖出当天的位移会被夹回窗口，宁可不动，也不把事项挪到另一天。 */
  const movable = row => row?.kind === '事项' && (row.move === 'slots' ? !!row.moveSlots?.length : row.move === 'anchor' && !!row.moveAnchor);
  const minuteAt = stamp => { const parts = itemTimeParts(stamp); return Number(parts.time.slice(0, 2)) * 60 + Number(parts.time.slice(3)); };
  const spanBounds = row => {
    const spans = row.move === 'slots' ? row.moveSlots : [row.moveAnchor];
    return {
      start: Math.min(...spans.map(span => minuteAt(span.start))),
      // 结束落在次日零点时，按 24:00 读，拖动的上界才不会少一天。
      end: Math.max(...spans.map(span => itemTimeParts(span.end).date > itemTimeParts(span.start).date ? 1440 : minuteAt(span.end)))
    };
  };
  const boundDelta = (row, delta) => { const bounds = spanBounds(row); return clampDelta(bounds.start, delta, -bounds.start, 1440 - bounds.end); };
  const shiftRow = (row, delta) => {
    if (!movable(row) || !delta) return false;
    const panes = row.move === 'slots' ? { slots: row.moveSlots.map(span => ({ id: span.id, start: span.start, end: span.end })) } : { anchor: { start: row.moveAnchor.start, end: row.moveAnchor.end } };
    try {
      const service = host.client('items');
      const before = JSON.stringify(service.get(row.ref));
      const move = row.move === 'slots'
        ? { slots: row.moveSlots.map(span => ({ id: span.id, start: moveStamp(span.start, delta), end: moveStamp(span.end, delta) })) }
        : { anchor: { start: moveStamp(row.moveAnchor.start, delta), end: moveStamp(row.moveAnchor.end, delta) } };
      const moved = service.reschedule(row.ref, move, { expected: before, date: renderer.date() });
      const first = row.move === 'slots' ? row.moveSlots[0].start : row.moveAnchor.start;
      nav.toast(`「${moved.title}」挪到 ${itemTimeParts(moveStamp(first, delta)).time}`, () => {
        try {
          host.client('items').reschedule(row.ref, panes, { expected: JSON.stringify(host.client('items').get(row.ref)), date: renderer.date() });
          feedback('已撤回这次挪动。', 'success');
        } catch (error) { nav.report(error); }
      });
      return true;
    } catch (error) { nav.report(error); renderer.render(); return false; }
  };
  const rowAt = element => {
    const li = element?.closest?.('[data-row][data-id]');
    if (!li) return null;
    const row = renderer.resolve(Number(li.dataset.row));
    if (!row || row.id !== li.dataset.id) return null;
    return { row, li };
  };
  let drag = null, suppressClick = false;
  const endDrag = () => {
    const current = drag; if (!current) return null;
    drag = null;
    current.li.classList.remove('is-dragging');
    content.classList.remove('is-moving-slip');
    current.ghost?.classList.remove('is-on');
    try { current.li.releasePointerCapture(current.pointerId); } catch { /* 捕获可能已被浏览器释放 */ }
    return current;
  };
  bindings.listen(content, 'pointerdown', event => {
    if (!started || disposed || state.skeleton !== 'loom' || main.dataset.activeView !== 'today') return;
    if (event.button !== 0 || event.isPrimary === false) return;
    const li = event.target.closest?.('.loom-warp .loom-paper[data-loom-move]');
    if (!li || !li.dataset.loomMove || event.target.closest('.loom-slip-knot, [data-loom-open-source]')) return;
    const found = rowAt(li); if (!found || !movable(found.row)) return;
    drag = {
      li, row: found.row, pointerId: event.pointerId, y0: event.clientY, delta: 0, moved: false,
      top0: parseFloat(li.style.top) || 0,
      hour: parseFloat(getComputedStyle(content).getPropertyValue('--hour')) || 88,
      first: found.row.move === 'slots' ? found.row.moveSlots[0].start : found.row.moveAnchor.start
    };
    try { li.setPointerCapture(event.pointerId); } catch { /* 触屏/离屏测试可能不支持捕获 */ }
  });
  bindings.listen(content, 'pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dy) < 5) return;
      drag.moved = true;
      drag.li.classList.add('is-dragging');
      content.classList.add('is-moving-slip');
      drag.ghost = content.querySelector('.loom-drag-ghost');
      drag.ghost?.classList.add('is-on');
    }
    event.preventDefault();
    drag.delta = boundDelta(drag.row, snapDelta(dy, drag.hour));
    drag.li.style.top = drag.top0 + drag.delta * drag.hour / 60 + 'px';
    if (drag.ghost) {
      drag.ghost.style.top = drag.li.style.top;
      const label = drag.ghost.querySelector('.loom-drag-ghost-time');
      if (label) label.textContent = itemTimeParts(moveStamp(drag.first, drag.delta)).time;
    }
  });
  bindings.listen(content, 'pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = endDrag();
    if (!current.moved) return;
    event.preventDefault();
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (current.delta) shiftRow(current.row, current.delta);
    else current.li.style.top = current.top0 + 'px';
  });
  bindings.listen(content, 'pointercancel', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = endDrag();
    if (current.moved) current.li.style.top = current.top0 + 'px';
  });
  bindings.listen(content, 'click', event => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault(); event.stopPropagation();
  }, { capture: true });
  // Alt↑↓ 以一刻钟为单位挪动当前聚焦的时段，四种摆位读同一批今天记录。
  bindings.listen(document, 'keydown', event => {
    if (!started || disposed || state.skeleton !== 'loom' || !event.altKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (main.dataset.activeView !== 'today' || document.querySelector('dialog[open]')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '') || event.target?.isContentEditable) return;
    const found = rowAt(document.activeElement);
    if (!found) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!movable(found.row)) { nav.notice('这项没有钟点可以挪动。'); return; }
    const delta = boundDelta(found.row, event.key === 'ArrowDown' ? moveStep : -moveStep);
    if (!delta) { nav.notice('已经到今天的边界了。'); return; }
    shiftRow(found.row, delta);
  });
  bindings.listen(document, 'keydown', event => { if (started && state.skeleton === 'loom') nav.keydown(event); }, { capture: true });
  // 上下换幕只在夜场、今天页、没有弹层时接管，其他布局仍把方向键交给页面滚动。
  bindings.listen(document, 'keydown', event => {
    if (!started || disposed || state.skeleton !== 'loom' || state.loomLayout !== 'stage') return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '')) return;
    if (main.dataset.activeView !== 'today' || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    renderer.cueStage('', event.key === 'ArrowDown' ? 1 : -1);
  });
  bindings.listen(content, 'click', event => {
    if (state.skeleton !== 'loom' || disposed) return;
    // 完成由文档上原有的处理器写入；这里只观察结果，确实写进今天才给撤销条，失败不抢报错。
    const done = event.target.closest('[data-today-item-complete]');
    if (done) {
      const ref = { collection: done.dataset.kind, id: done.dataset.todayItemComplete };
      const completionDate = done.dataset.completionDate;
      // 真点击时微任务会在两个监听器之间就执行，所以放到宏任务里读，确保原来的写入已经落盘。
      setTimeout(() => {
        if (disposed || state.skeleton !== 'loom') return;
        try {
          const item = host.client('items').get(ref);
          if (!completionDatesOnDate(item, today()).includes(completionDate)) return;
          nav.toast(`已完成 · ${item.title}`, () => {
            host.client('items').toggle(ref, completionDate);
            feedback('已撤销刚才的完成。', 'success');
          });
        } catch { /* 原处理器会报错，这里只负责撤销条 */ }
      });
    }
    // 课后追问：先记住这次问过，再按“有作业”走原有的事项编辑器；没有就只收起提示。
    const askButton = event.target.closest('[data-loom-homework]');
    if (askButton) {
      const card = askButton.closest('.loom-homework');
      if (!card) return;
      const origin = {
        tableId: card.getAttribute('data-loom-homework-table') || '',
        courseId: card.getAttribute('data-loom-homework-course') || '',
        title: card.getAttribute('data-loom-homework-title') || '',
        originalDate: card.getAttribute('data-loom-homework-date') || ''
      };
      try {
        markHomework(homework, card.getAttribute('data-loom-homework-key') || '');
        renderer.render();
        if (askButton.dataset.loomHomework === 'no') { feedback('好，这次不问作业。', 'success'); return; }
        let owner = '';
        try { if (modules?.()?.enabled?.objects) owner = host.client('objects').context({ collection: 'courseEntry', containerId: origin.tableId, id: origin.courseId }).owner || ''; } catch { owner = ''; }
        host.run('items.edit', 'task', null, undefined, 'longterm', owner, origin);
      } catch (error) { nav.report(error); }
      return;
    }
    if (event.target.closest('[data-loom-now]')) {
      const mark = content.querySelector('.loom-now-mark');
      if (mark) mark.scrollIntoView({ block: 'center', behavior: 'auto' }); else surface.scrollTop = 0;
      return;
    }
    if (event.target.closest('[data-loom-today-other]')) {
      try { host.run('today.other'); } catch (error) { nav.report(error); }
      return;
    }
    // 舆图的比例尺只是读法说明，不进业务：告诉 CEO「此刻前后」那一格实际是四小时。
    const atlasScale = event.target.closest('[data-loom-scale]');
    if (atlasScale) { feedback('比例：路线按四小时为一格读——「此刻前后」是接下来四小时内的事。', 'info'); return; }
    // 夜场换幕：候场那一条被点中才上台，仍只改呈现，不写业务。
    const stageCue = event.target.closest('[data-loom-stage-cue]');
    if (stageCue) { renderer.cueStage(stageCue.dataset.loomStageCue); return; }
    const stageLight = event.target.closest('[data-loom-stage-light]');
    // 冷光是这套版式的默认，不需要额外属性；只在暖光时留下标记，再点就交回默认。
    if (stageLight) {
      if (root.dataset.loomLight === 'warm') delete root.dataset.loomLight; else root.dataset.loomLight = 'warm';
      renderer.render();
      return;
    }
    const reminderEdit=event.target.closest('[data-loom-reminder-edit]');if(reminderEdit){try{host.run('reminders.edit',reminderEdit.dataset.loomReminderEdit);}catch(error){nav.report(error);}return;}
    const stageObject = event.target.closest('[data-loom-stage-object]');
    if (stageObject) { try { host.run('objects.sheet', stageObject.dataset.loomStageObject); } catch (error) { nav.report(error); } return; }
    const step = event.target.closest('[data-loom-cal-step]');
    if (step) { try { renderer.calendarStep(Number(step.dataset.loomCalStep)); } catch (error) { nav.report(error); } return; }
    if (event.target.closest('[data-loom-cal-clear]')) { renderer.scopeCalendar(); return; }
    const calView = event.target.closest('[data-loom-cal-view]');
    if (calView) { try { renderer.setCalendarView(calView.dataset.loomCalView); } catch (error) { nav.report(error); } return; }
    if (event.target.closest('[data-loom-cal-today]')) { renderer.calendarToday(); return; }
    const goTo = event.target.closest('[data-loom-goto]');
    if (goTo) {
      try { host.navigate(goTo.dataset.loomGoto); } catch (error) { nav.report(error); }
      return;
    }
    const captureOpen = event.target.closest('[data-loom-capture-open]');
    if (captureOpen) {
      try { host.run('web-captures.open', { collection: 'capture', id: captureOpen.dataset.loomCaptureOpen }); }
      catch (error) { nav.report(error); }
      return;
    }
    const captureRow = event.target.closest('[data-loom-capture-select]');
    if (captureRow) {
      renderer.selectCapture(captureRow.dataset.loomCaptureSelect);
      if (main.dataset.activeView !== 'web-capture') host.navigate('web-capture');
      return;
    }
    const approve = event.target.closest('[data-loom-approve-draft]');
    if (approve) {
      try {
        const result = host.client('web-captures').approve(approve.dataset.loomCapture, approve.dataset.loomApproveDraft, { title: approve.dataset.loomDraftTitle, date: approve.dataset.loomDraftDate });
        renderer.selectCapture(approve.dataset.loomCapture);
        feedback(result.added ? '已加入事项，可在事项与今天中查看。' : '该行动已在事项中，未重复添加。', 'success');
      } catch (error) { nav.report(error); }
      return;
    }
    const layoutChoice = event.target.closest('[data-loom-layout-choice]');
    if (layoutChoice) { selectLayout(layoutChoice.dataset.loomLayoutChoice); return; }
    const skeletonChoice = event.target.closest('[data-loom-skeleton]');
    if (skeletonChoice) {
      try { host.run('workspace.skeleton', skeletonChoice.dataset.loomSkeleton); renderer.render(); }
      catch (error) { nav.report(error); }
      return;
    }
    const themeChoice = event.target.closest('[data-loom-theme]');
    if (themeChoice) {
      // 换配色仍走原来的命令与保存；窗口刚被预设色推过去，这里按材质强制盖回来。
      try { host.run('settings.theme', themeChoice.dataset.loomTheme); renderer.render(); chrome(true); }
      catch (error) { nav.report(error); }
      return;
    }
    const developerToggle = event.target.closest('[data-loom-developer]');
    if (developerToggle) {
      try { host.run('settings.developer', developerToggle.dataset.loomDeveloper === 'true'); renderer.render(); }
      catch (error) { nav.report(error); }
      return;
    }
    const dataAction = event.target.closest('[data-loom-action]');
    if (dataAction) {
      const kind = dataAction.dataset.loomAction;
      // 示例导入与清空数据只在开发者模式出现，命令自带门禁判断。
      if (kind === 'examples' || kind === 'reset') {
        try { if (kind === 'examples') host.run('workspace.examples', 'all'); else host.run('workspace.reset-open'); }
        catch (error) { nav.report(error); }
        return;
      }
      Promise.resolve()
        .then(() => kind === 'export' ? host.client('workspace').export() : host.client('workspace').openFolder())
        .then(result => {
          if (kind === 'export') { if (!result?.ok) throw Error(result?.message || '导出失败。'); feedback(`已导出到 ${result.path}`, 'success'); }
          else if (result?.ok === false) throw Error(result.message || '无法打开数据目录');
        })
        .catch(error => nav.report(error));
      return;
    }
    const moduleToggle = event.target.closest('[data-loom-module]');
    if (moduleToggle) {
      try { host.run('plugins.set', moduleToggle.dataset.loomModule, moduleToggle.dataset.loomModuleOn === 'true'); renderer.render(); }
      catch (error) { nav.report(error); }
      return;
    }
    if (event.target.closest('[data-loom-reminder-new]')) {
      try { host.run('reminders.new'); } catch (error) { nav.report(error); }
      return;
    }
    // 提醒的写入是异步 IPC：结果回来由 reminders:committed 重画这条线。
    const reminderState = event.target.closest('[data-loom-reminder-state]');
    if (reminderState) {
      Promise.resolve()
        .then(() => host.run('reminders.state', reminderState.dataset.loomReminderState, reminderState.dataset.loomReminderArchived === 'true'))
        .catch(error => nav.report(error));
      return;
    }
    const reminderCancel = event.target.closest('[data-loom-reminder-cancel]');
    if (reminderCancel) {
      Promise.resolve()
        .then(() => host.run('reminders.cancel', reminderCancel.dataset.loomReminderCancel))
        .then(() => feedback('提醒已从这条线上移除。', 'success'))
        .catch(error => nav.report(error));
      return;
    }
    // 「来自这节课」：回到布置它的那次课，仍走原记录路由。
    const source = event.target.closest('[data-loom-open-source]');
    if (source) {
      try { host.run('courses.edit', source.dataset.loomOpenSource, source.dataset.loomSourceDate || '', source.dataset.loomSourceTable || ''); }
      catch (error) { nav.report(error); }
      return;
    }
    // 其他页：打开原记录。仍走各插件自己的编辑命令，不复制业务。
    const openRow = event.target.closest('[data-loom-row-open]');
    if (openRow) {
      const page = main.dataset.activeView || '';
      try {
        if (page === 'plans' || page === 'calendar') host.run('items.edit', openRow.dataset.loomOpenCollection, openRow.dataset.loomRowOpen);
        else if (page === 'objects') host.run('objects.sheet', openRow.dataset.loomRowOpen);
        else if (page === 'notes') host.run('journal.open', { collection: 'journalEntry', id: openRow.dataset.loomRowOpen });
        else nav.report(Error('这一页暂不支持从这里打开。'));
      } catch (error) { nav.report(error); }
      return;
    }
    const openCourse = event.target.closest('[data-loom-open-course]');
    if (openCourse) {
      try { host.run('courses.edit', openCourse.dataset.loomOpenCourse, '', openCourse.dataset.loomCourseTable || ''); }
      catch (error) { nav.report(error); }
      return;
    }
    // 新建：仍用各页原有的新建入口。
    const create = event.target.closest('[data-loom-new]');
    if (create) {
      try {
        if (create.dataset.loomNew === 'item') host.run('items.edit', 'task', null);
        else if (create.dataset.loomNew === 'note') host.run('notes.new');
        else if (create.dataset.loomNew === 'object') host.run('objects.new');
        else if (create.dataset.loomNew === 'course') host.run('courses.settings');
      } catch (error) { nav.report(error); }
      return;
    }
    const button = event.target.closest('[data-loom-paper-action]'); if (!button || button.dataset.loomPaperAction === 'complete') return;
    try {
      const element = button.closest('[data-row]');
      const row = renderer.resolve(Number(element.dataset.row));
      if (!row || row.id !== element.dataset.id || row.ref.collection !== element.dataset.collection) throw Error('日期或安排已变化，请刷新后重试。');
      if (row.kind === '课程') host.run('courses.edit', row.ref.id, row.originalDate, row.ref.containerId);
      else host.run('items.edit', row.ref.collection, row.ref.id);
    } catch (error) { nav.report(error); renderer.render(); }
  });
  // 网页采集仍走公开服务；提交在这里接管，避免经纬页整页刷新。
  bindings.listen(content, 'submit', event => {
    const form = event.target.closest('[data-loom-collect]');
    if (!form || state.skeleton !== 'loom' || disposed) return;
    event.preventDefault();
    const url = form.querySelector('input')?.value.trim();
    if (!url) return;
    const submit = form.querySelector('button');
    if (submit) submit.disabled = true;
    host.client('web-captures').collect(url, today())
      .then(record => {
        renderer.selectCapture(record.id);
        feedback(`已整理 ${record.highlights.length} 条重点、${record.drafts.length} 项行动草稿。确认后才会加入待办。`, 'success');
      })
      .catch(error => nav.report(error))
      .finally(() => { if (submit) submit.disabled = false; });
  });
  const dispose = () => {
    if (disposed) return;
    renderer.dispose();
    for (const page of positions.keys()) restore(page);
    for (const host_ of loomHosts.values()) host_.remove();
    if (searchMarker) { searchMarker.before(searchPanel); searchMarker.remove(); searchMarker = null; }
    disposed = true; nav.dispose(); surface.hidden = true;
    delete root.dataset.workspaceSkeleton; delete root.dataset.loomLayout;
  };
  bindings.onStop(dispose);
  return { scopeCalendar: renderer.scopeCalendar, select, selectLayout, start, refresh, beforeShow, afterShow, sync, removePage: restore, dispose, current: () => ({ ...state }) };
}
