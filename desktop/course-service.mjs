import { visibleRecords, isExampleRecord, requireDeveloperMode } from './examples.mjs';
import { readModules, isModuleEnabled } from './modules.mjs';
import { todayCourseState, validateAdjustments } from './course-occurrences.mjs';
import { weekdayOf } from '../shared/packages/core/src/semester-calendar.mjs';
import { createTimetableStore, defaultTimetableSchedule } from './timetable-store.mjs';
import { buildCourseFields } from './course-fields.mjs';
import { validateSchedule, generateSchedule } from './schedule.mjs';
import { buildCourseBatch, prepareCourseFileCommit, exportCourseCsv, exportCourseIcs } from './course-files.mjs';
import { prepareCapturedCourses, capturedSchoolSchedule } from './course-import.mjs';
import { changeOccurrence, restoreOccurrence, projectCourseOccurrences } from './course-occurrences.mjs';
export const defaultCourseSchedule = defaultTimetableSchedule;
export const emptyCourseTable = () => ({ id: 'semester_hidden_empty', name: '当前课表', startDate: '', totalWeeks: 20, courses: [], schedule: defaultCourseSchedule() });
// Read-only provider over the existing timetable snapshot. Never initializes,
// migrates, selects or writes tables while an aggregate view is reading them.
export function createCourseService(storage, { enabled = id => isModuleEnabled(readModules(storage), id), onCommit = () => { } } = {}) {
    const check = () => { if (!enabled('courses'))
        throw Error('课程表已关闭，请在插件管理中开启。'); };
    const snapshot = () => {
        const state = JSON.parse(storage.getItem('jiwei-desktop-timetables-v1') || 'null');
        if (state === null)
            return { tables: [], activeId: null };
        if (!Array.isArray(state.tables))
            throw Error('课表资料无效，请保留原文件。');
        return state;
    };
    const tables = () => snapshot().tables;
    const entries = table => {
        if (!Array.isArray(table.courses) || table.unplacedCourses !== undefined && !Array.isArray(table.unplacedCourses))
            throw Error('课程资料无效，请保留原文件。');
        return [...table.courses, ...(table.unplacedCourses || [])];
    };
    const visibleTable = table => {
        validateAdjustments(table);
        const courses = visibleRecords(storage, table.courses), ids = new Set(courses.map(course => course.id));
        return { ...table, courses, ...(table.unplacedCourses === undefined ? {} : { unplacedCourses: visibleRecords(storage, table.unplacedCourses) }), ...(table.adjustments === undefined ? {} : { adjustments: table.adjustments.filter(change => ids.has(change.courseId)) }) };
    };
    const current = () => { const state = snapshot(), shown = visibleRecords(storage, state.tables), table = shown.find(t => t.id === state.activeId) || shown[0]; return table ? visibleTable(table) : { id: 'semester_hidden_empty', name: '当前课表', startDate: '', totalWeeks: 20, courses: [], schedule: defaultSchedule() }; };
    const defaultSchedule = defaultCourseSchedule;
    const assertBound = expected => { if (expected !== undefined && expected !== JSON.stringify(current()))
        throw Error('课表内容已变化，请关闭后重新打开，避免覆盖新修改。'); };
    const commit = action => { check(); const result = action(createTimetableStore(storage)); onCommit(); return result; };
    const update = (patch, expected) => {
        check();
        assertBound(expected);
        if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('课表更新参数无效。');
        const selected = current(), raw = tables().find(t => t.id === selected.id), next = { ...patch };
        if(next.example)requireDeveloperMode(storage);
        for(const field of ['courses','unplacedCourses'])if(next[field]!==undefined&&!Array.isArray(next[field]))throw Error('课程列表格式无效。');
        for (const field of ['courses', 'unplacedCourses'])
            if (next[field]?.some(c => isExampleRecord(storage, c)))
                requireDeveloperMode(storage);
        // Updates to a visible subset must retain hidden records and their adjustments.
        for (const field of ['courses', 'unplacedCourses'])
            if (next[field] && raw?.[field]) {
                const visibleIds = new Set(visibleRecords(storage, raw[field]).map(c => c.id));
                const hidden = raw[field].filter(c => !visibleIds.has(c.id));
                if (next[field].some(c => hidden.some(h => h.id === c.id)))
                    throw Error('不能修改当前不可见的示例课程。');
                next[field] = [...next[field], ...hidden];
            }
        if (next.adjustments && raw?.adjustments) {
            const visibleIds = new Set(selected.courses.map(c => c.id));
            next.adjustments = [...next.adjustments, ...raw.adjustments.filter(a => !visibleIds.has(a.courseId))];
        }
        if (next.startDate)
            weekdayOf(next.startDate);
        if (next.totalWeeks !== undefined && (!Number.isInteger(next.totalWeeks) || next.totalWeeks < 1 || next.totalWeeks > 60))
            throw Error('总周数需为 1–60 的整数。');
        if (next.schedule)
            next.schedule = validateSchedule(next.schedule, Math.max(0, ...(next.courses || raw?.courses || []).map(c => c.periodEnd || 0)));
        if(next.scheduleBatch)generateSchedule(next.scheduleBatch);
        return commit(store => store.update(next));
    };
    return {
        current() { check(); return current(); },
        list() { check(); return visibleRecords(storage, tables()).map(({ courses, schedule, unplacedCourses, ...metadata }) => metadata); },
        summary() { check(); const shown = visibleRecords(storage, tables()); return { tables: shown.length, courses: shown.reduce((sum, t) => sum + visibleRecords(storage, entries(t)).length, 0) }; },
        defaultSchedule,
        update,
        ensureVisibleSelection: () => commit(store => store.ensureVisibleSelection()),
        select: id => commit(store => store.select(id)),
        create: metadata => { if (metadata.example)
            requireDeveloperMode(storage); if (typeof metadata.name !== 'string' || !metadata.name.trim() || !Number.isInteger(metadata.totalWeeks) || metadata.totalWeeks < 1 || metadata.totalWeeks > 60)
            throw Error('请填写有效课表名称和总周数。'); if (metadata.startDate)
            weekdayOf(metadata.startDate); return commit(store => store.create(metadata)); },
        remove: id => { check(); if (!visibleRecords(storage, tables()).some(t => t.id === id))
            throw Error('课表不存在或当前不可见。'); return commit(store => store.remove(id)); },
        saveCourse(fields, { id = null, expected } = {}) { check(); assertBound(expected); const table = current(), old = id ? table.courses.find(c => c.id === id) : null; if (id && !old)
            throw Error('课程已不存在或当前不可见。'); const values = buildCourseFields({ ...fields, weeksText: fields.weeksText ?? fields.weekText }, table), record = { ...old, ...values, id: old?.id || `course_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: old?.createdAt || new Date().toISOString() }; update({ courses: old ? table.courses.map(c => c.id === id ? record : c) : [...table.courses, record] }, expected); return record; },
        deleteCourse(id, expected) { check(); assertBound(expected); const table = current(); if (!table.courses.some(c => c.id === id))
            throw Error('课程已不存在或当前不可见。'); return update({ courses: table.courses.filter(c => c.id !== id), adjustments: (table.adjustments || []).filter(a => a.courseId !== id) }, expected); },
        batch(rows, expected) { check(); assertBound(expected); const table = current(); return update({ courses: buildCourseBatch(table.courses, rows, table) }, expected); },
        adjust(id, date, fields, expected) { check(); assertBound(expected); return update({ adjustments: changeOccurrence(current(), id, date, fields) }, expected); },
        restoreAdjustment(id, date, expected) { check(); assertBound(expected); return update({ adjustments: restoreOccurrence(current(), id, date) }, expected); },
        importRows(rows, expected) { check(); assertBound(expected);if(!Array.isArray(rows)||!rows.length||rows.length>2000)throw Error('一次需导入 1–2000 行课程。'); const result = prepareCourseFileCommit(rows, current()); update({ courses: result.courses }, expected); return result; },
        importCaptured(result, expected) {
            check();
            if (!enabled('course-import'))
                throw Error('教务导入已关闭，本次读取未写入。');
            assertBound(expected);
            if(!result||typeof result.text!=='string'||!result.text.trim())throw Error('没有读取到课表内容。');
            const table = current(), prepared = prepareCapturedCourses(result, table.courses, table.unplacedCourses || []), schoolSchedule = capturedSchoolSchedule(result, table.schedule, defaultSchedule(), Boolean(table.scheduleBatch));
            if (prepared.additions.length || prepared.unplacedAdditions.length || schoolSchedule)
                update({ courses: [...table.courses, ...prepared.additions], unplacedCourses: [...(table.unplacedCourses || []), ...prepared.unplacedAdditions], ...(schoolSchedule ? { schedule: schoolSchedule } : {}) }, expected);
            return { ...prepared, schoolSchedule };
        },
        exportFile(type) { check(); if (!['csv', 'ics'].includes(type))
            throw Error('不支持的导出格式。'); return type === 'csv' ? exportCourseCsv(current()) : exportCourseIcs(current()); },
        occurrences(range) { check(); return projectCourseOccurrences(current(), range); },
        onDate(date, time) {
            check();
            weekdayOf(date);
            if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
                throw Error('请提供有效的查询时间（HH:mm）。');
            const state = snapshot(), shown = visibleRecords(storage, state.tables);
            const selected = shown.find(table => table.id === state.activeId) || shown[0];
            if (!selected)
                return { table: null, entries: [], ongoing: [], next: null };
            entries(selected);
            const table = visibleTable(selected);
            return { table, ...todayCourseState(table, date, time) };
        },
        listEntries() {
            check();
            return visibleRecords(storage, tables()).flatMap(table => {
                entries(table); // Validate before projecting a visible snapshot.
                const shown = visibleTable(table);
                return entries(shown).map(record => ({ ref: { collection: 'courseEntry', containerId: shown.id, id: record.id }, record, table: shown }));
            });
        },
        inspect(ref) {
            check();
            if (ref?.collection !== 'courseEntry' || typeof ref.containerId !== 'string' || !ref.containerId || typeof ref.id !== 'string' || !ref.id)
                throw Error('课程引用无效。');
            const table = tables().find(table => table.id === ref.containerId);
            if (!table)
                return { status: 'missing' };
            if (!visibleRecords(storage, [table]).length)
                return { status: 'hidden' };
            const record = entries(table).find(record => record.id === ref.id);
            if (!record)
                return { status: 'missing' };
            if (!visibleRecords(storage, [record]).length)
                return { status: 'hidden' };
            return { status: 'found', record, table: visibleTable(table) };
        },
    };
}
