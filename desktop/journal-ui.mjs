import { createCourseOverlay } from './course-overlay.mjs';
import { escapeHtml as esc } from './ui-text.mjs';
import { journalKinds, journalKind, journalKindLabel, journalMarkdown } from './journal.mjs';

export function createJournalUI({ panel, main, host, scope, feedback, markUnsaved = () => {} }) {
  const journal = host.use('journal'), workspace = host.use('workspace');
  let status = 'active', limit = 20, draft = null, dirty = false, pendingPurge = null, disposed = false;
  panel.innerHTML = `<div class="intro desktop-page-head"><div><h1>笔记</h1><p>留下此刻的想法，也可以稍后整理。</p></div><div class="desktop-page-actions"><button type="button" class="secondary" id="desktop-journal-example">导入示例</button><button type="button" class="primary" id="desktop-journal-new">记一笔</button></div></div>
    <section class="panel desktop-journal-tools"><div class="desktop-journal-statuses" role="group" aria-label="笔记范围"><button type="button" class="secondary" data-journal-status="active" aria-pressed="true">全部笔记</button><details class="desktop-journal-secondary"><summary>更多</summary><div class="desktop-journal-secondary-actions"><button type="button" class="secondary" data-journal-status="archived" aria-pressed="false">归档</button><button type="button" class="secondary" data-journal-status="trash" aria-pressed="false">回收站</button></div></details></div><div class="desktop-journal-filters"><label>搜索<input type="search" id="desktop-journal-search" placeholder="文字或标签" /></label><label>日期<input type="date" id="desktop-journal-date" /></label><label>按用途<select id="desktop-journal-kind"><option value="">全部用途</option>${Object.entries(journalKinds).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><button type="button" class="secondary" id="desktop-journal-clear">清除筛选</button></div></section>
    <section id="desktop-journal-draft" class="panel desktop-journal-draft" hidden><div><strong>还有一份草稿</strong><p>文字已留在本地，随时可以继续。</p></div><button type="button" class="secondary" id="desktop-journal-resume">继续写</button></section>
    <div class="desktop-journal-list-head"><p id="desktop-journal-count" role="status"></p><button type="button" class="secondary" id="desktop-journal-export">导出筛选结果</button></div><div id="desktop-journal-list"></div><button type="button" class="secondary" id="desktop-journal-more" hidden>再看一些</button>`;
  const form = document.createElement('form'); form.id = 'desktop-journal-form'; form.className = 'panel desktop-item-editor'; form.hidden = true;
  form.innerHTML = `<div class="panel-head"><h2 id="desktop-journal-editor-title">记一笔</h2><button type="button" class="secondary" data-journal-close>收起</button></div><div class="desktop-item-fields desktop-journal-fields"><label class="wide">想记下什么<textarea name="body" rows="9" maxlength="100000" placeholder="可以是一句话，也可以慢慢写。无需先起标题或选择用途。" required></textarea></label><p class="wide desktop-journal-save" id="desktop-journal-save-state" role="status" aria-live="polite"></p><label>记录日期<input type="date" name="date" required /></label><label>用途（可不选）<select name="kind">${Object.entries(journalKinds).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><p class="wide desktop-section-copy">用途帮助回看：见闻记经历，感受记心情，想法留灵感，摘录留原文，复盘留经验。也可以保持未分类。</p><label class="wide">标题（可不填）<input name="title" maxlength="160" placeholder="留空也可以，正文就是记录" /></label><label class="wide">标签（可不填）<input name="tags" maxlength="500" placeholder="用空格或逗号分开，例如：学习 生活" /></label><p class="wide desktop-form-error" id="desktop-journal-error" role="alert" hidden></p><div class="wide desktop-journal-discard" id="desktop-journal-discard-confirm" hidden><p>放弃当前草稿？原笔记不会改变。</p><button type="button" class="secondary" id="desktop-journal-confirm-discard">确认放弃</button><button type="button" class="secondary" id="desktop-journal-keep-draft">继续写</button></div></div><div class="desktop-form-actions"><button type="button" class="secondary" id="desktop-journal-discard">放弃草稿</button><button type="button" class="secondary" id="desktop-journal-retry" hidden>重试保存草稿</button><button type="submit" class="primary" id="desktop-journal-publish">保存笔记</button></div>`;
  const extractSelection = document.createElement('button'); extractSelection.type = 'button'; extractSelection.id = 'desktop-note-extract-selection'; extractSelection.className = 'secondary'; extractSelection.textContent = '保存并提炼选文'; extractSelection.hidden = true;
  form.querySelector('.desktop-form-actions').prepend(extractSelection);
  const actionForm = document.createElement('form'); actionForm.id = 'desktop-note-action-form'; actionForm.className = 'panel desktop-item-editor'; actionForm.hidden = true;
  actionForm.innerHTML = `<div class="panel-head"><h2 id="desktop-note-action-title">从笔记提炼事项</h2><button type="button" class="secondary" data-action-close>稍后继续</button></div><div class="desktop-item-fields"><p class="wide desktop-journal-save" id="desktop-note-action-save-state" role="status" aria-live="polite"></p><label class="wide">原文依据<textarea name="evidence" rows="4" readonly></textarea></label><p class="wide desktop-section-copy">确认后才会创建事项，原笔记保留。截止是最晚完成时间；执行时段可在创建后安排。</p><label class="wide">事项名称<input name="title" maxlength="160" required /></label><label>截止日期（可不填）<input type="date" name="date" /></label><label>截止时间（可不填）<input type="time" name="time" /></label><label class="wide">所属对象（可不选）<select name="objectId"></select></label><p class="wide desktop-form-error" role="alert" hidden></p></div><div class="desktop-form-actions"><button type="button" class="secondary" id="desktop-note-action-discard">放弃提炼草稿</button><button type="button" class="secondary" id="desktop-note-action-retry" hidden>重试保存草稿</button><button type="submit" class="primary">确认创建事项</button></div>`;
  let actionDraft = null, actionDirty = false;
  const overlay = createCourseOverlay({ surface: main, main, panels: [form, actionForm], id: 'desktop-journal-dialog', fitViewport: true, beforeClose: () => persist(), onClose: () => { draft = null; actionDraft = null; actionDirty = false; if (!disposed) { refresh(); host.emit('journal:closed'); } } });
  scope.own(() => overlay.dispose());
  const error = message => { const node = form.querySelector('#desktop-journal-error'); node.textContent = message; node.hidden = !message; };
  const fields = () => ({ body: form.elements.body.value, title: form.elements.title.value, date: form.elements.date.value, kind: form.elements.kind.value, tags: [...new Set(form.elements.tags.value.split(/[\s,，#]+/).filter(Boolean))] });
  const saved = () => { dirty = false; markUnsaved(false); error(''); form.querySelector('#desktop-journal-retry').hidden = true; form.querySelector('#desktop-journal-save-state').textContent = `${draft?.editId ? '修改已存为本地草稿，原笔记尚未更新' : '草稿已保存到本地，尚未存为笔记'} · ${form.elements.body.value.length} 字`; };
  const actionSaved = () => {
    actionForm.querySelector('#desktop-note-action-save-state').textContent = '提炼草稿已保存到本地，尚未创建事项。';
    actionForm.querySelector('#desktop-note-action-retry').hidden = true;
    actionForm.querySelector('[role=alert]').hidden = true;
  };
  function persist() {
    if (actionDraft && overlay.activePanel === actionForm) return persistAction();
    if (!draft) return true;
    const value = fields();
    if (!dirty && ['body', 'title', 'date', 'kind'].every(key => (key === 'kind' ? journalKind(draft.kind) : draft[key]) === value[key]) && JSON.stringify(draft.tags) === JSON.stringify(value.tags)) return true;
    try { draft = journal.saveDraft(value, draft.revision); saved(); return true; }
    catch (failure) { dirty = true; markUnsaved(true); error(`${failure.message} 输入仍在这里，请重试；收起和切页会等待保存。`); form.querySelector('#desktop-journal-retry').hidden = false; form.querySelector('#desktop-journal-save-state').textContent = '尚未保存'; return false; }
  }
  function persistAction() {
    if (!actionDraft || !actionDirty) return true;
    const f = actionForm.elements, error = actionForm.querySelector('[role=alert]');
    try { actionDraft = journal.saveActionDraft(actionDraft.id, { title: f.title.value, date: f.date.value, time: f.time.value, objectId: f.objectId.value }); actionDirty = false; markUnsaved(false); actionSaved(); return true; }
    catch (failure) { markUnsaved(true); error.textContent = `${failure.message} 输入仍在这里，请重试保存草稿；保存成功后才能离开。`; error.hidden = false; actionForm.querySelector('#desktop-note-action-save-state').textContent = '最新修改尚未保存，尚未创建事项。'; actionForm.querySelector('#desktop-note-action-retry').hidden = false; return false; }
  }
  function openAction(id, article, evidence) {
    const entry = journal.inspect(id).record;
    if (!entry) throw Error('原笔记已不可用。');
    const selection = window.getSelection();
    const selected = evidence || (article?.contains(selection?.anchorNode) ? selection.toString() : '');
    const previous = journal.actions(id).find(action => action.status === 'pending' && action.entryRevision === entry.revision);
    actionDraft = selected && entry.body.includes(selected) ? journal.beginAction(id, selected) : previous || journal.beginAction(id, entry.body.slice(0,4000));
    for (const key of ['evidence','title','date','time']) actionForm.elements[key].value = actionDraft[key] || '';
    const context = journal.context(id), f = actionForm.elements;
    f.objectId.innerHTML = '<option value="">独立事项 · 暂不关联</option>' + context.objects.map(o => `<option value="${esc(o.id)}">${esc(o.title)}${o.status === 'archived' ? '（已归档）' : ''}</option>`).join('');
    if (actionDraft.objectId && !context.objects.some(o => o.id === actionDraft.objectId)) f.objectId.insertAdjacentHTML('beforeend', `<option value="${esc(actionDraft.objectId)}">原归属暂不可用（保留）</option>`);
    f.objectId.value = actionDraft.objectId || ''; f.objectId.disabled = !context.available;
    actionSaved(); actionDirty = false;
    overlay.show(actionForm, { labelledBy: 'desktop-note-action-title', focus: f.title });
  }
  function open(id) {
    if (overlay.activePanel) { form.elements.body.focus(); return; }
    try {
      draft = journal.draft() || journal.start(id);
      if (id && draft.editId !== id) feedback('先继续上一份草稿，保存或放弃后再编辑其他笔记。');
      for (const key of ['body', 'title', 'date', 'kind']) form.elements[key].value = key === 'kind' ? journalKind(draft.kind) : draft[key];
      form.elements.tags.value = draft.tags.join(' '); form.querySelector('#desktop-journal-discard-confirm').hidden = true;
      form.querySelector('#desktop-journal-editor-title').textContent = draft.editId ? '编辑笔记' : '记一笔'; saved();
      extractSelection.hidden = !draft.editId; extractSelection.disabled = !journal.features().items;
      overlay.show(form, { labelledBy: 'desktop-journal-editor-title', focus: form.elements.body });
    } catch (failure) { feedback(failure.message, 'error'); }
  }
  const options = () => ({ status, query: panel.querySelector('#desktop-journal-search').value, date: panel.querySelector('#desktop-journal-date').value, kind: panel.querySelector('#desktop-journal-kind').value });
  function connections(entry) {
    if (entry.deletedAt) return '';
    const context = journal.context(entry.id), owner = context.objects.find(o => o.id === context.owner), actions = journal.actions(entry.id), canExtract = journal.features().items;
    const options = '<option value="">独立笔记 · 暂不关联</option>' + context.objects.map(o => `<option value="${esc(o.id)}" ${o.id === context.owner ? 'selected' : ''}>${esc(o.title)}${o.status === 'archived' ? '（已归档）' : ''}</option>`).join('') + (context.owner && !owner ? `<option value="${esc(context.owner)}" selected>原归属暂不可见（保留）</option>` : '');
    return `<details class="desktop-note-context"><summary>${owner ? '所属：' + esc(owner.title) : context.available ? '关联课程或项目' : '对象功能已关闭 · 原关联保留'}</summary>${context.available ? `<div class="desktop-note-owner-row"><label>所属对象<select data-note-owner data-original-owner="${esc(context.owner)}">${options}</select></label><button type="button" class="secondary" data-note-assign>保存归属</button>${owner ? `<button type="button" class="secondary" data-open-object="${esc(owner.id)}">查看对象</button>` : ''}</div>` : ''}</details><div class="desktop-journal-actions"><button type="button" class="secondary" data-note-extract ${canExtract ? '' : 'disabled'}>${actions.some(a => a.status === 'pending') ? '继续提炼事项' : '提炼为事项'}</button>${actions.filter(a => a.status === 'confirmed').map(a => `<button type="button" class="secondary" data-note-action="${esc(a.id)}">打开事项：${esc(a.title)}</button>`).join('')}</div>${canExtract ? '' : '<p class="desktop-section-copy">开启事项功能后可提炼，原笔记可以继续保存。</p>'}`;
  }
  function refresh() {
    const entries = journal.list(options()), visible = entries.slice(0, limit);
    panel.querySelector('#desktop-journal-example').hidden = !workspace.developerMode();
    panel.querySelector('#desktop-journal-draft').hidden = !journal.draft();
    panel.querySelector('#desktop-journal-count').textContent = `${entries.length} 篇${status === 'trash' ? '已删除笔记' : status === 'archived' ? '已归档笔记' : '笔记'}`;
    panel.querySelector('#desktop-journal-export').disabled = !entries.length;
    panel.querySelector('#desktop-journal-more').hidden = entries.length <= limit;
    let day = '';
    panel.querySelector('#desktop-journal-list').innerHTML = visible.length ? visible.map(entry => {
      const heading = day !== entry.date ? `<h2 class="desktop-journal-day">${esc(entry.date)}</h2>` : ''; day = entry.date;
      const controls = status === 'trash' ? `<button type="button" class="secondary" data-journal-action="restore">恢复</button><button type="button" class="secondary" data-journal-action="purge">${pendingPurge === entry.id ? '确认永久删除' : '永久删除'}</button>` : `<button type="button" class="secondary" data-journal-edit="${esc(entry.id)}">${entry.body.length > 600 ? '阅读全文 / 编辑' : '编辑'}</button><button type="button" class="secondary" data-journal-action="${entry.archivedAt ? 'unarchive' : 'archive'}">${entry.archivedAt ? '取消归档' : '归档'}</button><button type="button" class="secondary" data-journal-action="trash">移入回收站</button>`;
      return `${heading}<article class="panel desktop-journal-entry" data-journal-id="${esc(entry.id)}"><div class="desktop-journal-meta"><span>${journalKindLabel(entry.kind)}</span>${entry.tags.map(tag => `<button type="button" data-journal-tag="${esc(tag)}">#${esc(tag)}</button>`).join('')}${entry.example ? '<span>虚构示例</span>' : ''}</div>${entry.title ? `<h3>${esc(entry.title)}</h3>` : ''}<p class="desktop-journal-body">${esc(entry.body.slice(0, 600))}</p>${entry.body.length > 600 ? '<p class="desktop-section-copy">列表展示前 600 字，阅读全文可继续编辑。</p>' : ''}${connections(entry)}<div class="desktop-journal-actions">${controls}</div></article>`;
    }).join('') : `<section class="panel desktop-journal-empty"><h2>${status === 'trash' ? '回收站是空的' : status === 'archived' ? '还没有归档记录' : '给今天留一点文字'}</h2><p>${options().query || options().date || options().kind ? '没有匹配的记录，可以清除筛选再看看。' : status === 'active' ? '一句想法、一段感受或一次复盘，都可以直接写下。标题和用途可不填，笔记保存在本地。' : '记录会留在这里，直到你选择恢复或删除。'}</p>${status === 'active' ? '<button type="button" class="secondary" data-journal-capture>记一笔</button>' : ''}</section>`;
    panel.querySelector('.desktop-journal-secondary summary').textContent = status === 'active' ? '更多' : status === 'archived' ? '已归档' : '回收站';
    panel.querySelectorAll('[data-journal-status]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.journalStatus === status)));
  }
  scope.listen(form, 'input', () => { dirty = true; persist(); });
  scope.listen(actionForm, 'input', () => { actionDirty = true; persistAction(); });
  scope.listen(actionForm, 'change', () => { actionDirty = true; persistAction(); });
  scope.listen(actionForm, 'submit', event => {
    event.preventDefault(); if (!actionDraft) return;
    actionDirty = true; if (!persistAction()) return;
    try { journal.confirmAction(actionDraft.id); actionDraft = null; overlay.close(); refresh(); feedback('事项已创建，原笔记与来源已保留。', 'success'); }
    catch (failure) { const error = actionForm.querySelector('[role=alert]'); error.textContent = `${failure.message} 草稿已保存，事项尚未创建，可重试「确认创建事项」。`; error.hidden = false; }
  });
  scope.listen(actionForm, 'click', event => {
    if (event.target.closest('[data-action-close]')) overlay.close();
    if (event.target.closest('#desktop-note-action-retry')) persistAction();
    if (event.target.closest('#desktop-note-action-discard')) try { journal.discardActionDraft(actionDraft.id); actionDraft = null; actionDirty = false; markUnsaved(false); overlay.close(); } catch (error) { feedback(error.message, 'error'); }
  });
  scope.listen(form, 'change', () => { dirty = true; persist(); });
  scope.listen(form, 'keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
  scope.listen(form, 'submit', event => {
    event.preventDefault(); if (!persist()) return;
    try { journal.publish(draft.revision); draft = null; markUnsaved(false); overlay.close(); refresh(); feedback('笔记已保存。', 'success'); }
    catch (failure) { error(failure.message); }
  });
  scope.listen(form, 'click', event => {
    if (event.target.closest('#desktop-note-extract-selection')) {
      const body = form.elements.body, evidence = body.value.slice(body.selectionStart, body.selectionEnd);
      if (!evidence.trim() || evidence.length > 4000) { feedback('请先在正文中选取 1—4000 字，再保存并提炼。'); return; }
      if (!persist()) return;
      try { const entry = journal.publish(draft.revision); draft = null; overlay.close(); openAction(entry.id, null, evidence); }
      catch (failure) { feedback(failure.message, 'error'); }
    }
    if (event.target.closest('[data-journal-close]')) overlay.close();
    if (event.target.closest('#desktop-journal-retry')) persist();
    if (event.target.closest('#desktop-journal-discard')) form.querySelector('#desktop-journal-discard-confirm').hidden = false;
    if (event.target.closest('#desktop-journal-keep-draft')) form.querySelector('#desktop-journal-discard-confirm').hidden = true;
    if (event.target.closest('#desktop-journal-confirm-discard')) {
      try { journal.discardDraft(); draft = null; dirty = false; markUnsaved(false); overlay.close(); refresh(); }
      catch (failure) { error(failure.message); }
    }
  });
  scope.listen(panel, 'input', event => { if (event.target.matches('#desktop-journal-search')) { limit = 20; refresh(); } });
  scope.listen(panel, 'change', event => { if (event.target.matches('#desktop-journal-date,#desktop-journal-kind')) { limit = 20; refresh(); } });
  scope.listen(panel, 'click', event => {
    const button = event.target.closest('button'); if (!button) return;
    try {
      if (button.matches('#desktop-journal-new,#desktop-journal-resume,[data-journal-capture]')) open();
      if (button.dataset.journalEdit) open(button.dataset.journalEdit);
      if (button.hasAttribute('data-note-extract')) openAction(button.closest('[data-journal-id]').dataset.journalId, button.closest('[data-journal-id]'));
      if (button.hasAttribute('data-note-assign')) { const article = button.closest('[data-journal-id]'), select = article.querySelector('[data-note-owner]'); journal.assign(article.dataset.journalId, select.value, select.dataset.originalOwner); refresh(); feedback('笔记归属已保存，原文保持不变。', 'success'); }
      if (button.dataset.noteAction) { const action = journal.actions(button.closest('[data-journal-id]').dataset.journalId).find(a => a.id === button.dataset.noteAction); if (action) host.run('records.open', action.ref); }
      if (button.dataset.journalStatus) { status = button.dataset.journalStatus; panel.querySelector('.desktop-journal-secondary').open = false; pendingPurge = null; limit = 20; refresh(); }
      if (button.id === 'desktop-journal-clear') { for (const id of ['search', 'date', 'kind']) panel.querySelector(`#desktop-journal-${id}`).value = ''; refresh(); }
      if (button.dataset.journalTag) { panel.querySelector('#desktop-journal-search').value = button.dataset.journalTag; refresh(); }
      if (button.id === 'desktop-journal-more') { limit += 20; refresh(); }
      if (button.id === 'desktop-journal-example') { journal.examples(); refresh(); feedback('已补充虚构笔记示例。', 'success'); }
      if (button.dataset.journalAction) {
        const id = button.closest('[data-journal-id]').dataset.journalId, action = button.dataset.journalAction;
        if (action === 'purge' && pendingPurge !== id) { pendingPurge = id; refresh(); return; }
        journal.change(id, action); pendingPurge = null; refresh();
      }
      if (button.id === 'desktop-journal-export') {
        if (window.jeeWeaveDesktop?.saveTextFile) {
          window.jeeWeaveDesktop.saveTextFile('JeeWeave-笔记.md', journalMarkdown(journal.list(options())), 'text/markdown').then(result => { if (!result?.ok) feedback(result?.message || '导出失败。', 'error'); }).catch(error => feedback(error.message, 'error'));
          return;
        }
        const anchor = document.createElement('a'), url = URL.createObjectURL(new Blob([journalMarkdown(journal.list(options()))], { type: 'text/markdown;charset=utf-8' }));
        anchor.href = url; anchor.download = 'JeeWeave-笔记.md'; anchor.click(); URL.revokeObjectURL(url);
      }
    } catch (failure) { feedback(failure.message, 'error'); }
  });
  scope.on('workspace:changed', () => { if (!overlay.activePanel) refresh(); });
  return { open, refresh, close: () => overlay.close({ restoreFocus: false }), leave() { if (!persist()) throw Error('笔记尚未保存，请先重试。'); overlay.close({ restoreFocus: false }); }, dispose: () => { disposed = true; markUnsaved(false); } };
}
