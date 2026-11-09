import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loomWindowStart, loomY, loomTodayRows, loomOmen } from './loom-render.mjs';
import { loomReminderRows, thread, loomCourseRows, loomThread, itemThread, loomItemRows, loomObjectRows, blockedPage } from './loom-pages.mjs';
import { atlasToday, rippleToday, stageToday, atlasFields, rippleCourses, rippleGroups, atlasMarks, stageLead, stagePitRatio, stageWeekAct } from './loom-layouts.mjs';
import { normalizeItem } from './planning.mjs';

test('经纬时窗沿用小样的五点边界与真实时间换算', () => {
  assert.equal(loomWindowStart(300), 0);
  assert.equal(loomWindowStart(301), 360);
  assert.equal(loomY(480, 840), 176);
  assert.equal(loomY(480, 840, 80), 160);
});
test('经纬纸条一事项一条，跨日时段和未定时不虚构截止钟点，保持集合身份', () => {
  const date='2026-11-02';
  const items=[normalizeItem({id:'same',title:'未定时截止',anchor:{type:'deadline',date}}),normalizeItem({id:'same',title:'执行时段',anchor:{type:'floating'},executionSlots:[]},'plan')];
  const model={date,scheduledItems:items,work:[{ref:{collection:'plan',id:'same'},object:{title:'项目'},slots:[{start:'2026-11-01T23:00:00+08:00',end:'2026-11-02T08:00:00+08:00'}]}],courses:{entries:[]}};
  const before=JSON.stringify(model),rows=loomTodayRows(model);
  assert.equal(rows.length,2);
  assert.equal(rows[0].at,0);assert.equal(rows[0].object,'项目');assert.equal(rows[0].ref.collection,'plan');
  assert.equal(rows[1].at,null);assert.match(rows[1].time,/^截止 \d{2}:\d{2}$/);
  assert.equal(JSON.stringify(model),before);
});

test('先兆句按“还有多久”分档，且不编造钟点', () => {
  const rows=[{at:600,title:'组会'},{at:null,title:'未定时'}];
  assert.match(loomOmen(rows,540).html,/还有 <b>60<\/b> 分钟/);
  assert.match(loomOmen(rows,599).html,/还有 <b>1<\/b> 分钟/);
  // 刚好到点：说“正在”，不再说“还有 0 分钟”。
  assert.match(loomOmen(rows,600).html,/正在 <em>组会<\/em>/);
  assert.match(loomOmen(rows,400).html,/到 <b>10:00<\/b> 之前还空着/);
  assert.match(loomOmen(rows,700).html,/余下的都走完了/);
  assert.equal(loomOmen(rows,700).quiet,true);
});

test('经纬提醒行按类型分段，时间批注用真实字段且缺字段不丢行', () => {
  const at=new Date(2026,10,8,8,30).getTime();
  const rows=[
    {id:'t1',title:'带钥匙',mode:'timed',at},
    {id:'t2',title:'喝水',mode:'timed',at,daily:true},
    {id:'t3',title:'已过的提醒',mode:'timed',at,delivered:true},
    {id:'s1',title:'交周报',mode:'silent',date:'2026-11-08'},
    {id:'a1',title:'别信陌生来电',mode:'attention'},
    {id:'x1',title:'未知类型'},
    {id:'d1',title:'取快递',mode:'silent',date:'2026-11-08',archived:true}
  ];
  const before=JSON.stringify(rows),groups=loomReminderRows(rows);
  assert.deepEqual(groups.map(group=>group.title),['定时提醒','今天的静默提示','长期注意','已处理'],'空段不占位，非空段按固定顺序');
  assert.equal(JSON.stringify(rows),before,'纯函数，不改写服务返回的记录');
  const timed=groups[0].items;
  assert.deepEqual(timed.map(item=>item.id),['t1','t2','t3','x1'],'未知 mode 归入定时段，不因字段缺失而消失');
  assert.equal(timed[0].title,'带钥匙');assert.match(timed[0].margin[0],/11\/08 08:30/);
  assert.equal(timed[1].margin[0],'每天 08:30');assert.equal(timed[2].margin[0],'已提醒');
  assert.equal(timed[3].kind,'定时提醒','缺 mode 时按定时提醒表述');
  assert.deepEqual(groups[1].items[0].margin,['2026-11-08'],'静默提示显示日期，不编造钟点');
  assert.deepEqual(groups[2].items[0].margin,['持续显示']);
  assert.equal(groups[3].items[0].margin[0],'已处理','已处理优先于类型批注');
  assert.equal(groups[3].items[0].done,true);
});

