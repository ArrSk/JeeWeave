# 几微项目维护约定

## 外部技能与技术文档

- 涉及 React、Vite、Tailwind、Electron、SDK、API、CLI 或云服务的用法、配置、升级和排错时，先使用 Context7：先按库名调用 `resolve-library-id`，再针对一个具体概念调用 `query-docs`；库名或版本要以本仓库 `package.json`、锁文件和实际代码为准。
- 当前会话只确认 Context7 技能文件已安装，未确认对应 MCP 工具已连接。工具不可用时，记录“未完成 Context7 查询”，再使用项目已有资料或官方文档核实，不得把未查询内容写成已验证结论。
- 界面改动按需使用 Impeccable 作为主流程；需要局部用户体验证据时使用 ui-ux-pro-max，需要落实 Tailwind、表单、弹窗和响应式细节时使用 ui-styling，跨页面统一样式时使用 design-system。先读实际界面和项目设计资料，不因技能自带示例而迁移技术栈或安装新组件库。
- 品牌文案、宣传图、横幅和演示文稿才使用 brand、banner-design、slides 等技能；它们不是每次产品开发的必经步骤。需要图片时再使用 imagegen，PPTX 任务遵循 presentations 技能。
- 每项任务只启用与目标直接相关的技能；技能的“已安装”不等于工具已连接或流程已实测。涉及账号、课程表、Cookie 或个人资料时，不上传到外部设计或文档服务。
- 具体触发条件和检查记录见 `docs/AI开发维护文档.md` 的“新增技能参与开发的方式”一节。

## 插件使用与效率

- 当前开发主线为 `desktop/`。先按实际目标选择插件和技能；桌面界面使用现有 Electron、HTML/CSS 与模块代码，不因设计插件示例改造网页端或迁移技术栈。
- 每次会话区分“技能文件存在、插件已安装、工具可调用、本次执行成功”。Context7 文档插件在 2026-10-17 查询时尚未安装；以后以最新工具清单和实际调用为准，不把历史不可用状态当成永久结论。
- UI 工作优先按需复用 Impeccable；桌面验证优先复用 `desktop/tests/workbench-ui.cjs` 的隔离示例数据和离屏截图，以及 `course-import-ui.cjs` 的导入链路。先检查现成测试，不重复搭建浏览器或诊断程序。视觉检查合并尺寸与状态，按技能限制完成有界的检查和修正。
- GitHub 插件仅在任务涉及仓库远端、PR、Issue 或 CI 时使用；当前 Code Review 工具用于 PR/CI 诊断，不能当作已提供本地代码审查。外部写入仍遵守本任务授权，不能因已连接插件就自动发布、发消息或推送。
- 工具失败先定位一次并记录原因；已有可靠替代流程时直接复用，除非环境或任务改变，不反复调用同一个不可用工具。不要为日常开发默认启用全部技能或安装无关插件。

## 接手入口

- 开发顺序：用户提出想法 → 编写代码并检查 → 提供本地体验并按反馈修改 → 用户明确确认满意 → 再封装 APK 和 Windows 应用 → 验证包后提交 GitHub。继续开发不代表同意打包或提交；APK 当前尚无实现，不能当成已有能力。

- 先读 `docs/HANDOVER.md`，了解实测基线、代码入口和未修复问题。
- 产品与长期设计见 `README.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/ROADMAP.md`。
- 架构与路线图同时含规划；当前实现以代码和实测为准，不把规划写成已完成。
- 用户指令优先。按当前任务完成必要工作，避免顺带扩展其他里程碑。

## 分层

- `shared/packages/core`：模型、日期/周次计算、课次展开；保持纯函数，不依赖 DOM 或存储。
- `shared/packages/data`：仓储、学期/作息管理、备份恢复、Dexie 实现。
- `shared/packages/ui`：通用网格、图标、模块契约。
- `shared/packages/platform`：通知、文件与持久化存储能力；当前只有 Web 实现。
- `web`：React 客户端、外壳与功能模块。
- 时间计算复用 core；界面通过 `useJeeWeave().repos` 和 data 服务操作数据，不直接使用 Dexie。
- 功能模块之间不要互相导入；共享逻辑放到适当的公共层。
- Zustand 以界面状态为主。现有 store 含选中学期快照，恢复/更新数据库时需同步它。

## 数据与行为

- `Block` 是模板，`Occurrence` 是派生课次。编辑课程保留 Block 的 id 与 createdAt。
- 学期、课程、作息、调整变化后，按需重建课次，再调用 `refresh()` 通知读取方；`refresh()` 自身只递增 dataVersion。
- 正常课和调入课均为 normal；调出课为 moved，停课为 cancelled。判断是否上课用 `isOccurrenceActive()`。
- 作息配置按学期保存为 `scheduleConfig:<id>`；保留旧全局键的读取兼容。
- 保持已有数据库与备份的升级兼容。涉及 schema、ID 或删除/恢复流程时检查引用完整性和失败回滚。
- PWA 的 base、start_url、scope 保持相对路径，兼容 GitHub Pages `/jiwei/` 子目录。
- 新功能只在真实可用后加入能力列表；当前没有日程、日历订阅、同步或原生闹钟成品。

## 开发与验证

- Node >=22；pnpm 版本以根 package.json 的 packageManager 为准。
- `pnpm dev`：开发服务，配置端口 5273。
- 改代码后运行 `pnpm typecheck`、`pnpm test`、`pnpm build`，构建成功后运行 `pnpm smoke`。
- 针对行为/数据问题补有意义的回归测试；纯文档改动检查链接、编码和 diff 即可。
- 现有 web 测试只有纯函数单测。涉及交互、刷新、恢复、离线时补对应浏览器验证，并说明手机真机是否覆盖。
- `pwsh -NoProfile -File scripts/verify.ps1` 已在 2026-10-16 修复并验证，包含 5 个项目的类型检查、core/data/web 单测、Web 构建及 smoke，可作为上述四项检查的等价入口；它仍不包含桌面单测与 Electron 交互测试，桌面改动需另行补齐对应检查。
- `docs/history/ENVIRONMENT.md` 描述历史环境问题；当前是否受限需实测，不能据此直接跳过检查。
- `pnpm save` 会提交并推送，main 推送会触发部署。仅在任务授权提交/推送时使用，优先用标准 Git 命令检查实际状态。

## 文档维护

- 维护结果与未完成项更新 `docs/HANDOVER.md`；产品能力变化同步 README/ROADMAP。
- 模型与关键决策变化同步 ARCHITECTURE/DECISIONS。
- 不改写历史检查记录为本次结果；记录日期、基线版本、实际检查范围与未验证边界。
