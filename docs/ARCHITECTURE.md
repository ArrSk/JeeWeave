# 几微（jiwei）架构设计

> 本文包含长期架构规划和历史选型，表格里的方案不全是当前实现。现用技术边界以 [Desktop README](../desktop/README.md)、[Web README](../web/README.md) 和实际代码为准，实测范围见 [HANDOVER](HANDOVER.md)。桌面当前为 Electron + HTML/CSS/JS，使用独立 localStorage，尚未统一接入 Web 的 React/Dexie 仓储。

## 2026-10-17 Windows 文件夹版存储补充

打包态由 `desktop/storage-paths.cjs` 在 ready 与单实例锁之前设置路径：exe 同级 `data/profile` 同时为 userData/sessionData（包含持久 localStorage 和登录会话），磁盘缓存另设 `data/cache`，采集和日志分别在 `data/captures`、`data/logs`。开发态沿用已有路径。不可写时给出搬到可写位置的提示并退出，不静默回退 AppData。运行资源仍按 Electron 目录布局，业务源文件进入 app.asar；不封装开发依赖、测试或个人资料。当前没有从开发 profile 自动迁移到成品的流程。

首次交付后复现根 release 目录中的原生启动失败，同字节副本在桌面目录正常。当前成品输出统一在 `desktop/release`；封装脚本必须在最终目录连续两次无调试参数普通启动并验证窗口和退出，未通过不能交付。测试副本的功能回归保留，但不代替最终目录启动验收。

> 定位：**面向大学生的课程表应用**。首版只有课程表，但架构按"多模块长期演进"设计。
> 模型与长期设计参考本文；决策理由见 [`DECISIONS.md`](DECISIONS.md)，闹钟专题见 [ALARM-STUDY.md](research/ALARM-STUDY.md)。

---

## 1. 产品与技术原则

这五条决定了后面所有选型，冲突时以它们为准：

| # | 原则 | 含义 | 反面案例（我们不这么做） |
| --- | --- | --- | --- |
| P1 | **模块化外壳** | 每个功能是一个自注册模块；外壳只管导航/主题/数据/能力 | 把课表写进 `App.tsx` 里，加功能时到处改 |
| P2 | **本地优先** | 数据先落本地库，离线完整可用；服务器是"增强"不是"前提" | 没网就白屏 |
| P3 | **数据模型面向"时间"而非"课"** | 课表是视图，不是模型 | 以后加日程时再造一张并行表 |
| P4 | **能力走适配层** | 通知/闹钟/文件/震动一律经 `platform`，不做平台假设 | 直接 `new Notification()`，将来原生端失效 |
| P5 | **同一份代码多端** | 一个 React 应用同时产出 PWA 与原生包 | 为手机另写一套 RN |

---

## 2. 技术栈

### 2.1 客户端（唯一重点）

| 用途 | 选型 | 说明 |
| --- | --- | --- |
| 仓库 / 语言 | **pnpm workspace + TypeScript 5** | 单仓多包，前后端与多端共享类型 |
| 框架 | **React 19 + Vite 7** | 生态最大；Vite 构建快、产物纯静态（利于 Capacitor 打包） |
| 样式 | **Tailwind CSS v4** + CSS 变量主题 | 深色模式、多主题成本低 |
| 组件 | **Radix UI / shadcn**（按需复制进仓库） | 无样式基座，无障碍开箱即用 |
| 异步/缓存 | **TanStack Query** | 查询缓存、乐观更新、离线重试 |
| 本地 UI 状态 | **Zustand** | 只放"当前周 / 选中日 / 主题"，不放业务数据 |
| 路由 | React Router v7 | 模块注册时挂载路由 |
| 表单校验 | react-hook-form + **Zod** | Zod schema 与 `@jiwei/core` 共用一份 |
| 日期时间 | **date-fns v4 + date-fns-tz** | 所有计算锁 `Asia/Shanghai`；纯函数、可测 |
| 手势 | @use-gesture/react | 手机左右滑切周、长按拖拽调课 |

### 2.2 数据层