test('经纬提醒行的动作只暴露服务真有的能力，标题按纯文本渲染', () => {
  const groups=loomReminderRows([
    {id:'t1',title:'<img src=x onerror=alert(1)>',mode:'timed',at:new Date(2026,10,8,8,30).getTime()},
    {id:'s1',title:'交周报',mode:'silent',date:'2026-11-08'},
    {id:'a1',title:'别信陌生来电',mode:'attention'},
    {id:'d1',title:'取快递',mode:'silent',date:'2026-11-08',archived:true}
  ]);
  const html=thread(groups);
  assert.doesNotMatch(html,/<img/,'标题经 thread 转义，本机记录里的标记不会变成节点');
  const labels=items=>items.flatMap(item=>item.actions).map(button=>/>([^<]*)<\/button>$/.exec(button)[1]);
  assert.deepEqual(labels(groups[0].items),['编辑 / 改期','取消'],'定时提醒支持编辑与取消，是否触发由任务计划决定');
  assert.deepEqual(labels(groups[1].items),['编辑 / 改期','已处理','移除']);
  assert.deepEqual(labels(groups[2].items),['编辑 / 改期','已处理','移除']);
  assert.deepEqual(labels(groups[3].items),['恢复','移除'],'已归档的静默提示给恢复，不再给一个无效的“已处理”');
  assert.match(html,/data-loom-reminder-state="s1"/);
  assert.match(html,/data-loom-reminder-cancel="t1"/,'集合身份留在行上，点击才回传服务');
});

// ── 涟漪 / 舆图 / 夜场的今天摆位：同一批记录，不同版式，属性契约不变 ──────
const layoutRow = (over = {}) => {
  const row = {
    id: 'r1', ref: { collection: 'task', id: 'r1' }, kind: '事项', at: 600, time: '10:00',
    title: '写周报', goal: '', criteria: '', note: '', where: '', object: '', stages: '',
    slotCount: 0, source: null, dates: [], ...over
  };
  return { ...row, ref: { ...row.ref, id: row.id } };
};
const layoutCtx = (rows, now = 600) => ({
  date: '2026-11-07', time: '10:00', now, start: 360, end: 1440, rows,
  model: { errors: {}, otherItems: [] }, omen: { html: '现在 <b>10:00</b>', quiet: false }, alerts: ''
});

test('舆图路线按走过/前后/再往前/未定时分带，条目保留原行号与集合身份', () => {
  const rows = [layoutRow({ id: 'a', at: 540 }), layoutRow({ id: 'b', at: 620, ref: { collection: 'plan', id: 'b' } }), layoutRow({ id: 'c', at: 1200 }), layoutRow({ id: 'd', at: null, time: '未定时' })];
  const html = atlasToday(layoutCtx(rows));
  assert.deepEqual([...html.matchAll(/<h2 class="loom-band-title">([^<]+)<b>(\d+)<\/b>/g)].map(m => `${m[1]}${m[2]}`), ['已经走过1', '此刻前后1', '再往前1', '还没上路1']);
  assert.deepEqual([...html.matchAll(/data-id="([a-z]+)" data-collection="([a-z]+)" data-row="(\d+)"/g)].map(m => m[3] + m[1] + m[2]), ['0atask', '1bplan', '2ctask', '3dtask']);
  assert.match(html, /data-collection="plan"/);
});

