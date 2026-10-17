// One interruptible transition for the workspace. Logical navigation is immediate.
export function createPageMotion(reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let active;
  return (element,direction=1) => {
    active?.cancel();
    if (!element?.animate) return;
    const reduced=reduceMotion();
    const frames=reduced ? [{opacity:.8},{opacity:1}] : [
      {opacity:.3,transform:`translateY(${direction*7}px) scale(.996)`,filter:'blur(1px)'},
      {opacity:1,transform:'translateY(0) scale(1)',filter:'blur(0px)'},
    ];
    active=element.animate(frames,{duration:reduced?90:260,easing:'cubic-bezier(0.2, 0.8, 0.2, 1)',id:'desktop-page-enter'});
  };
}
