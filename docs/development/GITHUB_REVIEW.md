# GitHub 提交审查稿

## 2026-10-20：0.2.1 提交范围

用户授权当前两端源码与桌面 exe 发布。此次整合 3d0e746 以来的 JeeWeave 命名/图标、课表修复及桌面功能移植、统一事项与精确日历、对象视图 Beta、开发者示例守卫/清空、覆盖弹层与文档归档。随记和插件化底座仅含规划，不作为已完成功能宣传。当前 pnpm 以 packageManager 的 11.25.0 为准。

本轮精简六处 HTML 转义和事项开关写入逻辑，当前交接改为摘要、详细记录入历史；保留暂停群消息模块、旧格式兼容和全部历史检查事实。268 个维护文件均有索引，49 项运行白名单依赖完整，259 个文本严格 UTF-8 通过，未发现常见令牌/私钥模式。data、profile、backups、缓存、依赖与 exe/ZIP 不进入 Git；真实资料未用于测试或打包。

本轮 281 单测、5 项类型检查、Web build/smoke 23 项、两端交互、模拟课表抓取/导入、真实 workspace 与清空重启通过。成品原目录普通启动两次通过；最终 ZIP 重跑的解压/示例/对象/采集/移动重开/退出通过，首轮退出异常原样记入[打包记录](桌面打包进度.md)。源码指纹与 ZIP 校验见该页。

目标：ArrSk/jiwei main 与 [v0.2.1 Release](https://github.com/ArrSk/jiwei/releases/tag/v0.2.1)。发布执行结果以该页和 HANDOVER 后续确认记录为准；下文为历次交付时的历史说明。


## 2026-10-19 最新提交范围

用户明确授权“审查清理 → 打包 exe → 提交 GitHub”。本次记录此前桌面开发与本轮精简：版本化 data、计划/待办与阶段、日历、课程呈现/编辑、主题/作息、内置开关、暂停的群消息代码，以及相关测试/文档。Web/shared 业务未改；根版本升至 0.2.0。

仓库维护文件 237 项，打包输入 37 项，生成物与实际资料排除。240 项单测、5 项类型检查、构建/smoke 23 项及桌面交互通过；最终 0.2.0 ZIP 解压后的真实 exe 和数据迁移/退出检查通过。清理了约 1.79 GiB 临时文件，保留数据/备份/依赖和旧成品回退目录。二进制和资料不进入 Git，产物位置与校验见[打包记录](桌面打包进度.md)。

同步结果：源码提交 `88be23d` 已推送至 ArrSk/jiwei main，GitHub Actions 构建及 Pages 部署通过。后续已按用户明确要求发布 [v0.2.0 二进制 Release](https://github.com/ArrSk/jiwei/releases/tag/v0.2.0)，上传 ZIP 及 .sha256；二进制仍不进入 Git 历史。

下文为 2026-10-17 提交准备时的历史稿，其中旧 localStorage 与验证计数不代表当前实现；当前以 Desktop README、DATA_FORMAT 和 HANDOVER 为准。


状态：2026-10-17，用户审查后明确要求“提交”，已授权将本文所列源码和文档提交并推送至 GitHub。本文保留准备阶段的检查记录；实际远端构建与部署结果以对应提交的 Actions 为准。本次不重打成品。

## 建议阅读顺序

1. [项目首页](../../README.md)：双客户端定位、能力对照、运行与验证。
2. [Desktop README](../../desktop/README.md)：重点审查技术框架、进程/IPC、教务导入、存储和封装。
3. [Web README](../../web/README.md)：React/PWA 架构、数据服务、开发和部署。

## 源码提交范围

| 范围 | 应包含 |
| --- | --- |
| 项目根 | README、LICENSE、AGENTS、工作区与锁文件、格式和忽略规则 |
| desktop | 正在使用的主进程、preload、界面、业务模块、启动/封装程序及测试 |
| web | GitHub 版界面源码、图标、构建配置、启动程序及交互测试 |
| shared/packages | core、data、ui、platform 的源码、包配置和测试 |
| scripts / .github | 本地验证/预览工具、Web Pages 工作流 |
| docs | 文档和两张来自虚构隔离数据的界面截图 |

不包含 `node_modules`、Web dist、桌面 release、本地 cache/backups、运行 profile、数据库、日志、环境凭证与签名私钥。`.gitignore` 已覆盖这些生成物和私人文件；`.gitattributes` 约定文本 LF、Windows cmd CRLF、二进制不做文本转换。

本地只读候选范围检查为 203 个文件、约 1.65 MiB，包含两端源码和公共层，未出现上述生成物/私人目录路径。此结果检查的是文件范围和忽略规则，不等同于独立的安全审计。

准备审查时，本地 Git 保留此前目录迁移的未提交状态：旧 `apps/web`、`packages` 显示删除，新 `web`、`shared`、`desktop` 中有未跟踪文件。本次提交统一记录目录迁移与现有源码，不能仅提交“删除旧目录”，也不能仅凭 `git diff --stat` 忽略未跟踪源码。没有改写 Git 历史或丢弃先前工作。

## 文案中需要确认的重点

- Desktop 采用 Electron 主进程 + preload + 原生 HTML/CSS/JS 界面；Web 采用 React/PWA。当前没有把桌面描述为 React 客户端或 Capacitor 成品。
- Desktop 数据是独立 localStorage 快照，公共层暂只直接复用日期模块；Web 使用 core/data/ui/platform 和 Dexie 仓储。统一存储和自动同步仍未完成。
- 南邮导入流程是手动认证后，主应用按钮触发实时读取、校验、去重并直接导入；普通网页整理使用本地规则和人工确认草稿。
- Web 有 JSON 恢复、ICS、单次调停课；Desktop 尚未完全移植这些功能。没有将两端能力合并宣传。
- Windows x64 本机成品验收不等于已有公开 Release、可信签名、跨系统成品或 APK。
- 截图只包含虚构示例；其中的占位导航不计入可用能力。

## 验证与边界

上轮应用基线已通过 5 项类型检查、199 项单测、生产构建和 23 项产物检查，以及 Web/Desktop 分项隔离交互。本次修改集中于文档、虚构截图和 Git 文件规则，检查文档链接、命令与代码对应、图片、UTF-8、忽略规则、候选源码及 diff；不将上轮结果写成本次重新运行。

Node 22.12+、pnpm 11.8.0 与 `install-electron` 用法根据当前锁文件、本地 Electron 44.7.0 包及官方文档核对。当前会话未连接 Context7，**未完成 Context7 查询**。没有执行全新电脑/空依赖目录的首次安装，未启动新的远端 Actions；最终远端 CI 与发布结果须在授权提交后验证。

本轮已核验 README 内的启动/检查命令与 package scripts、Electron 安装器入口，6 个工作区的依赖声明均与锁文件一致。Git 换行语义依据[官方 gitattributes 文档](https://git-scm.com/docs/gitattributes)核实，未执行暂存或重规范化整个工作区。

用户已明确授权提交/推送。推送 main 会触发现有 Web Pages 部署流程；桌面成品不是该工作流的发布产物。
