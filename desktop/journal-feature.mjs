import { createJournalUI } from './journal-ui.mjs';

export function createJournalFeature({ host, storage, panel, main, feedback, markUnsaved }) {
  let active = null;
  return {
    reconcile(enabled) {
      if (enabled && !active) {
        const scope = host.scope('notes');
        const ui = createJournalUI({ panel, main, host, scope, feedback, markUnsaved });
        scope.own(() => ui.dispose()); scope.command('notes.capture', () => ui.open());
        scope.command('journal.open', ref => {host.navigate('notes');ui.open(ref.id);});
        active = { scope, ui }; ui.refresh();
      } else if (!enabled && active) { active.scope.dispose(); active = null; panel.replaceChildren(); }
    },
    refresh() { active?.ui.refresh(); },
    leave() { active?.ui.leave(); },
    close() { active?.ui.close(); },
  };
}
