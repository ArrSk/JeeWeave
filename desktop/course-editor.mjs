import { editorWeeks, toggleEditorWeek, buildCourseFields } from './course-fields.mjs';
export { editorWeeks, toggleEditorWeek, buildCourseFields } from './course-fields.mjs';
import { coursePalettes } from './course-colors.mjs';
import { courseColors, readAppearance } from './appearance.mjs';

export function createCourseFormControls({ form, getTable, storage, bindings }) {
  const listen = (target,...args) => bindings ? bindings.listen(target,...args) : target?.addEventListener(...args);
  const container = form.querySelector('.desktop-course-form-grid'); container.className = 'desktop-course-web-fields';
  container.innerHTML = `<label>课程名<input name="title" required placeholder="如：高等数学 A（I）" /></label><label>教师<input name="teacher" placeholder="选填" /></label><label>教室<input name="location" placeholder="选填，如：教西 101" /></label><label>星期<select name="weekday">${[...'一二三四五六日'].map((day, i) => `<option value="${i + 1}">周${day}</option>`).join('')}</select></label><fieldset><legend>节次</legend><div class="desktop-course-period-pair"><label class="sr-only" for="desktop-course-start">开始节次</label><select id="desktop-course-start" name="periodStart" aria-label="开始节次"></select><span>至</span><label class="sr-only" for="desktop-course-end">结束节次</label><select id="desktop-course-end" name="periodEnd" aria-label="结束节次"></select></div></fieldset><fieldset><legend>颜色</legend><div class="desktop-course-color-choices"><input name="color" type="hidden" /><button type="button" data-course-color="" aria-label="自动配色">自动</button>${coursePalettes.map(p => `<button type="button" data-course-color="${p.name}" aria-label="颜色 ${p.label}" style="background:${p.bg};color:${p.text}">${p.label}</button>`).join('')}</div></fieldset><fieldset><legend>周次</legend><div class="desktop-course-week-modes">${[['all', '全周'], ['odd', '单周'], ['even', '双周']].map(([id, label]) => `<button class="secondary" type="button" data-course-week-mode="${id}">${label}</button>`).join('')}</div></fieldset><label class="desktop-course-weeks-text">自定义<input name="weeksText" placeholder="如 1-16、1-16单；留空表示每周" /></label><div class="desktop-course-week-detail"><div><span>逐周选择（点击加入或取消）</span><span id="desktop-course-week-count" role="status"></span></div><div id="desktop-course-week-choices"></div></div><p id="desktop-course-form-error" class="desktop-form-error" role="alert" hidden></p>`;
  const fields = form.elements;
  const error = text => { const node = form.querySelector('#desktop-course-form-error'); node.textContent = text; node.hidden = !text; };
  const updateWeeks = () => {
    const total = getTable().totalWeeks; let selected = [];
    try { selected = editorWeeks(fields.weeksText.value, total); error(''); } catch (e) { error(e.message); }
    const raw = fields.weeksText.value.trim(), mode = !raw || /^(每周|全周|全部周次)$/.test(raw) ? 'all' : /单周?$/.test(raw) ? 'odd' : /双周?$/.test(raw) ? 'even' : 'custom';
    form.querySelectorAll('[data-course-week-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.courseWeekMode === mode)));
    form.querySelector('#desktop-course-week-count').textContent = `已选 ${selected.length} / ${total} 周`;
    form.querySelector('#desktop-course-week-choices').innerHTML = Array.from({ length: total }, (_, i) => `<button class="secondary" type="button" data-course-week="${i + 1}" aria-label="第 ${i + 1} 周" aria-pressed="${selected.includes(i + 1)}">${i + 1}</button>`).join('');
  };
  const updateColors = () => {
    form.querySelectorAll('[data-course-color]').forEach(button => {
      const preset = coursePalettes.find(p => p.name === button.dataset.courseColor);
      if (preset) { const colors = courseColors(preset, readAppearance(storage)); button.style.backgroundColor = colors.bg; button.style.color = colors.text; }
      button.setAttribute('aria-pressed', String(button.dataset.courseColor === fields.color.value));
    });
  };
  const updateEnd = (previous = fields.periodEnd.value) => {
    const max = Math.max(getTable().schedule.length, ...getTable().courses.map(course => Number(course.periodEnd) || 0)), start = Number(fields.periodStart.value);
    fields.periodEnd.innerHTML = Array.from({ length: max - start + 1 }, (_, i) => `<option value="${start + i}">第 ${start + i} 节</option>`).join('');
    fields.periodEnd.value = String(Math.max(start, Math.min(max, Number(previous) || start)));
  };
  listen(fields.periodStart,'change', () => updateEnd()); listen(fields.weeksText,'input', updateWeeks);
  listen(form,'click', event => {
    const color = event.target.closest('[data-course-color]'); if (color) { fields.color.value = color.dataset.courseColor; updateColors(); }
    const mode = event.target.closest('[data-course-week-mode]');
    if (mode) { fields.weeksText.value = mode.dataset.courseWeekMode === 'all' ? '' : `1-${getTable().totalWeeks}${mode.dataset.courseWeekMode === 'odd' ? '单' : '双'}`; updateWeeks(); }
    const week = event.target.closest('[data-course-week]');
    if (week) { try { fields.weeksText.value = toggleEditorWeek(fields.weeksText.value, Number(week.dataset.courseWeek), getTable().totalWeeks); updateWeeks(); form.querySelector(`[data-course-week="${week.dataset.courseWeek}"]`).focus({ preventScroll: true }); } catch (e) { error(e.message); } }
  });
  return {
    error,
    load(course) {
      const table = getTable(), max = Math.max(table.schedule.length, ...table.courses.map(item => Number(item.periodEnd) || 0));
      fields.periodStart.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}">第 ${i + 1} 节</option>`).join('');
      for (const key of ['title', 'teacher', 'location']) fields[key].value = course?.[key] || '';
      fields.weekday.value = String(course?.weekday || 1); fields.periodStart.value = String(course?.periodStart || 1); updateEnd(course?.periodEnd || Math.min(max, (course?.periodStart || 1) + 1));
      fields.weeksText.value = course?.weekText || (course?.weeks || []).join(',');
      const stored = String(course?.color || '').trim(); fields.color.value = coursePalettes.find(p => p.name === stored.toLowerCase() || p.bg === stored.toLowerCase())?.name || stored;
      updateWeeks(); updateColors();
    },
    value() { return buildCourseFields(Object.fromEntries(['title', 'teacher', 'location', 'weekday', 'periodStart', 'periodEnd', 'weeksText', 'color'].map(key => [key, fields[key].value])), getTable()); },
  };
}
