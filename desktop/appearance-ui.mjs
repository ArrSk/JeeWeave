import { themePresets, normalizeAppearance, readAppearance, saveAppearance, applyAppearance, contrastRatio, appearanceTokens } from './appearance.mjs';

export function createAppearanceUI({ container, storage, feedback, onChange = () => {} }) {
  const section = document.createElement('section'); section.className = 'desktop-appearance-settings';
  const presetButton = preset => { const tokens = appearanceTokens(normalizeAppearance(null, preset.id)); return `<button type="button" class="desktop-theme-preset" data-theme="${preset.id}" aria-label="切换到${preset.name}" aria-pressed="false"><span class="desktop-theme-mini" style="--preview-bg:${preset.colors.background};--preview-text:${preset.colors.text};--preview-panel:${tokens['--panel']};--preview-accent:${tokens['--blue']}"><span>几微 · 课程与计划</span><span class="desktop-theme-mini-row"><i></i><span>下一步，按自己的节奏</span></span></span><strong>${preset.name}</strong><small>${preset.usage}</small></button>`; };
  section.innerHTML = `<div class="desktop-section-head"><div><h2>主题与文字</h2><p>推荐样式会一起调整背景、文字、面板与按钮。</p></div><span id="desktop-current-theme" role="status"></span></div><div class="desktop-theme-presets" role="group" aria-label="推荐主题">${themePresets.slice(0, 4).map(presetButton).join('')}</div><details class="desktop-more-themes"><summary>更多配色 · 紫 / 玫瑰 / 青 / 琥珀 / 石墨</summary><div class="desktop-theme-presets" role="group" aria-label="更多主题">${themePresets.slice(4).map(presetButton).join('')}</div></details>
    <details class="desktop-custom-theme"><summary>自定义背景、文字与强调色</summary><form id="desktop-theme-form"><div class="desktop-theme-colors">${[['background', '页面背景'], ['text', '正文文字'], ['accent', '强调颜色']].map(([key, label]) => `<label>${label}<input name="${key}" type="color" aria-label="${label}" /><output data-color-value="${key}"></output></label>`).join('')}</div><div id="desktop-theme-preview" class="desktop-theme-custom-preview"><strong>每一天，都有清晰的安排</strong><p>课程、计划和待办使用统一的文字与背景配色。</p><span>课程表 · 今天 · 计划</span></div><p id="desktop-theme-contrast" role="status"></p><p class="desktop-form-error" role="alert" hidden></p><div class="desktop-form-actions"><button type="button" id="desktop-reset-theme-draft" class="secondary">恢复当前配色</button><button type="submit" class="primary">应用自定义配色</button></div></form></details>`;
  container.prepend(section);
  const form = section.querySelector('form');
  const renderDraft = () => {
    const colors = Object.fromEntries(['background', 'text', 'accent'].map(key => [key, form.elements[key].value]));
    const ratio = contrastRatio(colors.text, colors.background), preview = form.querySelector('#desktop-theme-preview');
    preview.style.backgroundColor = colors.background; preview.style.color = colors.text;
    preview.querySelector('span').style.color = colors.accent;
    form.querySelectorAll('[data-color-value]').forEach(label => { label.value = colors[label.dataset.colorValue].toUpperCase(); });
    form.querySelector('#desktop-theme-contrast').textContent = `文字 / 背景对比 ${ratio.toFixed(2)}:1${ratio >= 4.5 ? ' · 可应用' : ' · 请提高到 4.5:1 以上'}`;
    const error = form.querySelector('[role="alert"]'); error.hidden = true; error.textContent = '';
  };
  const refresh = () => {
    const current = readAppearance(storage);
    applyAppearance(current, document.documentElement);
    document.querySelectorAll('button[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === current.preset)));
    section.querySelector('#desktop-current-theme').textContent = `当前：${themePresets.find(p => p.id === current.preset)?.name || '自定义配色'}`;
    for (const key of ['background', 'text', 'accent']) form.elements[key].value = current.colors[key];
    renderDraft();
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-theme]'); if (!button) return;
    try { saveAppearance(storage, normalizeAppearance(null, button.dataset.theme)); refresh(); onChange(); feedback(`已应用「${themePresets.find(p => p.id === button.dataset.theme).name}」，背景与文字已更新。`, 'success'); }
    catch (error) { feedback(error.message, 'error'); }
  });
  form.addEventListener('input', renderDraft);
  form.querySelector('#desktop-reset-theme-draft').addEventListener('click', refresh);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const colors = Object.fromEntries(['background', 'text', 'accent'].map(key => [key, form.elements[key].value]));
      saveAppearance(storage, { schemaVersion: 1, preset: 'custom', colors }); refresh(); onChange(); feedback('自定义配色已保存，重新打开也会保留。', 'success');
    } catch (error) { const message = form.querySelector('[role="alert"]'); message.hidden = false; message.textContent = error.message; }
  });
  refresh();
  return { refresh };
}
