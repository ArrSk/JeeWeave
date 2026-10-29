import { executionSlotsOnDate, isOnDate, isComplete, deadlineOf, isOverdue, sortItems } from './planning.mjs';
// Read only public providers. Disabled modules never contribute cached/private data.
export function createSearchService(host, { enabled }) {
    return { query({ text = '', collection = '', objectId = '' } = {}) {
        const needle = String(text).trim().slice(0, 200).toLocaleLowerCase(), rows = [], errors = [];
        let objects = [], links = [];
        if (enabled('objects')) try { ({ objects, links } = host.use('objects').read()); } catch { errors.push('对象'); }
        const add = (ref, record, body, label) => {
            const owner = links.find(link => link.ref.collection === ref.collection && link.ref.id === ref.id && link.ref.containerId === ref.containerId)?.objectId || '';
            if (collection && (collection === 'items' ? !['task', 'plan'].includes(ref.collection) : collection !== ref.collection) || objectId && owner !== objectId) return;
            const title = record.title || (record.body || '').split(/\r?\n/)[0].slice(0, 160) || '未命名记录';
            const content = [title, body, objects.find(object => object.id === owner)?.title].filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n');
            const index = content.toLocaleLowerCase().indexOf(needle);
            if (needle && index < 0) return;
            rows.push({ ref, title, label, owner, snippet: content.slice(Math.max(0, index - 40), Math.max(0, index - 40) + 180), updatedAt: record.updatedAt || record.createdAt || '' });
        };
        const read = (id, title, action) => { if (enabled(id)) try { action(); } catch { errors.push(title); } };
        read('courses', '课程', () => host.use('courses').listEntries().forEach(({ ref, record, table }) => add(ref, record, [table.name, record.teacher, record.location, record.weekText].join(' '), '课程')));
        read('items', '事项', () => host.use('items').list().forEach(item => add({ collection: item.kind, id: item.id }, item, [item.goal, item.completionCriteria, item.note, item.evidence, item.courseOrigin?.title, item.courseOrigin?.originalDate].join('\n'), '事项')));
        read('notes', '笔记', () => host.use('journal').list().forEach(record => add({ collection: 'journalEntry', id: record.id }, record, [record.body, ...(record.tags || [])].join('\n'), '笔记')));
        read('web-capture', '网页', () => host.use('web-captures').list().forEach(record => add({ collection: 'capture', id: record.id }, record, [record.url, record.text].join('\n'), '网页')));
        if (!collection || collection === 'object') for (const object of objects) {
            if (objectId && object.id !== objectId) continue;
            const content = [object.title, object.purpose, object.completionCriteria].join('\n');
            if (!needle || content.toLocaleLowerCase().includes(needle)) rows.push({ ref: { collection: 'object', id: object.id }, title: object.title, label: '对象', owner: object.id, snippet: content.slice(0, 180), updatedAt: object.updatedAt || '' });
        }
        rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, 'zh-CN'));
        return { results: rows.slice(0, 80), total: rows.length, objects, errors };
    } };
}
export function splitTodayItems(items, date) {
    const scheduled = [], other = [];
    for (const item of sortItems(items.filter(item => !isComplete(item, date) || executionSlotsOnDate(item, date).length), date)) {
        const explicit = executionSlotsOnDate(item, date).length || deadlineOf(item)?.date === date ||
            (item.anchor.type !== 'deadline' && isOnDate(item, date));
        (explicit ? scheduled : other).push(item);
    }
    return { scheduled, other };
}
export function createTodayService(host, { enabled }) {
    return { query(date, time) {
            const result = { courses: { table: null, entries: [], ongoing: [], next: null }, items: [], scheduledItems: [], otherItems: [], otherGroups: [], errors: {} };
            if (enabled('courses'))
                try {
                    result.courses = host.use('courses').onDate(date, time);
                }
                catch {
                    result.errors.courses = '课程服务暂不可用，请重新打开应用后重试。';
                }
            if (enabled('items'))
                try {
                    result.items = host.use('items').onDate(date);
                    const split = splitTodayItems(host.use('items').list(), date);
                    result.scheduledItems = split.scheduled;
                    result.otherItems = split.other;
                    result.otherGroups = [
                        { id: 'overdue', title: '已逾期', items: [] },
                        { id: 'undated', title: '未定日期', items: [] },
                        { id: 'dated', title: '其他日期', items: [] },
                    ];
                    for (const item of split.other) {
                        const group = isOverdue(item, date) ? 0 : item.anchor.type === 'floating' && !item.executionSlots?.length && !deadlineOf(item) ? 1 : 2;
                        result.otherGroups[group].items.push(item);
                    }
                    result.work = [...split.scheduled, ...split.other].map(item => {
                        const ref = { collection: item.kind, id: item.id };
                        let object = null;
                        if (enabled('objects')) try { object = host.use('objects').context(ref).object; } catch { /* Independent items remain usable. */ }
                        return { ref, slots: executionSlotsOnDate(item, date), object };
                    });
                }
                catch {
                    result.errors.items = '事项服务暂不可用，请重新打开应用后重试。';
                }
            return result;
        } };
}
export function createOverviewService(host, { enabled }) {
    return { query() {
            const result = { courses: null, items: null, notes: null, captures: null, errors: {} };
            const read = (name, active, query) => { if (active)
                try {
                    result[name] = query();
                }
                catch {
                    result.errors[name] = '暂不可用';
                } };
            read('courses', enabled('courses'), () => host.use('courses').summary());
            read('items', enabled('items'), () => host.use('items').summary());
            read('notes', enabled('notes'), () => ({ count: host.use('journal').list().length, draft: Boolean(host.use('journal').draft()) }));
            read('captures', enabled('web-capture'), () => { const records = host.use('web-captures').list(); return { count: records.length, pending: records.flatMap(record => record.drafts.filter(d => d.status === 'pending').map(draft => ({ record: { id: record.id, title: record.title }, draft }))) }; });
            return result;
        } };
}
