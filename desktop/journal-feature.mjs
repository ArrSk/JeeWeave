import { createJournalUI } from './journal-ui.mjs';

export function createJournalFeature({ host, storage, panel, main, feedback, markUnsaved }) {
  let active = null;
  return {
    reconcile(enabled) {
      if (enabled && !active) {
        const scope = host.scope('notes');
        const ui = createJournalUI({ panel, main, host, scope, feedback, markUnsaved });
        scope.own(() => ui.dispose()); scope.command('notes.capture', (options = {}) => { host.navigate('notes'); ui.open(undefined, options); });
        scope.command('journal.open', ref => {host.navigate('notes');ui.open(ref.id);});
        active = { scope, ui }; ui.refresh();
      } else if (!enabled && active) { active.scope.dispose(); active = null; panel.replaceChildren(); }
    },
    refresh() { active?.ui.refresh(); },
    // 经纬独立宿主不碰旧页 DOM；新建走这条与「记一笔」按钮同一通路的公共命令。
    create() { if (!active) throw Error('笔记功能已关闭，请在插件管理中开启。'); active.ui.open(); },
    leave() { active?.ui.leave(); },
    close() { active?.ui.close(); },
  };
}