test('舆图的图廓报出下一处里程碑与三个数，比例尺只说明读法', () => {
  const rows = [layoutRow({ id: 'a', at: 540, title: '走过的' }), layoutRow({ id: 'b', at: 660, title: '下一处' }), layoutRow({ id: 'c', at: null, time: '未定时' })];
  const html = atlasToday(layoutCtx(rows, 600));
  assert.match(html, /^<header class="loom-atlas-cartouche">/, '舆图的今天以图廓开头');
  assert.match(html, /今天的<em>路线<\/em>/);
  assert.match(html, /下一处里程碑是「下一处」/);
  assert.match(html, /<span>未走完 <b>2<\/b><\/span>/, '未走完含还没上路的那件');
  assert.match(html, /<span>全长 <b>3<\/b> 处<\/span>/);
  assert.match(html, /<span>当前 <b>10:00<\/b><\/span>/);
  assert.match(html, /data-loom-scale>比例尺<\/button>/);
  assert.match(atlasToday(layoutCtx([layoutRow({ id: 'a', at: 300 })], 600)), /今天余下的路都走过了/, '走完了就照实说');
  assert.equal(atlasToday(layoutCtx([layoutRow({ id: 'a', at: 660, title: '<script>坏' })], 600)).includes('<script>'), false);
});

test('舆图的地块补出完成标准脚注，并把今天的路线摘要接在下面', () => {
  const groups = [{ title: '对象', items: [
    { id: 'o1', title: '毕业设计', kind: '项目', lines: ['把论文写完', '查重通过'], margin: ['3 件事', '2 则笔记'] },
    { id: 'o2', title: '社团', kind: '对象', lines: [], margin: [] }
  ] }];
  const slips = [layoutRow({ id: 'a', at: 540 }), layoutRow({ id: 'b', at: 660 }), layoutRow({ id: 'c', at: 700 }), layoutRow({ id: 'd', at: 800 }), layoutRow({ id: 'e', at: 900 })];
  const html = atlasFields(groups, { head: '<header class="loom-atlas-cartouche">疆域</header>', todayRows: slips, date: '2026-11-07' });
  assert.match(html, /^<header class="loom-atlas-cartouche">/, '图廓排在地块之前');
  assert.match(html, /<span class="loom-atlas-annot">完成标准：查重通过<\/span>/);
  assert.match(html, /<span class="loom-atlas-annot">还没有写完成标准<\/span>/);
  assert.match(html, /从这些地里穿出来的路<b>4<\/b>/, '路线摘要只接前四处');
  assert.deepEqual([...html.matchAll(/data-id="([a-z])" data-collection="task" data-row="(\d)"/g)].map(m => m[1] + m[2]), ['a0', 'b1', 'c2', 'd3'], '摘要里的行号仍是今天那批记录的原序号');
  assert.equal(html.includes('data-row="4"'), false, '第五处不重复接进摘要');
  assert.match(atlasFields([], { todayRows: slips, date: '2026-11-07' }), /loom-empty/);
});

test('涟漪按离此刻的远近落水，未定时的排在远处且不改写记录', () => {
  const rows = [layoutRow({ id: 'a', at: 500 }), layoutRow({ id: 'b', at: 630 }), layoutRow({ id: 'c', at: 900 }), layoutRow({ id: 'd', at: 1400 }), layoutRow({ id: 'e', at: null })];
  const html = rippleToday(layoutCtx(rows));
  assert.deepEqual([...html.matchAll(/class="loom-ripple-row (is-[a-z]+)"/g)].map(m => m[1]), ['is-past', 'is-near', 'is-mid', 'is-far', 'is-far']);
  assert.match(html, /<span class="loom-ripple-time">未定时<\/span>/);
});

