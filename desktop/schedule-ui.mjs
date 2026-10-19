import { defaultScheduleBatch, inferScheduleBatch, generateSchedule, validateSchedule } from './schedule.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createScheduleEditor({ section, getTable, updateTable, refreshTimetable, feedback, defaultSchedule }) {
  const form = document.createElement('form'); form.id = 'desktop-schedule-batch-form'; form.className = 'desktop-schedule-batch-form';
  form.innerHTML = `<div class="desktop-section-head"><div><h3>批量安排课程时间</h3><p>先生成预览，确认后再保存到当前课表。</p></div></div><div class="desktop-schedule-groups">${defaultScheduleBatch().groups.map(group => `<fieldset><legend>${group.label}</legend><label>开始时间<input name="${group.id}Start" type="time" required /></label><label>节数<input name="${group.id}Count" type="number" min="0" max="20" required /></label></fieldset>`).join('')}</div><div class="desktop-schedule-intervals"><label>每节课时长（分钟）<input name="duration" type="number" min="1" max="180" required /></label><label>普通课间隔（分钟）<input name="gap" type="number" min="0" max="120" required /></label><label>每几节设大课间<input name="longBreakEvery" type="number" min="0" max="20" required /></label><label>大课间总间隔（分钟）<input name="longBreak" type="number" min="0" max="180" required /></label></div><p class="desktop-section-copy">某时段填 0 节可关闭；大课间频次填 0 表示关闭。大课间总间隔会替代普通课间隔，分时段重新计数。</p><p role="alert" class="desktop-form-error" hidden></p><div class="desktop-form-actions"><button type="submit" class="secondary">生成时间预览</button></div>`;
  const list = section.querySelector('#desktop-period-list'), save = section.querySelector('#desktop-save-schedule');
  const status = document.createElement('p'); status.id = 'desktop-schedule-draft-status'; status.className = 'desktop-schedule-draft-status'; status.setAttribute('role', 'status');
  list.before(form, status);
  let config, tableId, dirty = false;
  const minimumPeriods = () => Math.max(0, ...getTable().courses.map(course => Number(course.periodEnd) || 0));
  const setStatus = text => { status.textContent = text; };
  const showError = text => { const output = form.querySelector('[role="alert"]'); output.hidden = !text; output.textContent = text; };
  const renderPeriods = schedule => { list.innerHTML = schedule.map(period => `<label><span>第 ${escape(period.index)} 节</span><input data-period-index="${escape(period.index)}" data-period-part="start" aria-label="第 ${escape(period.index)} 节开始时间" type="time" value="${escape(period.start)}" /><input data-period-index="${escape(period.index)}" data-period-part="end" aria-label="第 ${escape(period.index)} 节结束时间" type="time" value="${escape(period.end)}" /></label>`).join(''); };
  const syncInputs = () => {
    for (const group of defaultScheduleBatch().groups) form.elements[`${group.id}Start`].disabled = Number(form.elements[`${group.id}Count`].value) === 0;
    form.elements.longBreak.disabled = Number(form.elements.longBreakEvery.value) === 0;
  };
  const fill = value => { config = structuredClone(value); for (const key of ['duration', 'gap', 'longBreakEvery', 'longBreak']) form.elements[key].value = value[key]; for (const group of value.groups) { form.elements[`${group.id}Start`].value = group.start; form.elements[`${group.id}Count`].value = group.count; } syncInputs(); };
  const refresh = () => { const table = getTable(); tableId = table.id; dirty = false; save.disabled = false; fill(table.scheduleBatch || inferScheduleBatch(table.schedule)); renderPeriods(table.schedule); showError(''); setStatus(`当前已保存 ${table.schedule.length} 节，可在下方逐节微调。`); };
  form.addEventListener('input', () => { dirty = true; save.disabled = true; syncInputs(); setStatus('批量参数已调整，请先生成时间预览，再保存。'); });
  form.addEventListener('submit', event => {
    event.preventDefault(); showError('');
    try {
      const next = { schemaVersion: 1, ...Object.fromEntries(['duration', 'gap', 'longBreakEvery', 'longBreak'].map(key => [key, Number(form.elements[key].value)])), groups: defaultScheduleBatch().groups.map(group => ({ ...group, start: form.elements[`${group.id}Start`].value, count: Number(form.elements[`${group.id}Count`].value) })) };
      const schedule = generateSchedule(next, minimumPeriods()); config = next; renderPeriods(schedule); dirty = false; save.disabled = false;
      setStatus(`已生成 ${schedule.length} 节时间预览，尚未保存。也可以逐节微调后保存。`);
    } catch (error) { showError(error.message); }
  });
  section.querySelector('#desktop-reset-schedule').addEventListener('click', () => {
    try { const schedule = validateSchedule(defaultSchedule(), minimumPeriods()); fill(inferScheduleBatch(schedule)); renderPeriods(schedule); dirty = false; save.disabled = false; showError(''); setStatus('已载入默认 12 节预览，点击保存后生效。'); }
    catch (error) { showError(error.message); }
  });
  list.addEventListener('input', () => { if (!dirty) setStatus('逐节时间已调整，尚未保存。'); });
  save.addEventListener('click', () => {
    try {
      if (dirty) throw new Error('请先生成时间预览。');
      if (getTable().id !== tableId) throw new Error('当前课表已切换，请重新打开作息设置。');
      const schedule = [...list.querySelectorAll('[data-period-part="start"]')].map(input => ({ index: Number(input.dataset.periodIndex), start: input.value, end: list.querySelector(`[data-period-index="${input.dataset.periodIndex}"][data-period-part="end"]`).value }));
      updateTable({ schedule: validateSchedule(schedule, minimumPeriods()), scheduleBatch: config }); refreshTimetable(); showError(''); setStatus(`已保存 ${schedule.length} 节课的作息时间。`); feedback('当前课表的课程时间已保存。', 'success');
    } catch (error) { showError(error.message); feedback(error.message, 'error'); }
  });
  return { refresh };
}
