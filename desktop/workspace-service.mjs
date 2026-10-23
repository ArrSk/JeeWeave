import { readModules, setModuleEnabled } from './modules.mjs';
import { loadWorkbenchExamples } from './workbench-data.mjs';
import { createTimetableStore } from './timetable-store.mjs';
import { prepareWorkspaceRestore } from './workspace-format.mjs';
const preferences = new Set(['jiwei-theme', 'jiwei-desktop-appearance-v1', 'jiwei-desktop-reading-v1', 'jiwei-desktop-calendar-v1', 'jiwei-desktop-developer-mode', 'jiwei-desktop-modules-v1']);
export function createWorkspaceService(workspace, bridge) {
    const storage = workspace.storage;
    return {
        snapshot: () => workspace.snapshot(),
        restore(value) {
            workspace.restore(prepareWorkspaceRestore(value));
        },
        initialize() { createTimetableStore(storage); },
        modules: () => readModules(storage),
        setModule: (id, value) => setModuleEnabled(storage, id, value),
        developerMode: () => storage.getItem('jiwei-desktop-developer-mode') === 'true',
        setDeveloperMode: value => { if (typeof value !== 'boolean')
            throw Error('开发者模式参数无效。'); storage.setItem('jiwei-desktop-developer-mode', String(value)); },
        examples: (scope, day) => loadWorkbenchExamples(storage, scope, day),
        canReset: () => Boolean(bridge?.resetWorkspace), canExport: () => Boolean(bridge?.exportWorkspace),
        reset(request) { if (storage.getItem('jiwei-desktop-developer-mode') !== 'true')
            throw Error('请先开启开发者模式。'); return bridge?.resetWorkspace?.(request); },
        export: () => bridge?.exportWorkspace?.(), openFolder: () => bridge?.openDataFolder?.(), markUnsaved: value => bridge?.setUnsavedJournal?.(Boolean(value)),
        canTransfer: () => Boolean(bridge?.transferWorkspace),
        async transfer(action, token) {
            const result = await bridge?.transferWorkspace?.(action, token);
            if (result?.ok && result.workspace) workspace.adopt(result.workspace);
            return result;
        },
        // Preference-only compatibility adapter. Business collections are never exposed.
        preferenceStorage(keys = [...preferences]) {
            const allowed = new Set(keys);
            const check = key => { if (!preferences.has(key) || !allowed.has(key))
                throw Error(`无权访问此设置：${key}`); };
            return { getItem(key) { check(key); return storage.getItem(key); }, setItem(key, value) { check(key); storage.setItem(key, String(value)); } };
        },
    };
}