test('涟漪的今天分三段流水，空态留一圈波纹，说明只用真实计数', () => {
  const rows = [layoutRow({ id: 'a', at: 500 }), layoutRow({ id: 'b', at: 630 }), layoutRow({ id: 'c', at: 900 }), layoutRow({ id: 'd', at: null, time: '未定时' })];
  const html = rippleToday(layoutCtx(rows, 600));
  assert.deepEqual([...html.matchAll(/class="loom-rp-title">([^<]+)<b>(\d+)<\/b>/g)].map(m => `${m[1]}${m[2]}`), ['已经流过去1', '此刻附近1', '稍晚1', '还没落形1']);
  assert.deepEqual([...html.matchAll(/data-id="([a-z])" data-collection="task" data-row="(\d)"/g)].map(m => m[1] + m[2]), ['a0', 'b1', 'c2', 'd3'], '分段不改今天那批记录的原行号');
  assert.match(html, /<p class="loom-rp-note">今天落到水面 4 条/, '尺度说明报真实条数');
  assert.equal(html.includes('3 个截止'), false, '不照抄小样里写死的数');
  const empty = rippleToday(layoutCtx([], 600));
  assert.match(empty, /class="loom-empty loom-rp-empty"><svg/, '空态仍有波纹');
  assert.equal(empty.includes('loom-ripple-row'), false);
});

