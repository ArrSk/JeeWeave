import { createPageMotion } from './page-motion.mjs';
// One native dialog owns course settings/editing, focus and background scrolling.
export function createCourseOverlay({ surface, main, panels, onClose }) {
  const motion = createPageMotion(undefined, 'desktop-overlay-enter');
  const dialog = document.createElement('dialog'); dialog.id = 'desktop-course-dialog'; dialog.className = 'desktop-course-dialog';
  const body = document.createElement('div'); body.className = 'desktop-course-dialog-body'; body.append(...panels);
  const status = document.createElement('p'); status.className = 'desktop-course-dialog-feedback'; status.setAttribute('role', 'status'); status.hidden = true;
  dialog.append(body, status); surface.append(dialog);
  let activePanel = null, opener, scrollTop = 0, outsidePressed = false;
  const position = () => {
    if (!dialog.open) return;
    const bounds = surface.getBoundingClientRect(), viewport = main.getBoundingClientRect();
    const right = Math.min(bounds.right - 12, innerWidth - 16), left = Math.max(bounds.left + 12, viewport.left + 12);
    const top = Math.max(bounds.top + 12, viewport.top + 16), bottom = Math.min(bounds.bottom - 12, innerHeight - 20);
    const width = Math.min(activePanel?.id === 'desktop-course-editor' ? 540 : 700, right - left);
    Object.assign(dialog.style, { left: `${right - width}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${Math.max(180, bottom - top)}px` });
  };
  const close = ({ restoreFocus = true } = {}) => {
    if (!dialog.open) return;
    dialog.close(); panels.forEach(panel => { panel.hidden = true; }); activePanel = null;
    delete main.dataset.courseOverlayOpen; main.scrollTop = scrollTop; onClose();
    if (restoreFocus) { const target = opener?.isConnected && opener.getClientRects().length ? opener : surface.querySelector('#desktop-add-course'); target?.focus({ preventScroll: true }); }
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]')].filter(item => !item.disabled && item.tabIndex >= 0 && item.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (first && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) { event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true }); }
    }
  });
  const outside = event => { const bounds = dialog.getBoundingClientRect(); return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom); };
  dialog.addEventListener('pointerdown', event => { outsidePressed = outside(event); });
  dialog.addEventListener('click', event => { if (outsidePressed && outside(event)) close(); outsidePressed = false; });
  window.addEventListener('resize', position);
  return {
    get activePanel() { return activePanel; },
    updatePosition: position,
    clearFeedback() { status.hidden = true; },
    show(panel, { labelledBy, focus, returnFocus } = {}) {
      if (!dialog.open) { scrollTop = main.scrollTop; opener = returnFocus || document.activeElement; }
      activePanel = panel; panels.forEach(item => { item.hidden = item !== panel; });
      dialog.setAttribute('aria-labelledby', labelledBy); status.hidden = true; body.scrollTop = 0;
      main.dataset.courseOverlayOpen = 'true';
      if (!dialog.open) dialog.showModal(); position(); focus?.focus({ preventScroll: true }); motion(body);
    },
    feedback(text, tone) { if (dialog.open) { status.textContent = text; status.dataset.tone = tone; status.hidden = false; } },
    close,
  };
}
