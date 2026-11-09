import { loomDestinations, loomLayoutBands, loomLayoutKeys, loomBandGroups, loomGroups, loomScaleEntries } from './loom-catalog.mjs';
import { loomLayouts } from './skeleton.mjs';
import { loomShortcuts } from './loom-pages.mjs';

export { loomDestinations, loomLayoutBands, loomLayoutKeys };
// 面板里能直接执行的插件命令：只收不带参数、任何时候都能跑的那几条。
// 需要 kind / boolean 参数的命令不在这里列，免得点一下就丢一个错误。
const loomCommands = [
  ['assistant.open', '打开全局助手'],
  ['notes.new', '新建笔记'],
  ['objects.new', '新建对象'],
  ['reminders.new', '新建提醒'],
  ['today.other', '查看其他待处理事项']
];
export function createLoomNav({host,surface,bindings,modules,active,feedback,openSearch,blocked}) {
  const chrome=document.createElement('div');chrome.className='loom-chrome';
  // 页头只留查找与页面命令；骨架、织法与配色切换统一收在设置页。
  chrome.innerHTML='<header class="loom-heading"><span class="loom-wordmark">几微 · 经纬</span><span class="loom-location" role="status"></span><div class="loom-head-acts"><button type="button" data-loom-search>查找资料</button><button type="button" data-loom-command>全部页面 <kbd>Ctrl P</kbd></button></div></header><div class="loom-record-search"></div><p class="loom-feedback" role="status" aria-live="polite"></p><div class="loom-toast" role="status" aria-live="polite" hidden><span class="loom-toast-text"></span><button type="button" data-loom-undo>撤销 <kbd>Ctrl Z</kbd></button></div>';
  surface.prepend(chrome);
  // 四条布局的条带一次建好，按「布局 + 槽位」分组；CSS 只显示当前布局，隐藏的条带不进 Tab 与朗读顺序。
  const bands=new Map(),slots=new Map();
  for(const [layoutId,defs] of Object.entries(loomLayoutBands)) for(const def of defs){
    const key=`${layoutId}::${def.slot}`;
    let slot=slots.get(key);
    if(!slot){slot=document.createElement('div');slot.className='loom-slot';slot.dataset.loomSlot=def.slot;slot.dataset.loomSlotLayout=layoutId;chrome.append(slot);slots.set(key,slot);}
    const el=document.createElement('nav');el.className=def.band;el.dataset.loomBand=def.band;el.dataset.loomBandLayout=layoutId;el.setAttribute('aria-label',def.label);
    slot.append(el);bands.set(`${layoutId}::${def.band}`,el);
  }
  // 舆图左缘的标尺与指北是装饰：不承载数据，读屏与键盘都不会碰到它，CSS 只在舆图下显示。
  const gauge=document.createElement('aside');gauge.className='loom-atlas-gauge';gauge.setAttribute('aria-hidden','true');
  gauge.innerHTML='<span>N</span><i class="loom-gauge-rule"></i><span class="loom-gauge-ticks">'+'<i></i>'.repeat(12)+'</span>';
  chrome.append(gauge);
  // 涟漪右缘的潮汐条同理：只说明水面在动，不承载记录，也不接事件。
  const tide=document.createElement('div');tide.className='loom-ripple-tide';tide.setAttribute('aria-hidden','true');chrome.append(tide);
  const palette=document.createElement('dialog');palette.id='loom-command-panel';palette.className='loom-command-panel';palette.setAttribute('aria-labelledby','loom-command-title');
  palette.innerHTML='<div class="loom-panel-head"><h2 id="loom-command-title">打开页面或命令</h2><button type="button" data-command-close>关闭</button></div><label for="loom-command-input">输入页面或命令名称</label><input id="loom-command-input" type="search" autocomplete="off" placeholder="今天、事项、设置…"><div class="loom-command-results"></div><p role="status" data-command-status></p>';
  surface.append(palette);
  // 键盘地图与设置页读同一张表：`?` 随时打开，不用记。
  const keysPanel=document.createElement('dialog');keysPanel.id='loom-keys-panel';keysPanel.className='loom-command-panel loom-keys-panel';keysPanel.setAttribute('aria-labelledby','loom-keys-title');
  keysPanel.innerHTML='<div class="loom-panel-head"><h2 id="loom-keys-title">键盘地图</h2><button type="button" data-keys-close>关闭</button></div><ul class="loom-key-list">'+loomShortcuts.map(([key,text])=>`<li><kbd>${key}</kbd><span>${text}</span></li>`).join('')+'</ul>';
  surface.append(keysPanel);
  const input=palette.querySelector('input'),results=palette.querySelector('.loom-command-results');
  let disposed=false,catalog=[],signature='',paletteOpener,currentLayout='jingwei';
  const listen=(...args)=>bindings.listen(...args);
  const report=error=>{chrome.querySelector('.loom-feedback').textContent=error.message;palette.querySelector('[data-command-status]').textContent=error.message;feedback(error.message,'error');};
  const closePalette=(focus=true)=>{if(!palette.open)return;palette.close();if(focus&&paletteOpener?.isConnected&&paletteOpener.getClientRects().length)paletteOpener.focus({preventScroll:true});};
  const closeKeys=()=>{if(keysPanel.open)keysPanel.close();};
  const close=()=>{closePalette(false);closeKeys();};
  // 撤销条：完成一件事后 6 秒内可撤回；动作由调用处给，这里不碰业务。
  let undoAction=null,toastTimer;
  const hideToast=()=>{clearTimeout(toastTimer);toastTimer=null;undoAction=null;const el=chrome.querySelector('.loom-toast');if(el){el.hidden=true;el.querySelector('.loom-toast-text').textContent='';}};
  const toast=(text,onUndo)=>{const el=chrome.querySelector('.loom-toast');if(!el)return;clearTimeout(toastTimer);undoAction=typeof onUndo==='function'?onUndo:null;el.querySelector('.loom-toast-text').textContent=text;el.hidden=false;toastTimer=setTimeout(hideToast,6000);};
  const undo=()=>{if(!undoAction)return false;const action=undoAction;hideToast();try{action();}catch(error){report(error);}return true;};
  const setLocation=text=>{chrome.querySelector('.loom-location').textContent=text;};
  // Flush the sticky status height before restoring scroll; browser anchoring otherwise shifts the page below it.
  const notice=text=>{const scroll=surface.scrollTop;chrome.querySelector('.loom-feedback').textContent=text;void chrome.offsetHeight;surface.scrollTop=scroll;};
  // 隐藏布局的条带仍在 DOM 里，键盘入口必须只看得到的那一份。
  const visibleLinks=()=>[...chrome.querySelectorAll('[data-loom-slot] [data-loom-go]:not([aria-disabled="true"])')].filter(b=>b.getClientRects().length);
  const firstLink=()=>visibleLinks()[0];
  const mark=()=>{
    const current=active();
    chrome.querySelector('.loom-location').textContent=catalog.find(p=>p.id===current)?.name||'工作空间';
    chrome.querySelectorAll('[data-loom-go]').forEach(b=>{if(b.dataset.loomGo===current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  };
  // 挂起的页仍可点：点进去看到原因和去处，比一个按不动的死按钮更有用。已关闭/暂不可用的页不进任何列表。
  const threadDot=page=>{const dot=document.createElement('i');dot.className='loom-link-thread';dot.style.setProperty('--thread',`var(${page.thread||'--accent'})`);dot.setAttribute('aria-hidden','true');return dot;};
  const makeLink=(page,options={})=>{const b=document.createElement('button');b.type='button';b.dataset.loomGo=page.id;b.dataset.loomPlugin=page.plugin||'';b.title=[page.pluginName,page.name,page.status].filter(Boolean).join(' · ');if(page.status)b.setAttribute('aria-disabled','true');const label=document.createElement('span');label.className='loom-link-name';label.textContent=(options.name||page.name)+(page.status?' · '+page.status:'');b.append(threadDot(page),label);if(options.copy){const small=document.createElement('small');small.className='loom-link-copy';small.textContent=options.copy;b.append(small);}if(options.meta){const meta=document.createElement('small');meta.className='loom-link-meta';meta.textContent=[page.pluginName,loomGroups[page.group]?.name].filter(Boolean).join(' · ');b.append(meta);}return b;};
  const makeCommand=([id,label])=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.loomRun=id;return b;};
  const setLabel=(text,count)=>{const el=document.createElement('span');el.className='loom-set-label';const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');el.append(dot,document.createTextNode(text));if(count!=null){const b=document.createElement('b');b.textContent=String(count);el.append(b);}return el;};
  const filter=()=>{const query=input.value.trim().toLowerCase();const pages=catalog.filter(p=>p.status!=='已关闭'&&p.status!=='暂不可用'&&(p.name.toLowerCase().includes(query)||p.id.includes(query)||(p.pluginName||'').toLowerCase().includes(query)));const commands=loomCommands.filter(([id,label])=>host.inventory().commands.includes(id)&&(!query||label.toLowerCase().includes(query)));const nodes=[];for(const group of Object.keys(loomGroups)){const items=pages.filter(p=>p.group===group);if(!items.length)continue;if(!(group==='home'&&items.length===1))nodes.push(setLabel(loomGroups[group].name,items.length));nodes.push(...items.map(page=>makeLink(page,{meta:true})));}if(commands.length)nodes.push(setLabel('命令',commands.length),...commands.map(makeCommand));results.replaceChildren(...nodes);palette.querySelector('[data-command-status]').textContent=pages.length||commands.length?`${pages.filter(p=>!p.status).length} 个页面 · ${commands.length} 条命令；按插件分组，上下键选择，Enter 打开`:'没有匹配页面，请更换名称。';};
  const fillBands=()=>{for(const [layoutId,defs] of Object.entries(loomLayoutBands)) for(const def of defs){const el=bands.get(`${layoutId}::${def.band}`);const groups=loomBandGroups(layoutId,def,catalog);if(def.roles){el.replaceChildren(...(groups[0]?.entries||[]).map(entry=>makeLink(entry.page,{name:entry.name,copy:entry.copy})));continue;}el.replaceChildren(...groups.map(group=>{const box=document.createElement('span');box.className='loom-set';box.dataset.loomSet=group.id;if(!(group.id==='home'&&group.entries.length===1))box.append(setLabel(group.label,group.entries.length));const links=document.createElement('span');links.className='loom-set-links';links.append(...group.entries.map(entry=>makeLink(entry.page)));box.append(links);return box;}));}};
  const render=()=>{
    if(disposed)return;catalog=loomDestinations(modules(),host.inventory());const next=JSON.stringify([catalog,currentLayout]);
    if(signature!==next){
      const focused=document.activeElement?.dataset.loomGo;
      signature=next;fillBands();if(palette.open)filter();
      // 被关掉的插件会带走聚焦的那个入口：把焦点交给当前布局的第一个可用页，别让键盘掉到文档根上。
      if(focused&&!document.activeElement?.getClientRects().length){const nextFocus=firstLink();if(nextFocus)nextFocus.focus({preventScroll:true});}
    }
    mark();chrome.querySelector('.loom-wordmark').textContent=`几微 · ${(loomLayouts.find(item=>item.id===currentLayout)||{name:'经纬'}).name}`;
  };
  const setLayout=value=>{if(disposed||currentLayout===value)return;currentLayout=value;render();};
  // 粘顶的条带高度随布局与换行变化，落点要量它自己，写死一个数就会把标题压在条带底下。
  const focusPage=()=>{const page=surface.querySelector('.loom-content > [data-page]:not([hidden])'),target=page?.querySelector('h1,h2')||page;if(target){target.setAttribute('tabindex','-1');target.style.scrollMarginTop=`${chrome.offsetHeight+16}px`;target.focus({preventScroll:true});target.scrollIntoView({block:'start',behavior:'auto'});}};
  const go=id=>{
    if(disposed)return false;
    try{
      const page=loomDestinations(modules(),host.inventory()).find(p=>p.id===id);
      if(!page||page.status){close();const error=Error(`${page?.name||'页面'}${page?.status?' · '+page.status:'不可用'}，请在插件管理查看。`);report(error);if(page?.status)blocked?.(page);return false;}
      if(document.querySelector('dialog[open]:not(#loom-command-panel)'))throw Error('请先保存或关闭当前编辑面板，再打开其他页面。');
      close();if(id==='assistant'){host.run('assistant.open');}else{host.navigate(id);focusPage();try{history.replaceState(null,'',`#${id}`);}catch{}}
      chrome.querySelector('.loom-feedback').textContent='';mark();return true;
    }catch(error){report(error);return false;}
  };
  // 裸数字直达、方括号轮巡都只读当前可用的页面，关掉的页不会把序号占住。
  const available=()=>catalog.filter(page=>!page.status);
  const jump=index=>{const page=available()[index];if(page)go(page.id);};
  const step=delta=>{const list=available();if(list.length<2)return;const at=list.findIndex(page=>page.id===active());const next=list[(at<0?0:at+delta+list.length)%list.length];if(next&&next.id!==active())go(next.id);};
  const openKeys=()=>{if(disposed)return;if(document.querySelector('dialog[open]:not(#loom-command-panel)')){report(Error('请先保存或关闭当前编辑面板。'));return;}closePalette(false);if(keysPanel.open){closeKeys();return;}keysPanel.showModal();keysPanel.querySelector('[data-keys-close]').focus();};
  const openPalette=()=>{if(disposed)return;if(document.querySelector('dialog[open]:not(#loom-command-panel)')){report(Error('请先保存或关闭当前编辑面板，再打开页面命令。'));return;}if(palette.open){closePalette();return;}paletteOpener=document.activeElement;input.value='';render();filter();palette.showModal();input.focus();};
  listen(chrome,'click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-loom-go'))go(b.dataset.loomGo);else if(b.hasAttribute('data-loom-command'))openPalette();else if(b.hasAttribute('data-loom-search')){close();openSearch(b);}else if(b.hasAttribute('data-loom-undo'))undo();});
  listen(palette,'click',event=>{const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-loom-run')){closePalette(false);try{host.run(b.dataset.loomRun);}catch(error){report(error);}}else if(b.hasAttribute('data-loom-go'))go(b.dataset.loomGo);else if(b.hasAttribute('data-command-close'))closePalette();});
  listen(keysPanel,'click',event=>{if(event.target.closest('[data-keys-close]'))closeKeys();});
  listen(keysPanel,'cancel',event=>{event.preventDefault();closeKeys();});
  listen(input,'input',event=>{if(!event.isComposing)filter();});listen(input,'compositionend',filter);
  listen(palette,'cancel',event=>{event.preventDefault();closePalette();});
  listen(palette,'keydown',event=>{if(event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closePalette();return;}const buttons=[...results.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const delta=event.key==='ArrowDown'?1:-1,next=index<0?(delta>0?0:buttons.length-1):(index+delta+buttons.length)%buttons.length;buttons[next]?.focus();}if(event.key==='Enter'&&event.target===input){event.preventDefault();buttons[0]?.click();}});
  const keydown=event=>{
    if(event.isComposing||event.keyCode===229)return;
    const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName||'')||event.target?.isContentEditable;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){event.preventDefault();event.stopImmediatePropagation();openPalette();}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){close();}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!typing&&!document.querySelector('dialog[open]')){if(undo()){event.preventDefault();event.stopImmediatePropagation();}}
    else if(event.key==='?'&&!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();openKeys();}
    else if(/^[1-9]$/.test(event.key)&&!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();jump(+event.key-1);}
    else if((event.key==='['||event.key===']')&&!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();step(event.key===']'?1:-1);}
    else if((event.ctrlKey||event.metaKey)&&/^[1-3]$/.test(event.key)&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();const entry=loomScaleEntries(currentLayout,catalog).filter(item=>!item.page.status)[+event.key-1];if(entry)go(entry.page.id);}
    else if((event.ctrlKey||event.metaKey)&&/^[4-7]$/.test(event.key)){event.preventDefault();event.stopImmediatePropagation();}
    else if(event.key==='F6'&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();if(chrome.contains(document.activeElement))focusPage();else{const link=visibleLinks().find(b=>b.getAttribute('aria-current')==='page')||firstLink();if(link)link.focus({preventScroll:true});else focusPage();}}
    else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='n'&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();try{const id=active();if(id==='courses')document.querySelector('#desktop-add-course').click();else if(id==='notes')host.run('notes.new');else if(id==='objects')host.run('objects.new');else host.run('items.edit','task',null);}catch(error){report(error);}}
  };
  const dispose=()=>{if(disposed)return;disposed=true;close();hideToast();keysPanel.remove();chrome.remove();palette.remove();};bindings.onStop(dispose);
  return {render,go,close,mark,keydown,focusPage,report,setLayout,toast,undo,notice,setLocation,openKeys,searchHome:chrome.querySelector('.loom-record-search'),dispose};
}
