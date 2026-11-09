import { createCourseOverlay } from './course-overlay.mjs';
import { describeItem, suggestExecutionTime, isComplete } from './planning.mjs';
import { today, weekdayOf } from '../shared/packages/core/src/semester-calendar.mjs';
import { escapeHtml as esc } from './ui-text.mjs';

export function createItemScheduleUI({ main, items, bindings, feedback, onSave }) {
  const listen = (target, ...args) => bindings ? bindings.listen(target, ...args) : target.addEventListener(...args);
  const form = document.createElement('form'); form.id = 'desktop-item-schedule-form'; form.className = 'panel desktop-item-editor'; form.hidden = true;
  form.innerHTML = `<div class="panel-head"><h2 id="desktop-item-schedule-title">安排时间</h2><button type="button" class="secondary" data-schedule-close>取消</button></div><div class="desktop-item-fields"><p class="wide desktop-section-copy" id="desktop-item-schedule-context"></p><label>开始<input name="start" type="datetime-local" required /></label><label>结束<input name="end" type="datetime-local" required /></label><label class="wide">这段时间做什么（可选）<input name="label" maxlength="160" placeholder="例如：做题、训练或检查" /></label><label class="wide" id="desktop-item-schedule-phase" hidden>所属阶段<select name="phaseId"></select></label><label class="wide" id="desktop-item-schedule-occurrence" hidden>原定重复日期<input name="occurrenceDate" type="date" /><small>只安排这一次的执行时间，其他日期的重复规则保持不变。</small></label><p class="wide desktop-section-copy">只增加执行时段，原截止、来源和对象归属保持不变。</p></div><p class="desktop-form-error" role="alert" hidden></p><div class="desktop-form-actions"><button type="button" class="secondary" data-schedule-close>取消</button><button type="submit" class="primary">保存安排</button></div>`;
  let editing = null;
  const overlay = createCourseOverlay({ main, surface: main, panels: [form], bindings, id: 'desktop-item-schedule-dialog', fitViewport: true, onClose: () => { editing = null; } });
  const error = text => { const node = form.querySelector('[role=alert]'); node.textContent = text; node.hidden = !text; };
  listen(form, 'click', event => { if (event.target.closest('[data-schedule-close]')) overlay.close(); });
  listen(form, 'submit', event => {
    event.preventDefault(); if (!editing) return;
    const { ref, id, expected } = editing, f = form.elements;
    try { items.schedule(ref, { id, label: f.label.value, start: f.start.value + ':00+08:00', end: f.end.value + ':00+08:00', phaseId: f.phaseId.value, occurrenceDate: f.occurrenceDate.value }, { expected }); }
    catch (failure) { error(failure.message + ' 输入仍在这里，未重复创建事项。'); return; }
    overlay.close();
    try { onSave(ref); feedback('执行时段已保存，原截止与归属保持不变。', 'success'); }
    catch (failure) { feedback('安排已保存，但视图刷新失败，请重新打开页面：' + failure.message, 'error'); }
  });
  return {
    open(ref, { date = today(), returnFocus } = {}) {
      const item = items.get(ref), requestedDate = date; weekdayOf(date);
      if (item.anchor.type !== 'weekly' && isComplete(item, date)) throw Error('事项已完成，请先恢复再安排。');
      if (item.anchor.type === 'range') date = date < item.anchor.start ? item.anchor.start : date > item.anchor.end ? item.anchor.end : date;
      const proposed = suggestExecutionTime(date), f = form.elements;
      form.reset(); f.start.value = proposed.start; f.end.value = proposed.end;
      f.phaseId.innerHTML = '<option value="">整体事项</option>' + item.phases.filter(phase => !phase.done).map(phase => `<option value="${esc(phase.id)}">${esc(phase.title)}</option>`).join('');
      form.querySelector('#desktop-item-schedule-phase').hidden = item.anchor.type !== 'range';
      f.phaseId.disabled = item.anchor.type !== 'range';
      form.querySelector('#desktop-item-schedule-occurrence').hidden = item.anchor.type !== 'weekly';
      f.occurrenceDate.disabled = item.anchor.type !== 'weekly'; f.occurrenceDate.required = item.anchor.type === 'weekly';
      if (item.anchor.type === 'weekly') {
        let candidate = date < item.anchor.startDate ? item.anchor.startDate : date;
        for (let count = 0; count < 7; count++) {
          if (item.anchor.weekdays.includes(weekdayOf(candidate)) && !isComplete(item, candidate) && (!item.anchor.until || candidate <= item.anchor.until)) { f.occurrenceDate.value = candidate; break; }
          candidate = new Date(Date.parse(candidate + 'T12:00:00Z') + 86400000).toISOString().slice(0,10);
        }
      }
      form.querySelector('#desktop-item-schedule-context').textContent = item.title + ' · ' + describeItem(item) + (date !== requestedDate ? ' · 所选日期不在计划区间内，默认使用区间内日期，请核对。' : '');
      error(''); editing = { ref: { ...ref }, expected: JSON.stringify(item), id: 'slot_' + crypto.randomUUID() };
      overlay.show(form, { labelledBy: 'desktop-item-schedule-title', focus: f.start, returnFocus });
    },
    close: () => overlay.close({ restoreFocus: false, force: true }),
  };
}