| 用途 | 选型 | 说明 |
| --- | --- | --- |
| 存储引擎（**首版**） | **IndexedDB，经 Dexie 封装** | 实现成本低，先把手表功能做出来（ADR-003） |
| 访问方式 | **仓储接口**（`SemesterRepo`/`BlockRepo`/`OccurrenceRepo`/`AlertRepo`/`NoteRepo`） | 业务代码只依赖接口，**禁止直接 import Dexie**（ADR-007） |
| 领域模型 | `@jiwei/core` 的 Zod schema | 与存储引擎完全解耦，换引擎不动模型 |
| 内容存储 | 笔记原文存 IndexedDB Blob，另支持导出 Markdown 文件夹 | 可被 Obsidian/git 管理 |
| 全文搜索（M7） | 内存倒排索引 + 分词（数据量小够用） | 迁移 SQLite 后换成 FTS5 |
| 迁移路径 | `shared/packages/data/src/engines/{dexie → sqlite}` | 换引擎 = 换 `createRepos(engine)` 的入参，上层零改动 |

> **为什么首版不直接上 SQLite**：WASM 加载、OPFS 兼容、Worker 异步边界三类成本会拖慢首个可用版本。
> 课表数据量极小（一学期几百条），IndexedDB 的复合索引足够。
> **风险已用接口隔离**：迁移时改动被限制在 `shared/packages/data/src/engines/` 内，`features/*` 一行不改。
> **触发迁移的条件**：① 跨模块复杂查询变难写 ② 笔记搜索要求变高 ③ 数据量/查询复杂度让手写索引吃力 ④ 决定接服务端同步。

### 2.3 提醒 / 闹钟 / 原生

| 用途 | 选型 |
| --- | --- |
| 应用内提醒 | Web Notifications + Web Audio（页面开着时精确） |
| 后台推送 | Web Push（`web-push` + VAPID），**需要服务器，且 iOS 不可靠** → 定位为增强 |
| 系统日历 | iCal 订阅导出（`ical-generator`），锁屏小组件/手表可用 |
| **原生闹钟** | **Capacitor + @capacitor/local-notifications**（系统级调度） |
| 原生其他能力 | @capacitor/filesystem / share / app / haptics / badge |

### 2.4 服务端（**后期可选，M1~M4 不跑**）

| 用途 | 选型 |
| --- | --- |
| 框架 / 运行时 | Hono + Node 20+ |
| 数据库 | Drizzle + SQLite(WAL) → 可换 Postgres；**服务端是独立实现，不复用浏览器端 Dexie 引擎** |
| 用途 | 仅两件事：① 多设备同步（后期） ② Web Push 推送服务 |
| 认证 | 真需要时再引入 better-auth；**本地优先意味着没有它也完整可用** |

> 注意：由于首版选了 IndexedDB（ADR-003），"浏览器与服务端共用同一份 ORM schema"这一收益**暂不成立**；
> 将来接同步时，`@jiwei/data` 需要新增一个"远程仓储实现"，但**仓储接口不变**，上层零改动。

### 2.5 工程

ESLint + Prettier + `tsc --noEmit` + Vitest（纯函数/数据层）+ Playwright（端到端，含手机视口）+ Lefthook pre-commit。

---

## 3. 平台能力矩阵（决定了功能怎么实现）

| 能力 | Web (PC) | PWA | Native (Capacitor) |
| --- | --- | --- | --- |
| 课表 / 日程 / 任务 / 笔记 | ✅ | ✅ | ✅ |
| 离线读写 | ✅ | ✅ | ✅ |
| 应用内提醒 | ✅ | ✅ | ✅ |
| 系统日历订阅 (iCal) | ✅ | ✅ | ✅ |
| 后台推送 | — | ⚠️ Android ✅ / iOS 受限 | ✅ |
| **锁屏闹钟（必响）** | ❌ | ❌ | ✅ |
| 震动 / 角标 / 后台任务 | ❌ | ❌ | ✅ |

**因此**：`shared/packages/platform` 暴露 `capabilities = { canAlarm, canBackgroundPush, canVibrate, canBadge, canFilesystem }`，
并通过 `app` 适配器提供在线状态和 PWA 安装入口。UI 依据能力**降级展示**（Web 上"闹钟"按钮 → "提醒 + 加入系统日历"）。详细论证见 [ALARM-STUDY.md](research/ALARM-STUDY.md)。

---

## 4. 数据模型（核心）

### 4.1 设计思路

