import { skeletonPresets, loomLayouts } from './skeleton.mjs';

export function createSkeletonUI({ container, bindings, onChange, onLayoutChange }) {
  const section = document.createElement('section');
  section.className = 'desktop-settings-section desktop-layout-settings';
  section.innerHTML = `<div class="desktop-section-head"><div><h2>骨架</h2><p>先选择骨架，再选择它的布局。配色独立保存。</p></div></div><div class="desktop-layout-options" role="group" aria-label="工作区骨架">${skeletonPresets.map(p => `<button type="button" data-desktop-skeleton="${p.id}" aria-pressed="false"><strong>${p.name}</strong><small>${p.copy}</small></button>`).join('')}</div><p>工作台提供原有七种布局；经纬另有四套布局。</p><div data-skeleton-section="loom" hidden><h3>经纬布局</h3><div class="desktop-layout-options" role="group" aria-label="经纬布局">${loomLayouts.map(p => `<button type="button" data-loom-layout-choice="${p.id}" aria-pressed="false"><strong>${p.name}</strong><small>${p.copy}</small></button>`).join('')}</div></div><p role="status" data-skeleton-status aria-live="polite"></p>`;
  container.prepend(section);
  const loomGroup = section.querySelector('[data-skeleton-section="loom"]');
  bindings.listen(section, 'click', event => {
    const button = event.target.closest('[data-desktop-skeleton]');
    if (button) { onChange(button.dataset.desktopSkeleton); return; }
    const layout = event.target.closest('[data-loom-layout-choice]');
    if (layout) onLayoutChange?.(layout.dataset.loomLayoutChoice);
  });
  const refresh = state => {
    section.querySelectorAll('[data-desktop-skeleton]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.desktopSkeleton === state.skeleton)));
    loomGroup.hidden = state.skeleton !== 'loom';
    section.querySelectorAll('[data-loom-layout-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.loomLayoutChoice === state.loomLayout)));
    const layoutName = (loomLayouts.find(p => p.id === state.loomLayout) || { name: '经纬' }).name;
    section.querySelector('[data-skeleton-status]').textContent = state.skeleton === 'loom' ? `已切换到经纬骨架 · ${layoutName}布局` : '当前为工作台骨架，保留原布局。';
  };
  const focus = () => {
    const selected = section.querySelector('[data-desktop-skeleton][aria-pressed="true"]');
    const target = selected?.getClientRects().length ? selected : document.querySelector('.sidebar .nav button.active:not([hidden])');
    target?.focus({ preventScroll: true });
  };
  bindings.onStop(() => { loomGroup.remove(); section.remove(); });
  return { refresh, focus };
}
