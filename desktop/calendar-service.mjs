import { calendarPreferenceKey, normalizeCalendarPreferences, projectCalendar, projectCourseCalendar } from './calendar.mjs';
export function createCalendarService(storage, { items, courses, objects, enabled, onCommit = () => { } }) {
    return {
        preferences: () => normalizeCalendarPreferences(JSON.parse(storage.getItem(calendarPreferenceKey) || 'null')),
        savePreferences(value) { const next = normalizeCalendarPreferences(value); storage.setItem(calendarPreferenceKey, JSON.stringify(next)); onCommit(); return next; },
        query(range, filters, { objectId = '' } = {}) {
            let records = [];
            const errors=[];
            let scope = null;
            if (typeof objectId !== 'string') throw Error('对象编号无效。');
            if (objectId) {
                if (typeof objectId !== 'string' || !enabled('objects') || !objects) throw Error('对象筛选暂不可用，请开启对象功能或返回全部日历。');
                scope = objects().detail(objectId);
                if (!scope?.object) throw Error('对象已不可用，请返回全部日历。');
                if (scope.entries.some(e => ['task','plan','courseEntry'].includes(e.ref.collection) && ['disabled','unavailable','missing'].includes(e.status))) errors.push('部分关联来源已关闭、移除或暂不可用，原关联保留。');
            }
            if(enabled('items'))try{records=['task','plan'].filter(k=>filters[k==='task'?'tasks':'plans']).flatMap(k=>items().list(k));}catch{errors.push('事项服务暂不可用');}
            if (scope) { const refs = new Set(scope.entries.map(e => JSON.stringify([e.ref.collection, e.ref.id]))); records = records.filter(item => refs.has(JSON.stringify([item.kind, item.id]))); }
            const projection = projectCalendar(records, range, filters);
            projection.errors = errors;
            if (enabled('courses') && filters.courses)
                try {
                    const tables = scope ? [...new Map(scope.entries.filter(e => e.ref.collection === 'courseEntry' && e.source?.table).map(e => [e.source.table.id, e.source.table])).values()] : [courses().current()];
                    const refs = scope && new Set(scope.entries.filter(e => e.ref.collection === 'courseEntry').map(e => JSON.stringify([e.ref.containerId, e.ref.id])));
                    for (const table of tables) projection.entries.push(...projectCourseCalendar(table, range).filter(e => !refs || refs.has(JSON.stringify([table.id, e.itemId]))).map(e => ({ ...e, containerId: table.id })));
                }
                catch {
                    projection.errors.push('课程服务暂不可用');
                }
            projection.entries.sort((a, b) => a.start.localeCompare(b.start) || Number(b.allDay) - Number(a.allDay) || (a.startTime || '').localeCompare(b.startTime || ''));
            projection.object = scope ? { id: scope.object.id, title: scope.object.title } : null;
            return projection;
        },
    };
}