```
用户视角                       数据模型
─────────────                 ────────────────────────────
"这学期我是第 3 周"      →     Semester（学期 + 起始日 + 总周数）
"第 3 节是 10:00"        →     Period（作息时间表）
"周三 3-4 节有高数"      →     Block（时间块，kind='course'）
"10 月 8 日那次课"       →     Occurrence（展开后的具体一次，稳定 ID）
"提前 20 分钟叫我"       →     Alert（闹钟/提醒，挂 occurrence/block/note）
"这门课我想记点东西"      →     Note（挂 occurrence/block/semester/独立）
```

**核心取舍**：`Block` 是唯一"占时间"的实体，课表/日程/任务只是它的不同 `kind` 视图；
`Occurrence` 是展开出的具体一次，拥有**确定性 ID**，是所有"锚定到某一次"的东西（闹钟、提醒、笔记）的挂载点。

### 4.2 Schema（`shared/packages/core/src/schema.ts`，Zod）

```ts
// ── 语境 ───────────────────────────────────────────────────────
Semester { id, name, startDate:'YYYY-MM-DD', totalWeeks, timezone:'Asia/Shanghai' }
Period   { id, semesterId, index, start:'HH:mm', end:'HH:mm' }   // 作息表：第1节 08:00-08:45

// ── 唯一占时间的实体 ────────────────────────────────────────────
Block {
  id, kind: 'course'|'event'|'task'|'exam', title, color, note?,
  anchor:                                        // 判别联合：时间语义
    | { type:'curriculum', semesterId, weekday:1..7, periods:[start,end], weeks:number[] }
    | { type:'absolute',   start:ISO, end:ISO }
    | { type:'allDay',     date:'YYYY-MM-DD' },
  repeat: { mode:'once' }
        | { mode:'weekly', interval:1|2, until:ISO }
        | { mode:'curriculum', semesterId, weeks:number[] },
  detail?: { teacher?, location?, credits?, courseCode? },   // course/exam 专有
  done?: boolean,                                            // task 专有
  priority?: 'low'|'normal'|'high',                          // 事项重要程度；旧数据缺省为 normal
  createdAt, updatedAt
}

Occurrence {                                     // 展开后的"具体一次"
  id,                                            // ★ 确定性：`${blockId}#${date}#${periods[0]}`
  blockId, semesterId?, date:'YYYY-MM-DD',
  start:ISO, end:ISO,
  status: 'normal'|'cancelled'|'moved',
  movedFrom?: 'YYYY-MM-DD',                      // 由「调课」挪过来的那一次，记原日期
  override?: { start?, end?, location?, title? }  // 单次调整
}

Adjustment { id, semesterId, date, action:'cancel'|'move'|'add', blockId, newDate?, newPeriod? }
```

**`status` 的语义（M1 明确下来，曾被实现错）**

| status | 含义 | 界面表现 |
| --- | --- | --- |
| `normal` | 正常上课。**也包括「补课」和「调课调进来」的那一次** | 正常色块；带 `movedFrom` 时额外标「调课 · 原定 X」 |
| `cancelled` | 这一次停课，原时间不再上课 | 置灰 + 划线，标「停课」 |
| `moved` | 这一次被**调走**了：原时间不再上课 | 置灰 + 划线，标「已调走」 |

两点必须记住，否则会重犯早期那个 bug（同一次课在原时间与新时间各显示一遍）：

1. **`moved` 打在"原时间"那一条上**，不是打在新时间上 —— 它回答的是"这里已经没课了"。
2. **`Adjustment.id` 是确定性的**（`adj_<blockId>#<date>`）：同一门课的同一天只可能有一条调整记录，
   先停课后改调课是**覆盖**而不是新增，不会留下两条互相矛盾的记录。

判断"这一次课到底上不上"一律用 `isOccurrenceActive()`，不要自己写 `status !== 'cancelled'` ——
被调走的那一次同样不算，"下一节""今天几节课""冲突检测"都要排除它。

```ts

// ── 附件型资源（与 kind 无关，可挂任意锚点）─────────────────────
Alert {                                          // 闹钟 + 提醒 统一建模
  id,
  ownerType: 'occurrence'|'block'|'semester'|'note',
  ownerId,
  leadMinutes: number,                           // 提前量，0 = 准点
  mode: 'notify' | 'alarm',                      // 提醒 or 闹钟（闹钟需原生能力）
  channels: ('inapp'|'webpush'|'ical'|'local')[],
  repeat: 'once'|'weekly'|'always',
  enabled
}
AlertQueue { id, alertId, occurrenceId, fireAt, sentAt, dedupeKey }   // 去重 + 幂等

Note {
  id, ownerType:'occurrence'|'block'|'semester'|'standalone', ownerId,
  title, bodyPath,                               // 原文落文件 data/notes/<id>.md
  tags:string[], createdAt, updatedAt
}

// ── 其他 ───────────────────────────────────────────────────────
CalendarFeed { token, semesterId, createdAt }    // iCal 订阅令牌
Meta { key, value }                              // schemaVersion、storageEngine、设备 ID、偏好
```

