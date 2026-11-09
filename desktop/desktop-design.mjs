import { installWeftDust } from './design-dust.mjs';
import { layoutPresets, floatingLayouts, readLayout, saveLayout, clampBarPosition } from './layout.mjs';

// Workspace-owned chrome: existing navigation nodes and commands remain authoritative.
export function createDesktopDesign({container,storage,bindings,feedback}) {
  const root=document.documentElement,shell=document.querySelector('.shell'),sidebar=shell.querySelector('.sidebar'),main=shell.querySelector('.main');
  const svg=p=>`<svg class="desktop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const listen=(target,...args)=>bindings.listen(target,...args);
  const section=document.createElement('section');section.className='desktop-settings-section desktop-layout-settings';
  section.innerHTML=`<div class="desktop-section-head"><div><h2>布局与动效</h2><p>布局与配色分别选择，随本地设置保存。</p></div><span id="desktop-current-layout" role="status"></span></div><div class="desktop-layout-options" role="group" aria-label="工作区布局">${layoutPresets.map(p=>`<button type="button" data-desktop-layout="${p.id}" aria-pressed="false"><span class="desktop-layout-sketch sketch-${p.id}" aria-hidden="true"><i></i><b></b></span><strong>${p.name}</strong><small>${p.copy}</small></button>`).join('')}</div><div class="desktop-layout-footer"><label><input id="desktop-particles-toggle" type="checkbox">轻柔粒子</label><button type="button" id="desktop-bar-reset" class="secondary">复位悬浮栏</button><span>悬浮栏可拖动，方向键微调，Home 复位。</span></div>`;
  container.prepend(section);
  const handle=document.createElement('button');handle.type='button';handle.id='desktop-bar-handle';handle.title='拖动悬浮栏 · 方向键移动 · Home 复位';handle.setAttribute('aria-label',handle.title);handle.innerHTML=svg('<path d="M8 5v14M16 5v14"/>');sidebar.prepend(handle);
  const tools=document.createElement('header');tools.className='desktop-workspace-tools';
  tools.innerHTML=`<button type="button" id="desktop-layout-menu" aria-expanded="false" aria-label="展开导航">${svg('<path d="M4 6h16M4 12h16M4 18h16"/>')}</button><span>我的工作空间</span><div class="desktop-workspace-actions"></div>`;
  const searchButton=document.querySelector('#desktop-search-open'),searchHome=searchButton.parentElement;
  tools.querySelector('.desktop-workspace-actions').append(searchButton);
  tools.querySelector('.desktop-workspace-actions').before(document.querySelector('#desktop-search-panel'));
  main.prepend(tools);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let current,revision=0,drag=null,disposed=false,resizeFrame=0;
  const dust=installWeftDust({bindings,enabled:()=>current?.particles!==false});
  const floating=()=>floatingLayouts.includes(current.layout);
  const clearInline=()=>{for(const key of ['left','top','right','bottom','transform'])sidebar.style.removeProperty(key);};
  const rectangle=()=>{const a=shell.getBoundingClientRect(),b=sidebar.getBoundingClientRect();return{a,b};};
  const place=(x,y)=>{const {a,b}=rectangle(),p=clampBarPosition({x,y},a,b);Object.assign(sidebar.style,{left:p.x+'px',top:p.y+'px',right:'auto',bottom:'auto',transform:'none'});return {x:p.x/Math.max(1,a.width-b.width),y:p.y/Math.max(1,a.height-b.height)};};
  const position=()=>{if(!floating()||!current.position)return;const {a,b}=rectangle();place(current.position.x*Math.max(1,a.width-b.width),current.position.y*Math.max(1,a.height-b.height));};
  const closeMenu=()=>{if(sidebar.contains(document.activeElement)&&current?.layout==='focus')tools.querySelector('#desktop-layout-menu').focus({preventScroll:true});root.classList.remove('desktop-menu-open');tools.querySelector('#desktop-layout-menu').setAttribute('aria-expanded','false');};
  listen(document.querySelector('#desktop-search-panel'),'focusin',closeMenu);
  listen(searchButton,'click',closeMenu);
  listen(document,'keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k')closeMenu();});
  const apply=next=>{
    const changed=current?.layout!==next.layout;current=next;
    if(changed){drag=null;const ticket=++revision;root.classList.add('desktop-layout-changing');root.dataset.workspaceLayout=next.layout;shell.classList.remove('is-sidebar-collapsed');clearInline();closeMenu();requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!disposed&&ticket===revision){root.classList.remove('desktop-layout-changing');position();}}));}
    else {clearInline();position();}
    if(!next.particles)dust.stop();
    section.querySelectorAll('[data-desktop-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.desktopLayout===next.layout)));
    section.querySelector('#desktop-current-layout').textContent=layoutPresets.find(p=>p.id===next.layout).name;
    section.querySelector('#desktop-particles-toggle').checked=next.particles;
    section.querySelector('#desktop-bar-reset').hidden=!floating();
    const toggle=document.querySelector('#desktop-sidebar-toggle');if(toggle){toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','收起侧栏');}
  };
  const commit=next=>{try{apply(saveLayout(storage,next));return true;}catch(error){apply(readLayout(storage));feedback(error.message,'error');return false;}};
  const reset=()=>{if(commit({...current,position:null}))clearInline();};
  listen(section,'click',e=>{const b=e.target.closest('[data-desktop-layout]');if(b&&b.dataset.desktopLayout!==current.layout)commit({...current,layout:b.dataset.desktopLayout,position:null});});
  listen(section.querySelector('#desktop-particles-toggle'),'change',e=>commit({...current,particles:e.target.checked}));
  listen(section.querySelector('#desktop-bar-reset'),'click',reset);
  sidebar.id='desktop-workspace-navigation';tools.querySelector('#desktop-layout-menu').setAttribute('aria-controls',sidebar.id);
  listen(tools.querySelector('#desktop-layout-menu'),'click',()=>{const open=root.classList.toggle('desktop-menu-open');tools.querySelector('#desktop-layout-menu').setAttribute('aria-expanded',String(open));if(open)sidebar.querySelector('.nav button.active:not([hidden]),.nav button:not([hidden])')?.focus({preventScroll:true});});
  listen(sidebar,'click',e=>{if(e.target.closest('[data-view],#desktop-search-open,#desktop-assistant-open'))closeMenu();});
  listen(document,'pointerdown',e=>{if(current.layout==='focus'&&!sidebar.contains(e.target)&&!tools.contains(e.target))closeMenu();});
  listen(document,'keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))closeMenu();});
  const release=()=>{const id=drag?.id;drag=null;if(id!==undefined&&handle.hasPointerCapture(id))handle.releasePointerCapture(id);};
  listen(handle,'pointerdown',e=>{if(e.button!==0||!floating()||reduced.matches)return;const {a,b}=rectangle();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:b.left-a.left,top:b.top-a.top,position:current.position};place(drag.left,drag.top);handle.setPointerCapture(e.pointerId);handle.focus();e.preventDefault();});
  listen(handle,'pointermove',e=>{if(drag?.id===e.pointerId){const {a,b}=rectangle(),p=clampBarPosition({x:drag.left+e.clientX-drag.x,y:drag.top+e.clientY-drag.y},a,b);drag.position={x:p.x/Math.max(1,a.width-b.width),y:p.y/Math.max(1,a.height-b.height)};sidebar.style.transform=`translate(${p.x-drag.left}px,${p.y-drag.top}px)`;}});
  listen(handle,'pointerup',()=>{if(!drag)return;const p=drag.position;release();if(commit({...current,position:p})){const r=handle.getBoundingClientRect();dust.burst({x:r.left+r.width/2,y:r.bottom},8);}});
  listen(handle,'pointercancel',()=>{release();clearInline();position();});
  listen(handle,'lostpointercapture',()=>{if(drag){drag=null;clearInline();position();}});
  listen(handle,'keydown',e=>{if(!floating())return;if(e.key==='Home'){e.preventDefault();reset();return;}const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(!delta)return;e.preventDefault();const {a,b}=rectangle(),p=place(b.left-a.left+delta[0],b.top-a.top+delta[1]);commit({...current,position:p});});
  const resize=()=>{if(disposed)return;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;release();position();});};
  const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(shell);sizeObserver.observe(sidebar);listen(window,'resize',resize);
  const focused=()=>root.classList.toggle('is-window-focused',document.hasFocus());focused();listen(window,'focus',focused);listen(window,'blur',focused);
  const searchPanel=document.querySelector('#desktop-search-panel');
  const searchObserver=new MutationObserver(()=>{if(!searchPanel.hidden){const r=searchPanel.getBoundingClientRect();dust.burst({x:r.right-24,y:r.bottom},12);}});searchObserver.observe(searchPanel,{attributes:true,attributeFilter:['hidden']});
  const dispose=()=>{disposed=true;release();sizeObserver.disconnect();searchObserver.disconnect();cancelAnimationFrame(resizeFrame);dust.dispose();section.remove();searchHome.append(searchButton);tools.remove();handle.remove();clearInline();delete root.dataset.workspaceLayout;root.classList.remove('desktop-menu-open','desktop-layout-changing');};
  bindings.onStop(dispose);
  const refresh=()=>apply(readLayout(storage));refresh();resize();return{refresh,dispose,dust:dust.burst};
}
