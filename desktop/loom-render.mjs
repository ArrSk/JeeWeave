import { today } from '../shared/packages/core/src/semester-calendar.mjs';
import { courseTimes } from './course-occurrences.mjs';
import { completionDatesOnDate, deadlineOf, itemTimeParts } from './planning.mjs';
import { escapeHtml as esc } from './ui-text.mjs';
import { journalKindLabel } from './journal.mjs';
import { objectTypes } from './object-view.mjs';
import { head, thread, loomItemRows, loomNoteRows, loomObjectRows, loomReminderRows, loomCourseRows, loomOverviewRows, loomCalendarRows, loomModuleRows, loomShortcuts, itemThread } from './loom-pages.mjs';
import { loomLayouts } from './skeleton.mjs';
import { loomLayoutToday, atlasFields, rippleCourses, rippleGroups, atlasMarks, stageLead, atlasCartouche } from './loom-layouts.mjs';
import { calendarRange, shiftCalendar } from './calendar.mjs';
import { availableModules, isModuleEnabled } from './modules.mjs';
import { loomDestinations, pluginThread } from './loom-catalog.mjs';
import { themePresets } from './appearance.mjs';
import { homeworkCandidate, readHomework } from './homework.mjs';

export const loomWindowStart = nowMin => nowMin > 300 ? 360 : 0;
export const loomY = (minute, nowMin, hour = 88) => (minute - loomWindowStart(nowMin)) * hour / 60;
const minuteOf = time => /^\d{2}:\d{2}$/.test(time || '') ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
// 桌面所有“此刻”都按东八区读，和课程表、提醒同一口径。
const nowTime = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const hm = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

// “此刻之后还有多久 / 接下来是什么”——页头的先兆句就靠这三个数。
export function loomOmen(rows, nowMin) {
  const next = rows.find(row => row.at !== null && row.at !== undefined && row.at >= nowMin);
  if (!next) return { html: `现在 <b>${hm(nowMin)}</b> · 今天余下的都走完了`, quiet: true };
  const gap = next.at - nowMin;
  if (gap <= 0) return { html: `现在 <b>${hm(nowMin)}</b> · 正在 <em>${esc(next.title)}</em>`, quiet: false };
  if (gap <= 60) return { html: `现在 <b>${hm(nowMin)}</b> · <em>${esc(next.title)}</em> 还有 <b>${gap}</b> 分钟`, quiet: false };
  const h = Math.floor(gap / 60), m = gap % 60;
  return {
    html: `现在 <b>${hm(nowMin)}</b> · 到 <b>${hm(next.at)}</b> 之前还空着` +
      (h ? ` <b>${h}</b> 小时` : '') + (m ? ` <b>${m}</b> 分` : ''),
    quiet: false
  };
}

export function loomTodayRows(model) {
  const items = model.scheduledItems.map(item => {
    const work = model.work?.find(w => w.ref.collection === item.kind && w.ref.id === item.id);
    const slots = work?.slots || [], deadline = deadlineOf(item), anchor = item.anchor;
    const time = slots.length ? itemTimeParts(slots[0].start) : anchor.type === 'absolute' ? itemTimeParts(anchor.start) : null;
    // 只有“真的有钟点”才落到时间轴上；纯截止不假装是一个时刻。
    const at = time ? (time.date < model.date ? 0 : minuteOf(time.time)) : null;
    const end = slots.length ? itemTimeParts(slots[0].end) : anchor.type === 'absolute' ? itemTimeParts(anchor.end) : null;
    const label = time && end
      ? `${time.date < model.date ? '00:00' : time.time}–${end.date > model.date ? '24:00' : end.time}${slots.length > 1 ? ' · +' + (slots.length - 1) + ' 段' : ''}`
      : at !== null ? hm(at)
      : anchor.type === 'deadline' ? `截止 ${hm(minuteOf(deadline?.time) ?? 23 * 60 + 59)}`
      : '未定时';
    // 拖动只挪今天真正开始的那几段；跨过午夜的时段仍按原日期读取，不改口径。
    const moveSlots = slots.filter(slot => itemTimeParts(slot.start).date === model.date).map(slot => ({ id: slot.id, start: slot.start, end: slot.end }));
    const move = moveSlots.length ? 'slots' : anchor.type === 'absolute' && itemTimeParts(anchor.start).date === model.date ? 'anchor' : '';
    const phases = Array.isArray(item.phases) ? item.phases : [];
    return {
      id: item.id, ref: { collection: item.kind, id: item.id }, kind: '事项',
      at, time: label,
      move, moveSlots, moveAnchor: move === 'anchor' ? { start: anchor.start, end: anchor.end } : null,
      title: item.title,
      goal: item.goal || '',
      criteria: item.completionCriteria || '',
      note: item.note || '',
      where: item.location || '',
      object: work?.object?.title || '',
      objectId: work?.object?.id || '',
      stages: phases.length ? `${phases.filter(p => p.done).length}/${phases.length}` : '',
      slotCount: (work?.slots || []).length,
      source: item.courseOrigin ? {
        collection: 'courseEntry',
        id: item.courseOrigin.courseId,
        containerId: item.courseOrigin.tableId,
        date: item.courseOrigin.originalDate,
        title: item.courseOrigin.title
      } : null,
      dates: completionDatesOnDate(item, model.date)
    };
  });
  const courses = (model.courses?.entries || []).map(entry => {
    const times = courseTimes(model.courses.table, entry);
    return {
      id: `${entry.courseId}:${entry.originalDate}`,
      ref: { collection: 'courseEntry', id: entry.courseId, containerId: model.courses.table.id },
      originalDate: entry.originalDate, kind: '课程', at: minuteOf(times?.start),
      time: times ? `${times.start}–${times.end}` : '时间未配置',
      title: entry.title,
      goal: '', criteria: '',
      note: `${entry.teacher || '教师未填'} · 第 ${entry.periodStart}–${entry.periodEnd} 节${entry.status === 'cancelled' ? ' · 本次停课' : entry.status === 'moved' ? ' · 本次调出' : entry.isMovedIn ? ' · 本次调入' : ''}`,
      where: entry.location || '', object: model.courses.table.name,
      stages: '', slotCount: 0, source: null, dates: []
    };
  });
  return [...courses, ...items].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || a.id.localeCompare(b.id));
}