### 4.3 关键约束

1. **`anchor` 是判别联合，不是万能结构**：`curriculum` 的时刻由 `Period` 派生，`absolute` 自带真实时刻，语义不混。
2. **`Occurrence` 落库 + 确定性 ID**：闹钟要扫"未来 instances"，笔记要绑"某一次课"；ID 稳定 ⇒ 重建后附件不丢。
3. **`weeks` 用显式数组**：真实课表会是"3-15 周但跳过第 8 周"，数组最不易错，导出 iCal 时再压缩成规则。
4. **重建是幂等的**：学期/作息/课程/Adjustment 任一变更 → 重算整学期 Occurrence（毫秒级，几百行）。
5. **`Alert` 统一闹钟与提醒**：两者只差 `mode` 与可用通道，避免两套调度逻辑。

### 4.4 时间真相唯一

> `@jiwei/core` 里的 `materialize()` 是**唯一**允许把"模板"变成"具体时刻"的地方。
> 前端预览、落库、iCal 导出、闹钟排程、提醒调度**全部调用它**，任何地方都不得自己算日期。

纯函数清单（全部带单测）：`expandWeeks()` · `materialize()` · `currentWeek()` · `nextOccurrence()` ·
`detectConflicts()` · `toICS()` · `parseWakeUp()` / `parseCSV()`。

---

## 5. 模块系统（"以后加很多功能"的落地机制）

### 5.1 模块契约

```ts
// shared/packages/ui/src/module.ts
export interface FeatureModule {
  id: string                     // 'timetable'
  title: string                  // '课程表'
  icon: ComponentType
  order: number
  routes?: RouteObject[]         // 独立页面（/timetable）
  widgets?: WidgetDef[]          // 可放到首页的卡片
  setup?(ctx: AppContext): void  // 注册查询、迁移、后台任务
}
```

- 每个模块在 `web/src/features/<name>/index.tsx` 导出一个 `FeatureModule`；
- `web/src/modules.ts` **静态导入**全部模块（保持类型安全与 tree-shaking，不用动态扫描）；
- 外壳据此生成**底部导航 / 侧边栏**，并渲染首页的 widget 网格；
- M4 起由外壳读取本地模块偏好，允许用户隐藏/启用官方模块；隐藏只影响入口和 widget，不删除模块数据；
- **feature 之间禁止互相 import**：跨模块协作一律走 `@jiwei/core` 类型与 `@jiwei/data` 仓储。

### 5.2 为什么首版就要有它

首版只有课表一个模块，模块系统看似"多余"。但它的成本是**一个 20 行的注册表 + 一个外壳组件**，
收益是：加日程表 = 加一个目录 + 加一行注册，**不用碰课表代码**。这正是用户"以后会加很多功能"的直接回答。

### 5.3 首页 = 模块化仪表盘

首页由 widget 拼装（课表模块提供"今天/下一节课"，日程模块提供"今日日程"，任务模块提供"待交作业"…）。
课表阶段首页只有课表模块的一个 widget；后续模块把自己的 widget 插进来，**首页不需要重写**。

---

## 6. 分层与目录

```
jiwei/
├─ desktop/                         # ★ 当前桌面主线（Electron）
│  ├─ main.cjs                      # 窗口、教务页面和受限 IPC
│  ├─ prototype.html                # 桌面工作台和课程抓取页
│  └─ prototype-modules.js          # 桌面课程解析与本地课表
├─ web/                             # 独立网页/PWA 客户端（React）
│  └─ src/
│     ├─ shell/                     # 外壳：导航、主题、模块注册
│     ├─ features/
│     │  └─ timetable/              # 课程表模块
│     ├─ modules.ts                 # 模块注册表
│     └─ main.tsx
├─ shared/packages/
│  ├─ core/                         # ★ Zod 模型 + materialize + 纯函数（唯一时间真相）
│  ├─ data/                         # ★ 仓储接口 + Dexie 引擎实现（可替换）+ 迁移
│  ├─ ui/                           # ★ 通用组件 + 通用时间网格 + FeatureModule 契约
│  └─ platform/                     # ★ capabilities + notifications/alarm/fs 适配器
├─ docs/
├─ pnpm-workspace.yaml
└─ README.md
```

