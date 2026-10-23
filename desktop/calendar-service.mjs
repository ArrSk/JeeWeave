import { calendarPreferenceKey, normalizeCalendarPreferences, projectCalendar, projectCourseCalendar } from './calendar.mjs';
export function createCalendarService(storage, { items, courses, enabled, onCommit = () => { } }) {
    return {
        preferences: () => normalizeCalendarPreferences(JSON.parse(storage.getItem(calendarPreferenceKey) || 'null')),
        savePreferences(value) { const next = normalizeCalendarPreferences(value); storage.setItem(calendarPreferenceKey, JSON.stringify(next)); onCommit(); return next; },
        query(range, filters) {
            let records = [];
            const errors=[];
            if(enabled('items'))try{records=['task','plan'].filter(k=>filters[k==='task'?'tasks':'plans']).flatMap(k=>items().list(k));}catch{errors.push('事项服务暂不可用');}
            const projection = projectCalendar(records, range, filters);
            projection.errors = errors;
            if (enabled('courses') && filters.courses)
                try {
                    const table = courses().current();
                    projection.entries.push(...projectCourseCalendar(table, range).map(e => ({ ...e, containerId: table.id })));
                }
                catch {
                    projection.errors.push('课程服务暂不可用');
                }
            projection.entries.sort((a, b) => a.start.localeCompare(b.start) || Number(b.allDay) - Number(a.allDay) || (a.startTime || '').localeCompare(b.startTime || ''));
            return projection;
        },
    };
}
