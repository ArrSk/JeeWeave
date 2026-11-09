import {designIcon} from './design-icons.mjs';
import {isComplete} from './planning.mjs';
import {today,weekdayOf} from '../shared/packages/core/src/semester-calendar.mjs';
import {shiftDate,shiftTime} from './design-inputs.mjs';

// UI intent adapter. Only existing public item, page and editor commands may write.
export function installDesktopExperience({host,bindings,refresh,feedback,dust}) {
  const root=document.documentElement,main=document.querySelector('.main'),tools=document.querySelector('.desktop-workspace-tools');
  const listen=(...args)=>bindings.listen(...args),pending=new Map(),enhanced=new WeakSet();let disposed=false,serial=0,arranging=null,drag=null,dragFrame=0,dropZone;
  const visible=e=>e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
  const newButton=document.createElement('button');newButton.type='button';newButton.id='desktop-global-new';newButton.className='desktop-global-new primary';newButton.innerHTML=designIcon('plus')+'<span>新建</span>';newButton.title='新建 · Ctrl+N';tools.querySelector('.desktop-workspace-actions').append(newButton);
  const newMenu=document.createElement('div');newMenu.className='design-popover';newMenu.setAttribute('popover','auto');newMenu.innerHTML='<strong>新建</strong><div class="design-new-actions"><button type="button" data-design-new="item">事项</button><button type="button" data-design-new="note">笔记</button><button type="button" data-design-new="object">对象</button></div>';document.body.append(newMenu);
  const newRecord=()=>{if(document.querySelector('dialog[open]'))return;const page=main.dataset.activeView,button={courses:'#desktop-add-course',plans:'#desktop-add-plan',notes:'#desktop-journal-new',objects:'#desktop-new-object'}[page];if(button){const target=document.querySelector(button);if(target&&!target.disabled){target.click();return;}}const r=newButton.getBoundingClientRect();newMenu.style.left=Math.max(12,r.right-286)+'px';newMenu.style.top=r.bottom+8+'px';newMenu.showPopover();};
  listen(newButton,'click',newRecord);listen(newMenu,'click',e=>{const action=e.target.closest('[data-design-new]')?.dataset.designNew;if(!action)return;try{newMenu.hidePopover();if(action==='item')host.run('items.edit','task',null);else host.run(action==='note'?'notes.new':'objects.new');}catch(error){feedback(error.message,'error');}});
  const breadcrumb=document.createElement('b');breadcrumb.className='desktop-breadcrumb-current';tools.querySelector(':scope>span').append(breadcrumb);
  const navNames={overview:'总览',today:'今天',courses:'课程表',plans:'事项',notes:'笔记',objects:'对象',calendar:'日历',settings:'设置',plugins:'插件','web-capture':'采集',reminders:'提醒'};
  const updatePage=()=>{newButton.disabled=['settings','plugins'].includes(main.dataset.activeView);breadcrumb.textContent=' › '+(navNames[main.dataset.activeView]||'工作空间');};updatePage();
  const pageObserver=new MutationObserver(()=>{updatePage();if(!drag)finishArrange();});pageObserver.observe(main,{attributes:true,attributeFilter:['data-active-view']});
  const planning=document.querySelector('#desktop-plan-form .desktop-item-fields');
  if(planning){
    const details=document.createElement('details');details.className='wide design-secondary-form';const summary=document.createElement('summary');summary.textContent='为什么与关联（可选）';details.append(summary);
    for(const name of ['goal','completionCriteria','objectId']){const label=planning.querySelector(`[name="${name}"]`)?.closest('label');if(label)details.append(label);}
    planning.append(details);for(const [name,title]of [['title','是什么'],['type','什么时候'],['note','补充记录']]){const field=planning.querySelector(`[name="${name}"]`)?.closest('label');if(field){const h=document.createElement('h3');h.className='wide design-form-section-title';h.textContent=title;field.before(h);}}
  }
  document.querySelector('#desktop-today-list')?.closest('.panel')?.classList.add('design-today-paper');
  for(const id of ['desktop-add-plan','desktop-journal-new','desktop-new-object']){const button=document.getElementById(id);if(button){button.classList.remove('primary');button.classList.add('secondary');}}
  // A single settings column with a compact, independent secondary navigation.
  const settings=document.querySelector('.desktop-settings-panel'),settingNav=document.createElement('nav');settingNav.className='desktop-settings-subnav';settingNav.setAttribute('aria-label','设置分类');settings.prepend(settingNav);
  let selectedSetting=null;
  const updateSettings=()=>{
    const sections=[...settings.children].filter(e=>e.tagName==='SECTION'&&!e.hidden),same=sections.length===settingNav.children.length&&sections.every((s,i)=>s.dataset.designSetting===String(i));if(same)return;
    settingNav.replaceChildren();sections.forEach((section,i)=>{section.dataset.designSetting=String(i);const b=document.createElement('button');b.type='button';b.textContent=section.querySelector('h2')?.textContent||'其他设置';b.dataset.settingIndex=String(i);settingNav.append(b);});
    if(!selectedSetting?.isConnected||!sections.includes(selectedSetting))selectedSetting=sections[0];sections.forEach((section,i)=>{section.classList.toggle('design-settings-active',section===selectedSetting);settingNav.children[i].setAttribute('aria-current',String(section===selectedSetting));});
  };
  listen(settingNav,'click',e=>{const b=e.target.closest('[data-setting-index]');if(!b)return;selectedSetting=[...settings.children].filter(s=>s.tagName==='SECTION'&&!s.hidden)[+b.dataset.settingIndex];settings.querySelectorAll(':scope>section[data-design-setting]').forEach(s=>s.classList.toggle('design-settings-active',s===selectedSetting));[...settingNav.children].forEach(n=>n.setAttribute('aria-current',String(n===b)));selectedSetting?.scrollIntoView({block:'nearest'});});
  const help=document.createElement('section');help.className='desktop-settings-section';help.innerHTML='<h2>键盘帮助</h2><dl><dt>Ctrl+K</dt><dd>查找与命令；Esc先清空，再收起</dd><dt>Ctrl+N</dt><dd>按当前页面新建</dd><dt>Ctrl+1..7</dt><dd>切到对应导航项</dd><dt>F6</dt><dd>在导航、工具栏、内容、浮层间循环</dd><dt>Ctrl+Z</dt><dd>5秒内撤销最近完成；文本编辑保留原撤销</dd><dt>安排把手：Ctrl+上下 / Alt+上下</dt><dd>改日期 / 改30分钟；Enter确认，Esc取消</dd></dl>';settings.append(help);
  const settingsObserver=new MutationObserver(updateSettings);settingsObserver.observe(settings,{childList:true});updateSettings();
  const confirmed=new WeakSet(),confirmPopover=document.createElement('div');confirmPopover.className='design-popover';confirmPopover.setAttribute('popover','auto');confirmPopover.innerHTML='<strong>确认删除这条事项？</strong><p>删除后原记录将被移除，请先核对。</p><button type="button" data-delete-cancel>取消</button><button type="button" class="danger-button" data-delete-confirm>确认删除</button>';document.body.append(confirmPopover);let deleteTarget;
  listen(document,'click',e=>{const button=e.target.closest?.('[data-item-action=delete]');if(!button)return;if(confirmed.has(button)){confirmed.delete(button);return;}e.preventDefault();e.stopImmediatePropagation();deleteTarget=button;const r=button.getBoundingClientRect();confirmPopover.style.left=Math.max(12,Math.min(r.right-286,innerWidth-298))+'px';confirmPopover.style.top=Math.max(12,Math.min(r.bottom+8,innerHeight-180))+'px';confirmPopover.showPopover();confirmPopover.querySelector('[data-delete-cancel]').focus();},{capture:true});
  listen(confirmPopover,'click',e=>{if(e.target.closest('[data-delete-cancel]')){confirmPopover.hidePopover();deleteTarget?.focus();}if(e.target.closest('[data-delete-confirm]')){confirmPopover.hidePopover();if(deleteTarget?.isConnected){confirmed.add(deleteTarget);deleteTarget.click();}}});
  // Completion is committed by the original handler. Observe only its successful result.
  const releaseHeld=token=>{for(const row of token.held)row.classList.remove('design-held-source');token.held.clear();};
  const placeCompletion=token=>{
    if(!token.ghost.isConnected&&token.page&&!token.page.hidden){const parent=token.parent.isConnected?token.parent:(token.group?token.page.querySelector(`[data-today-group="${CSS.escape(token.group)}"]`):null)||token.page.querySelector('.loom-completion-slot')||token.page.querySelector('#desktop-today-list,#desktop-plan-list')||token.page;if(parent)parent.insertBefore(token.ghost,parent.children[Math.min(token.index,parent.children.length)]||null);}
    if(token.page)for(const row of token.page.querySelectorAll('.desktop-planning-item,.desktop-today-item')){if((row.dataset.itemId||row.dataset.todayItem)===token.ref.id&&row.dataset.kind===token.ref.collection){row.classList.add('design-held-source');token.held.add(row);}}
  };
  const undo=token=>{
    if(!pending.has(token.id))return;
    try{const api=host.client('items'),current=api.get(token.ref);if(JSON.stringify(current)!==token.expected)throw Error('事项已被再次修改，未覆盖新状态。');if(token.phase)api.setPhase(token.ref,token.phase,false);else api.toggle(token.ref,token.date);clearTimeout(token.timer);token.ghost.remove();releaseHeld(token);pending.delete(token.id);refresh();feedback('已撤销完成。','success');}catch(error){feedback(error.message,'error');}
  };
  const completion=e=>{
    const b=e.target.closest('[data-item-action=toggle],[data-today-item-complete],[data-cal-complete],[data-phase-toggle],[data-cal-phase]');if(!b)return;
    const phaseControl=b.hasAttribute('data-phase-toggle')||b.hasAttribute('data-cal-phase');if((phaseControl&&e.type!=='change')||(!phaseControl&&e.type!=='click'))return;
    const id=b.dataset.id||b.dataset.todayItemComplete||b.dataset.calComplete||b.dataset.itemId||b.dataset.item,kind=b.dataset.kind,phase=b.dataset.phaseToggle||b.dataset.calPhase,date=b.dataset.completionDate||b.dataset.occurrence||today();if(!id||!kind)return;
    let before;try{before=host.client('items').get({collection:kind,id});if(phase?before.phases.find(p=>p.id===phase)?.done:isComplete(before,date))return;}catch{return;}
    const source=b.closest('.desktop-planning-item,.desktop-today-item,.desktop-calendar-aside,.desktop-list-item')||b.parentElement,parent=source.parentElement,index=[...parent.children].indexOf(source),ref={collection:kind,id},page=source.closest('[data-page]'),group=source.closest('[data-today-group]')?.dataset.todayGroup;
    queueMicrotask(()=>{
      if(disposed)return;let after;try{after=host.client('items').get(ref);if(!(phase?after.phases.find(p=>p.id===phase)?.done:isComplete(after,date)))return;}catch{return;}
      const ghost=document.createElement('article');ghost.className='design-retained-completion';ghost.innerHTML=designIcon('check',20)+'<strong></strong><span>已完成</span><button type="button">撤销</button>';ghost.querySelector('strong').textContent=phase?before.phases.find(p=>p.id===phase)?.title||before.title:before.title;
      const token={id:++serial,ref,date,phase,expected:JSON.stringify(after),ghost,parent,index,page,group,held:new Set()};pending.set(token.id,token);ghost.querySelector('button').onclick=()=>undo(token);placeCompletion(token);
      const r=ghost.getBoundingClientRect();dust?.({x:r.left+24,y:r.top+20},12);
      token.timer=setTimeout(()=>{pending.delete(token.id);releaseHeld(token);if(matchMedia('(prefers-reduced-motion: reduce)').matches)ghost.remove();else ghost.animate([{opacity:1},{opacity:0}],{duration:240,easing:'cubic-bezier(.16,1,.3,1)'}).finished.then(()=>ghost.remove(),()=>ghost.remove());},5000);
    });
  };
  listen(document,'click',completion,{capture:true});listen(document,'change',completion,{capture:true});
  // Arrange a new execution slot, using the existing optimistic public schedule API.
  const preview=document.createElement('div');preview.className='design-arrange-preview';preview.hidden=true;preview.innerHTML='<p role="status"></p><button type="button" class="primary" data-arrange-confirm>确认安排</button><button type="button" data-arrange-cancel>取消</button>';document.body.append(preview);
  function finishArrange(){if(drag&&document.body.hasPointerCapture(drag.id))document.body.releasePointerCapture(drag.id);cancelAnimationFrame(dragFrame);dragFrame=0;if(drag){drag.ghost.remove();drag.source.classList.remove('design-drag-placeholder');drag=null;}dropZone?.classList.remove('design-drop-zone');dropZone=null;arranging=null;preview.hidden=true;}
  const renderPreview=()=>{if(preview.hidden)preview.hidden=false;const text=arranging.title+' · '+arranging.date+' '+arranging.time+'–'+shiftTime(arranging.time,30)+'（新增时段，保留原截止）',p=preview.querySelector('p');if(p.textContent!==text)p.textContent=text;};
  const begin=handle=>{
    try{const ref={collection:handle.dataset.arrangeKind,id:handle.dataset.arrangeId},item=host.client('items').get(ref),date=document.querySelector('#desktop-calendar-jump')?.value||today();let occurrence=date;
      if(item.anchor.type==='weekly'){occurrence=occurrence<item.anchor.startDate?item.anchor.startDate:occurrence;for(let i=0;i<7&&!item.anchor.weekdays.includes(weekdayOf(occurrence));i++)occurrence=shiftDate(occurrence,1);}
      arranging={ref,title:item.title,expected:JSON.stringify(item),date,time:'09:00',occurrence:item.anchor.type==='weekly'?occurrence:''};return true;
    }catch(error){feedback(error.message,'error');return false;}
  };
  const commitArrange=()=>{if(!arranging)return;const a=arranging;
    try{host.client('items').schedule(a.ref,{id:a.slotId||(a.slotId='slot_'+crypto.randomUUID()),label:'',start:a.date+'T'+a.time+':00+08:00',end:(shiftTime(a.time,30)<=a.time?shiftDate(a.date,1):a.date)+'T'+shiftTime(a.time,30)+':00+08:00',...(a.occurrence?{occurrenceDate:a.occurrence}:{})},{expected:a.expected});finishArrange();refresh();dust?.({x:innerWidth-150,y:innerHeight-120},8);feedback('执行时段已安排，原事项与截止保留。','success');}catch(error){feedback(error.message+' 可取消后重新核对。','error');}
  };
  listen(preview,'click',e=>{if(e.target.closest('[data-arrange-confirm]'))commitArrange();if(e.target.closest('[data-arrange-cancel]'))finishArrange();});
  const addHandles=node=>{
    const rows=[...(node.matches?.('.desktop-planning-item')?[node]:[]),...(node.querySelectorAll?.('.desktop-planning-item')||[])];
    for(const row of rows){if(enhanced.has(row)||row.classList.contains('is-done'))continue;enhanced.add(row);const b=document.createElement('button');b.type='button';b.className='design-drag-handle';b.dataset.arrangeId=row.dataset.itemId;b.dataset.arrangeKind=row.dataset.kind;b.setAttribute('aria-label','安排时间：拖到日历，或Ctrl上下改日期、Alt上下改时间、Enter确认');b.title='拖到日历安排，或用方向键调整';b.innerHTML=designIcon('drag');row.querySelector('.desktop-list-item')?.append(b);}
  };
  const dropAt=(x,y)=>{
    const el=document.elementFromPoint(x,y),cell=el?.closest('[data-time-date],[data-cal-date]');if(dropZone!==cell){dropZone?.classList.remove('design-drop-zone');dropZone=cell;cell?.classList.add('design-drop-zone');}if(!cell)return false;
    arranging.date=cell.dataset.timeDate||cell.dataset.calDate;
    if(cell.dataset.timeDate){const minutes=Math.max(0,Math.min(23*60+30,Math.round((y-cell.getBoundingClientRect().top)/.8/30)*30));arranging.time=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
    return true;
  };
  listen(document,'pointerdown',e=>{const handle=e.target.closest('.design-drag-handle');if(!handle||e.button!==0||matchMedia('(prefers-reduced-motion: reduce)').matches||!begin(handle))return;const source=handle.closest('.desktop-planning-item'),ghost=document.createElement('div');ghost.className='design-paper-drag';ghost.textContent=arranging.title;document.body.append(ghost);source.classList.add('design-drag-placeholder');drag={source,ghost,id:e.pointerId,x:e.clientX,y:e.clientY};document.body.setPointerCapture(e.pointerId);e.preventDefault();});
  listen(document,'pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;drag.x=e.clientX;drag.y=e.clientY;if(dragFrame)return;dragFrame=requestAnimationFrame(()=>{dragFrame=0;if(!drag)return;drag.ghost.style.transform=`translate(${drag.x+12}px,${drag.y+12}px) rotate(1.5deg) scale(1.02)`;const target=document.elementFromPoint(drag.x,drag.y)?.closest('[data-view=calendar]');if(target&&!document.querySelector('dialog[open]')){const saved=arranging;target.click();arranging=saved;}if(arranging){dropAt(drag.x,drag.y);renderPreview();}});});
  listen(document,'pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const canDrop=dropAt(e.clientX,e.clientY);drag.ghost.remove();drag.source.classList.remove('design-drag-placeholder');drag=null;if(canDrop)commitArrange();else finishArrange();});listen(document,'pointercancel',finishArrange);
  listen(document,'keydown',e=>{
    const editing=e.target.matches?.('input,textarea,select,[contenteditable=true]');
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newRecord();return;}
    if((e.ctrlKey||e.metaKey)&&!editing&&e.key.toLowerCase()==='z'&&pending.size){e.preventDefault();undo([...pending.values()].at(-1));return;}
    if((e.ctrlKey||e.metaKey)&&/^[1-7]$/.test(e.key)&&!document.querySelector('dialog[open]')){const target=[...document.querySelectorAll('.nav [data-view]')].filter(b=>!b.hidden)[+e.key-1];if(target){e.preventDefault();target.click();}return;}
    if(e.key==='F6'){e.preventDefault();const areas=[document.querySelector('.sidebar'),tools,main.querySelector('[data-page]:not([hidden])'),document.querySelector('dialog[open]')].filter(Boolean);let index=areas.findIndex(a=>a.contains(document.activeElement)),next=areas[(index+1)%areas.length];let control=[...next.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].find(i=>!i.disabled&&visible(i)&&!i.classList.contains('design-native-source'));if(!control&&next.matches('.sidebar'))control=document.querySelector('#desktop-layout-menu');control?.focus({preventScroll:false});return;}
    const handle=e.target.closest?.('.design-drag-handle');if(handle&&(e.ctrlKey||e.altKey)&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(!arranging&&!begin(handle))return;if(e.ctrlKey)arranging.date=shiftDate(arranging.date,e.key==='ArrowUp'?-1:1);else arranging.time=shiftTime(arranging.time,e.key==='ArrowUp'?-30:30);renderPreview();return;}
    if(arranging&&e.key==='Enter'&&handle){e.preventDefault();commitArrange();}if(arranging&&e.key==='Escape'){e.preventDefault();finishArrange();}
  });
  const enhance=rootNode=>{
    addHandles(rootNode);[...(rootNode.matches?.('.desktop-object-choice:not([data-design-avatar])')?[rootNode]:[]),...(rootNode.querySelectorAll?.('.desktop-object-choice:not([data-design-avatar])')||[])].forEach(item=>{item.dataset.designAvatar='';const avatar=document.createElement('span');avatar.className='desktop-object-avatar';avatar.textContent=(item.querySelector('strong')?.textContent||item.textContent).trim().slice(0,1);avatar.setAttribute('aria-hidden','true');item.prepend(avatar);});
    [...(rootNode.matches?.('#desktop-today-list .desktop-list-item')?[rootNode]:[]),...(rootNode.querySelectorAll?.('#desktop-today-list .desktop-list-item')||[])].forEach(item=>{if(item.querySelector('.desktop-today-time'))return;const time=(item.querySelector('small')?.textContent||'').match(/\d{2}:\d{2}/)?.[0];if(time){const marker=document.createElement('span');marker.className='desktop-today-time';marker.textContent=time;item.prepend(marker);}});
  };
  enhance(document.body);const observer=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1)enhance(n);for(const token of pending.values())placeCompletion(token);});observer.observe(main,{childList:true,subtree:true});
  const dispose=()=>{disposed=true;finishArrange();for(const token of pending.values()){clearTimeout(token.timer);token.ghost.remove();releaseHeld(token);}pending.clear();observer.disconnect();settingsObserver.disconnect();pageObserver.disconnect();newButton.remove();newMenu.remove();confirmPopover.remove();preview.remove();help.remove();settingNav.remove();breadcrumb.remove();};bindings.onStop(dispose);return{dispose};
}
