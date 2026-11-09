export const readingKey = 'jiwei-desktop-reading-v1';
export function normalizeReading(value) {
  if (value == null) return { schemaVersion: 1, size: 'standard', density: 'compact' };
  if (value.schemaVersion !== 1 || !['small', 'standard', 'medium', 'large', 'extra-large'].includes(value.size) || !['compact', 'comfortable'].includes(value.density)) throw Error('阅读设置格式无效，请保留原数据后检查版本。');
  return { ...value };
}
export function applyReading(value, root) { const next = normalizeReading(value); root.dataset.readingSize = next.size; root.dataset.density = next.density; }
export function createReadingUI({ container, courseDisplay, storage, onChange, feedback, bindings }) {
  const listen = (target,...args) => bindings ? bindings.listen(target,...args) : target?.addEventListener(...args);
  const section = document.createElement('section'); section.className = 'desktop-settings-section';
  const group = (key,label,options) => `<fieldset class="desktop-reading-group"><legend>${label}</legend><div class="desktop-filter-buttons">${options.map(([value,title])=>`<button class="secondary" type="button" data-reading-field="${key}" data-reading-value="${value}" aria-pressed="false">${title}</button>`).join('')}</div></fieldset>`;
  section.innerHTML = `<h2>阅读与显示</h2>${group('size','阅读字号',[['small','小号'],['standard','标准'],['medium','中大'],['large','大号'],['extra-large','特大']])}<p class="desktop-reading-preview">今天，把值得做的事情安排好。</p><p class="desktop-section-copy">字号作用于今天、事项、课程卡片、笔记和日历正文。课表密度请在课程表的「课表设置 → 课表显示」中调整。自动保存到本地数据。</p>`;
  courseDisplay.innerHTML = `<h3>课表显示</h3>${group('density','课表密度',[['compact','紧凑'],['comfortable','宽松']])}<p class="desktop-section-copy">宽松模式增加课表行高。显示偏好适用于本机所有课表，自动保存。</p>`;
  container.prepend(section);
  const refresh = () => { const next = normalizeReading(JSON.parse(storage.getItem(readingKey) || 'null')); applyReading(next, document.documentElement); for(const root of [section,courseDisplay])root.querySelectorAll('[data-reading-field]').forEach(b=>b.setAttribute('aria-pressed', String(next[b.dataset.readingField]===b.dataset.readingValue))); };
  const update = event => { const b = event.target.closest('[data-reading-field]'); if (!b) return; try { const next = normalizeReading({ ...normalizeReading(JSON.parse(storage.getItem(readingKey)||'null')), [b.dataset.readingField]: b.dataset.readingValue }); storage.setItem(readingKey,JSON.stringify(next)); refresh(); onChange(); feedback('阅读显示设置已保存。','success'); } catch(error) { feedback(error.message,'error'); } };
  listen(section,'click',update);listen(courseDisplay,'click',update);
  refresh(); return { refresh };
}
