import { validateAdjustments } from './course-occurrences.mjs';
import { isDeveloperMode, requireDeveloperMode, visibleRecords } from './examples.mjs';
// One atomic snapshot: switching a timetable always switches its courses and schedule together.
export function createTimetableStore(storage) {
  const key = 'jiwei-desktop-timetables-v1';
  const read = (name, fallback) => {
    const value = storage.getItem(name);
    return value === null ? fallback : JSON.parse(value);
  };
  const defaultSchedule = () => ['08:00-08:45', '08:55-09:40', '10:00-10:45', '10:55-11:40', '14:00-14:45', '14:55-15:40', '16:00-16:45', '16:55-17:40', '18:30-19:15', '19:25-20:10', '20:20-21:05', '21:15-22:00'].map((time, index) => { const [start, end] = time.split('-'); return { index: index + 1, start, end }; });
  if (!storage.getItem(key)) {
    const legacy = read('jiwei-desktop-semester', {});
    const semesters = read('jiwei-desktop-semesters', null) || [{ ...legacy, id: 'semester_default', name: legacy.name || '当前课表', startDate: legacy.startDate || '', totalWeeks: legacy.totalWeeks || 20 }];
    const tables = semesters.map((semester, index) => ({
      ...semester,
      courses: read(`jiwei-desktop-courses:${semester.id}`, index === 0 ? read('jiwei-desktop-courses', []) : []),
      schedule: read(`jiwei-desktop-schedule:${semester.id}`, index === 0 ? read('jiwei-desktop-schedule', defaultSchedule()) : defaultSchedule()),
    }));
    const requested = storage.getItem('jiwei-desktop-active-semester');
    storage.setItem(key, JSON.stringify({ tables, activeId: tables.some(table => table.id === requested) ? requested : tables[0].id }));
  }
  const snapshot = () => read(key, null);
  const current = () => { const state = snapshot(), shown=visibleRecords(storage,state.tables); return shown.find(table => table.id === state.activeId)||shown[0]||{id:'semester_hidden_empty',name:'当前课表',startDate:'',totalWeeks:20,courses:[],schedule:defaultSchedule()}; };
  const mutate = change => { const state = snapshot(); change(state); storage.setItem(key, JSON.stringify(state)); };
  const update = patch => mutate(state => { const selected=current(), index = state.tables.findIndex(table => table.id === selected.id); const next = { ...selected, ...patch, id: selected.id }; validateAdjustments(next); if(index<0)state.tables.push(next);else state.tables[index] = next;state.activeId=next.id; });
  const ensureVisibleSelection = () => {
    const state=snapshot();if(isDeveloperMode(storage)||!state.tables.find(t=>t.id===state.activeId)?.example)return;
    let real=state.tables.find(t=>!t.example);
    if(!real){real={id:`semester_${Date.now()}_empty`,name:'当前课表',startDate:'',totalWeeks:20,courses:[],schedule:defaultSchedule()};state.tables.push(real);}
    state.activeId=real.id;storage.setItem(key,JSON.stringify(state));
  };
  ensureVisibleSelection();
  return {
    snapshot, current, defaultSchedule, ensureVisibleSelection,
    list: () => visibleRecords(storage,snapshot().tables).map(({ courses, schedule, unplacedCourses, ...metadata }) => metadata),
    update,
    loadExample(metadata, courses) {
      requireDeveloperMode(storage);
      mutate(state => {
        let table = state.tables.find(item => item.example === true);
        if (!table) {
          table = { ...metadata, id: `example_${Date.now()}`, example: true, courses: [], schedule: defaultSchedule() };
          state.tables.push(table);
        }
        const ids = new Set(table.courses.map(course => course.id));
        table.courses.push(...courses.filter(course => !ids.has(course.id)));
        state.activeId = table.id;
      });
    },
    select(id) { mutate(state => { if (!visibleRecords(storage,state.tables).some(table => table.id === id)) throw new Error('课表不存在或当前不可见'); state.activeId = id; }); },
    create(metadata) {
      const id = `semester_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      mutate(state => {
        const source = state.tables.find(table => table.id === state.activeId);
        state.tables.push({ ...metadata, id, courses: [], schedule: source.schedule.map(period => ({ ...period })) });
        state.activeId = id;
      });
      return id;
    },
    remove(id) {
      mutate(state => {
        if (state.tables.length <= 1) throw new Error('请先新建另一张课表，再删除当前课表。');
        state.tables = state.tables.filter(table => table.id !== id);
        if (state.activeId === id) state.activeId = state.tables[0].id;
      });
    },
  };
}
