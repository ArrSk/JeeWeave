# 桌面数据目录与格式

当前业务格式为 `jeeweave-desktop-workspace`，`schemaVersion: 1`；旧 `jiwei-desktop-workspace` 继续可读取，并在下次保存时升级。此格式属于 Desktop；Web 的 Dexie 备份仍使用自己的契约，不能直接互相恢复。

## 目录

开发版固定在 `desktop/data/`，成品固定在 exe 同级 `data/`。设置页显示实际绝对路径并可打开文件夹。测试通过 `JEEWEAVE_DATA_DIR` 使用隔离目录，旧 `JIWEI_DATA_DIR` 仍兼容，不碰真实资料。

```text
data/
├─ manifest.json             目录格式与相对路径清单，layoutVersion: 1
├─ workspace.json            业务数据主文件
├─ workspace.previous.json   上一次成功保存前的业务快照
├─ profile/                  Chromium 会话、教务登录状态和兼容缓存
├─ captures/web-captures/    网页原文、元数据
├─ integrations/chat/        群消息本机接收密钥及未确认缓冲（主动开启后创建）
├─ exports/                  主动导出的业务 JSON、浏览器下载
├─ backups/                  每次确认恢复前单独保留的业务快照
├─ cache/                    可重新生成的磁盘缓存
└─ logs/                     错误与崩溃记录
```

开发者“清空所有数据”使用短暂的 `reset-request.json`，包含请求来源进程和工作区 revision；旧进程退出后、profile 和单实例锁初始化前执行。完整活动资料移动到 `backups/before-clear-…/data/`，该备份旁的 reset-manifest.json 记录清单及 complete/rolled-back/recovery-required 状态，原有 backups 不移动；不永久删除文件。请求的主进程来源、开发者开关、确认值和 revision 均检查，清空期间拒绝新业务写入；第二次启动若原进程仍存在则不提前处理。发生移动错误先回滚；未完整成功不加载新空数据覆盖旧资料。重置后的首次初始化跳过历史 profile 迁入，避免刚清空又恢复旧记录。

