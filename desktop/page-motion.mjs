// One interruptible transition for the workspace. Logical navigation is immediate.
export function createPageMotion(reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches, id='desktop-page-enter') {
  let active;
  return element => {
    active?.cancel();
    if (!element?.animate) return;
    const reduced=reduceMotion();
    if (reduced) return;
    active=element.animate([{opacity:.88},{opacity:1}],{duration:120,easing:'ease-out',id});
  };
}
