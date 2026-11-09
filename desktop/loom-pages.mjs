/* 经纬 · 其他页面的渲染
   今天页是「一条经线贯穿一天」，其余页面沿用同一套物质语言：
   一条竖线（经） + 落在其上的条目（纬）。不复制业务判断，数据一律来自 host.client。

   设计原则（对应 demo 的四条）：
   1. 位置由内容决定，不由栅格决定 —— 分组之间用真实间距，不用等距卡片。
   2. rest 态透明、只有发丝线；hover 才浮起。
   3. 每一页都有自己的「刻度」，不是所有页都画时间轴。
   4. 克制：一屏最多一条经线、一个主动作。 */

import { today } from '../shared/packages/core/src/semester-calendar.mjs';
import { escapeHtml as esc } from './ui-text.mjs';

const hm = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const kindName = kind => ({ task: '待办', plan: '计划', event: '事件', exam: '考试', weekly: '每周' }[kind] || '事项');

/* 八色毛线：颜色不是装饰，是「同一条线」的记号。
   课程固定用靛；事项按类型各占一支；对象按 id 落到七支里的一支，
   同一块地每次打开都是同一色，删掉别的对象也不会换色。 */
const threadPalette = ['--t-indigo', '--t-madder', '--t-turmeric', '--t-moss', '--t-wisteria', '--t-clay', '--t-celadon', '--t-slate'];
const objectPalette = threadPalette.slice(1);
const kindThreads = { task: '--t-madder', plan: '--t-turmeric', exam: '--t-clay', event: '--t-moss', weekly: '--t-celadon' };
export const loomThread = seed => {
  const text = String(seed || ''); let hash = 0;
  for (let index = 0; index < text.length; index++) hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  return objectPalette[hash % objectPalette.length];
};
// 有归属的事项跟它的那块地同色，没有归属的按类型取色。
export const itemThread = (kind, objectId) => objectId ? loomThread(objectId) : kindThreads[kind] || '--t-madder';

/* 键盘地图与设置页共用一张表，避免两处各写一份。 */
export const loomShortcuts = [
  ['Ctrl P', '打开页面或命令'],
  ['Ctrl K', '查找资料'],
  ['?', '键盘地图'],
  ['1–9', '按顺序直达页面'],
  ['[ ]', '上一页 / 下一页'],
  ['Ctrl N', '新建'],
  ['Ctrl Z', '撤销刚才的完成'],
  ['Alt ↑↓', '把当前时段挪一刻钟'],
  ['F6', '在导航与页面间切换']
];
const dayOf = date => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(`${date}T12:00:00+08:00`).getDay()];

/* ── 通用：页头 ───────────────────────────────────────────────── */
function head(title, omen, stats) {
  return `<header class="loom-day-head">` +
    `<h1 tabindex="-1">${esc(title)}<span>${esc(stats.date || '')}</span></h1>` +
    `<p class="loom-omen">${omen}</p>` +
    (stats.right ? `<div class="loom-head-acts">${stats.right}</div>` : '') +
    `<span class="loom-day-stats">${esc(stats.meta || '')}</span>` +
    `</header>`;
}

/* ── 通用：把条目挂到一条竖线上 ───────────────────────────────── */
function thread(groups, options = {}) {
  const body = groups.filter(group => group.items.length).map(group =>
    `<section class="loom-group">` +
      `<h2 class="loom-group-title">${esc(group.title)}<b>${group.items.length}</b></h2>` +
      `<ol class="loom-rows">` + group.items.map(item => row(item, options)).join('') + `</ol>` +
    `</section>`).join('');
  return `<div class="loom-ribbon${options.compact ? ' is-compact' : ''}">` +
    (body || `<p class="loom-empty">${esc(options.empty || '这里还空着。')}</p>`) + `</div>`;
}

/* 每行最多一个入口：课程回课表、草稿回采集页、固定去处走页面跳转，其余打开原记录。
   四种摆位共用这一条判定，布局只改外观，不改去处。 */
export function rowEntry(item) {
  return item.course
    ? `<button type="button" data-loom-open-course="${esc(item.course.id)}" data-loom-course-table="${esc(item.course.table || '')}">${esc(item.title)}</button>`
    : item.captureSelect
    ? `<button type="button" data-loom-capture-select="${esc(item.captureSelect)}">${esc(item.title)}</button>`
    : item.goto
    ? `<button type="button" data-loom-goto="${esc(item.goto)}">${esc(item.title)}</button>`
    : item.action
    ? `<button type="button" data-loom-row-open="${esc(item.openId || item.id)}" data-loom-open-collection="${esc(item.collection || '')}">${esc(item.title)}</button>`
    : esc(item.title);
}

