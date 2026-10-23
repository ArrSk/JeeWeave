import { executionSlotsOnDate, isOnDate, isComplete, deadlineOf, isOverdue, sortItems } from './planning.mjs';
export function splitTodayItems(items, date) {
    const scheduled = [], other = [];
    for (const item of sortItems(items.filter(item => !isComplete(item, date)), date)) {
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