test('夜场主角取此刻后第一件，没有未来的就用今天最后一件，候场不再重复主角', () => {
  const upcoming = [layoutRow({ id: 'a', at: 500 }), layoutRow({ id: 'b', at: 700 }), layoutRow({ id: 'c', at: 900 })];
  const first = stageToday(layoutCtx(upcoming));
  assert.match(first, /class="loom-stage-lead[^"]*" data-id="b"/);
  assert.equal((first.match(/data-id="b"/g) || []).length, 1, '主角不能同时出现在候场');
  const last = stageToday(layoutCtx([layoutRow({ id: 'a', at: 400 }), layoutRow({ id: 'b', at: 500 })]));
  assert.match(last, /loom-stage-lead[^"]*" data-id="b"/);
  assert.match(last, /候场<b>1<\/b>/);
});

test('夜场换幕：候场挑过的主角压过此刻判断，候场钮换成换幕而不是打开记录', () => {
  const rows = [layoutRow({ id: 'a', at: 500, title: '收作业' }), layoutRow({ id: 'b', at: 700, title: '写周报' }), layoutRow({ id: 'c', at: 900, title: '交材料' })];
  assert.equal(stageLead(rows, 'c', 600).id, 'c', '点过的候场必须仍是主角');
  assert.equal(stageLead(rows, '', 600).id, 'b', '没点过时仍按此刻后第一件');
  assert.equal(stageLead(rows, 'gone', 600).id, 'b', '主角被删掉要回到自动判断');
  const html = stageToday(layoutCtx(rows, 600));
  assert.deepEqual([...html.matchAll(/data-loom-stage-cue="([a-z0-9]+)"/g)].map(m => m[1]), ['a', 'c'], '候场里每一行都要能换幕');
  for (const title of ['收作业', '交材料']) assert.equal(html.includes(`data-loom-paper-action="open">${title}`), false, `${title} 还在候场里当打开入口`);
  assert.match(html, /data-loom-paper-action="open">写周报/, '台上的主角仍可打开原记录');
});

test('夜场的幕线只在 06:00–24:00 之间取位置，刻度与此刻点分开', () => {
  assert.equal(stagePitRatio(6 * 60), 0);
  assert.equal(stagePitRatio(15 * 60), 0.5);
  assert.equal(stagePitRatio(24 * 60), 1);
  assert.equal(stagePitRatio(3 * 60), 0, '凌晨不给出负位置');
  assert.equal(stagePitRatio(30 * 60), 1, '过了午夜不给出越界位置');
  const html = stageToday(layoutCtx([layoutRow({ at: 600 })], 720));
  const track = html.match(/<div class="loom-pit-track"[\s\S]*?<\/div>/)[0];
  assert.deepEqual([...track.matchAll(/class="loom-pit-time" style="left:[\d.]+%">([\d:]+)<\/span>/g)].map(m => m[1]), ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00']);
  assert.match(track, /class="loom-pit-now" style="left:33\.3333+%"/, '此刻要点落在 12:00 那一格');
  assert.equal(track.includes('data-loom'), false, '幕线只作示读，不接事件');
});

test('夜场的场次按 ISO 周号数，台上动作只挂真实存在的公共入口', () => {
  assert.equal(stageWeekAct('2026-01-01'), 1);
  assert.equal(stageWeekAct('2026-11-07'), 45);
  assert.equal(stageWeekAct('2021-01-01'), 53);
  assert.equal(stageWeekAct('不是日期'), 1);
  const plain = stageToday(layoutCtx([layoutRow({ id: 'b', at: 700 })], 600));
  assert.match(plain, /第 45 场/, '页头要报本场是第几场');
  assert.match(plain, /data-loom-new="note">记一笔/);
  assert.equal(plain.includes('data-loom-stage-object'), false, '没有归属对象时不给看对象');
  const owned = stageToday(layoutCtx([layoutRow({ id: 'b', at: 700, objectId: 'object_1' })], 600));
  assert.match(owned, /data-loom-stage-object="object_1">看对象/);
  assert.match(owned, /data-loom-stage-light aria-pressed="false">冷光/);
  assert.match(stageToday({ ...layoutCtx([], 600), light: true }), /data-loom-stage-light aria-pressed="true">暖光/);
});

test('三套布局都只在“一次做完的事项”上给完成钮，课程与多日事项不给', () => {
  const rows = [layoutRow({ id: 'c', kind: '课程', dates: ['2026-11-07'] }), layoutRow({ id: 'm', dates: ['2026-11-07', '2026-11-08'] }), layoutRow({ id: 's', dates: ['2026-11-07'] })];
  for (const build of [atlasToday, rippleToday, stageToday]) {
    const html = build(layoutCtx(rows));
    assert.deepEqual([...html.matchAll(/data-today-item-complete="([a-z0-9]+)"/g)].map(m => m[1]), ['s'], build.name + ' 的完成钮越权了');
    assert.equal(html.includes('<img'), false, build.name + ' 不应出现位图');
  }
});

test('标题与批注按纯文本渲染，读取失败的告警仍会出现在每套布局里', () => {
  const ctx = layoutCtx([layoutRow({ title: '<b>加粗</b>与<img>', note: '安全 <script>' })]);
  ctx.alerts = '<p role="alert">课表读取失败</p>';
  for (const build of [atlasToday, rippleToday, stageToday]) {
    const html = build(ctx);
    assert.match(html, /&lt;b&gt;加粗&lt;\/b&gt;与&lt;img&gt;/, build.name + ' 未转义标题');
    assert.equal(html.includes('<script'), false, build.name + ' 泄漏了可执行片段');
    assert.match(html, /课表读取失败/);
  }
  assert.match(atlasFields([{ title: '对象', items: [{ id: 'o1', kind: '项目', title: '<i>甲</i>', lines: ['目的'], margin: ['3 件事'] }] }]), /&lt;i&gt;甲&lt;\/i&gt;/);
});

// ── 涟漪与舆图的页面级摆位：分组契约与入口判定和经纬完全同一套 ──────────
test('涟漪的本周铺成七条水道，课程格仍走课程入口，空着的日子不消失', () => {
  const entries = [{ id: 'c1', title: '高等数学', weekday: 2, location: 'A302', teacher: '周老师', containerId: 't1' }];
  const { columns, weekday } = loomCourseRows(entries, { id: 't1', name: '2026 秋' }, '2026-11-07');
  const html = rippleCourses({ columns, weekday, date: '2026-11-07', table: { name: '2026 秋' }, total: 1 });
  assert.equal((html.match(/class="loom-rp-col/g) || []).length, 7, '七条水道一条不少');
  assert.match(html, /data-loom-open-course="c1" data-loom-course-table="t1"/, '课程格仍按课表身份打开');
  assert.match(html, /loom-rp-col is-today/, '今天的列点亮');
  assert.equal((html.match(/空着/g) || []).length, 6, '没有课的日子留白但仍占位');
});

test('涟漪的分组行沿用同一入口判定，类型与批注进尾标，完成态只改样式', () => {
  const groups = [{ title: '有明确时段', items: [
    { id: 'i1', kind: '事项', title: '写周报', lines: ['目标：交出去'], margin: ['10:00', '2 段'], action: true, collection: 'task' },
    { id: 'i2', kind: '事件', title: '<b>答辩</b>', margin: [], action: true, collection: 'exam', done: true }
  ] }];
  const html = rippleGroups(groups, { empty: '还没有事项。' });
  assert.match(html, /data-loom-row-open="i1" data-loom-open-collection="task"/);
  assert.match(html, /data-loom-row-open="i2" data-loom-open-collection="exam"/, '集合身份不被版式改写');
  assert.match(html, /class="loom-rp-row is-done"/);
  assert.match(html, /<span class="loom-rp-tag">事项<small>10:00 · 2 段<\/small>/);
  assert.match(html, /&lt;b&gt;答辩&lt;\/b&gt;/, '标题按纯文本渲染');
  assert.equal(rippleGroups([{ title: '空', items: [] }], { empty: '还没有事项。' }).includes('还没有事项。'), true);
});

test('舆图的界标把每件事立在界桩线上，去处仍由公共判定决定', () => {
  const html = atlasMarks([{ title: '只有截止', items: [
    { id: 'x', kind: '考试', title: '期中', lines: ['6 月 3 日'], margin: ['截止 今天'], action: true, collection: 'exam' },
    { id: 'y', title: '回课表', course: { id: 'c9', table: 't9' } },
    { id: 'z', title: '去采集', goto: 'web-capture' }
  ] }], { empty: '还没有事项。' });
  assert.match(html, /data-loom-row-open="x" data-loom-open-collection="exam"/);
  assert.match(html, /data-loom-open-course="c9" data-loom-course-table="t9"/);
  assert.match(html, /data-loom-goto="web-capture"/);
  assert.match(html, /<span class="loom-mark-side">截止 今天<\/span>/);
  assert.equal(atlasMarks([], { empty: '还没有事项。' }).includes('还没有事项。'), true);
});

test('八色毛线：同一块地总是同一支，课程固定用靛，事项跟随归属', () => {
  // 同一 id 反复打开必须同色；对象不占课程的靛，避免和课次混淆。
  assert.equal(loomThread('object-1'), loomThread('object-1'));
  assert.equal(loomThread('object-1'), '--t-madder');
  assert.equal(loomThread('object-2'), '--t-turmeric');
  assert.equal(loomThread('object-3'), '--t-moss');
  assert.match(loomThread('object-1'), /^--t-(madder|turmeric|moss|wisteria|clay|celadon|slate)$/);
  // 没有归属按类型取色；有归属就跟那块地同色。
  assert.equal(itemThread('task', ''), '--t-madder');
  assert.equal(itemThread('exam', ''), '--t-clay');
  assert.equal(itemThread('task', 'object-2'), '--t-turmeric');
  const groups = loomItemRows([{ id: 'i', kind: 'plan', title: '写报告', objectId: 'object-2', anchor: { type: 'floating' } }], '2026-11-02');
  assert.equal(groups[2].items[0].thread, '--t-turmeric');
  assert.equal(loomObjectRows([{ id: 'object-3', title: '课程项目', type: 'project' }], {})[0].items[0].thread, '--t-moss');
  assert.equal(loomCourseRows([{ id: 'c1', weekday: 1, title: '高数', containerId: 't' }], {}, '2026-11-02').columns[0].items[0].thread, '--t-indigo');
});

test('关掉或挂起的页给出页体说明与去处，不再只闪一行字', () => {
  const closed = blockedPage({ name: '笔记', status: '已关闭' });
  assert.match(closed, /笔记/);
  assert.match(closed, /关闭/);
  assert.match(closed, /记录仍保存在本机/);
  assert.match(closed, /data-loom-goto="plugins"/);
  assert.match(blockedPage({ name: '群消息', status: '挂起' }), /挂起/);
  assert.match(blockedPage({ name: '网页采集', status: '暂不可用' }), /还没有接入/);
});