function row(item, options = {}) {
  const past = item.past ? ' is-past' : '';
  const done = item.done ? ' is-done' : '';
  const selected = item.selected ? ' is-selected' : '';
  const title = rowEntry(item);
  const margin = ((item.margin || []).filter(Boolean)
    .map(text => `<span>${esc(text)}</span>`).join('')) + (item.actions || []).join('');
  return `<li class="loom-row${past}${done}${selected}" data-loom-row="${esc(item.id)}" style="--thread:var(${item.thread || '--accent'})">` +
    `<span class="loom-row-body">` +
      `<span class="loom-row-kind"><i></i>${esc(item.kind || '')}</span>` +
      `<h3 class="loom-row-title">${title}</h3>` +
      (item.lines || []).filter(Boolean).map(line => `<p class="loom-row-line">${esc(line)}</p>`).join('') +
    `</span>` +
    (margin ? `<span class="loom-row-margin">${margin}</span>` : '') +
    `<span class="loom-row-knot" aria-hidden="true"></span>` +
  `</li>`;
}

/* ── 事项：按「时间性质」分三段，不是按类型列四列 ───────────────── */
export function loomItemRows(items, date) {
  const groups = [
    { id: 'timed', title: '有明确时段', items: [] },
    { id: 'deadline', title: '只有截止', items: [] },
    { id: 'open', title: '未定期', items: [] }
  ];
  for (const item of items) {
    const anchor = item.anchor || {};
    const slots = item.executionSlots || [];
    const deadline = anchor.type === 'deadline' ? anchor : item.deadline;
    const timed = slots.length || anchor.type === 'absolute' || anchor.type === 'weekly';
    const group = groups.find(g => g.id === (timed ? 'timed' : deadline ? 'deadline' : 'open'));
    group.items.push({
      id: item.id, kind: kindName(item.kind), title: item.title,
      // kind 就是 task/plan 集合身份；打开时必须原样传给 items.edit。
      collection: item.kind,
      thread: itemThread(item.kind, item.objectId),
      lines: [item.goal, item.completionCriteria].filter(Boolean),
      margin: [
        timed && slots.length ? describeSlot(slots[0]) : '',
        anchor.type === 'weekly' ? `每周 ${(anchor.weekdays || []).join('、')}` : '',
        deadline ? `截止 ${deadline.date === date ? '今天' : deadline.date}${deadline.time ? ' ' + deadline.time : ''}` : '',
        slots.length > 1 ? `+${slots.length - 1} 段` : ''
      ],
      action: true
    });
  }
  return groups;
}

function describeSlot(slot) {
  const start = String(slot.start || ''), end = String(slot.end || '');
  const time = value => value.slice(11, 16);
  return `${time(start)}–${time(end)}`;
}

/* ── 笔记：按日期倒序，日期是刻度 ─────────────────────────────── */
export function loomNoteRows(notes) {
  const byDate = new Map();
  for (const note of notes) {
    const date = note.date || '';
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(note);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      title: date === today() ? '今天' : `${date} ${dayOf(date)}`,
      items: list.map(note => ({
        id: note.id, kind: note.kind || '记录',
        title: note.title || firstLine(note.body),
        lines: note.title ? [firstLine(note.body)] : [bodyRest(note.body)],
        margin: [note.time, (note.tags || []).map(tag => '#' + tag).join(' ')],
        thread: '--t-slate',
        action: true
      }))
    }));
}

const firstLine = body => String(body || '').split('\n').find(line => line.trim()) || '（无正文）';
const bodyRest = body => {
  const lines = String(body || '').split('\n').filter(line => line.trim());
  return lines.length > 1 ? lines[1] : '';
};

