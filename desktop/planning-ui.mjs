import { createPageMotion } from './page-motion.mjs';
import { buildItem, normalizeItem, typeOf, planTypes, describeItem, isComplete, isOverdue, toggleItem, sortItems, deadlineOf } from './planning.mjs';
import { today } from '../shared/packages/core/src/semester-calendar.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const keyOf = kind => `jiwei-desktop-${kind === 'plan' ? 'plans' : 'tasks'}`;
export function createPlanningUI({ plansPanel, tasksPanel, storage, feedback, onChange }) {
  const read = kind => JSON.parse(storage.getItem(keyOf(kind)) || '[]').map(item => normalizeItem(item, kind));
  const write = (kind, items) => storage.setItem(keyOf(kind), JSON.stringify(items));
  const motion = createPageMotion(undefined, 'desktop-planning-change');
  let editingTask = null, editingPlan = null, taskFilter = 'all', planFilter = 'all';
  const errorText = (form, text) => { const message = form.querySelector('[role="alert"]'); message.textContent = text; message.hidden = !text; };
  plansPanel.innerHTML = `<div class="intro desktop-page-head"><div><h1>计划</h1><p>安排执行区间、固定时段和每周事项，把大计划拆成阶段。</p></div><button id="desktop-add-plan" class="primary" type="button">添加计划</button></div>
    <form id="desktop-plan-form" class="panel desktop-item-editor" hidden><div class="desktop-section-head"><h2 id="desktop-plan-form-title">添加计划</h2><button id="desktop-cancel-plan" type="button" class="secondary">取消</button></div>
      <div class="desktop-item-fields"><label class="wide">名称<input name="title" required maxlength="160" placeholder="例如：四周完成课程项目" /></label><label>计划类型<select name="type">${Object.entries(planTypes).map(([key, title]) => `<option value="${key}">${title}</option>`).join('')}</select></label>
      <fieldset data-plan-field="dates"><label><span id="desktop-plan-date-label">截止日期</span><input name="date" type="date" /></label><label data-plan-field="endDate">结束日期<input name="endDate" type="date" /></label></fieldset>
      <label data-plan-field="timed" class="desktop-checkbox-label"><input name="timed" type="checkbox" />指定具体时段</label>
      <fieldset data-plan-field="times"><label><span id="desktop-plan-time-label">开始时间</span><input name="startTime" type="time" /></label><label data-plan-field="endTime">结束时间<input name="endTime" type="time" /></label></fieldset>
      <fieldset data-plan-field="weekly" class="wide"><legend>每周重复</legend><div class="desktop-weekday-choices">${[...'一二三四五六日'].map((day, i) => `<label><input name="weekdays" type="checkbox" value="${i + 1}" />周${day}</label>`).join('')}</div><label>重复结束日期（可选）<input name="until" type="date" /></label></fieldset>
      <fieldset data-plan-field="deadline" class="wide desktop-secondary-fields"><legend>完成期限（可选）</legend><p>执行区间与最后完成时间分别保存。</p><div class="desktop-field-pair"><label>截止日期<input name="deadlineDate" type="date" /></label><label>截止时间<input name="deadlineTime" type="time" /></label></div></fieldset>
      <label class="wide">备注<textarea name="note" rows="2" maxlength="4000" placeholder="目标、地点或准备材料（可选）"></textarea></label></div>
      <section data-plan-field="phases" class="desktop-phase-editor"><div class="desktop-section-head"><div><h3>阶段任务</h3><p>可不设日期；填写日期时必须位于计划区间内。</p></div><button type="button" id="desktop-add-phase" class="secondary">添加阶段</button></div><div id="desktop-phase-rows"></div></section>
      <p role="alert" class="desktop-form-error" hidden></p><div class="desktop-form-actions"><button type="submit" class="primary">保存计划</button></div></form>
    <section class="panel desktop-items-panel"><div class="desktop-list-toolbar"><label>分类<select id="desktop-plan-filter"><option value="all">全部计划</option>${Object.entries(planTypes).map(([key, title]) => `<option value="${key}">${title}</option>`).join('')}<option value="completed">已完成</option></select></label><span id="desktop-plan-total"></span></div><div id="desktop-plan-list" class="desktop-list"></div></section>`;
  tasksPanel.innerHTML = `<div class="intro desktop-page-head"><div><h1>待办</h1><p>处理单步行动。有期限按日期处理，无期限留在清单中。</p></div></div>
    <section class="panel desktop-entry-panel"><form id="desktop-task-form" class="desktop-task-editor"><div class="desktop-task-quick"><label class="wide">待办内容<input name="title" required maxlength="160" placeholder="例如：提交课程作业" /></label><label>截止日期（可选）<input name="date" type="date" /></label><button type="submit" class="primary" id="desktop-save-task">添加待办</button><button id="desktop-cancel-task" type="button" class="secondary" hidden>取消编辑</button></div><details><summary>时间与备注</summary><label>截止时间（需先填写日期，可选）<input name="time" type="time" /></label><textarea name="note" rows="2" maxlength="4000" aria-label="待办备注" placeholder="补充说明（可选）"></textarea></details><p role="alert" class="desktop-form-error" hidden></p></form>
    <div class="desktop-list-toolbar"><div class="desktop-filter-buttons" aria-label="待办分类">${[['all', '全部'], ['deadline', '有期限'], ['longterm', '无期限'], ['completed', '已完成']].map(([key, title]) => `<button type="button" class="secondary" data-task-filter="${key}" aria-pressed="${key === 'all'}">${title}</button>`).join('')}</div><span id="desktop-task-total"></span></div><div id="desktop-task-list" class="desktop-list"></div></section>`;
  const taskForm = tasksPanel.querySelector('#desktop-task-form'), planForm = plansPanel.querySelector('#desktop-plan-form');
  const phaseRows = plansPanel.querySelector('#desktop-phase-rows');
  const saveRecord = (kind, item) => { const all = read(kind), index = all.findIndex(old => old.id === item.id); if (index < 0) all.push(item); else all[index] = item; write(kind, all); };
  const phaseRow = (phase = {}) => {
    const row = document.createElement('div'); row.className = 'desktop-phase-row'; row.dataset.phaseId = phase.id || '';
    row._phase = phase;
    row.innerHTML = `<label>阶段名称<input data-phase-field="title" required maxlength="160" value="${escape(phase.title)}" /></label><label>开始日期<input data-phase-field="startDate" type="date" value="${escape(phase.startDate)}" /></label><label>结束日期<input data-phase-field="endDate" type="date" value="${escape(phase.endDate)}" /></label><button type="button" class="secondary danger-button" data-remove-phase>移除</button>`;
    phaseRows.append(row); return row;
  };
  const syncPlanFields = () => {
    const type = planForm.elements.type.value, timed = planForm.elements.timed.checked;
    const show = { dates: type !== 'longterm', endDate: type === 'range', timed: ['range', 'event', 'weekly'].includes(type), times: type === 'deadline' || timed && type !== 'longterm', endTime: type !== 'deadline', weekly: type === 'weekly', deadline: ['range', 'event', 'weekly'].includes(type), phases: type === 'range' };
    for (const [key, visible] of Object.entries(show)) planForm.querySelector(`[data-plan-field="${key}"]`).hidden = !visible;
    planForm.querySelectorAll('input,select,textarea').forEach(input => { input.disabled = !!input.closest('[hidden]'); });
    planForm.elements.date.required = type !== 'longterm';
    planForm.elements.endDate.required = type === 'range';
    planForm.elements.startTime.required = timed && ['range', 'weekly', 'event'].includes(type);
    planForm.elements.endTime.required = planForm.elements.startTime.required;
    planForm.querySelector('#desktop-plan-date-label').textContent = type === 'deadline' ? '截止日期' : type === 'event' ? '日期' : '开始日期';
    planForm.querySelector('#desktop-plan-time-label').textContent = type === 'deadline' ? '截止时间（可选）' : '开始时间';
  };
  const openPlan = item => {
    editingPlan = item || null; planForm.hidden = false; planForm.reset(); phaseRows.replaceChildren(); errorText(planForm, '');
    const value = item ? normalizeItem(item, 'plan') : null, a = value?.anchor;
    const fields = planForm.elements;
    fields.title.value = value?.title || ''; fields.type.value = value ? typeOf(value) : 'range';
    fields.date.value = a?.date || a?.start?.slice(0, 10) || a?.startDate || today(); fields.endDate.value = a?.end?.slice(0, 10) || today();
    fields.timed.checked = !!(a?.startTime || a?.type === 'absolute');
    fields.startTime.value = a?.time || a?.startTime || (a?.type === 'absolute' ? a.start.slice(11, 16) : '');
    fields.endTime.value = a?.endTime || (a?.type === 'absolute' ? a.end.slice(11, 16) : ''); fields.until.value = a?.until || '';
    fields.deadlineDate.value = value?.deadline?.date || ''; fields.deadlineTime.value = value?.deadline?.time || ''; fields.note.value = value?.note || '';
    planForm.querySelectorAll('[name="weekdays"]').forEach(input => { input.checked = (a?.weekdays || [1]).includes(Number(input.value)); });
    for (const phase of value?.phases || []) phaseRow(phase);
    plansPanel.querySelector('#desktop-plan-form-title').textContent = item ? '编辑计划' : '添加计划';
    syncPlanFields(); fields.title.focus(); planForm.scrollIntoView({ block: 'nearest' });
  };
  planForm.addEventListener('change', event => { if (['type', 'timed'].includes(event.target.name)) { syncPlanFields(); motion(planForm); } });
  plansPanel.querySelector('#desktop-add-plan').addEventListener('click', () => openPlan());
  plansPanel.querySelector('#desktop-cancel-plan').addEventListener('click', () => { planForm.hidden = true; editingPlan = null; plansPanel.querySelector('#desktop-add-plan').focus(); });
  plansPanel.querySelector('#desktop-add-phase').addEventListener('click', () => { const row = phaseRow(); syncPlanFields(); row.querySelector('input').focus(); });
  phaseRows.addEventListener('click', event => { const button = event.target.closest('[data-remove-phase]'); if (button) button.closest('.desktop-phase-row').remove(); });
  planForm.addEventListener('submit', event => {
    event.preventDefault(); errorText(planForm, '');
    try {
      const f = planForm.elements, type = f.type.value;
      if (type !== 'range' && phaseRows.children.length) throw new Error('此计划已有阶段任务，请保持区间类型，或先在区间类型下移除阶段。');
      const fields = { type, title: f.title.value, date: f.date.value, endDate: f.endDate.value, startTime: f.startTime.value, endTime: f.endTime.value, timed: f.timed.checked, weekdays: [...planForm.querySelectorAll('[name="weekdays"]:checked')].map(input => Number(input.value)), until: f.until.value, deadlineDate: f.deadlineDate.disabled ? '' : f.deadlineDate.value, deadlineTime: f.deadlineTime.disabled ? '' : f.deadlineTime.value, note: f.note.value, phases: [...phaseRows.children].map(row => ({ ...row._phase, ...Object.fromEntries([...row.querySelectorAll('[data-phase-field]')].map(input => [input.dataset.phaseField, input.value])) })) };
      if (fields.deadlineTime && !fields.deadlineDate) throw new Error('填写截止时间时，也需要填写截止日期。');
      const latest = editingPlan && read('plan').find(item => item.id === editingPlan.id);
      if (editingPlan && !latest) throw new Error('此计划已不存在，请取消编辑后重新添加。');
      fields.phases = fields.phases.map(phase => ({ ...phase, done: latest?.phases.find(item => item.id === phase.id)?.done ?? phase.done }));
      saveRecord('plan', buildItem(fields, latest || editingPlan, 'plan')); planForm.hidden = true; editingPlan = null;
      refresh(); feedback('计划已保存，时间安排与阶段任务已更新。', 'success');
    } catch (error) { errorText(planForm, error.message); }
  });
  const resetTask = () => { editingTask = null; taskForm.reset(); taskForm.querySelector('details').open = false; taskForm.querySelector('#desktop-save-task').textContent = '添加待办'; taskForm.querySelector('#desktop-cancel-task').hidden = true; errorText(taskForm, ''); };
  const openTask = (item = null, date = '') => {
    resetTask(); editingTask = item;
    taskForm.elements.title.value = item?.title || '';
    taskForm.elements.date.value = item?.anchor.date || date;
    taskForm.elements.time.value = item?.anchor.time || '';
    taskForm.elements.note.value = item?.note || '';
    taskForm.querySelector('details').open = !!(item?.anchor.time || item?.note);
    taskForm.querySelector('#desktop-save-task').textContent = item ? '保存修改' : '添加待办';
    taskForm.querySelector('#desktop-cancel-task').hidden = !item;
    taskForm.elements.title.focus(); taskForm.scrollIntoView({ block: 'nearest' });
  };
  taskForm.querySelector('#desktop-cancel-task').addEventListener('click', resetTask);
  taskForm.addEventListener('submit', event => {
    event.preventDefault(); errorText(taskForm, '');
    try {
      const latest = editingTask && read('task').find(item => item.id === editingTask.id);
      if (editingTask && !latest) throw new Error('此待办已不存在，请取消编辑后重新添加。');
      if (taskForm.elements.time.value && !taskForm.elements.date.value) throw Error('填写截止时间时，也需要填写截止日期。');
      saveRecord('task', buildItem({ title: taskForm.elements.title.value, date: taskForm.elements.date.value, startTime: taskForm.elements.time.value, note: taskForm.elements.note.value }, latest || editingTask, 'task'));
      resetTask(); refresh(); feedback('待办已保存。', 'success');
    } catch (error) { errorText(taskForm, error.message); }
  });
  const row = (item, kind) => {
    const complete = isComplete(item, today()), over = isOverdue(item, today(), new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const phases = item.phases || [];
    return `<article class="desktop-planning-item ${complete ? 'is-done' : ''}" data-item-id="${escape(item.id)}"><div class="desktop-list-item"><button type="button" role="checkbox" aria-checked="${complete}" aria-label="${complete ? '恢复' : '完成'}${escape(item.title)}${item.anchor.type === 'weekly' ? '（本次）' : ''}" class="desktop-check" data-${kind}-toggle="${escape(item.id)}">${complete ? '✓' : ''}</button><div><div class="desktop-item-title"><strong>${escape(item.title)}</strong><span class="desktop-item-type ${over ? 'is-overdue' : ''}">${over ? '已逾期' : planTypes[typeOf(item)]}</span></div><small>${escape(describeItem(item))}</small>${item.note ? `<p class="desktop-item-note">${escape(item.note)}</p>` : ''}${phases.length ? `<small>${phases.filter(p => p.done).length} / ${phases.length} 阶段已完成</small>` : ''}</div><button class="secondary" type="button" data-${kind}-edit="${escape(item.id)}">编辑</button><button class="desktop-inline-delete" type="button" data-${kind}-delete="${escape(item.id)}" aria-label="删除${escape(item.title)}">删除</button></div>${phases.length ? `<details class="desktop-item-phases" open><summary>阶段任务</summary>${phases.map(phase => `<label><input type="checkbox" data-phase-toggle="${escape(phase.id)}" data-plan-id="${escape(item.id)}" ${phase.done ? 'checked' : ''} /><span class="${phase.done ? 'is-phase-done' : ''}">${escape(phase.title)}<small>${phase.startDate ? `${escape(phase.startDate)} — ${escape(phase.endDate)}` : '跟随计划区间 · 未单独设日期'}</small></span></label>`).join('')}</details>` : ''}</article>`;
  };
  const group = (title, items, kind) => items.length ? `<section class="desktop-item-group"><h3 class="desktop-list-heading">${title} · ${items.length}</h3>${items.map(item => row(item, kind)).join('')}</section>` : '';
  const renderTasks = () => {
    const all = sortItems(read('task'), today()), done = all.filter(item => isComplete(item, today())), active = all.filter(item => !isComplete(item, today()));
    const items = active.filter(item => taskFilter === 'all' || typeOf(item) === taskFilter);
    tasksPanel.querySelector('#desktop-task-total').textContent = `${active.length} 条未完成`;
    tasksPanel.querySelectorAll('[data-task-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.taskFilter === taskFilter)));
    tasksPanel.querySelector('#desktop-task-list').innerHTML = (taskFilter !== 'completed' ? group('已逾期', items.filter(i => deadlineOf(i)?.date < today()), 'task') + group('今天截止', items.filter(i => deadlineOf(i)?.date === today()), 'task') + group('接下来', items.filter(i => deadlineOf(i)?.date > today()), 'task') + group('无期限', items.filter(i => !deadlineOf(i)), 'task') : '') + (taskFilter === 'all' || taskFilter === 'completed' ? group('已完成', done, 'task') : '') || '<p class="empty">这个分类还没有待办。添加一条行动，日期可以留空。</p>';
  };
  const renderPlans = () => {
    const all = sortItems(read('plan'), today()), done = all.filter(item => isComplete(item, today())), active = all.filter(item => !isComplete(item, today()));
    plansPanel.querySelector('#desktop-plan-total').textContent = `${active.length} 项未完成`;
    const items = planFilter === 'completed' ? done : active.filter(i => planFilter === 'all' || typeOf(i) === planFilter);
    plansPanel.querySelector('#desktop-plan-list').innerHTML = (planFilter === 'completed' ? group('已完成', done, 'plan') : Object.entries(planTypes).map(([key, label]) => group(label, items.filter(i => typeOf(i) === key), 'plan')).join('') + (planFilter === 'all' ? group('已完成', done, 'plan') : '')) || '<p class="empty">这个分类还没有计划。添加区间计划后，可以继续拆分阶段任务。</p>';
  };
  function refresh() { renderTasks(); renderPlans(); onChange(); }
  tasksPanel.addEventListener('click', event => { const filter = event.target.closest('[data-task-filter]'); if (filter) { taskFilter = filter.dataset.taskFilter; renderTasks(); motion(tasksPanel.querySelector('#desktop-task-list')); } });
  plansPanel.querySelector('#desktop-plan-filter').addEventListener('change', event => { planFilter = event.target.value; renderPlans(); motion(plansPanel.querySelector('#desktop-plan-list')); });
  for (const [panel, kind] of [[tasksPanel, 'task'], [plansPanel, 'plan']]) panel.addEventListener('click', event => {
    const action = ['toggle', 'edit', 'delete'].find(name => event.target.closest(`[data-${kind}-${name}]`));
    if (!action) return;
    const button = event.target.closest(`[data-${kind}-${action}]`), id = button.getAttribute(`data-${kind}-${action}`), item = read(kind).find(i => i.id === id);
    if (!item) return;
    try {
      if (action === 'edit') {
        if (kind === 'plan') openPlan(item);
        else openTask(item);
        return;
      }
      if (action === 'toggle') saveRecord(kind, toggleItem(item, today()));
      else { write(kind, read(kind).filter(i => i.id !== id)); if (kind === 'task' && editingTask?.id === id) resetTask(); if (kind === 'plan' && editingPlan?.id === id) { editingPlan = null; planForm.hidden = true; } }
      refresh(); feedback(action === 'delete' ? `已删除「${item.title}」。` : '完成状态已更新。', 'success');
    } catch (error) { feedback(error.message, 'error'); }
  });
  plansPanel.addEventListener('change', event => {
    const input = event.target.closest('[data-phase-toggle]'); if (!input) return;
    try {
      const item = read('plan').find(p => p.id === input.dataset.planId);
      saveRecord('plan', { ...item, updatedAt: new Date().toISOString(), phases: item.phases.map(phase => phase.id === input.dataset.phaseToggle ? { ...phase, done: input.checked, updatedAt: new Date().toISOString() } : phase) });
      refresh(); feedback('阶段完成状态已保存。', 'success');
    } catch (error) { input.checked = !input.checked; feedback(error.message, 'error'); }
  });
  return { renderPlans, renderTasks, openItem: (kind, id, date) => {
    const item = id ? read(kind).find(i => i.id === id) : null;
    if (id && !item) throw Error('此事项已不存在。');
    if (kind === 'plan') { openPlan(item); if (!item && date) { planForm.elements.date.value = date; planForm.elements.endDate.value = date; } }
    else openTask(item, date);
  }, resetEditors: () => { resetTask(); planForm.hidden = true; editingPlan = null; } };
}
