import { escapeHtml as esc } from './ui-text.mjs';

export function createSearchUI({ host, bindings, openRecord, feedback = () => {} }) {
  const panel = document.createElement('div');
  panel.className = 'desktop-search-panel'; panel.id = 'desktop-search-panel'; panel.hidden = true;
  panel.setAttribute('role', 'search'); panel.setAttribute('aria-label', '查找与整理');
  panel.innerHTML = '<div class="desktop-search-line"><svg class="desktop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><label class="design-search-label" for="desktop-search-input">查找</label><input id="desktop-search-input" type="search" maxlength="200" placeholder="搜索课程、事项、笔记与资料…" autocomplete="off" aria-controls="desktop-search-results"/><button type="button" data-search-close aria-label="收起搜索" title="收起 · Esc"><svg class="desktop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></div><div class="desktop-search-dropdown"><details class="desktop-search-filters"><summary>筛选</summary><div class="desktop-field-pair"><label>内容类型<select id="desktop-search-type"><option value="">全部类型</option><option value="courseEntry">课程</option><option value="items">事项</option><option value="journalEntry">笔记</option><option value="capture">网页</option><option value="object">对象</option></select></label><label>所属对象<select id="desktop-search-owner"></select></label></div></details><p class="desktop-search-status" role="status" aria-live="polite"></p><div id="desktop-search-results"></div></div>';
  const main = document.querySelector('.main'); main.prepend(panel);
  let results = [], opener, disposed = false, selectedIndex=0;
  const input = panel.querySelector('input'), type = panel.querySelector('#desktop-search-type'), owner = panel.querySelector('#desktop-search-owner');
  const status = panel.querySelector('[role="status"]'), output = panel.querySelector('#desktop-search-results');
  const triggers = () => document.querySelectorAll('#desktop-search-open');
  const close = ({ restoreFocus = true } = {}) => {
    if (panel.hidden) return;
    panel.hidden = true;main.classList.remove('search-weave-open'); triggers().forEach(b => b.setAttribute('aria-expanded', 'false'));
    if (restoreFocus && opener?.isConnected && opener.getClientRects().length) opener.focus({preventScroll:true});
  };
  const selectResult=index=>{selectedIndex=index;const buttons=[...output.querySelectorAll('[data-search-open]')],target=buttons.find(b=>+b.dataset.searchOpen===index)||buttons[0];buttons.forEach(b=>b.classList.toggle('is-search-selected',b===target));const cursor=output.querySelector('.desktop-search-cursor');if(cursor&&target){selectedIndex=+target.dataset.searchOpen;cursor.style.transform=`translateY(${target.offsetTop}px)`;cursor.style.setProperty('--cursor-height',target.offsetHeight+'px');}};
  bindings.listen(output,'focusin',event=>{const b=event.target.closest('[data-search-open]');if(b)selectResult(+b.dataset.searchOpen);});
  const render = () => {
    try {
      const model = host.client('search').query({ text: input.value, collection: type.value, objectId: owner.value }); results = model.results;
      status.textContent = `${input.value ? '找到' : '最近内容'} ${model.total} 项${model.total > 80 ? '，显示前 80 项，请缩小搜索范围' : ''}${model.errors.length ? `；${model.errors.join('、')}暂不可用，其他结果仍可查看` : ''}`;
      const row=(result,index)=>`<button type="button" class="desktop-search-result" data-search-open="${index}"><small>${esc(result.label)}${result.owner?` · ${esc(model.objects.find(o=>o.id===result.owner)?.title||'原归属')}`:' · 独立内容'}</small><strong>${esc(result.title)}</strong><span>${esc(result.snippet)}</span></button>`;
      if(results.length){
        const groups=input.value?[['结果',results.map((r,i)=>({r,i}))]]:[['最近',[]],['今天',[]],['对象',[]]];
        if(!input.value){const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());results.forEach((r,i)=>groups[r.ref.collection==='object'?2:r.updatedAt&&new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(r.updatedAt))===date?1:0][1].push({r,i}));}
        output.innerHTML=groups.filter(([,rows])=>rows.length).map(([name,rows])=>`<h3 class="desktop-search-group">${name} · ${rows.length}</h3>`+rows.map(({r,i})=>row(r,i)).join('')).join('')+'<i class="desktop-search-cursor" aria-hidden="true"></i>';
      }else output.innerHTML='<p class="empty">没有匹配内容。试试：</p><div class="desktop-search-suggestions"><button type="button" data-search-suggest="课程">课程</button><button type="button" data-search-suggest="作业">作业</button><button type="button" data-search-suggest="10月">10月</button><button type="button" data-search-clear>清除筛选</button></div>';
      if(!input.value)output.insertAdjacentHTML('beforeend','<div class="desktop-search-commands"><h3 class="desktop-search-group">操作</h3><button type="button" data-search-command="items.edit">新建事项</button><button type="button" data-search-command="notes.new">新建笔记</button><button type="button" data-search-command="assistant.open">全局助手</button></div>');
      selectResult(0);

    } catch (error) { results = []; output.replaceChildren(); status.textContent = `无法查找：${error.message}，请重新输入或重试。`; }
  };
  const open = () => {
    if (disposed) return;
    if (document.querySelector('dialog[open]')) { feedback('请先保存或关闭当前编辑面板，再查找其他内容。', 'error'); return; }
    if (panel.hidden) opener = document.activeElement?.closest('#desktop-search-open') || document.querySelector('#desktop-search-open') || document.activeElement;
    panel.hidden = false;main.classList.add('search-weave-open'); triggers().forEach(b => { b.setAttribute('aria-expanded','true'); b.setAttribute('aria-controls',panel.id); });
    try {
      const model = host.client('search').query(), previous = owner.value;
      owner.innerHTML = '<option value="">所有归属</option>' + model.objects.map(object => `<option value="${esc(object.id)}">${esc(object.title)}</option>`).join('');
      owner.value = model.objects.some(object => object.id === previous) ? previous : ''; render();
    } catch (error) { results = []; output.replaceChildren(); status.textContent = `无法查找：${error.message}，请收起后重试。`; }
    main.scrollTop = 0; input.focus({preventScroll:true}); input.select();
  };
  bindings.listen(input, 'input', event => { if (!event.isComposing) render(); });
  bindings.listen(input, 'compositionend', render);
  bindings.listen(type, 'change', render); bindings.listen(owner, 'change', render);
  bindings.listen(panel, 'click', event => {
    const suggest=event.target.closest('[data-search-suggest]');if(suggest){input.value=suggest.dataset.searchSuggest;render();input.focus();return;}if(event.target.closest('[data-search-clear]')){input.value=type.value=owner.value='';render();input.focus();return;}const command=event.target.closest('[data-search-command]');if(command){try{if(command.dataset.searchCommand==='items.edit')host.run('items.edit','task',null);else host.run(command.dataset.searchCommand);close({restoreFocus:false});}catch(error){status.textContent=error.message;}return;}
    if (event.target.closest('[data-search-close]')) { close(); return; }
    const button = event.target.closest('[data-search-open]'); if (!button) return;
    try {
      const result = results[Number(button.dataset.searchOpen)];
      if (!result) throw Error('结果已变化，请重新搜索');
      if (result.ref.collection === 'object') host.run('objects.open', result.ref.id); else openRecord(result.ref);
      close({restoreFocus:false});
    } catch (error) { status.textContent = `无法打开：${error.message}。结果可能已变化，请重新搜索。`; }
  });
  bindings.listen(panel, 'keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation();if(input.value||type.value||owner.value){input.value=type.value=owner.value='';render();input.focus();}else close();return; }
    const buttons = [...output.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' && (event.target === input || index >= 0) && buttons.length) { event.preventDefault(); const next=event.target===input?Math.max(0,buttons.findIndex(b=>+b.dataset.searchOpen===selectedIndex)):Math.min(index+1,buttons.length-1);buttons[next].focus(); }
    if (event.key === 'ArrowUp' && index >= 0) { event.preventDefault(); (buttons[index-1] || input).focus(); }
    if (event.key === 'Enter' && event.target === input && !event.isComposing && buttons.length) { event.preventDefault(); (output.querySelector('[data-search-open="'+selectedIndex+'"]')||buttons[0]).click(); }
  });
  bindings.listen(document, 'pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !event.target.closest('#desktop-search-open')) close({restoreFocus:false}); });
  bindings.listen(document, 'keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); }
  });
  const observer = new MutationObserver(() => close({restoreFocus:false}));
  observer.observe(main, { attributes:true, attributeFilter:['data-active-view'] });
  bindings.onStop(() => { disposed = true; observer.disconnect(); main.classList.remove('search-weave-open');panel.remove(); });
  return { open, close };
}