/* ── 对象：每个对象是一个结，牵着几件事 ───────────────────────── */
export function loomObjectRows(objects, counts, typeLabel = () => '对象') {
  return [{ title: '对象', items: objects.map(object => ({
    id: object.id, kind: typeLabel(object),
    // 对象记录的真实字段是 title / purpose / completionCriteria，不要读不存在的 name、goal。
    title: object.title,
    thread: loomThread(object.id),
    lines: [object.purpose, object.completionCriteria].filter(Boolean).map(text => text.length > 90 ? `${text.slice(0, 90)}…` : text),
    margin: [
      counts.items?.[object.id] ? `${counts.items[object.id]} 件事` : '',
      counts.notes?.[object.id] ? `${counts.notes[object.id]} 则笔记` : ''
    ],
    action: true
  })) }];
}

/* ── 提醒：三类各一段刻度，动作留在行尾批注 ───────────────────── */
const reminderModeLabel = mode => ({ timed: '定时提醒', silent: '静默提示', attention: '长期注意事项' }[mode || 'timed']);
function reminderWhen(row) {
  if (row.archived) return '已处理';
  if (row.mode === 'attention') return '持续显示';
  if (row.mode === 'silent') return row.date || '今天';
  if (row.delivered) return '已提醒';
  if (row.daily) return `每天 ${new Date(row.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  return new Date(row.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function loomReminderRows(rows) {
  const groups = [
    { id: 'timed', title: '定时提醒', items: [] },
    { id: 'silent', title: '今天的静默提示', items: [] },
    { id: 'attention', title: '长期注意', items: [] },
    { id: 'archived', title: '已处理', items: [] }
  ];
  for (const row of rows) {
    const group = row.archived ? groups[3] : groups.find(item => item.id === (row.mode || 'timed')) || groups[0];
    const actions = [];
    if (!row.archived) actions.push(`<button type="button" class="loom-inline-action" data-loom-reminder-edit="${esc(row.id)}">编辑 / 改期</button>`);
    if (row.mode === 'silent' || row.mode === 'attention') {
      actions.push(`<button type="button" class="loom-inline-action" data-loom-reminder-state="${esc(row.id)}" data-loom-reminder-archived="${row.archived ? 'false' : 'true'}">${row.archived ? '恢复' : '已处理'}</button>`);
    }
    actions.push(`<button type="button" class="loom-inline-action" data-loom-reminder-cancel="${esc(row.id)}">${!row.mode || row.mode === 'timed' ? '取消' : '移除'}</button>`);
    group.items.push({
      id: row.id, kind: reminderModeLabel(row.mode), title: row.title,
      lines: [], margin: [reminderWhen(row)], actions, done: row.archived
    });
  }
  return groups.filter(group => group.items.length);
}

/* ── 课程：七缕并排，不是表格 ─────────────────────────────────── */
export function loomCourseRows(entries, table, date) {
  const weekday = (new Date(`${date}T12:00:00+08:00`).getDay() + 6) % 7;
  const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const columns = names.map((name, index) => ({ name, index, items: [] }));
  for (const entry of entries) {
    // 真实字段是 weekday（1=周一）与 location；旧名 day/room 仅作兼容兜底。
    const day = (Number(entry.weekday ?? entry.day) || 1) - 1;
    if (!columns[day]) continue;
    columns[day].items.push({
      id: entry.id, kind: '课程', title: entry.title,
      containerId: entry.containerId || '',
      thread: '--t-indigo',
      lines: entry.teacher ? [entry.teacher] : [],
      margin: [entry.location || entry.room || ''],
      action: true
    });
  }
  return { columns, weekday, table };
}

/* ── 总览：一页读完工作区，草稿是唯一需要动手的东西 ───────────── */
export function loomOverviewRows(model, date) {
  const groups = [];
  const pending = model.captures?.pending || [];
  if (pending.length) groups.push({
    title: '待确认的网页行动',
    items: pending.slice(0, 8).map(({ record, draft }) => ({
      id: `${record.id}/${draft.id}`, kind: '草稿',
      title: draft.title, captureSelect: record.id,
      lines: [record.title, draft.date ? `截止 ${draft.date}` : '日期待确认'],
      margin: ['确认后加入事项']
    }))
  });
  const counts = [];
  if (model.courses) counts.push({
    id: 'courses', kind: '课程表', title: `${model.courses.tables} 张课表`,
    goto: 'courses', lines: ['周次、作息与课程导入都在这里']
  });
  if (model.items) counts.push({
    id: 'items', kind: '事项', title: `${model.items.unfinished} 项未完成`,
    goto: 'plans', lines: [`共 ${model.items.total} 项，已完成 ${model.items.completed}`]
  });
  if (model.notes) counts.push({
    id: 'notes', kind: '笔记', title: `${model.notes.count} 则记录${model.notes.draft ? ' · 1 份草稿' : ''}`,
    goto: 'notes', lines: []
  });
  if (model.captures) counts.push({
    id: 'captures', kind: '网页采集', title: `${model.captures.count} 条记录 · ${pending.length} 项待确认`,
    goto: 'web-capture', lines: []
  });
  if (counts.length) groups.push({ title: '本地工作区', items: counts });
  return groups;
}

/* ── 插件：每个功能一个开关，仍是同一根经线上的结 ─────────────── */
export function loomModuleRows(list) {
  return [{ title: '插件 · 每个插件带自己的线色与入口', items: list.map(item => ({
    id: item.id,
    kind: item.partial ? '部分开启' : item.enabled ? '已开启' : '已关闭',
    title: item.name,
    thread: item.thread,
    lines: [
      item.blocked ? `需先开启「${item.requiresName || '依赖插件'}」` : item.description,
      item.pages?.length ? `入口 · ${item.pages.join(' / ')}` : '还没有贡献页面，开关只影响它自己的服务'
    ],
    margin: [item.pages?.length ? `${item.pages.length} 个入口` : '无入口'],
    actions: [`<button type="button" class="loom-inline-action" data-loom-module="${esc(item.id)}" data-loom-module-on="${item.enabled ? 'false' : 'true'}"${item.blocked ? ' disabled' : ''}>${item.enabled ? '关闭' : '开启'}</button>`],
    done: false
  })) }];
}

/* ── 日历：一个月是一段刻度，日是小结 ─────────────────────────── */
export function loomCalendarRows(model, date) {
  const groups = new Map();
  const push = (day, item) => { if (!groups.has(day)) groups.set(day, []); groups.get(day).push(item); };
  for (const entry of model.entries || []) {
    // 同一天的多段安排按开始时间先后落行；课程和事项各有自己的打开方式。
    const course = entry.course ? { id: entry.course.courseId, date: entry.course.originalDate, table: entry.containerId || '' } : null;
    const kind = entry.type === 'deadline' ? '截止' : entry.type === 'execution' ? '执行' : entry.type === 'phase' ? '阶段' : course ? '课程' : '安排';
    const time = entry.allDay ? '' : `${entry.startTime || ''}${entry.endTime && entry.endTime !== entry.startTime ? '–' + entry.endTime : ''}`;
    push(entry.start, {
      id: entry.id,
      openId: entry.itemId || entry.id,
      kind,
      title: entry.title,
      collection: entry.kind,
      action: !course,
      course,
      done: entry.done,
      past: entry.start < date,
      lines: [time, entry.slotLabel, entry.parentTitle].filter(Boolean),
      margin: [course ? '课程' : entry.done ? '已完成' : entry.end !== entry.start ? `到 ${entry.end}` : '']
    });
  }
  const rows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, items]) => ({
    title: day === date ? `今天 · ${dayOf(day)}` : `${day.slice(5)} ${dayOf(day)}`,
    items: items.sort((a, b) => String(a.lines[0]).localeCompare(String(b.lines[0])))
  }));
  const floating = model.floating || [];
  if (floating.length) rows.push({
    title: '未定日期',
    items: floating.map(item => ({
      id: item.id, kind: kindName(item.kind), title: item.title,
      collection: item.kind, action: true, lines: [item.goal || '还没排期']
    }))
  });
  return rows;
}

/* 页点不开时的说明：不再只闪一行字，明说原因，并给出唯一该去的去处。 */
export function blockedPage(page) {
  const copy = page.status === '挂起'
    ? '这个功能在本次运行中挂起：它的适配器还没有接好，入口先保留，已有记录不受影响。'
    : page.status === '暂不可用'
      ? '这个页面在当前版本里还没有接入，暂不能打开。'
      : '这个功能在插件管理里被关闭了。记录仍保存在本机，重新开启后就会回来。';
  return head(page.name, esc(copy), {
    date: '',
    meta: '关闭只收起入口，课程、事项与笔记都还在',
    right: '<button type="button" data-loom-goto="plugins">去插件管理</button><button type="button" data-loom-goto="overview">回总览</button>'
  });
}

export { head, thread, row as loomRow };
