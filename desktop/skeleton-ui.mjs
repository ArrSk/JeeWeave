import { skeletonPresets } from './skeleton.mjs';

export function createSkeletonUI({ container, bindings, onChange }) {
  const section = document.createElement('section');
  section.className = 'desktop-settings-section desktop-layout-settings';
  section.innerHTML = `<div class="desktop-section-head"><div><h2>骨架</h2><p>先选择骨架，再选择它的布局。配色独立保存。</p></div></div><div class="desktop-layout-options" role="group" aria-label="工作区骨架">${skeletonPresets.map(p => `<button type="button" data-desktop-skeleton="${p.id}" aria-pressed="false"><strong>${p.name}</strong><small>${p.copy}</small></button>`).join('')}</div><p>工作台提供原有七种布局；经纬已接入真实页面；其余三套布局待接入。</p><div data-skeleton-section="loom" hidden><h3>经纬布局</h3><div class="desktop-layout-options" role="group" aria-label="经纬布局"><button type="button" data-loom-layout-choice="jingwei" aria-pressed="true"><strong>经纬</strong><small>现在 · 本周 · 长线</small></button></div><p class="loom-layouts-note">经纬布局已接入。涟漪、舆图、夜场三套待接入，完成后再开放选择。</p></div><p role="status" data-skeleton-status aria-live="polite"></p>`;
  container.prepend(section);
  const loomGroup = section.querySelector('[data-skeleton-section="loom"]');
  bindings.listen(section, 'click', event => {
    const button = event.target.closest('[data-desktop-skeleton]');
    if (button) onChange(button.dataset.desktopSkeleton);
  });
  const refresh = state => {
    section.querySelectorAll('[data-desktop-skeleton]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.desktopSkeleton === state.skeleton)));
    loomGroup.hidden = state.skeleton !== 'loom';
    loomGroup.querySelectorAll('[data-loom-layout-choice]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.loomLayoutChoice === state.loomLayout)));
    section.querySelector('[data-skeleton-status]').textContent = state.skeleton === 'loom' ? '已切换到经纬骨架 · 经纬布局' : '当前为工作台骨架，保留原布局。';
  };
  const focus = () => {
    const selected = section.querySelector('[data-desktop-skeleton][aria-pressed="true"]');
    const target = selected?.getClientRects().length ? selected : document.querySelector('.sidebar .nav button.active:not([hidden])');
    target?.focus({ preventScroll: true });
  };
  bindings.onStop(() => { loomGroup.remove(); section.remove(); });
  return { refresh, focus };
}
