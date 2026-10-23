import { createPageMotion } from './page-motion.mjs';
import { createCourseOverlay } from './course-overlay.mjs';
import { typeOf, planTypes, describeItem, isComplete, isOverdue, sortItems, itemTimeParts, describeExecutionSlot } from './planning.mjs';
import { today } from '../shared/packages/core/src/semester-calendar.mjs';

import { escapeHtml as escape } from './ui-text.mjs';
export function createPlanningUI({ plansPanel, items, enabled = () => true, feedback, onChange, bindings, onOpenSource = () => {} }) {
  const listen = (target,...args) => bindings ? bindings.listen(target,...args) : target?.addEventListener(...args);
  const motion = createPageMotion(undefined, 'desktop-planning-change');
  let editing = null, filter = 'all';
  const filters = { all: '全部', todo: '待办', event: '事件 / 考试', range: '阶段计划', weekly: '重复', completed: '已完成' };
  const hints = { deadline: '记录最晚完成日期，可精确到几点几分。', longterm: '暂时不设日期，保留在清单里。', event: '当天有明确起止时间的事件或考试；填写日期及起止时间，地点和准备材料可写在备注中。', allDay: '只指定日期，不占用具体时段。', range: '在一段日期内推进，可以细分阶段；具体时段与完成期限分别保存。', weekly: '选择重复星期；每次的完成状态独立记录。' };
  plansPanel.innerHTML = `<div class="intro desktop-page-head"><div><h1>事项</h1><p>把要完成的事与时间安排放在一起，按需要设置期限、时段或阶段。</p></div><button id="desktop-add-plan" class="primary" type="button">添加事项</button></div>
    <section class="panel desktop-items-panel"><div class="desktop-list-toolbar"><div class="desktop-filter-buttons" aria-label="事项分类">${Object.entries(filters).map(([key, label]) => `<button type="button" class="secondary" data-item-filter="${key}" aria-pressed="${key === 'all'}">${label}</button>`).join('')}</div><span id="desktop-plan-total" role="status"></span></div><div id="desktop-plan-list" class="desktop-list"></div></section>
    <form id="desktop-plan-form" class="panel desktop-item-editor" hidden><div class="panel-head"><h2 id="desktop-plan-form-title">添加事项</h2><button id="desktop-close-plan" type="button" class="icon-button" aria-label="关闭事项编辑"><svg viewBox="0 0 24 24" class="desktop-icon" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <div class="desktop-item-fields"><label class="wide">事项名称<input name="title" required maxlength="160" placeholder="例如：完成作业、课程考试或项目讨论" /></label><label class="wide">时间安排<select name="type" aria-describedby="desktop-item-type-hint">${Object.entries(planTypes).map(([key, title]) => `<option value="${key}">${title}</option>`).join('')}</select><small id="desktop-item-type-hint"></small></label>
      <fieldset data-plan-field="dates"><label><span id="desktop-plan-date-label">截止日期</span><input name="date" type="date" /></label><label data-plan-field="endDate">结束日期<input name="endDate" type="date" /></label></fieldset>
      <label data-plan-field="timed" class="desktop-checkbox-label"><input name="timed" type="checkbox" />指定具体时段</label>
      <fieldset data-plan-field="times"><label><span id="desktop-plan-time-label">开始时间</span><input name="startTime" type="time" /></label><label data-plan-field="endTime">结束时间<input name="endTime" type="time" /></label></fieldset>
      <fieldset data-plan-field="weekly" class="wide"><legend>每周重复</legend><div class="desktop-weekday-choices">${[...'一二三四五六日'].map((day, i) => `<label><input name="weekdays" type="checkbox" value="${i + 1}" />周${day}</label>`).join('')}</div><label>重复结束日期（可选）<input name="until" type="date" /></label></fieldset>
      <fieldset data-plan-field="deadline" class="wide desktop-secondary-fields"><legend>完成期限（可选）</legend><p>执行区间与最后完成时间分别保存。</p><div class="desktop-field-pair"><label>截止日期<input name="deadlineDate" type="date" /></label><label>截止时间<input name="deadlineTime" type="time" /></label></div></fieldset>
      <label class="wide">备注<textarea name="note" rows="2" maxlength="4000" placeholder="目标、地点或准备材料（可选）"></textarea></label></div>
      <section data-plan-field="phases" class="desktop-phase-editor"><div class="desktop-section-head"><div><h3>阶段任务</h3><p>可不设日期；填写日期时必须位于计划区间内。</p></div><button type="button" id="desktop-add-phase" class="secondary">添加阶段</button></div><div id="desktop-phase-rows"></div></section>
      <p role="alert" class="desktop-form-error" hidden></p><div class="desktop-form-actions"><button id="desktop-cancel-plan" type="button" class="secondary">取消</button><button type="submit" class="primary">保存事项</button></div></form>`;
  const form = plansPanel.querySelector('#desktop-plan-form'), phaseRows = plansPanel.querySelector('#desktop-phase-rows');
  const context=document.createElement('label');context.className='wide';context.innerHTML='所属对象（可选）<select name="objectId"></select><button type="button" class="secondary" id="desktop-item-open-object" hidden>查看对象全貌</button>';
  form.querySelector('.desktop-item-fields').append(context);
  const slotsSection = document.createElement('section'); slotsSection.className = 'desktop-slot-editor';
  slotsSection.innerHTML = '<div class="desktop-section-head"><div><h3>执行安排（可选）</h3><p>执行安排是准备做这件事的时间，截止是最晚完成时间。可安排多段；调整时段不会改变截止，也不会新增事项或自动完成。</p></div><button type="button" class="secondary" id="desktop-add-slot">添加时段</button></div><p class="desktop-section-copy" id="desktop-slot-hint" hidden>阶段和每周重复事项暂不支持独立执行安排；已有时段需先移除再更改类型。</p><div id="desktop-slot-rows"></div>';
  form.querySelector('.desktop-form-error').before(slotsSection);
  const slotRows = slotsSection.querySelector('#desktop-slot-rows');
  const sourceButton = document.createElement('button'); sourceButton.type = 'button'; sourceButton.className = 'secondary'; sourceButton.id = 'desktop-item-open-source'; sourceButton.textContent = '返回原笔记'; sourceButton.hidden = true;
  form.querySelector('.desktop-form-actions').prepend(sourceButton);
  const slotRow = (slot = {}) => {
    const row = document.createElement('div'); row.className = 'desktop-slot-row'; row._slot = slot;
    const start = slot.start ? itemTimeParts(slot.start) : { date: today(), time: '19:00' }, end = slot.end ? itemTimeParts(slot.end) : { date: start.date, time: '20:00' };
    row.innerHTML = `<label class="wide">这段时间做什么<input data-slot-field="label" maxlength="160" value="${escape(slot.label || '')}" placeholder="例如：做题、检查或提交（可不填）" /></label><label>开始日期<input data-slot-field="startDate" type="date" value="${start.date}" required /></label><label>开始时间<input data-slot-field="startTime" type="time" value="${start.time}" required /></label><label>结束日期<input data-slot-field="endDate" type="date" value="${end.date}" required /></label><label>结束时间<input data-slot-field="endTime" type="time" value="${end.time}" required /></label><button type="button" class="secondary" data-remove-slot>移除这段</button>`;
    slotRows.append(row); return row;
  };
  let originalOwner='';
  const errorText = text => { const message = form.querySelector('[role="alert"]'); message.textContent = text; message.hidden = !text; };
  const overlay = createCourseOverlay({ bindings, surface: plansPanel, main: plansPanel.closest('main'), panels: [form], id: 'desktop-plan-dialog', fitViewport: true, onClose: () => { editing = null; } });
  const phaseRow = (phase = {}) => {
    const row = document.createElement('div'); row.className = 'desktop-phase-row'; row.dataset.phaseId = phase.id || ''; row._phase = phase;
    row.innerHTML = `<label>阶段名称<input data-phase-field="title" required maxlength="160" value="${escape(phase.title)}" /></label><label>开始日期<input data-phase-field="startDate" type="date" value="${escape(phase.startDate)}" /></label><label>结束日期<input data-phase-field="endDate" type="date" value="${escape(phase.endDate)}" /></label><button type="button" class="secondary danger-button" data-remove-phase>移除</button>`;
    phaseRows.append(row); return row;
  };
  const syncFields = () => {
    const type = form.elements.type.value, timed = form.elements.timed.checked, event = type === 'event';
    // Preserve overnight events from older backups, including their end date.
    const crossDay = event && editing?.anchor.type === 'absolute' && itemTimeParts(editing.anchor.start).date !== itemTimeParts(editing.anchor.end).date;
    const show = { dates: type !== 'longterm', endDate: type === 'range' || crossDay, timed: ['range', 'weekly'].includes(type), times: type === 'deadline' || event || timed && ['range', 'weekly'].includes(type), endTime: type !== 'deadline', weekly: type === 'weekly', deadline: ['range', 'event', 'allDay', 'weekly'].includes(type), phases: type === 'range' };
    for (const [key, visible] of Object.entries(show)) form.querySelector(`[data-plan-field="${key}"]`).hidden = !visible;
    form.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !!input.closest('[hidden]'); });
    form.elements.date.required = type !== 'longterm'; form.elements.endDate.required = show.endDate;
    form.elements.startTime.required = event || timed && ['range', 'weekly'].includes(type); form.elements.endTime.required = form.elements.startTime.required;
    form.querySelector('#desktop-plan-date-label').textContent = type === 'deadline' ? '截止日期' : ['event', 'allDay'].includes(type) ? '日期' : '开始日期';
    form.querySelector('#desktop-plan-time-label').textContent = type === 'deadline' ? '截止时间（可选）' : '开始时间';
    form.querySelector('#desktop-item-type-hint').textContent = hints[type];
    const supported = !['range', 'weekly'].includes(type);
    slotsSection.hidden = !supported && !slotRows.children.length;
    slotsSection.querySelector('#desktop-add-slot').disabled = !supported;
    slotsSection.querySelector('#desktop-slot-hint').hidden = supported;
  };
  const open = (item = null, date = '', preferredType, objectId = '') => {
    if (item) item = items.get({ collection: item.kind, id: item.id });
    editing = item; form.hidden = false; form.reset(); phaseRows.replaceChildren(); slotRows.replaceChildren(); errorText('');
    const a = item?.anchor, f = form.elements, start = a?.type === 'absolute' ? itemTimeParts(a.start) : null, end = a?.type === 'absolute' ? itemTimeParts(a.end) : null;
    f.title.value = item?.title || ''; f.type.value = item ? typeOf(item) : preferredType || 'deadline';
    f.date.value = start?.date || a?.date || a?.start || a?.startDate || date || (preferredType === 'longterm' ? '' : today());
    f.endDate.value = end?.date || a?.end || f.date.value;
    f.timed.checked = !!(a?.startTime || start);
    f.startTime.value = start?.time || a?.time || a?.startTime || ''; f.endTime.value = end?.time || a?.endTime || '';
    f.until.value = a?.until || ''; f.deadlineDate.value = item?.deadline?.date || ''; f.deadlineTime.value = item?.deadline?.time || ''; f.note.value = item?.note || '';
    form.querySelectorAll('[name="weekdays"]').forEach(input => { input.checked = (a?.weekdays || [1]).includes(Number(input.value)); });
    for (const phase of item?.phases || []) phaseRow(phase);
    for (const slot of item?.executionSlots || []) slotRow(slot);
    sourceButton.hidden = !item?.sourceRef; sourceButton.disabled = !enabled('notes');
    form.querySelector('#desktop-plan-form-title').textContent = item ? '编辑事项' : '添加事项';
    const state=items.context(item?{collection:item.kind,id:item.id}:null);
    originalOwner=state.owner;
    const available=state.objects;
    f.objectId.innerHTML='<option value="">独立事项 · 暂不关联</option>'+available.map(o=>`<option value="${escape(o.id)}">${escape(o.title)}${o.status==='archived'?'（已归档）':''}</option>`).join('');
    if(originalOwner&&!available.some(o=>o.id===originalOwner))f.objectId.insertAdjacentHTML('beforeend',`<option value="${escape(originalOwner)}">原归属暂不可见（保留）</option>`);
    f.objectId.value=objectId||originalOwner;context.hidden=!enabled('objects');
    const back=form.querySelector('#desktop-item-open-object');back.hidden=!originalOwner||!enabled('objects');back.dataset.openObject=originalOwner;
    syncFields(); overlay.show(form, { labelledBy: 'desktop-plan-form-title', focus: f.title, returnFocus: [...plansPanel.querySelectorAll('[data-item-action="edit"]')].find(button => button.dataset.id === item?.id && button.dataset.kind === item?.kind) || plansPanel.querySelector('#desktop-add-plan') });
  };
  listen(form,'change', event => { if (['type', 'timed'].includes(event.target.name)) { syncFields(); motion(form); } });
  listen(plansPanel.querySelector('#desktop-add-plan'),'click', () => open(null, '', enabled('tasks') ? 'deadline' : 'event'));
  for (const id of ['desktop-cancel-plan', 'desktop-close-plan']) listen(plansPanel.querySelector(`#${id}`),'click', () => overlay.close());
  listen(plansPanel.querySelector('#desktop-add-phase'),'click', () => { const row = phaseRow(); syncFields(); row.querySelector('input').focus(); });
  listen(phaseRows,'click', event => { event.target.closest('[data-remove-phase]')?.closest('.desktop-phase-row').remove(); });
  listen(slotsSection.querySelector('#desktop-add-slot'), 'click', () => { slotRow().querySelector('input').focus(); });
  listen(slotRows, 'click', event => { event.target.closest('[data-remove-slot]')?.closest('.desktop-slot-row').remove(); syncFields(); });
  listen(sourceButton, 'click', () => { try { onOpenSource(editing.sourceRef); } catch (error) { errorText(error.message); } });
  listen(form,'submit', event => {
    event.preventDefault(); errorText('');
    try {
      const f = form.elements, type = f.type.value;
      if (type !== 'range' && phaseRows.children.length) throw Error('此事项已有阶段，请先在阶段计划类型中移除阶段，再更改时间安排。');
      const fields = { type, title: f.title.value, date: f.date.value, endDate: f.endDate.disabled ? f.date.value : f.endDate.value, startTime: f.startTime.disabled ? '' : f.startTime.value, endTime: f.endTime.value, timed: type === 'event' || !f.timed.disabled && f.timed.checked, weekdays: [...form.querySelectorAll('[name="weekdays"]:checked')].map(input => Number(input.value)), until: f.until.value, deadlineDate: f.deadlineDate.disabled ? '' : f.deadlineDate.value, deadlineTime: f.deadlineTime.disabled ? '' : f.deadlineTime.value, note: f.note.value, phases: [...phaseRows.children].map(row => ({ ...row._phase, ...Object.fromEntries([...row.querySelectorAll('[data-phase-field]')].map(input => [input.dataset.phaseField, input.value])) })) };
      if (slotRows.children.length || editing?.executionSlots !== undefined) fields.executionSlots = [...slotRows.children].map(row => {
        const values = Object.fromEntries([...row.querySelectorAll('[data-slot-field]')].map(input => [input.dataset.slotField, input.value]));
        return { ...row._slot, label: values.label, start: `${values.startDate}T${values.startTime}:00+08:00`, end: `${values.endDate}T${values.endTime}:00+08:00` };
      });
      items.save(fields, { ref: editing ? { collection: editing.kind, id: editing.id } : null, objectId: f.objectId.value, originalOwner });
      overlay.close(); refresh(); feedback('事项及归属已保存，日历中的时间安排已同步更新。', 'success');
    } catch (error) { errorText(error.message); }
  });
  const row = item => {
    const complete = isComplete(item, today()), over = isOverdue(item, today(), new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const attrs = action => `data-item-action="${action}" data-kind="${item.kind}" data-id="${escape(item.id)}" data-${item.kind}-${action}="${escape(item.id)}"`;
    const state=items.context({collection:item.kind,id:item.id}),object=state.objects.find(o=>o.id===state.owner);
    const contextButton=object&&enabled('objects')?`<button type="button" class="desktop-object-context" data-open-object="${escape(object.id)}">所属：${escape(object.title)}${object.status==='archived'?' · 已归档':''}</button>`:'';
    return `<article class="desktop-planning-item ${complete ? 'is-done' : ''}" data-item-id="${escape(item.id)}" data-kind="${item.kind}"><div class="desktop-list-item"><button type="button" role="checkbox" aria-checked="${complete}" aria-label="${complete ? '恢复' : '完成'}${escape(item.title)}${item.anchor.type === 'weekly' ? '（本次）' : ''}" class="desktop-check" ${attrs('toggle')}>${complete ? '✓' : ''}</button><div><div class="desktop-item-title"><strong>${escape(item.title)}</strong><span class="desktop-item-type ${over ? 'is-overdue' : ''}">${over ? '已逾期' : planTypes[typeOf(item)]}</span></div><small>${escape(describeItem(item))}</small>${contextButton}${item.executionSlots?.length ? `<ul class="desktop-execution-summary">${item.executionSlots.map(slot=>`<li>${escape(describeExecutionSlot(slot))}</li>`).join('')}</ul>` : ''}${item.note ? `<p class="desktop-item-note">${escape(item.note)}</p>` : ''}${item.phases.length ? `<small>${item.phases.filter(p => p.done).length} / ${item.phases.length} 阶段已完成</small>` : ''}</div><button class="secondary" type="button" ${attrs('edit')}>编辑</button><button class="desktop-inline-delete" type="button" ${attrs('delete')} aria-label="删除${escape(item.title)}">删除</button></div>${item.phases.length ? `<details class="desktop-item-phases" open><summary>阶段任务</summary>${item.phases.map(phase => `<label><input type="checkbox" data-phase-toggle="${escape(phase.id)}" data-item-id="${escape(item.id)}" data-kind="${item.kind}" ${phase.done ? 'checked' : ''} /><span class="${phase.done ? 'is-phase-done' : ''}">${escape(phase.title)}<small>${phase.startDate ? `${escape(phase.startDate)} — ${escape(phase.endDate)}` : '跟随计划区间 · 未单独设日期'}</small></span></label>`).join('')}</details>` : ''}</article>`;
  };
  function render() {
    const all = sortItems(enabled('items') ? items.list() : [], today());
    const done = all.filter(item => isComplete(item, today())), active = all.filter(item => !isComplete(item, today()));
    const groupOf = item => ['deadline', 'longterm'].includes(typeOf(item)) ? 'todo' : ['event', 'allDay'].includes(typeOf(item)) ? 'event' : typeOf(item);
    const visible = filter === 'completed' ? done : active.filter(item => filter === 'all' || groupOf(item) === filter);
    const group = (label, items) => items.length ? `<section class="desktop-item-group"><h2 class="desktop-list-heading">${label} · ${items.length}</h2>${items.map(row).join('')}</section>` : '';
    plansPanel.querySelector('#desktop-plan-total').textContent = `${active.length} 项未完成 · ${done.length} 项已完成`;
    plansPanel.querySelectorAll('[data-item-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.itemFilter === filter)));
    plansPanel.querySelector('#desktop-plan-list').innerHTML = (filter === 'completed' ? group('已完成', done) : Object.entries(filters).filter(([key]) => !['all', 'completed'].includes(key)).map(([key, label]) => group(label, visible.filter(item => groupOf(item) === key))).join('') + (filter === 'all' ? group('已完成', done) : '')) || '<p class="empty">这里还没有事项。添加一件要做的事，再选择是否需要期限或具体时段。</p>';
  }
  function refresh() { render(); onChange(); }
  listen(plansPanel,'click', event => {
    const selection = event.target.closest('[data-item-filter]'); if (selection) { filter = selection.dataset.itemFilter; render(); motion(plansPanel.querySelector('#desktop-plan-list')); return; }
    const button = event.target.closest('[data-item-action]'); if (!button) return;
    const { kind, id, itemAction: action } = button.dataset, ref = { collection: kind, id };
    try {
      const item = items.get(ref);
      if (action === 'edit') { open(item); return; }
      if (action === 'toggle') items.toggle(ref, today()); else items.remove(ref);
      refresh(); feedback(action === 'delete' ? `已删除「${item.title}」。` : '完成状态已更新。', 'success');
    } catch (error) { feedback(error.message, 'error'); }
  });
  listen(plansPanel,'change', event => {
    const input = event.target.closest('[data-phase-toggle]'); if (!input) return;
    try {
      items.setPhase({ collection: input.dataset.kind, id: input.dataset.itemId }, input.dataset.phaseToggle, input.checked);
      refresh(); feedback('阶段完成状态已保存。', 'success');
    } catch (error) { input.checked = !input.checked; feedback(error.message, 'error'); }
  });
  return { render, openItem: (kind, id, date, type,objectId) => { const item = id ? items.get({ collection: kind, id }) : null; open(item, date, type || (kind === 'task' ? 'deadline' : 'event'),objectId); }, resetEditors: () => { overlay.close({ restoreFocus: false }); form.hidden = true; editing = null; } };
}