**依赖方向（严格单向，禁止反向/循环）**

```
features  ──►  shell / ui / data / platform / core
shell     ──►  ui / data / platform / core
data      ──►  core
platform  ──►  core
core      ──►  （无依赖：不碰 DOM、不碰 Node、不碰 Capacitor）
```

> `core` 必须能在 Node、浏览器、原生容器里**无差别运行**，这是多端共享的前提。

---

## 7. 关键路径

### 7.1 课表渲染（M0 起）
- 数据源：`Block(kind='course', anchor.type='curriculum')` 展开出的 `Occurrence`。
- 网格：`grid-template-columns: 56px repeat(7,1fr)`，行 = 节次；课程块 `grid-column: weekday+1`、`grid-row: periodStart / periodEnd+1`，天然支持连堂跨节。
- **网格是通用组件**（`@jiwei/ui` 的 `TimeGrid`）：传"列=星期、行=节次、块=occurrence"，课表与日程共用，只是筛选条件不同。
- 移动端默认**日视图 + 周条**（可左右滑切周），PC 端默认周视图；同一组件按断点切布局。日视图排在 M1，M0 先出周视图。
- 性能：一学期几百条 occurrence，无需虚拟滚动。

### 7.2 存储与初始化
```
main.tsx
  └─ 初始化 platform.capabilities
  └─ createRepos(createDexieEngine())        # 打开 IndexedDB，跑 schema 版本迁移（幂等）
  └─ 载入模块注册表 → 渲染外壳 + 首页 widgets
```

> 将来换 SQLite：`createRepos(createSqliteEngine())` —— 上层代码一行不改（ADR-007）。

### 7.3 导入导出（M3）
- 导入：`parsers/{wakeup,shiguang,csv,json}.ts` 只输出**标准 `Block[]`**；导入向导负责预览与冲突提示。
- 导出：iCal（`CalendarFeed` 令牌 URL）、CSV、JSON 全量备份（**备份 = 一个 JSON 文件**，本地优先的关键保障）。
- 教务抓取**不做**（ADR-001），仅保留 parser 接口。

---

## 8. 测试与质量

| 对象 | 手段 | 重点 |
| --- | --- | --- |
| `@jiwei/core` 纯函数 | Vitest **穷举** | 单双周、跳过周、跨月跨年、闰年、调课、时区、iCal 往返一致性 |
| `@jiwei/data` 仓储 | Vitest（fake-indexeddb） | 迁移、CRUD、Occurrence 重建后附件不丢、仓储接口契约测试 |
| 交互 | Testing Library | 课程编辑、导入向导预览 |
| 端到端 | Playwright（含手机视口） | 录课→周视图→日视图→导出 iCal 全链路 |
| 原生 | 真机手测清单 | 杀掉应用后闹钟是否仍响（M5） |

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| **过度设计**（首版只有课表却搭大架子） | 交付变慢 | 只落地"模型 + 数据层 + 能力层 + 20 行模块注册"，**不写任何未来功能的逻辑**；M1 范围严格锁死 |
| **存储引擎被业务代码渗透**（换引擎时返工） | 迁移即重构 | 仓储接口 + ESLint 禁止 `features/*` import Dexie（ADR-007）；接口契约测试固定行为 |
| IndexedDB 无事务语义 | Occurrence 重建可能写坏 | 单个 Dexie 事务内"先删后写"，失败自动回滚；重建后校验引用完整性 |
| IndexedDB 数据被浏览器清理 | 数据丢失 | M3 提供一键 JSON 备份 + `navigator.storage.persist()` + UI 提示 |
| 时间/周次算错 | 展示错误、信任崩塌 | `materialize()` 单点实现 + 穷举单测 + iCal 往返校验 |
| 实例重建丢附件 | 闹钟/笔记挂空 | 确定性 `occurrenceId` + 重建后引用完整性校验 |
| 闹钟在 Web 端做不到 | 用户预期落空 | 能力探测 + UI 降级（提醒/系统日历），文案不承诺；原生外壳作为正式方案（M5） |
| 范围膨胀 | 做不完 | 严守 [`ROADMAP.md`](ROADMAP.md) 里程碑，一次只加一个模块 |
| 隐私 | 泄露 | 数据只在本地；本就不抓取教务，无学号/密码入库 |

