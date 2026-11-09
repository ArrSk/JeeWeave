// Motion: bounded, action-triggered dust; no pointermove listener and no idle loop.
export function installWeftDust({bindings,enabled}) {
  const media=matchMedia('(prefers-reduced-motion: reduce)');let canvas,ctx,frame=0,last=0,blurTimer,dots=[],disposed=false;
  const stop=()=>{cancelAnimationFrame(frame);frame=0;dots=[];ctx?.clearRect(0,0,innerWidth,innerHeight);};
  const size=()=>{if(!canvas)return;const d=Math.min(devicePixelRatio,2);canvas.width=innerWidth*d;canvas.height=innerHeight*d;canvas.style.width=innerWidth+'px';canvas.style.height=innerHeight+'px';ctx.setTransform(d,0,0,d,0,0);};
  const create=()=>{if(media.matches||disposed||canvas)return;canvas=document.createElement('canvas');canvas.id='desktop-design-particles';canvas.setAttribute('aria-hidden','true');document.body.append(canvas);ctx=canvas.getContext('2d');size();};
  const motion=()=>{stop();if(media.matches){canvas?.remove();canvas=ctx=null;}else create();};
  const draw=now=>{frame=0;if(disposed||media.matches||!enabled()||document.hidden){stop();return;}const dt=Math.min((now-last)/1000,.04);last=now;ctx.clearRect(0,0,innerWidth,innerHeight);dots=dots.filter(d=>d.life>0);for(const p of dots){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.7,dt);ctx.fillStyle=p.color;ctx.globalAlpha=Math.max(0,p.life/.9)*.36;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;if(dots.length)frame=requestAnimationFrame(draw);};
  const burst=(point,count=8)=>{if(disposed||media.matches||!enabled()||document.hidden)return;create();if(!ctx)return;const color=getComputedStyle(document.documentElement).getPropertyValue('--accent');for(let i=0;i<Math.min(24,count);i++)dots.push({x:point.x,y:point.y,vx:(Math.random()-.5)*30,vy:14+Math.random()*10,r:1+Math.random(),life:.6+Math.random()*.3,color});dots=dots.slice(-24);if(!frame){last=performance.now();frame=requestAnimationFrame(draw);}};
  bindings.listen(window,'resize',size);bindings.listen(media,'change',motion);bindings.listen(document,'visibilitychange',()=>{if(document.hidden)stop();});
  bindings.listen(window,'blur',()=>{clearTimeout(blurTimer);blurTimer=setTimeout(stop,500);});bindings.listen(window,'focus',()=>clearTimeout(blurTimer));
  const dispose=()=>{disposed=true;clearTimeout(blurTimer);stop();canvas?.remove();canvas=ctx=null;};bindings.onStop(dispose);create();return {burst,stop,dispose};
}