// Presentation only: synchronous public queries and DOM layout, never business writes.
export function createLoomRenderer({ host, bindings, context, loomLayout = () => 'jingwei', homework }) {
  const view = document.createElement('div'); view.className = 'loom-today';  let active = false, disposed = false, timer, frame, date = '', rows = [], currentPage = '', calendarCursor = '', calendarView = '', captureId = '', reminderRows = null, reminderError = '', reminderToken = 0, stageCue = '', cueDate = '';
  let calendarObject = '';
  // 同一批分组，四种读法：涟漪铺成水纹行，舆图的事项立成界标，其余仍沿那条纬线。
  const grouped = (pageId, groups, options) => loomLayout() === 'ripple' ? rippleGroups(groups, options)
    : loomLayout() === 'atlas' && pageId === 'plans' ? atlasMarks(groups, options)
    : thread(groups, options);
  const layout = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0; if (!active || disposed || document.hidden) return;
      const warp = view.querySelector('.loom-warp'); if (!warp) return;
      const now = Number(warp.dataset.now), start = loomWindowStart(now), hour = parseFloat(getComputedStyle(view).getPropertyValue('--hour')) || 88;
      let floor = -Infinity;
      warp.querySelectorAll('.loom-paper').forEach(el => {
        const top = Math.max(loomY(Math.max(start, Number(el.dataset.at)), now, hour), floor);
        el.style.top = top + 'px'; floor = top + el.offsetHeight + 11;
      });
      const windowBottom = loomY(start + 1080, now, hour);
      warp.style.height = Math.max(18 * hour + 48, Number.isFinite(floor) ? floor + 24 : 0) + 'px';
      warp.querySelectorAll('[data-min]').forEach(el => { el.style.top = loomY(+el.dataset.min, now, hour) + 'px'; });
      const nowMark = warp.querySelector('.loom-now-mark');
      if (nowMark) nowMark.style.top = Math.max(0, loomY(now, now, hour)) + 'px';
      // 先兆流光：从此刻往下 150 分钟那一段
      const omen = warp.querySelector('.loom-omen-line');
      if (omen) {
        const top = Math.max(0, loomY(Math.max(now, start), now, hour));
        const bottom = Math.min(windowBottom, loomY(Math.min(now + 150, start + 1080), now, hour));
        omen.style.top = top + 'px';
        omen.style.height = Math.max(24, bottom - top) + 'px';
      }
      // 日尾：最后一张纸条之下，到窗口底
      const tail = warp.querySelector('.loom-tail');
      if (tail) {
        const from = Math.max(Number.isFinite(floor) ? floor + 26 : 0, loomY(Math.max(now, start), now, hour) + 30);
        if (windowBottom - from < 40) { tail.remove(); }
        else { tail.style.top = from + 'px'; tail.style.height = (windowBottom - from) + 'px'; }
      }
    });
  };
  const layer = (label, text) => text ? `<p class="loom-slip-layer"><b>${label}</b>${esc(text)}</p>` : '';  const paper = (row, index) => {
    const past = row.at !== null && row.at !== undefined && row.at < Number(view.dataset.now || 0);
    const canComplete = row.kind === '事项' && row.dates.length === 1;
    // 课程始终是靛；有归属的事项跟那块地同色，散的事项按类型取色。
    const thread = row.kind === '课程' ? '--t-indigo' : itemThread(row.ref.collection, row.objectId);
    const margin = [
      `<span class="loom-slip-time">${esc(row.time)}</span>`,
      row.where ? `<span class="loom-slip-where">${esc(row.where)}</span>` : '',
      row.object ? `<span class="loom-slip-obj">${esc(row.object)}</span>` : '',
      row.stages ? `<span class="loom-slip-stage">阶段 ${esc(row.stages)}</span>` : '',
      row.slotCount > 1 ? `<span class="loom-slip-stage">执行 ${row.slotCount} 段</span>` : '',
      row.source ? `<button type="button" class="loom-slip-source" data-loom-open-source="${esc(row.source.id)}" data-loom-source-table="${esc(row.source.containerId || '')}" data-loom-source-date="${esc(row.source.date || '')}">来自 ${esc(row.source.title || '这节课')}</button>` : ''
    ].filter(Boolean).join('');
    return `<li class="loom-paper ${row.kind === '事项' ? 'loom-slip' : 'loom-course-slip'}${past ? ' is-past' : ''}" data-id="${esc(row.id)}" data-collection="${row.ref.collection}" data-at="${row.at ?? 360}" data-row="${index}" data-loom-move="${row.move || ''}" style="--i:${index};--thread:var(${thread})">` +
      `<span class="loom-slip-body"><span class="loom-slip-kind"><i></i>${row.kind}</span>` +
      `<h3 class="loom-slip-title"><button type="button" data-loom-paper-action="open">${esc(row.title)}</button></h3>` +
      layer('为什么', row.goal) + layer('怎样算好', row.criteria) +
      (row.note ? `<p class="loom-slip-note${row.goal || row.criteria ? ' is-quiet' : ''}">${esc(row.note)}</p>` : '') +
      `</span><span class="loom-slip-margin">${margin}</span>` +
      `<button class="loom-slip-knot" type="button" ${canComplete ? `data-today-item-complete="${esc(row.ref.id)}" data-kind="${esc(row.ref.collection)}" data-completion-date="${row.dates[0]}" data-render-date="${date}"` : ''} data-loom-paper-action="${canComplete ? 'complete' : 'open'}" aria-label="${canComplete ? '穿过：' : '打开：'}${esc(row.title)}"></button></li>`;
  };
  const jingweiToday = ctx => {
    const { date, time, now, start, end, rows, model, omen, openCount } = ctx;
    const ticks = [];
    for (let m = start; m <= end; m += 30) {
      ticks.push(`<span class="loom-tick${m % 60 === 0 ? ' is-hour' : ''}" data-min="${m}"></span>`);
      if (m % 120 === 0 && m < end) ticks.push(`<span class="loom-tick-label${Math.abs(m - now) < 26 ? ' is-muted' : ''}" data-min="${m}"><b>${hm(m)}</b></span>`);
    }
    const tailText = openCount ? `还有 ${openCount} 件在下面` : '今天走到了这里';
    return `<header class="loom-day-head">` +
        `<h1 tabindex="-1">今天<span>${date}</span></h1>` +
        `<p class="loom-omen${omen.quiet ? ' is-quiet' : ''}">${omen.html}</p>` +
        `<div class="loom-head-acts">` +
          `<button type="button" data-loom-now>回到此刻</button>` +
          `<button type="button" data-loom-today-other>其他待处理事项 · ${model.otherItems.length}</button>` +
        `</div>` +
        `<span class="loom-day-stats">${rows.filter(r => r.kind === '课程').length} 次课 · ${model.scheduledItems.length} 项安排</span>` +
      `</header>` +
      ctx.alerts +
      (rows.length ? '' : '<p class="loom-empty">今天空着，正好留给自己。</p>') +
      `<div class="loom-completion-slot"></div>` +
      `<div class="loom-warp" data-now="${now}">` +
        `<div class="loom-warp-ticks" aria-hidden="true">${ticks.join('')}</div>` +
        `<div class="loom-omen-line" aria-hidden="true"></div>` +
        `<div class="loom-now-mark"><span class="loom-now-dot"></span><span class="loom-now-clock">${time}<i>此刻</i></span></div>` +
        `<div class="loom-drag-ghost" aria-hidden="true"><span class="loom-drag-ghost-time"></span></div>` +
        `<ol class="loom-slips">${rows.map(paper).join('')}</ol>` +
        `<div class="loom-tail" aria-hidden="true"><span class="loom-tail-line"></span><span class="loom-tail-knot"></span><span class="loom-tail-say">${tailText}</span></div>` +
      `</div>`;
  };
  // 刚下课的追问只在今天页出现；点过一次就记住，问过的不再重复。
  const askAboutHomework = model => {
    if (!homework) return null;
    try {
      const handled = new Set(readHomework(homework));
      return homeworkCandidate(model.courses, Number(view.dataset.now || 0), key => handled.has(key), candidate => {
        try {
          return host.client('items').forCourse(
            { collection: 'courseEntry', id: candidate.courseId, containerId: candidate.tableId },
            { originalDate: candidate.originalDate, date }).total > 0;
        } catch { return true; }
      });
    } catch { return null; }
  };
  const homeworkPrompt = ask => {
    const card = document.createElement('aside');
    card.className = 'loom-homework';
    card.setAttribute('role', 'note');
    for (const [name, value] of Object.entries({ key: ask.key, table: ask.tableId, course: ask.courseId, title: ask.title, date: ask.originalDate, end: ask.end })) card.setAttribute(`data-loom-homework-${name}`, value);
    card.innerHTML = `<p class="loom-homework-line"><span class="loom-homework-knot" aria-hidden="true"></span>` +
      `<span>刚下课 · <b>${esc(ask.title)}</b> ${esc(ask.end)} 结束</span>` +
      `<span class="loom-homework-ask">这次有作业吗？</span></p>` +
      `<span class="loom-homework-acts">` +
        `<button type="button" data-loom-homework="yes">有，记一项</button>` +
        `<button type="button" data-loom-homework="no">没有</button>` +
      `</span>`;
    return card;
  };
  const render = () => {
    if (!active || disposed || document.hidden) return;
    const focused = view.contains(document.activeElement) ? { id: document.activeElement.closest('[data-id]')?.dataset.id, action: document.activeElement.dataset.loomPaperAction } : null;
    const time = nowTime();
    date = today(); const now = minuteOf(time), start = loomWindowStart(now), end = start + 1080;
    // 换幕挑的是「今天这一刻台上站谁」，过了零点就要交还给自动选幕，不能把昨天的主角带过来。
    if (cueDate !== date) { cueDate = date; stageCue = ''; }
    let model;
    try { model = host.client('today').query(date, time); rows = loomTodayRows(model); }
    catch (error) { rows = []; view.innerHTML = `<h1 tabindex="-1">今天</h1><p role="alert">无法读取今天：${esc(error.message)}。请稍后重试。</p>`; return; }
    // 必须在生成任何一张条目之前写入此刻，否则首帧会把所有条目都判成“已过去”。
    view.dataset.now = String(now);
    const ctx = {
      date, time, now, start, end, rows, model, cue: stageCue,
      // 灯位只改这一套版式的光，不动数据也不动配色方案本身。
      light: document.documentElement.dataset.loomLight === 'warm',
      omen: loomOmen(rows, now),
      openCount: rows.filter(row => (row.at ?? Infinity) >= now).length,
      alerts: Object.values(model.errors).map(message => `<p role="alert">${esc(message)}</p>`).join('')
    };
    // 经纬仍是默认摆位；涟漪 / 舆图 / 夜场用同一批真实记录换一套版式。
    view.innerHTML = loomLayoutToday(loomLayout(), ctx) || jingweiToday(ctx);
    const ask = askAboutHomework(model);
    if (ask) {
      const prompt = homeworkPrompt(ask);
      const handle = view.querySelector('.loom-day-head, .loom-atlas-cartouche');
      if (handle) handle.insertAdjacentElement('afterend', prompt); else view.prepend(prompt);
    }
    if (focused) {
      const row = [...view.querySelectorAll('[data-id]')].find(el => el.dataset.id === focused.id);
      (row?.querySelector(`[data-loom-paper-action="${focused.action}"]`) || row || view.querySelector('h1')).focus({ preventScroll: true });
    }
    layout();
  };
  // 夜场换幕：候场点击或 ↑↓ 都能换主角，改的只是呈现，数据仍来自同一批今天记录。
  const curtain = () => {
    if (!view.isConnected || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const veil = document.createElement('div'); veil.className = 'loom-stage-veil'; veil.setAttribute('aria-hidden', 'true');
    view.append(veil);
    const drop = () => veil.remove();
    veil.animate([{ opacity: 0 }, { opacity: .88, offset: .4 }, { opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.33,0,.2,1)' }).finished.then(drop, drop);
  };
  const cueStage = (id, step = 0) => {
    if (!rows.length) return;
    const current = stageLead(rows, id || stageCue, Number(view.dataset.now || 0));
    const index = rows.indexOf(current);
    if (index < 0) return;
    const next = step ? rows[(index + step + rows.length) % rows.length] : current;
    if (!next || (!step && next.id === stageCue)) return;
    stageCue = next.id; render(); curtain();
  };
  const observer = new ResizeObserver(layout);
  /* ── 其余页面：沿用同一套「一条线 + 落在线上的条目」 ───────────────
     每页只取公共查询、只画，不做业务判断；数据变化沿用同一套 render。 */
  const renderPage = pageId => {
    if (disposed || document.hidden) return;
    const date = today();
    let html = '';
    try {
      if (pageId === 'overview') {
        const model = host.client('overview').query();
        const pending = model.captures?.pending?.length || 0;
        const groups = loomOverviewRows(model, date);
        const errors = Object.values(model.errors || {});
        html = head('总览', pending ? `有 <b>${pending}</b> 项网页行动等你确认` : '工作区一页读完，今天在另一条线上',
          { date, meta: errors.length ? errors.join(' · ') : '全部保存在本机',
            right: pending ? '<button type="button" data-loom-goto="web-capture">去整理</button>' : '' }) +
          thread(groups, { empty: '还没有内容。先从课程表或事项写起。' });
      } else if (pageId === 'plans') {
        const items = host.client('items').list();
        const groups = loomItemRows(items, date);
        const count = groups.reduce((sum, group) => sum + group.items.length, 0);
        html = (loomLayout() === 'atlas'
          ? atlasCartouche('所有<em>界标</em>', '待办、事件、考试与计划，每一个都能回到它所在的那块地。',
            { date, stats: `<span>共 <b>${count}</b> 处</span><span>未完成 <b>${items.filter(item => !item.done).length}</b></span>`, right: '<button type="button" data-loom-new="item">新增</button>' })
          : head('事项',
            groups[0].items.length
              ? `共 <b>${count}</b> 件，最近的一件有明确时段`
              : `共 <b>${count}</b> 件，都还没有排定时间`,
            { date, meta: `${items.filter(item => !item.done).length} 件未完成`, right: '<button type="button" data-loom-new="item">新增</button>' })) +
          grouped('plans', groups, { empty: '还没有事项。' });
      } else if (pageId === 'notes') {
        const service = host.client('journal');
        const notes = service.list({ status: 'active' });
        const draft = service.draft();
        // kind 存的是英文键，页面用中文标签；映射失败就原样显示，不猜。
        const label = kind => {
          try { return journalKindLabel(kind); } catch { return kind || '记录'; }
        };
        const groups = loomNoteRows(notes.map(note => ({ ...note, kind: label(note.kind) })));
        html = head('笔记', `最近 ${notes.length} 则，按日期铺在这条线上`,
          { date, meta: groups.length + ' 天有记录', right: '<button type="button" data-loom-new="note">记一笔</button>' }) +
          (draft ? '<p class="loom-note" role="status">还有一份草稿，已保存在本地。<button type="button" class="loom-inline-action" data-loom-new="note">继续写</button></p>' : '') +
          grouped('notes', groups, { empty: '还没有记录。' });
      } else if (pageId === 'objects') {
        const objects = host.client('objects').list();
        const items = host.client('items').list();
        const notes = host.client('journal').list({ status: 'active' });
        const counts = { items: {}, notes: {} };
        for (const item of items) if (item.objectId) counts.items[item.objectId] = (counts.items[item.objectId] || 0) + 1;
        for (const note of notes) if (note.objectId) counts.notes[note.objectId] = (counts.notes[note.objectId] || 0) + 1;
        const objectGroups = loomObjectRows(objects, counts, object => objectTypes[object.type] || '对象');
        // 舆图在疆域下面接一段今天的路线：行号与完成判定要用同一批今天记录，所以顺手把缓存换成刚查到的。
        let slips = [];
        if (loomLayout() === 'atlas') {
          try { slips = rows = loomTodayRows(host.client('today').query(date, nowTime())); } catch { slips = []; }
        }
        html = (loomLayout() === 'atlas'
          ? atlasCartouche('这块<em>疆域</em>', '每个对象是一块地，边上的数字是它牵着的安排与记录。',
            { date, stats: `<span>共 <b>${objects.length}</b> 块</span><span>写了目的 <b>${objects.filter(object => object.purpose).length}</b></span><span>今天 <b>${slips.length}</b> 处</span>`, right: '<button type="button" data-loom-new="object">新建</button>' })
          : head('对象', `共 <b>${objects.length}</b> 块，每块牵着各自的安排与记录`,
            { date, meta: objects.filter(object => object.purpose).length + ' 块写了目的', right: '<button type="button" data-loom-new="object">新建</button>' })) +
          // 舆图把对象摆成疆域上的地块，涟漪摆成水纹行，其他布局仍沿一条纬线读同一批对象。
          (loomLayout() === 'atlas' ? atlasFields(objectGroups, { todayRows: slips, date }) : grouped('objects', objectGroups, { empty: '还没有对象。' }));
      } else if (pageId === 'reminders') {
        // 提醒记录来自异步 IPC：先画已读到的，读到再重画，不把 Promise 当成数组。
        const rows = reminderRows;
        const count = mode => (rows || []).filter(row => !row.archived && (row.mode || 'timed') === mode).length;
        html = head('提醒', rows && rows.length ? `定时 <b>${count('timed')}</b> 条 · 静默 ${count('silent')} 条 · 长期 ${count('attention')} 条` : '现在没有需要提醒你的事',
          { date, meta: rows ? '关掉插件只暂停系统通知，记录保留' : '交给 Windows 任务计划，退出几微仍可触发',
            right: '<button type="button" data-loom-reminder-new>添加提醒</button>' }) +
          (reminderError ? `<p role="alert">${esc(reminderError)}</p>` : '') +
          (rows === null ? '<p class="loom-empty">正在读取本机提醒记录…</p>' : rows.length ? thread(loomReminderRows(rows)) : '<p class="loom-empty">还没有提醒。点「添加提醒」写一条；提醒由独立插件管理，可在「插件」里查看它的开关状态。</p>');
      } else if (pageId === 'courses') {
        const entries = host.client('courses').listEntries();
        const model = host.client('courses').onDate(date, '12:00');
        const { columns, weekday } = loomCourseRows(
          entries.map(entry => ({ ...entry.record, day: weekdayIndexOf(entry.record), id: entry.ref.id, containerId: entry.ref.containerId })),
          model.table, date);
        const total = columns.reduce((sum, column) => sum + column.items.length, 0);
        // 涟漪把一周读成七条并排的水道，其余布局仍沿经纬那七缕。
        html = loomLayout() === 'ripple' ? rippleCourses({ columns, weekday, date, table: model.table, total }) :
          head('课程表', `本周 <b>${total}</b> 节课，七缕并排`,
          { date, meta: model.table?.name || '当前课表', right: '<button type="button" data-loom-new="course">添加课程</button>' }) +
          `<div class="loom-courses">` + columns.map(column =>
            `<div class="loom-course-col${column.index === weekday ? ' is-today' : ''}">` +
              `<h2 class="loom-course-day">${column.name}<b>${column.items.length || ''}</b></h2>` +
              `<ol class="loom-course-list">` + column.items.map(item =>
                `<li class="loom-course${column.index === weekday ? ' is-today' : ''}">` +
                  `<button type="button" data-loom-open-course="${esc(item.id)}" data-loom-course-table="${esc(item.containerId || '')}">${esc(item.title)}</button>` +
                  (item.margin[0] ? `<span>${esc(item.margin[0])}</span>` : '') +
                `</li>`).join('') +
              `</ol></div>`).join('') + `</div>`;
      } else if (pageId === 'calendar') {
        const cursor = calendarCursor || date;
        const preferences = host.client('calendar').preferences();
        // 首次进页沿用日历自己保存的视图；之后只改本页，并立刻存回同一份设置。
        if (!calendarView) calendarView = ['month', 'week', 'day'].includes(preferences.view) ? preferences.view : 'month';
        const range = calendarRange(cursor, calendarView);
        let model;
        try { model = host.client('calendar').query(range, preferences.filters, { objectId: calendarObject }); }
        catch (error) { model = { entries: [], floating: [], errors: [error.message], object: { id: calendarObject, title: '对象暂不可用' } }; }
        const groups = loomCalendarRows(model, date);
        const unit = { month: '月', week: '周', day: '日' }[calendarView];
        const title = calendarView === 'month'
          ? `${Number(cursor.slice(0, 4))} 年 ${Number(cursor.slice(5, 7))} 月`
          : calendarView === 'week' ? `${range.start.slice(5)} – ${range.end.slice(5)}` : range.start;
        const viewButton = (id, name) => `<button type="button" data-loom-cal-view="${id}" aria-pressed="${calendarView === id}">${name}</button>`;
        html = head('日历', `${title} · 共 <b>${(model.entries || []).length}</b> 条安排`,
          { date: cursor, meta: (model.floating || []).length ? `${model.floating.length} 项未定日期` : '',
            right: `<span class="loom-cal-views">${viewButton('month', '月')}${viewButton('week', '周')}${viewButton('day', '日')}</span>` +
              `<button type="button" data-loom-cal-step="-1">上${unit}</button><button type="button" data-loom-cal-today>回到今天</button><button type="button" data-loom-cal-step="1">下${unit}</button>` }) +
          (calendarObject ? `<p class="loom-note" role="status">只看：${esc(model.object?.title || '所选对象')} <button type="button" class="loom-inline-action" data-loom-cal-clear>返回全部日历</button></p>` : '') +
          (model.errors?.length ? `<p class="loom-note" role="alert">${esc(model.errors.join('；'))}</p>` : '') +
          thread(groups, { empty: `这个${unit}还没有安排。` });
      } else if (pageId === 'settings') {
        const ctx = context?.() || {};
        const currentSkeleton = ctx.skeleton?.skeleton || 'workbench';
        const currentLayout = ctx.skeleton?.loomLayout || 'jingwei';
        const theme = themePresets.find(preset => preset.id === ctx.theme);
        const developer = Boolean(ctx.developerMode);
        const choice = (id, name, copy) => `<button type="button" class="loom-choice" data-loom-skeleton="${id}" aria-pressed="${currentSkeleton === id}"><strong>${name}</strong><small>${copy}</small></button>`;
        html = head('设置', '骨架、配色与本机数据都收在这一页', { date, meta: '改动即时保存' }) +
          `<div class="loom-ribbon">` +
          `<section class="loom-group"><h2 class="loom-group-title">骨架<b>2</b></h2><div class="loom-choices">` +
            choice('loom', '经纬', '现在 · 本周 · 长线') + choice('workbench', '工作台', '原七种布局') +
          `</div><p class="loom-note">页头只留查找与命令；骨架、织法和配色都在这一页切换，改动即时保存。</p></section>` +
          // 四套经纬布局共用同一批本机数据，这里只换导航与摆位。
          (currentSkeleton === 'loom' ? `<section class="loom-group"><h2 class="loom-group-title">经纬布局<b>4</b></h2><div class="loom-choices">` +
            loomLayouts.map(item => `<button type="button" class="loom-choice" data-loom-layout-choice="${item.id}" aria-pressed="${currentLayout === item.id}"><strong>${item.name}</strong><small>${item.copy}</small></button>`).join('') +
          `</div><p class="loom-note">换布局只改导航与摆位，记录与开关都不动。</p></section>` : '') +
          `<section class="loom-group"><h2 class="loom-group-title">配色<b>${esc(theme?.name || '自定义')}</b></h2>` +
            `<p class="loom-note">经纬里四套布局各有默认材质（暖纸 / 水面 / 图纸 / 屋内）；这里选定的配色会保存，返回工作台后生效。</p>` +
            `<div class="loom-swatches">` + themePresets.map(item =>
              `<button type="button" class="loom-swatch" data-loom-theme="${esc(item.id)}" title="${esc(item.name)}" aria-label="切换到${esc(item.name)}" aria-pressed="${ctx.theme === item.id}" style="--swatch:${item.colors.accent};--swatch-bg:${item.colors.background}"></button>`).join('') +
          `</div></section>` +
          `<section class="loom-group"><h2 class="loom-group-title">本机数据</h2><div class="loom-choices">` +
            `<button type="button" class="loom-choice" data-loom-developer="${developer ? 'false' : 'true'}"><strong>开发者模式 · ${developer ? '已开启' : '已关闭'}</strong><small>示例导入与教务抓取原文</small></button>` +
            `<button type="button" class="loom-choice" data-loom-action="data-folder"><strong>打开数据文件夹</strong><small>${esc(ctx.dataRoot || '统一数据目录')}</small></button>` +
            `<button type="button" class="loom-choice" data-loom-action="export"><strong>导出迁移包</strong><small>课程、事项、笔记与原文</small></button>` +
          `</div><p class="loom-note">导入迁移包需要预览确认，请返回工作台操作。</p></section>` +
          // 示例导入和清空数据只在开发者模式出现，和工作台设置里的归属保持一致。
          (developer ? `<section class="loom-group"><h2 class="loom-group-title">开发者<b>2</b></h2><div class="loom-choices">` +
            `<button type="button" class="loom-choice" data-loom-action="examples"><strong>导入全部示例</strong><small>只补缺失项，保留已有内容与完成状态</small></button>` +
            `<button type="button" class="loom-choice" data-loom-action="reset"><strong>清空所有数据</strong><small>先备份，再重启应用</small></button>` +
            `</div><p class="loom-note">关闭开发者模式后这两项就消失；清空仍要在这里确认范围。</p></section>` : '') +
          `<section class="loom-group"><h2 class="loom-group-title">键盘</h2><div class="loom-keys">` +
            loomShortcuts.map(([key, text]) => `<span><kbd>${esc(key)}</kbd>${esc(text)}</span>`).join('') +
          `</div><p class="loom-note">按 <kbd>?</kbd> 随时打开这张地图。</p></section>` +
          `</div>`;
      } else if (pageId === 'plugins') {
        const modules = context?.().modules || { enabled: {} };
        const catalog = loomDestinations(modules, host.inventory());
        const list = availableModules
          .filter(item => !item.desktopOnly || typeof globalThis.window?.jeeWeaveDesktop?.assistant === 'function')
          .map(item => ({
            ...item,
            enabled: item.id === 'plans' ? isModuleEnabled(modules, 'items') : isModuleEnabled(modules, item.id),
            partial: item.id === 'plans' && modules.enabled.plans !== modules.enabled.tasks,
            blocked: Boolean(item.requires && !isModuleEnabled(modules, item.requires)),
            requiresName: availableModules.find(other => other.id === item.requires)?.name || '',
            thread: pluginThread(item.id),
            pages: catalog.filter(page => page.plugin === item.id).map(page => page.name)
          }));
        const open = list.filter(item => item.enabled).length;
        html = head('插件', `壳由目录生成：<b>${list.length}</b> 个可开关功能，各自带线色与入口`,
          { date, meta: `${open} 个已开启 · 关闭只收起入口，资料保留` }) +
          thread(loomModuleRows(list), { empty: '没有可开关的功能。' });
      } else if (pageId === 'web-capture') {
        const records = host.client('web-captures').list();
        if (!records.some(record => record.id === captureId)) captureId = records[0]?.id || '';
        const selected = records.find(record => record.id === captureId);
        const pending = records.reduce((sum, record) => sum + record.drafts.filter(draft => draft.status === 'pending').length, 0);
        html = head('网页采集',
          records.length ? `已采集 <b>${records.length}</b> 条网页，${pending} 项行动待确认` : '把公开网页整理成下一步',
          { date, meta: '公开静态网页 · 在本机整理 · 原文单独保存' }) +
          `<form class="loom-capture-form" data-loom-collect>` +
            `<label class="sr-only" for="loom-collect-url">公开网页地址</label>` +
            `<input id="loom-collect-url" type="url" required placeholder="粘贴通知或文章的网址，例如 https://example.com" />` +
            `<button type="submit" class="primary">抓取并整理</button>` +
          `</form>` +
          (records.length
            ? thread([{ title: '已采集网页', items: records.map(record => ({
                id: record.id, kind: record.example ? '示例' : '网页', title: record.title,
                captureSelect: record.id, selected: record.id === captureId,
                lines: [record.url],
                margin: [`${record.drafts.filter(draft => draft.status === 'pending').length} 项待确认`]
              })) }])
            : '<p class="loom-empty">还没有采集记录。粘贴一个公开网页地址开始。</p>') +
          (selected ? `<section class="loom-capture-detail">` +
            `<h2>${esc(selected.title)}</h2><p class="loom-note">${esc(selected.url)}</p>` +
            `<h3>重点信息</h3><ul class="loom-capture-highlights">${(selected.highlights || []).map(text => `<li>${esc(text)}</li>`).join('') || '<li>未提取到重点。</li>'}</ul>` +
            `<h3>行动草稿</h3><div class="loom-capture-drafts">` +
              ((selected.drafts || []).map(draft => draft.status === 'added'
                ? `<div class="loom-capture-draft"><strong>${esc(draft.title)}</strong><small>${esc(draft.date || '无截止日期')}</small><span class="loom-note">已加入事项</span></div>`
                : `<div class="loom-capture-draft"><strong>${esc(draft.title)}</strong><small>${esc(draft.date || '日期待确认')}${draft.dateInferred ? ' · 原文未写完整日期' : ''}</small><button type="button" class="loom-inline-action" data-loom-approve-draft="${esc(draft.id)}" data-loom-capture="${esc(selected.id)}" data-loom-draft-title="${esc(draft.title)}" data-loom-draft-date="${esc(draft.date || '')}">确认加入事项</button></div>`).join('') ||
                '<p class="loom-note">未识别到明确行动。重点与原文已保留。</p>') +
            `</div>` +
            `<details class="loom-capture-original"><summary>查看原文</summary><pre>${esc(selected.text || '')}</pre></details>` +
          `</section>` : '');
      } else {
        return null;
      }
    } catch (error) {
      view.innerHTML = head(pageId, `读取失败：${esc(error.message)}`, { date }) + `<p class="loom-empty">稍后重试，或回到工作台查看。</p>`;
      return true;
    }
    view.innerHTML = html;
    return true;
  };

  const weekdayIndexOf = record => {
    // 课程记录保存的是周几（1=周一）；缺失时按 1 处理，不猜测真实日期。
    const day = Number(record.weekday ?? record.day ?? 1);
    return Math.min(7, Math.max(1, Number.isFinite(day) ? day : 1));
  };

  const calendarStep = amount => {
    const focused = document.activeElement?.dataset?.loomCalStep;
    calendarCursor = shiftCalendar(calendarCursor || today(), amount, calendarView || 'month');
    if (currentPage === 'calendar') renderPage('calendar');
    if (focused && active) view.querySelector(`[data-loom-cal-step="${focused}"]`)?.focus({ preventScroll: true });
  };
  // 月 / 周 / 日共用同一份日历设置：换视图先重画，再存回设置；存不上由调用处报错。
  const setCalendarView = next => {
    if (!['month', 'week', 'day'].includes(next) || next === calendarView) return;
    const focused = document.activeElement?.dataset?.loomCalView;
    calendarView = next;
    if (currentPage === 'calendar') renderPage('calendar');
    if (focused && active) view.querySelector(`[data-loom-cal-view="${focused}"]`)?.focus({ preventScroll: true });
    const preferences = host.client('calendar').preferences();
    host.client('calendar').savePreferences({ ...preferences, view: next });
  };
  const calendarToday = () => {
    const focused = document.activeElement?.hasAttribute?.('data-loom-cal-today');
    calendarCursor = '';
    if (currentPage === 'calendar') renderPage('calendar');
    if (focused && active) view.querySelector('[data-loom-cal-today]')?.focus({ preventScroll: true });
  };
  const selectCapture = id => {
    captureId = id;
    if (currentPage === 'web-capture') renderPage('web-capture');
  };
  // 提醒是唯一异步的页面：每次进入或提交后重读，迟到的旧结果一律丢弃。
  const loadReminders = () => {
    const token = ++reminderToken;
    const settle = () => { if (!disposed && token === reminderToken && currentPage === 'reminders') renderPage('reminders'); };
    let pending;
    try { pending = Promise.resolve(host.client('reminders').list()); }
    catch (error) { reminderError = error.message; settle(); return; }
    pending.then(result => {
      if (disposed || token !== reminderToken) return;
      reminderRows = Array.isArray(result?.rows) ? result.rows : Array.isArray(result) ? result : [];
      reminderError = '';
    }).catch(error => {
      if (disposed || token !== reminderToken) return;
      reminderError = error.message;
    }).then(settle);
  };
  const setActive = page => {
    if (disposed) return;
    const next = Boolean(page);
    const pageId = next ? (page.dataset.page || '') : '';
    // 同一页被重复 mount（例如插件刷新）时只重绘当前页，不重绘成今天。
    if (active && next && view.parentElement === page && currentPage === pageId) { refreshActive(); return; }
    active = next; currentPage = pageId;
    clearInterval(timer); timer = null; cancelAnimationFrame(frame); observer.disconnect();
    if (!next) { view.remove(); rows = []; return; }
    view.classList.toggle('is-paused', document.hidden || !document.hasFocus());
    page.prepend(view);
    if (pageId === 'today' || !pageId) render();
    else renderPage(pageId);
    if (pageId === 'reminders') loadReminders();
    observer.observe(view);
    timer = setInterval(() => {
      if (!document.hasFocus()) return;
      if (currentPage === 'today' || !currentPage) render();
      else if (currentPage === 'reminders') loadReminders();
      else renderPage(currentPage);
    }, 30000);
  };
  // 只刷新「当前页」的呈现：早期版本无条件调 render()，会把其他页覆盖成今天。
  const refreshActive = () => {
    if (!active || disposed) return;
    if (currentPage === 'today' || !currentPage) render();
    else if (currentPage === 'reminders') loadReminders();
    else renderPage(currentPage);
  };
  bindings.listen(document, 'visibilitychange', () => { view.classList.toggle('is-paused', document.hidden); if (!document.hidden) refreshActive(); });
  bindings.listen(window, 'blur', () => view.classList.add('is-paused'));
  bindings.listen(window, 'focus', () => { view.classList.toggle('is-paused', document.hidden); refreshActive(); });
  for (const event of ['items:committed', 'courses:committed', 'objects:committed']) bindings.effect(() => host.on(event, refreshActive));
  bindings.effect(() => host.on('reminders:committed', () => { if (currentPage === 'reminders') loadReminders(); }));
  const dispose = () => { setActive(null); disposed = true; };
  bindings.onStop(dispose);
  const scopeCalendar = (objectId = '', nextView = calendarView || 'month') => { if (typeof objectId !== 'string') throw Error('对象编号无效。'); calendarObject = objectId; setCalendarView(nextView); refreshActive(); };
  return { scopeCalendar, setActive, render: refreshActive, renderToday: render, calendarStep, calendarToday, setCalendarView, selectCapture, cueStage, resolve: index => active && date === today() ? rows[index] : null, date: () => date, dispose };
}