---

## 10. 决策状态

| ADR | 决策 | 状态 |
| --- | --- | --- |
| ADR-001 | 定位 = 大学生生活 App；首版只做课表，不做账号/教务抓取 | ✅ |
| ADR-002 | 本地优先，首版不做服务器 | ✅ |
| ADR-003 | 首版 IndexedDB（Dexie），存储引擎可替换 | ✅ |
| ADR-004 | `Block` + `Occurrence` 锚点模型；`Alert` 统一闹钟与提醒 | ✅ |
| ADR-005 | 模块化外壳 + `platform` 能力适配层 | ✅ |
| ADR-006 | Capacitor 原生外壳承载闹钟（排期 M5） | ✅ |
| ADR-007 | 存储实现与访问接口分离（仓储模式） | ✅ |
| ADR-010 | 官方模块按需启用；AI 只生成待确认草稿 | ✅ |

**前置设计已全部确认**，无待定项。M2 手机可靠性、M3 文件进出和 M4 计划/官方模块开关已在本地完成；计划模块扩展 `Block` 锚点支持截止、长期、区间和每周语义，模块偏好写入 `meta` 并随备份保存。课程表图片 AI/OCR 仍放在后续可选阶段。
## 11. 产品与实现边界（2026-10-07）

- 核心体验是“今天工作台”：课程、计划和待办通过统一事项模型汇总到今天页；页面入口可以不同，但数据源和完成状态不能分叉。
- 当前落地基础是 React/Vite/Tailwind/Zustand/Dexie/Zod、本地优先仓储、模块开关和示例数据。TanStack Query、路由库、SQLite、云同步、原生通知和插件运行时仍是候选方案。
- 后续新增应用服务层，集中处理事项创建、完成、延期和导入；UI 只调用服务，不直接拼接数据库规则。只有在真实需求出现时再引入查询缓存、代码分包或远程同步。
- AI 的第一阶段只生成候选数据，用户确认后才写入；必须记录来源、允许撤销，并在离线不可用时保持核心流程可用。
- 面向职场扩展时使用工作/生活空间、项目关联和隐私边界复用核心模型，不把所有场景同时展示在首页。

### 2026-10-16 桌面课程表当前存储边界

桌面渲染层通过 `desktop/timetable-store.mjs` 读写本机 localStorage 快照，键为 `jiwei-desktop-timetables-v1`。快照含 `activeId` 和 `tables`，每张表保存元信息、`courses` 和 `schedule`，一次 setItem 提交。首次读取兼容旧的单课表及多课表数据键，不修改旧键。桌面课程暂未迁入 Web 的 Dexie/Block/Occurrence 仓储，不声明两端数据互通。日期与教学周计算复用 core 的 `semester-calendar.mjs`，Electron 加载本地模块时也使用该共享文件。

### 2026-10-17 桌面示例与网页整理

`desktop/workbench-data.mjs` 管理示例合并和网页记录，沿用计划/待办原键，新增 `jiwei-desktop-web-collections-v1`。每条网页记录含来源、正文、重点、行动草稿和加入状态；`web-extract.mjs` 为不访问网络或存储的本地规则提取器。`web-collector.cjs` 在主进程读取公开静态网页，保留段落、原文文件和最终来源，受限 preload 继续通过 `collector:fetch` 调用。它独立于南邮登录后的课表读取，不使用教务会话抓取普通网页。

示例按固定 ID 补充，课程进入独立示例课表；不覆盖真实数据或示例已编辑/完成状态。网页草稿由用户核对标题和日期后加入现有桌面待办，保留原文证据；待办与草稿状态一起写入，运行时异常会回滚已改键。多键 localStorage 写入不是跨进程事务，也不声明断电恢复保证。桌面 JSON 导出包含网页记录，仍未实现该 JSON 的导入恢复或跨端仓储互通。

`page-motion.mjs` 只处理可打断的页面入场动画；逻辑切换和旧页隐藏同步完成，不克隆旧页、不延迟路由或绑定业务数据。普通模式 260ms 轻微位移/缩放与淡入；减少动态效果时改为 90ms 透明度反馈。滚动位置按页面保存。
