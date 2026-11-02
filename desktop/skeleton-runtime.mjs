import { readSkeleton, saveSkeleton } from './skeleton.mjs';
import { createLoomNav } from './loom-nav.mjs';
import { createLoomRenderer } from './loom-render.mjs';

export function createSkeletonRuntime({ root, main, host, getPage, modules, storage, bindings, feedback, onChange, onWorkbench, beforeChange, search }) {
  const surface = main.querySelector('#loom-surface'), content = document.createElement('div');
  content.className = 'loom-content'; surface.replaceChildren(content);
  const positions = new Map(), searchPanel = document.querySelector('#desktop-search-panel');
  const renderer = createLoomRenderer({ host, bindings });
  const scrollPositions = new Map();
  let searchMarker, state = readSkeleton(storage), disposed = false, started = false, workbenchScroll = 0;
  const nav = createLoomNav({ host, surface, bindings, modules, feedback, active: () => main.dataset.activeView || 'overview', returnWorkbench: () => select('workbench'), openSearch: button => search.open(button) });
  const restore = page => {
    const marker = positions.get(page); if (!marker) return;
    // Removed dynamic plugin pages must not be resurrected.
    if (page.isConnected && marker.isConnected) marker.before(page);
    marker.remove(); positions.delete(page);
  };
  const mount = page => {
    if (!page || state.skeleton !== 'loom' || disposed) return;
    scrollPositions.set(main.dataset.activeView || 'overview', surface.scrollTop);
    renderer.setActive(page.dataset.page === 'today' ? page : null);
    for (const old of positions.keys()) if (old !== page) restore(old);
    if (!positions.has(page)) { const marker = document.createComment('loom-page-home'); page.before(marker); positions.set(page, marker); }
    content.append(page);
  };
  const apply = (next, focus = false) => {
    if (disposed) return;
    const changed = state.skeleton !== next.skeleton || !root.dataset.workspaceSkeleton, scroll = main.scrollTop;
    const wasLoom = root.dataset.workspaceSkeleton === 'loom';
    if (!wasLoom && next.skeleton === 'loom') workbenchScroll = scroll;
    if (wasLoom) scrollPositions.set(main.dataset.activeView || 'overview', surface.scrollTop);
    nav.close(); beforeChange?.(); state = next.skeleton === 'loom' ? { ...next, loomLayout: 'jingwei' } : next;
    root.dataset.workspaceSkeleton = next.skeleton;
    // Other registered layouts become selectable in phase 2.
    if (next.skeleton === 'loom') root.dataset.loomLayout = 'jingwei'; else delete root.dataset.loomLayout;
    surface.hidden = next.skeleton !== 'loom';
    if (next.skeleton === 'loom') {
      if (!searchMarker) { searchMarker = document.createComment('loom-search-home'); searchPanel.before(searchMarker); }
      nav.searchHome.append(searchPanel);
      mount(getPage(main.dataset.activeView || 'overview'));
    } else {
      renderer.setActive(null);
      for (const page of positions.keys()) restore(page);
      if (searchMarker) { searchMarker.before(searchPanel); searchMarker.remove(); searchMarker = null; }
    }
    onChange?.(state); nav.render();
    if (next.skeleton === 'workbench') onWorkbench?.(focus && changed);
    if (next.skeleton === 'loom') surface.scrollTop = scrollPositions.get(main.dataset.activeView || 'overview') || 0;
    else main.scrollTop = wasLoom ? workbenchScroll : scroll;
    if (focus && next.skeleton === 'loom') nav.focusPage();
  };
  const select = skeleton => {
    if (disposed || skeleton === state.skeleton) return false;
    try {
      if (document.querySelector('dialog[open]')) throw Error('请先保存或关闭当前编辑面板，再切换骨架。');
      const next = saveSkeleton(storage, { ...state, skeleton }); apply(next, true); return true;
    } catch (error) { nav.report(error); return false; }
  };
  const beforeShow = (_id, page) => { if (started) mount(page); };
  const afterShow = id => { if (started) { nav.render(); renderer.render(); if (state.skeleton === 'loom') surface.scrollTop = scrollPositions.get(id) || 0; } };
  const sync = () => {
    if (!started) return;
    if (state.skeleton === 'loom' && !host.inventory().pages.includes(main.dataset.activeView || 'overview')) host.navigate('overview');
    nav.render(); renderer.render();
  };
  const start = () => { if (started || disposed) return; started = true; apply(readSkeleton(storage)); };
  const refresh = () => { if (started) apply(readSkeleton(storage)); };
  bindings.listen(document, 'keydown', event => { if (started && state.skeleton === 'loom') nav.keydown(event); }, { capture: true });
  bindings.listen(content, 'click', event => {
    if (state.skeleton !== 'loom' || disposed) return;
    if (event.target.closest('[data-loom-now]')) { content.querySelector('.loom-now-mark')?.scrollIntoView({ block: 'center', behavior: 'auto' }); return; }
    if (event.target.closest('[data-loom-today-other]')) { getPage('today').querySelector('#desktop-today-other-open').click(); return; }
    // 「来自这节课」：回到布置它的那次课，仍走原记录路由。
    const source = event.target.closest('[data-loom-open-source]');
    if (source) {
      try { host.run('courses.edit', source.dataset.loomOpenSource, source.dataset.loomSourceDate || '', source.dataset.loomSourceTable || ''); }
      catch (error) { nav.report(error); }
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
  const dispose = () => {
    if (disposed) return;
    renderer.dispose();
    for (const page of positions.keys()) restore(page);
    if (searchMarker) { searchMarker.before(searchPanel); searchMarker.remove(); searchMarker = null; }
    disposed = true; nav.dispose(); surface.hidden = true;
    delete root.dataset.workspaceSkeleton; delete root.dataset.loomLayout;
  };
  bindings.onStop(dispose);
  return { select, start, refresh, beforeShow, afterShow, sync, removePage: restore, dispose, current: () => ({ ...state }) };
}