重置不升级业务 schema。恢复业务 JSON 不恢复登录会话；全量恢复须退出应用后从备份 data 恢复原文件，保留当前 data 副本及历史 backups。测试入口为 `pnpm desktop:test:reset`，使用新建隔离目录实测自动重启，不访问真实 desktop/data。重启顺序依照 [Electron app 文档](https://www.electronjs.org/docs/latest/api/app#apprelaunchoptions)核实。

升级前关闭所有几微窗口，保留旧版副本，把**整个 data** 复制到新版 exe 旁；不要把新旧目录中的 profile 或 JSON 分别混合。首次用新版本打开既有 data 时，会读取旧 profile 中的业务数据并生成 workspace.json，旧资料不删除。开发版首次改用固定目录时，复制旧默认 profile 中的持久存储/登录文件和已采集原文，原目录保留；已有新 profile 时不重复覆盖。跨电脑的系统加密 Cookie 可能仍需重新登录。

## 业务主文件

```json
{
  "format": "jeeweave-desktop-workspace",
  "schemaVersion": 1,
  "revision": 1,
  "createdAt": "2026-10-17T00:00:00.000Z",
  "updatedAt": "2026-10-17T00:00:00.000Z",
  "data": {
    "timetables": null,
    "plans": [],
    "tasks": [],
    "webCaptures": [],
    "preferences": { "theme": "blue", "developerMode": false },
    "extensions": {}
  }
}
```

示例是初始化前的空结构。应用随后初始化至少一张课表；`timetables` 仍为 `{ activeId, tables }` 快照，每张课表含自己的 `courses` 和 `schedule`。网页记录沿用正文、来源、重点、草稿与确认状态；采集目录规范成 `captures/...` 相对路径。未知旧 `jiwei-*` 键放入 extensions，避免升级时丢弃未来扩展资料。

### 2026-10-20 对象视图 Beta 与示例可见性

可选 `data.objectView = { schemaVersion: 1, objects: [], links: [] }`，旧文件缺少时补空集合，不从标题推断关系，也不改原课程/事项身份。兼容存储键为 `jiwei-desktop-objects-v1`，映射到 objectView，正式数据仍在同一 workspace.json，未新增散落文件。对象保存 `id/type(course|project|general)/title/purpose?/status(active|archived)/createdAt/updatedAt`；示例额外带 `example: true`。

关系保存 `{ objectId, ref: { collection, id, containerId? }, title?, example?, createdAt? }`。collection 为 courseEntry/task/plan/capture，只有 courseEntry 必填课表 containerId；task 与 plan 相同 id 仍是不同来源。一个来源只能有一个主对象，对象可收纳多条课程安排。新关联检查来源真实存在且当前可见；对象保存/归档不改源记录，新增或编辑事项及归属通过既有事务一次写入。格式拒绝重复对象、重复主归属、未知版本及指向不存在对象的关系，保存失败保留旧快照。

来源删除后，旧关系允许保留为“来源已移除”的可解除引用，标题快照只用于识别，不充当第二份正文；不会自动关联重新导入的同名新记录。隐藏示例与来源删除分开处理。归档对象保留引用，不改变原事项完成状态。降级版本对该扩展的写入无损性尚未验证，升级/回退仍先保留整个 data 副本。

`preferences.developerMode` 决定示例入口和投影可见性，服务层同时阻止示例导入/示例网页草稿转事项。关闭不会删示例；若当前选中示例课表则切到真实课表，无真实课表时补空白课表供正常使用。确认的示例网页任务带 example，旧任务通过已记录的草稿 taskId 与来源 URL 识别，不能按标题猜测。JSON 备份仍包含隐藏数据，任何列表编辑不能以筛选后的集合覆盖完整存储。

### 2026-10-19 未排课记录的兼容扩展（字段说明）

每张课表可选 `unplacedCourses: [{ id, title, weekText, weeks, raw }]`，旧文件缺少此字段仍合法，schemaVersion 保持 1。它保存教务“其它课程”中未给星期和节次的记录，与 courses 一次原子提交、随课表切换及 JSON 备份/恢复保留；不填假节次、不进入周网格或今天课表。title 保留学校原文中的课程与教师组合名称，raw 保留该条完整原文，不猜测姓名分界。周次必须完整合法；按 raw 去重，未知字段仍原样保留。CSV 当前只导出有明确时间的 courses；完整迁移请使用工作区 JSON 或整个 data。

### 2026-10-18 课程颜色与编辑兼容

课程沿用现有 `color` 字段：空值为自动分类，显式颜色可为 green/blue/yellow/red/purple/orange/cyan；仍读取旧十六进制背景色及名称，未知旧颜色值保留。界面主题只改变呈现，不改课程保存值。`weeks` 与 `weekText` 沿用原字段，空 weeks 表示每周；逐周选择存显式周次，全部选中可简写，不能取消最后一周后意外变成每周。无效片段、超学期周次和倒置节次在提交前拒绝。编辑合并原记录，保留 id、createdAt 及其他已有字段；不提升 schemaVersion、不新增资料目录。

### 2026-10-18 群消息兼容扩展

工作区 v1 增加可选 `data.chatMonitor: { schemaVersion: 1, sources: [], messages: [] }`，旧文件自动补空结构。兼容缓存键 `jiwei-desktop-chat-monitor-v1`，进入同一快照/JSON 备份与恢复。来源包含 id/name、platform（qq/wechat）、transport（manual/onebot11/wechat-bridge）、accountId/groupId、enabled、keywords/excluded；最多 50 个，平台/方式/账号/群组合唯一。已有消息的来源不允许改身份字段，避免原文改属其他群。

messages 最多 500 条，包含稳定组合 id、sourceId、text、senderId/senderName、sentAt/receivedAt 与 draft（title/date/dateInferred/status，可选 taskId）。原文不截断、超限拒绝，不静默淘汰；引用来源必须存在。确认待办与 draft 状态通过一次事务写入，待办保留 sourceMessageId/sourceGroupId/sourceTitle/evidence；清理已处理消息后证据仍在待办中。截止日是用户确认后的值，规则建议不自动改课。

本机接收密钥单独保存 `integrations/chat/receiver-key.json`，缓冲为同目录 `pending.json`（schemaVersion 1、events 数组，最多 200 条）。HTTP 成功前原子落缓冲，界面成功写工作区后才 ack 移除；新上报并发到来继续排队处理。JSON 导出包含已导入群消息原文，不含密钥及未提交缓冲；完整迁移仍复制整个 data。JSON 恢复会停止接收，不覆盖独立密钥/缓冲，后续主动开启后按恢复后的来源规则重新筛选。接口只监听本机，应用重启不自动开启；协议与容量边界见[群消息说明](../docs/research/CHAT_MONITOR.md)。

### 2026-10-18 作息与外观的兼容扩展

工作区仍为 schemaVersion 1，新增可选字段，旧文件不要求重建。每张课表的 `schedule` 仍保存实际逐节时间；可选 `scheduleBatch` 保存上次批量生成使用的参数：`schemaVersion: 1`、duration（分钟）、gap、longBreakEvery、longBreak，以及上午/午后/晚间三项 groups（id、label、start、count）。手工逐节微调以 schedule 为准，不强行反算或覆盖；旧表缺少参数时只推断表单初值，生成预览不落盘，保存才提交。

`data.preferences.appearance` 为 `{ schemaVersion: 1, preset, colors: { background, text, accent } }`，颜色使用 `#rrggbb`。preset 支持 blue/paper/forest/ink/violet/rose/ocean/amber/graphite/custom；原 theme 字段保留并与 preset 一次事务写入。旧 blue/violet/forest 自动补齐颜色，旧写入方只改非 custom 的 theme 时按该预设重新生成颜色。自定义缺失颜色、非法颜色、未来主题格式或正文/背景对比不足会拒绝写入，不覆盖原偏好。兼容缓存键为 `jiwei-desktop-appearance-v1`，权威记录仍在同一 workspace.json。

`data.preferences.modules` 为 `{ schemaVersion: 1, enabled: { today, courses, plans, tasks, "web-capture", "course-import" } }`，每项为布尔值。旧文件缺少此字段时六项默认开启，未知布尔开关原样保留，未来格式或非布尔值拒绝写入。兼容键为 `jiwei-desktop-modules-v1`。关闭不删除任何课表/事项/采集记录；教务导入是否可用还依赖 courses，父功能关闭只暂停依赖，不覆盖原开关值。JSON 导出、恢复、清缓存和整目录迁移沿用同一偏好字段。

主文件是权威存储。渲染层使用同步 Storage 适配器，经受限 preload IPC 交给主进程；校验成功、写临时文件、fsync、原子替换后才确认成功。localStorage 是兼容缓存，清空它不会清空已保存的 workspace.json。示例合并和网页草稿确认使用一次多键事务，避免任务与确认状态分开落盘。revision 拒绝过期快照写入；超出 32 MiB 或未来格式版本会报错并保留旧文件。

文件损坏时不静默重建空数据。先关闭应用、备份整个 data，再检查 workspace.previous.json 或 backups 中的副本；不要在应用运行时手工覆盖主文件。

## 事项（兼容原计划与待办集合）

两类事项统一包含 `schemaVersion: 1`、`id`、`kind`、`title`、`note`、`anchor`、`done`、`completedDates`、`phases`、`createdAt`、`updatedAt`；保留已有来源、证据和示例标记。编辑保留 id/createdAt。旧待办的 date 迁为截止日期，旧计划的 date 迁为全天安排，避免把执行日期误当最后期限。

| anchor.type | 时间语义 | 主要字段 |
| --- | --- | --- |
| floating | 无期限 | 无日期 |
| deadline | 最晚完成日期 | date、可选 time；没有时间时按当天 23:59 判断逾期 |
| allDay | 某日全天安排 | date |
| absolute | 有具体时段的事项 | 带 `+08:00` 的 start/end |
| range | 连续日期区间 | start/end；可选 startTime/endTime |
| weekly | 按周重复 | startDate、weekdays；可选 until、startTime/endTime |

当前 tasks/plans 均接受全部时间类型；kind 表示持久来源，不再限制时间语义。统一界面不搬动旧记录、不按标题合并；新建 floating/deadline 默认写 tasks，其余优先写 plans；旧单边开关下选仍开启的集合，编辑始终原地保存。考试以可选 eventType: "exam" 和 absolute 起止时间标识，不新增独立事件库。未升级的旧程序可能拒绝 tasks 中的时段/阶段事项，回退前保留原版备份。区间、重复和定时计划还可独立设置 `deadline: { date, time? }`，不把执行区间末尾强行当成硬期限。周重复以 completedDates 记录单次完成；完成一次不取消未来重复。

range 的 phases 是一级阶段数组：每项包含稳定 id、title、done、可选 startDate/endDate 和时间戳。阶段日期要么都留空跟随计划，要么完整填写且位于父区间；编辑/再次导入示例保留完成状态。父计划完成与阶段完成分别记录，不擅自级联覆盖。

## 导出和恢复

“导出业务数据”在 data/exports 生成与主文件相同格式的 JSON。恢复先校验并显示数量，取消不写入；确认前把现有主文件保存在 data/backups，再原子替换。兼容此前带 exportedAt/timetables/plans/tasks/webCaptures 的旧桌面导出，保留当时缺失的当前主题/开发者偏好。拒绝把 Web 备份当成桌面备份。

JSON 不包含 Cookie、profile 和原文文件。完整版本迁移以整个 data 文件夹为单位。新增功能应扩展版本化业务格式或在 data 内建立有说明的资源目录，不再另写散落的业务文件。

### 2026-10-18 日历偏好与群消息暂停

可选 `data.preferences.calendar` 为 `{ schemaVersion: 1, view: "month", filters: { plans: true, tasks: true, phases: true, completed: false } }`，view 支持 month/week/day。旧文件补默认值，兼容键 `jiwei-desktop-calendar-v1` 映射到同一偏好字段，随导出、恢复、清缓存和 data 搬迁保存。当前显示日期与事项选择不持久化，重开定位当天，避免停留在过期日期。没有新增独立事件库或日期数据目录。

日历从现有任务/计划派生展示记录，不存派生 ID。全天 range 结束日包含在内；有具体时间的 range/absolute 按结束时间不包含处理，上海时区 00:00 结束不重复绘制下一天。阶段日期、独立 deadline、weekly 的 completedDates 继续遵守原字段。待办可选截止时间仍使用 anchor.time，不变更模型版本。

modules 默认增加 calendar:true，旧 chat-monitor 布尔值原样保留；运行时 suspended 状态使群消息入口与接收始终不可用，不把旧 true 清成 false。chatMonitor 和 integrations/chat 资料不删除，历史原文随业务备份保留，密钥/缓冲仍只随整个 data 迁移。恢复不会重新启动接收。

### 2026-10-20 统一事项入口与精确时间

schemaVersion 仍为 1；保留两份集合及稳定 ID/createdAt/来源。引用及派生日历 ID 必须含 kind，不能假定 plans/tasks 的 id 跨集合唯一。考试改为其他时间类型时移除 exam 标记；同日时段必须结束晚于开始，旧跨日 absolute 在编辑时保留结束日及上海时区时刻。

模块与日历偏好仍使用原 plans/tasks 布尔字段。合并控件读取时不改旧单边值，主动操作后一次写两项；关闭不删除资料。anchor.time 或独立 deadline.time 只影响日历投影：变为带 dueTime 的 point，日历不保存假时长，视觉最小高度不改实际时刻。范围/重复时段、日末和跨午夜规则沿用原语义。

2026-10-20 选项精简：事件与考试共用 event 时间选项；旧 exam 调用及 eventType=exam 仍兼容，编辑为 event 时保留旧标记，改成非时段类型时才移除。没有清理或重编号旧考试记录。

## 2026-10-20 课次调整、阅读及课程文件移植

每张课表可选 adjustments: [{ id, courseId, originalDate, originalPeriodStart, originalPeriodEnd, action, target?, reason?, createdAt, updatedAt }]，action 为 move/cancel；move 的 target 为 {date,periodStart,periodEnd,location}。原日期必须是该课程的有效教学周/星期，原节次应与课程一致；调入日期在本学期、目标节次在现有作息内。同一原课次只一项调整，编辑保留其 id/createdAt；恢复删除这一项。修改课程/学期使引用失效时拒绝保存，删课程则同一事务清理对应调整。只在桌面课表内持久化，不引入第二份 Occurrence 库。

派生课次以 [courseId,originalDate] 为逻辑身份，source/target 为显示身份；调出 moved、停课 cancelled、正常/调入 normal。课表、今天、日历、ICS 使用同一纯投影。作息更新按节次重新计算时刻，减少节次需同时满足模板和调入目标；备份校验也拒绝悬空引用。旧文件缺 adjustments 按空读取，字段存在但损坏则拒绝，不能静默清空。

可选 preferences.reading = {schemaVersion:1,size:"standard"|"large",density:"compact"|"comfortable"}，旧文件补标准/紧凑；缓存键 jiwei-desktop-reading-v1 映射到同一权威工作区，随清缓存重开和 JSON 恢复保存。日历 filters 新增可选 courses:true，旧偏好默认显示课程；独立控制课程及事项，仍遵守模块关闭。

CSV/ICS 先保留原字段草稿和错误，确认时全批重验并原子保存，旧预览绑定完整课表快照。重复依据课程/教师/地点/星期/节次/等价周次，不将颜色作为新增依据；冲突提示不删除已有课程。CSV 是模板，ICS 按有效课次导出，JSON 保留调整历史。回退到不认识新字段的旧版前应保留原备份，旧版编辑模板可能导致新调整引用失效。

ICS 折行、UTC、转义与重复排除参照 [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html)，实际支持范围见 [Desktop README](README.md)。不支持的时区/复杂系列/单次覆盖显式报错，不声称完整通用 iCalendar 实现。
