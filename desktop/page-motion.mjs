// Motion: one interruptible page pair; source snapshots have no live controls or IDs.
export function createPageMotion(reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches,id='desktop-page-enter') {
  let active,exit,snapshot,line;
  const clear=()=>{active?.cancel();exit?.cancel();active=exit=null;snapshot?.remove();snapshot=null;line?.remove();line=null;};
  const play=element=>{
    active?.cancel();active=null;
    if(!element)return;
    element.inert=false;element.removeAttribute('aria-hidden');
    if(reduceMotion()||element.ownerDocument?.hidden){clear();return;}
    if(!element.animate)return;
    const page=id==='desktop-page-enter';
    active=element.animate([{opacity:page?0:.85,transform:page?'translateY(6px)':id.includes('overlay')?'translateX(12px)':'translateY(4px)'},{opacity:1,transform:'translate(0)'}],{duration:page?380:240,easing:'cubic-bezier(.16,1,.3,1)',id});
    if(page&&!snapshot&&element.ownerDocument){const r=element.getBoundingClientRect();line=element.ownerDocument.createElement('div');line.className='design-omen-line';Object.assign(line.style,{left:r.left+'px',top:Math.max(36,r.top)+'px',width:r.width+'px'});element.ownerDocument.body.append(line);const own=line;active.finished?.then(()=>own.remove(),()=>own.remove());}
  };
  play.prepare=(main,source)=>{
    clear();if(!source||source.hidden||reduceMotion()||source.ownerDocument?.hidden)return;
    const r=main.getBoundingClientRect(),s=source.getBoundingClientRect(),top=Math.max(r.top,s.top),clone=source.cloneNode(true);
    clone.removeAttribute('id');clone.removeAttribute('data-page');clone.querySelectorAll('[data-page]').forEach(n=>n.removeAttribute('data-page'));clone.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));clone.querySelectorAll('iframe,script,dialog').forEach(n=>n.remove());
    clone.querySelectorAll('button,input,textarea,select,a').forEach(n=>{n.removeAttribute('autofocus');n.tabIndex=-1;if('disabled'in n)n.disabled=true;});
    snapshot=document.createElement('div');snapshot.className='design-page-snapshot';snapshot.inert=true;snapshot.setAttribute('aria-hidden','true');
    Object.assign(snapshot.style,{left:r.left+'px',top:top+'px',width:r.width+'px',height:Math.max(0,r.bottom-top)+'px'});
    Object.assign(clone.style,{position:'absolute',left:(s.left-r.left)+'px',top:(s.top-top)+'px',width:s.width+'px',margin:'0',padding:getComputedStyle(source).padding});snapshot.append(clone);document.body.append(snapshot);
    source.inert=true;source.setAttribute('aria-hidden','true');const own=snapshot;
    exit=snapshot.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-3px)'}],{duration:180,easing:'cubic-bezier(.2,.7,.2,1)',id:'desktop-page-exit'});
    exit.finished.then(()=>own.remove(),()=>own.remove());
  };
  play.dispose=clear;return play;
}
