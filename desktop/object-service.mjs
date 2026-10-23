import { createObjectStore, readObjects, objectDetail, objectSources, resolveObjectSource, itemContext, prepareItemAssignment, refKey } from './object-view.mjs';
import { visibleRecords } from './examples.mjs';
export function createObjectService(storage, { providers, onCommit = () => { } }) {
    const store = createObjectStore(storage, providers);
    const list = () => visibleRecords(storage, readObjects(storage).objects);
    const get = id => { const object = list().find(o => o.id === id); if (!object)
        throw Error('对象不存在或当前不可见。'); return object; };
    const commit = action => { const result = action(); onCommit(); return result; };
    return {
        list, get,
        read() { const state = readObjects(storage), ids = new Set(list().map(o => o.id)); return { ...state, objects: list(), links: visibleRecords(storage, state.links).filter(l => ids.has(l.objectId)) }; },
        context(ref) { const state = readObjects(storage), owner = state.links.find(l => refKey(l.ref) === refKey(ref))?.objectId || ''; return { owner, object: list().find(o => o.id === owner) || null }; },
        itemContext: ref => itemContext(storage, ref),
        prepareItemAssignment: request => prepareItemAssignment(storage, request),
        detail: id => objectDetail(storage, id, providers),
        sources: () => objectSources(storage, providers),
        source: ref => resolveObjectSource(storage, ref, providers),
        save(fields, id) { if (id)
            get(id); return commit(() => store.save(fields, id)); },
        archive(id) { get(id); return commit(() => store.archive(id)); },
        assign(id, ref) { get(id); return commit(() => store.assign(id, ref)); },
        unassign(id, ref) { get(id); return commit(() => store.unassign(id, ref)); },
    };
}
