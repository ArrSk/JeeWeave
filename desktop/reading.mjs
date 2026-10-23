export const readingKey = 'jiwei-desktop-reading-v1';
export function normalizeReading(value) {
  if (value == null) return { schemaVersion: 1, size: 'standard', density: 'compact' };
  if (value.schemaVersion !== 1 || !['standard', 'large'].includes(value.size) || !['compact', 'comfortable'].includes(value.density)) throw Error('阅读设置格式无效，请保留原数据后检查版本。');
  return { ...value };
}
export function applyReading(value, root) { const next = normalizeReading(value); root.dataset.readingSize = next.size; root.dataset.density = next.density; }
export function createReadingUI({ container, storage, onChange, feedback, bindings }) {
  const listen = (target,...args) => bindings ? bindings.listen(target,...args) : target?.addEventListener(...args);
  const section = document.createElement('section'); section.className = 'desktop-settings-section';
  section.innerHTML = `<h2>阅读与显示</h2>${[['size','阅读字号',[['standard','标准字号'],['large','大字模式']]],['density','课表密度',[['compact','紧凑'],['comfortable','宽松']]]].map(([key,label,options])=>`<fieldset class="desktop-reading-group"><legend>${label}</legend><div class="desktop-filter-buttons">${options.map(([value,title])=>`<button class="secondary" type="button" data-reading-field="${key}" data-reading-value="${value}" aria-pressed="false">${title}</button>`).join('')}</div></fieldset>`).join('')}<p class="desktop-section-copy">字号作用于今天、事项、课程卡片和日历正文；宽松模式增加课表行高。自动保存到本地数据。</p>`;
  container.prepend(section);
  const refresh = () => { const next = normalizeReading(JSON.parse(storage.getItem(readingKey) || 'null')); applyReading(next, document.documentElement); section.querySelectorAll('[data-reading-field]').forEach(b=>b.setAttribute('aria-pressed', String(next[b.dataset.readingField]===b.dataset.readingValue))); };
  listen(section,'click', event => { const b = event.target.closest('[data-reading-field]'); if (!b) return; try { const next = normalizeReading({ ...normalizeReading(JSON.parse(storage.getItem(readingKey)||'null')), [b.dataset.readingField]: b.dataset.readingValue }); storage.setItem(readingKey,JSON.stringify(next)); refresh(); onChange(); feedback('阅读显示设置已保存。','success'); } catch(error) { feedback(error.message,'error'); } });
  refresh(); return { refresh };
}
