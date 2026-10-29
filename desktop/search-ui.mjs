import { escapeHtml as esc } from './ui-text.mjs';

export function createSearchUI({ host, bindings, openRecord, feedback = () => {} }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'desktop-search-dialog'; dialog.id = 'desktop-search-dialog';
  dialog.setAttribute('aria-labelledby', 'desktop-search-title');
  dialog.innerHTML = '<header class="panel-head"><h2 id="desktop-search-title">查找与整理</h2><button type="button" class="secondary" data-search-close>关闭</button></header><div class="desktop-search-controls"><label class="sr-only" for="desktop-search-input">搜索课程、事项、笔记与网页原文</label><input id="desktop-search-input" type="search" maxlength="200" placeholder="搜索课程、事项、笔记与网页原文" /><div class="desktop-field-pair"><label>内容类型<select id="desktop-search-type"><option value="">全部类型</option><option value="courseEntry">课程</option><option value="items">事项</option><option value="journalEntry">笔记</option><option value="capture">网页</option><option value="object">对象</option></select></label><label>所属对象<select id="desktop-search-owner"></select></label></div></div><p class="desktop-search-status" role="status"></p><div id="desktop-search-results"></div>';
  document.body.append(dialog);
  let results = [];
  const input = dialog.querySelector('input'), type = dialog.querySelector('#desktop-search-type'), owner = dialog.querySelector('#desktop-search-owner');
  const render = () => {
    try {
      const model = host.client('search').query({ text: input.value, collection: type.value, objectId: owner.value }); results = model.results;
      dialog.querySelector('[role="status"]').textContent = `${input.value ? '找到' : '最近内容'} ${model.total} 项${model.total > 80 ? '，显示前 80 项，请缩小搜索范围' : ''}${model.errors.length ? `；${model.errors.join('、')}暂不可用，其他结果仍可查看` : ''}`;
      dialog.querySelector('#desktop-search-results').innerHTML = results.length ? results.map((result, index) => `<button type="button" class="desktop-search-result" data-search-open="${index}"><small>${esc(result.label)}${result.owner ? ` · ${esc(model.objects.find(object => object.id === result.owner)?.title || '原归属')}` : ' · 独立内容'}</small><strong>${esc(result.title)}</strong><span>${esc(result.snippet)}</span></button>`).join('') : '<p class="empty">没有匹配内容。试试课程名、任务目标或原文中的词，也可清除筛选。关闭的功能不会参与搜索。</p>';
    } catch (error) { dialog.querySelector('[role="status"]').textContent = `无法查找：${error.message}，请关闭后重试。`; }
  };
  const open = () => {
    if (document.querySelector('dialog[open]:not(#desktop-search-dialog)')) { feedback('请先保存或关闭当前编辑面板，再查找其他内容。', 'error'); return; }
    const model = host.client('search').query();
    const previous = owner.value;
    owner.innerHTML = '<option value="">所有归属</option>' + model.objects.map(object => `<option value="${esc(object.id)}">${esc(object.title)}</option>`).join('');
    owner.value = model.objects.some(object => object.id === previous) ? previous : '';
    render(); if (!dialog.open) dialog.showModal(); input.focus(); input.select();
  };
  bindings.listen(input, 'input', event => { if (!event.isComposing) render(); });
  bindings.listen(input, 'compositionend', render);
  bindings.listen(type, 'change', render); bindings.listen(owner, 'change', render);
  bindings.listen(dialog, 'click', event => {
    if (event.target === dialog || event.target.closest('[data-search-close]')) { dialog.close(); return; }
    const button = event.target.closest('[data-search-open]'); if (!button) return;
    try {
      const result = results[Number(button.dataset.searchOpen)];
      if (result.ref.collection === 'object') host.run('objects.open', result.ref.id); else openRecord(result.ref);
      dialog.close();
    } catch (error) { dialog.querySelector('[role="status"]').textContent = `无法打开：${error.message}。结果可能已变化，请重新搜索。`; }
  });
  bindings.listen(document, 'keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); }
  });
  return { open };
}
