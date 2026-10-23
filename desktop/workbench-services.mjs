import { createPluginRuntime } from './plugin-runtime.mjs';
import { createWorkspaceService } from './workspace-service.mjs';
import { createObjectService } from './object-service.mjs';
import { createItemService } from './item-service.mjs';
import { createCourseService } from './course-service.mjs';
import { createCalendarService } from './calendar-service.mjs';
import { createWebCaptureService } from './web-capture-service.mjs';
import { createJournalStore } from './journal.mjs';
import { createRecordRouter } from './record-router.mjs';
import { createPluginStorage } from './plugin-storage.mjs';
import { createTodayService, createOverviewService } from './workbench-views.mjs';
export function createWorkbenchServices({ host, workspace, bridge, enabled, onError }) {
    const runtime = createPluginRuntime(host, { enabled, onError }), storage = workspace.storage;
    let sequence = 0;
    const changed = name => () => { let revision = null; try {
        revision = workspace.revision?.() ?? workspace.snapshot().revision;
    }
    catch { } host.emit(`${name}:committed`, { source: name, revision, sequence: ++sequence, correlationId: `local-${sequence}`, refs: [] }); };
    const captureKey = 'jiwei-desktop-web-collections-v1', objectKey = 'jiwei-desktop-objects-v1';
    const owned = (write, transaction = []) => {
        // Old example tasks identify their source by URL/taskId. Supply only that
        // compatibility metadata to other owners, never captured text or files.
        const projectRead=(key,text)=>{if(key!==captureKey||write.includes(captureKey)||text===null)return text;return JSON.stringify(JSON.parse(text).map(record=>({example:record.example,url:record.url,drafts:(record.drafts||[]).map(d=>({taskId:d.taskId}))})));};
        return createPluginStorage(storage,{write,transaction,projectRead,read:['jiwei-desktop-developer-mode','jiwei-desktop-modules-v1',captureKey]});
    };
    const services = { workspace: ['workspace', 'records'], objects: ['objects'], items: ['items'], courses: ['courses'], calendar: ['calendar'], 'web-capture': ['web-captures'], 'course-import': ['course-import'], notes: ['journal'], today: ['today'], overview: ['overview'] };
    const register = (id, activate, optional = []) => runtime.register({ id, version: '1.0.0', hostApiVersion: 1, requires: id === 'workspace' ? [] : id === 'course-import' ? ['workspace', 'courses'] : ['workspace'], servicesRequired: id === 'workspace' ? {} : { workspace: 1 }, optional, provides: services[id] || [], capabilities: id === 'workspace' ? ['workspace-admin'] : id === 'web-capture' ? ['owned-storage', 'public-page-collector'] : id === 'course-import' ? ['manual-portal'] : ['owned-storage'], activate });
    const workspaceApi = createWorkspaceService(workspace, bridge);
    workspaceApi.initialize();
    register('workspace', scope => { scope.provide('workspace', workspaceApi); scope.provide('records', createRecordRouter(host, { enabled })); });
    register('objects', scope => scope.provide('objects', createObjectService(owned([objectKey]), { providers: { enabled, courses: () => host.use('courses'), items: () => host.use('items'), captures: () => host.use('web-captures'), journal: () => host.use('journal') }, onCommit: changed('objects') })), ['courses', 'items', 'web-capture', 'notes']);
    register('items', scope => scope.provide('items', createItemService(owned(['jiwei-desktop-tasks', 'jiwei-desktop-plans'], [objectKey, captureKey, 'jiwei-desktop-journal-v1']), { enabled, objects: () => enabled('objects') ? host.use('objects') : null, journal: () => enabled('notes') ? host.use('journal') : null, onCommit: changed('items') })), ['objects','notes']);
    register('courses', scope => scope.provide('courses', createCourseService(owned(['jiwei-desktop-timetables-v1']), { enabled, onCommit: changed('courses') })), ['objects']);
    register('calendar', scope => scope.provide('calendar', createCalendarService(owned(['jiwei-desktop-calendar-v1']), { enabled, items: () => host.use('items'), courses: () => host.use('courses'), onCommit: changed('calendar') })), ['courses', 'items']);
    register('web-capture', scope => {
        const api = createWebCaptureService(owned([captureKey]), { items: () => host.use('items'), onCommit: changed('web-captures') });
        scope.provide('web-captures', { ...api, async collect(url, day) { const valid = runtime.ticket('web-capture'); if (!bridge?.collectPage)
                throw Error('请在桌面端使用网页抓取功能。'); const result = await bridge.collectPage(url); valid(); if (!result?.ok)
                throw Error(result?.message || '无法抓取网页'); return api.save(result, day); }, openFolder: () => bridge?.openCollectorFolder?.() });
    }, ['items']);
    register('course-import', scope => scope.provide('course-import', {
        async open(url) { const valid = runtime.ticket('course-import'); const result = await bridge?.open?.(url); valid(); return result; },
        async capture() { const valid = runtime.ticket('course-import'), expected = JSON.stringify(host.use('courses').current()); const result = await bridge?.captureNow?.(); valid(); return { result, expected }; },
        subscribe: callback => bridge?.onPortalStatus?.(callback) || (() => { }),
    }), ['courses']);
    register('notes', scope => scope.provide('journal', createJournalStore(owned(['jiwei-desktop-journal-v1'], [objectKey]), { objects: () => enabled('objects') ? host.use('objects') : null, items: () => enabled('items') ? host.use('items') : null, onCommit: changed('journal') })), ['objects', 'items']);
    register('today', scope => scope.provide('today', createTodayService(host, { enabled })), ['courses', 'items', 'objects']);
    register('overview', scope => scope.provide('overview', createOverviewService(host, { enabled })), ['courses', 'items', 'notes', 'web-capture']);
    for (const id of ['settings', 'plugins'])
        register(id, () => { });
    runtime.reconcile();
    return runtime;
}
