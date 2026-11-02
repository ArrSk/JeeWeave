import { builtinModules, isModuleAvailable, isModuleEnabled } from './modules.mjs';

const destinations = [['overview','总览'],['today','今天'],['courses','课程表'],['calendar','日历'],['plans','事项'],['notes','笔记'],['objects','对象'],['web-capture','网页采集'],['reminders','提醒'],['assistant','全局助手'],['chat-monitor','群消息'],['plugins','插件管理'],['settings','设置']];
export const loomScales = [{id:'today',name:'现在',copy:'今天的行动'},{id:'courses',name:'本周',copy:'课程与时间'},{id:'objects',name:'长线',copy:'对象与进展'}];
export function loomDestinations(modules, inventory) {
  return destinations.map(([id,name]) => {
    const owner=id==='plans'?'items':id, definition=builtinModules.find(m=>m.id===owner);
    const status=definition?.suspended?'挂起':!isModuleAvailable(owner)||!isModuleEnabled(modules,owner)?'已关闭':!(id==='assistant'?inventory.commands.includes('assistant.open'):inventory.pages.includes(id))?'暂不可用':'';
    return {id,name,status};
  });
}

export function createLoomNav({host,surface,bindings,modules,active,feedback,returnWorkbench,openSearch}) {
  const chrome=document.createElement('div');chrome.className='loom-chrome';
  chrome.innerHTML='<header class="loom-heading"><span class="loom-wordmark">几微 · 经纬</span><span class="loom-location" role="status"></span><div><button type="button" data-loom-search>查找资料</button><button type="button" data-loom-command>页面 <kbd>Ctrl P</kbd></button><button type="button" data-skeleton-return>返回工作台</button></div></header><div class="loom-record-search"></div><button type="button" class="loom-thread" data-loom-thread aria-expanded="false" aria-controls="loom-drawer"><span aria-hidden="true">——</span> 线头</button><nav class="loom-scales" aria-label="经纬尺度"></nav><aside class="loom-drawer" id="loom-drawer" aria-label="线头导航" hidden><div class="loom-drawer-head"><h2>线头</h2><button type="button" data-loom-close aria-label="收起线头">收起</button></div><nav aria-label="全部页面" class="loom-links"></nav><p>记账 · 未实装</p></aside><p class="loom-feedback" role="status" aria-live="polite"></p>';
  surface.prepend(chrome);
  const palette=document.createElement('dialog');palette.id='loom-command-panel';palette.className='loom-command-panel';palette.setAttribute('aria-labelledby','loom-command-title');
  palette.innerHTML='<div class="loom-drawer-head"><h2 id="loom-command-title">打开页面</h2><button type="button" data-command-close>关闭</button></div><label for="loom-command-input">输入页面名称</label><input id="loom-command-input" type="search" autocomplete="off" placeholder="今天、事项、设置…"><div class="loom-command-results"></div><p role="status" data-command-status></p>';
  surface.append(palette);
  const drawer=chrome.querySelector('.loom-drawer'),thread=chrome.querySelector('[data-loom-thread]'),input=palette.querySelector('input'),results=palette.querySelector('.loom-command-results'),scales=chrome.querySelector('.loom-scales');
  let disposed=false,catalog=[],signature='',paletteOpener;
  const listen=(...args)=>bindings.listen(...args);
  const report=error=>{chrome.querySelector('.loom-feedback').textContent=error.message;palette.querySelector('[data-command-status]').textContent=error.message;feedback(error.message,'error');};
  const closeDrawer=(focus=true)=>{drawer.hidden=true;thread.setAttribute('aria-expanded','false');if(focus)thread.focus({preventScroll:true});};
  const closePalette=(focus=true)=>{if(!palette.open)return;palette.close();if(focus&&paletteOpener?.isConnected&&paletteOpener.getClientRects().length)paletteOpener.focus({preventScroll:true});};
  const close=()=>{closeDrawer(false);closePalette(false);};
  const mark=()=>{const current=active();chrome.querySelector('.loom-location').textContent=catalog.find(p=>p.id===current)?.name||'工作空间';chrome.querySelectorAll('[data-loom-go]').forEach(b=>{if(b.dataset.loomGo===current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});};
  const makeLink=page=>{const b=document.createElement('button');b.type='button';b.textContent=page.name;b.dataset.loomGo=page.id;if(page.status){b.disabled=true;b.textContent+=' · '+page.status;}return b;};
  const filter=()=>{const query=input.value.trim().toLowerCase(),matches=catalog.filter(p=>p.status!=='已关闭'&&p.status!=='暂不可用'&&(p.name.toLowerCase().includes(query)||p.id.includes(query)));results.replaceChildren(...matches.map(makeLink));palette.querySelector('[data-command-status]').textContent=matches.length?`${matches.filter(p=>!p.status).length} 个可用页面；上下键选择，Enter打开`:'没有匹配页面，请更换名称。';};
  const render=()=>{
    if(disposed)return;catalog=loomDestinations(modules(),host.inventory());const next=JSON.stringify(catalog);
    if(signature!==next){const focused=document.activeElement?.dataset.loomGo;signature=next;chrome.querySelector('.loom-links').replaceChildren(...catalog.filter(p=>(!p.status||p.status==='挂起')&&!loomScales.some(s=>s.id===p.id)).map(makeLink));scales.replaceChildren(...loomScales.filter(s=>catalog.some(p=>p.id===s.id&&!p.status)).map(s=>{const b=makeLink({...s,status:''}),small=document.createElement('small');small.textContent=s.copy;b.append(small);return b;}));if(palette.open)filter();if(focused&&!document.activeElement?.getClientRects().length)thread.focus({preventScroll:true});}
    mark();
  };
  const focusPage=()=>{const page=surface.querySelector('.loom-content > [data-page]:not([hidden])'),target=page?.querySelector('h1,h2')||page;if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'auto'});}};
  const go=id=>{
    if(disposed)return false;
    try{const page=loomDestinations(modules(),host.inventory()).find(p=>p.id===id);if(!page||page.status)throw Error(`${page?.name||'页面'}${page?.status?' · '+page.status:'不可用'}，请在插件管理查看。`);if(document.querySelector('dialog[open]:not(#loom-command-panel)'))throw Error('请先保存或关闭当前编辑面板，再打开其他页面。');close();if(id==='assistant'){thread.focus({preventScroll:true});host.run('assistant.open');}else{host.navigate(id);focusPage();}chrome.querySelector('.loom-feedback').textContent='';mark();return true;}catch(error){report(error);return false;}
  };
  const openPalette=()=>{if(disposed)return;if(document.querySelector('dialog[open]:not(#loom-command-panel)')){report(Error('请先保存或关闭当前编辑面板，再打开页面命令。'));return;}if(palette.open){closePalette();return;}closeDrawer(false);paletteOpener=document.activeElement;input.value='';render();filter();palette.showModal();input.focus();};
  listen(chrome,'click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-loom-go'))go(b.dataset.loomGo);else if(b.hasAttribute('data-loom-thread')){if(!drawer.hidden)closeDrawer();else{drawer.hidden=false;thread.setAttribute('aria-expanded','true');drawer.querySelector('button').focus();}}else if(b.hasAttribute('data-loom-close'))closeDrawer();else if(b.hasAttribute('data-loom-command'))openPalette();else if(b.hasAttribute('data-skeleton-return'))returnWorkbench();else if(b.hasAttribute('data-loom-search')){close();openSearch(b);}});
  listen(palette,'click',event=>{const b=event.target.closest('button');if(b?.hasAttribute('data-loom-go'))go(b.dataset.loomGo);else if(b?.hasAttribute('data-command-close'))closePalette();});
  listen(input,'input',event=>{if(!event.isComposing)filter();});listen(input,'compositionend',filter);
  listen(palette,'cancel',event=>{event.preventDefault();closePalette();});
  listen(palette,'keydown',event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePalette();return;}const buttons=[...results.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const delta=event.key==='ArrowDown'?1:-1,next=index<0?(delta>0?0:buttons.length-1):(index+delta+buttons.length)%buttons.length;buttons[next]?.focus();}if(event.key==='Enter'&&event.target===input){event.preventDefault();buttons[0]?.click();}});
  listen(document,'pointerdown',event=>{if(!drawer.hidden&&!drawer.contains(event.target)&&!thread.contains(event.target))closeDrawer(false);});
  const keydown=event=>{
    if(event.isComposing||event.keyCode===229)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopImmediatePropagation();openPalette();}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){close();}
    else if(event.key==='Escape'&&!drawer.hidden&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();closeDrawer();}
    else if((event.ctrlKey||event.metaKey)&&/^[1-3]$/.test(event.key)&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();go(loomScales[+event.key-1].id);}
    else if((event.ctrlKey||event.metaKey)&&/^[4-7]$/.test(event.key)){event.preventDefault();event.stopImmediatePropagation();}
    else if(event.key==='F6'&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();if(chrome.contains(document.activeElement))focusPage();else thread.focus({preventScroll:true});}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='n'&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();try{const id=active();if(id==='courses')document.querySelector('#desktop-add-course').click();else if(id==='notes')host.run('notes.new');else if(id==='objects')host.run('objects.new');else host.run('items.edit','task',null);}catch(error){report(error);}}
  };
  const dispose=()=>{if(disposed)return;disposed=true;close();chrome.remove();palette.remove();};bindings.onStop(dispose);
  return {render,go,close,mark,keydown,focusPage,report,searchHome:chrome.querySelector('.loom-record-search'),dispose};
}
