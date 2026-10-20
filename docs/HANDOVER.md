# 几微 · 当前接手说明

更新：2026-10-20。本页只保留运行现状、验证和下一步。完整历次记录见[截至 10 月 19 日](history/HANDOVER-20261019.md)与[0.2.1 发布前交接](history/HANDOVER-20261020.md)，原检查事实保留。

## 当前实现与边界

- 主线为 Desktop：Electron 44.7.0 + HTML/CSS/ES Modules；Web 为独立 React/PWA，公共层主要服务 Web。两端数据不自动互通，不能直接互相恢复备份。
- 桌面包含多课表、单双周/连堂与未排课记录、逐表作息、单次调停课/恢复、南邮 WebVPN 手动登录后实时导入、CSV/ICS 预览与导出。课程表、今天状态与日历共用有效课次投影。
- 计划/待办统一为事项入口，事件/考试共用选项，保留截止、时段、全天、阶段和重复。旧 tasks/plans 集合与 ID 保留，不按标题合并；日历按真实时刻和期限投影。
- 对象视图 Beta 可手动关联课程排课、事项和网页原文，双向返回原编辑器；一来源一主归属。多执行时段、单次课堂布置来源仍待开发。
- 侧栏显示 JeeWeave · 几微，无原生左上菜单；统一弹层最大 820px，主题/字号/密度集中设置，切换为可打断的轻量淡入。插件管理为 7 项内置开关，尚不是第三方插件框架。
- 示例入口、读取和导入服务均受开发者模式控制。开发者可确认后清空：重启前停止写入，旧进程退出后完整归档到同一 data/backups，再初始化空白环境；失败回滚，不永久删原资料。
- QQ/微信群接收及入口暂停，代码与历史资料保留。随记、记账、外部 AI、同步、原生闹钟、第三方插件安装与 APK 尚未完成。

数据权威为同一 data/workspace.json；会话、原文、导出和备份均位于 data。升级先退出应用、备份，再整体复制 data；来源和兼容约束见[数据格式](../desktop/DATA_FORMAT.md)。真实资料未参与本轮测试或打包。

## 本轮精简与发布范围

用户明确授权精简、验证、打包并上传源码和成品。根版本升为 0.2.1；包含从 3d0e746 以来的当前开发成果，保留已有未提交工作。

- 将六处 HTML 转义合为 ui-text.mjs，补齐注入边界与零值/布尔值回归；统一事项开关改为公共服务一次保存，失败保留原状态。
- 长交接流水归档，本页改为当前摘要；当前入口的 pnpm 版本与 packageManager 11.25.0 对齐，过期能力说明同步。设计文档与历史记录分开，随记/底座仍标为规划。
- 分发使用明确运行文件白名单；加强空数据检查，覆盖对象/关系、消息来源、课程、未排课及调整。测试、实际 data、缓存、备份和凭据不封入应用。

## 本轮验证

本轮实际执行：5 项类型检查、core 81/data 71/Web 17/Desktop 112 项单测，合计 **281 项**；Web 构建和 smoke 23 项通过。桌面 features、workbench-ui、模拟教务 import-ui、真实 workspace create/reopen、清空自动重启，以及 Web 交互检查通过。宽窄截图检查通过，均使用隔离虚构资料。

工作区证据：desktop/.cache/verification/workspace-flow-1792469215681；清空重启：desktop/.cache/verification/reset-flow-1792469258172。首次沙箱内 Electron 以 0x80000003 退出，正常用户环境的隔离测试随后通过；没有关闭应用沙箱或改系统 ACL。既有 Zod 注释/chunk 构建提示保留。

成品原目录连续两次无调试参数启动/关窗通过。最终 ZIP 解压后的独立副本验证示例、对象引用、网页采集、移动目录后重开与数据保留，以及两次关窗进程清理通过，证据 desktop/.cache/verification/package-smoke-1792481570820。首轮 ZIP 测试曾在第二次关窗检测到进程残留，失败后清理了该测试实例；补主窗口标题身份断言后重跑通过，尚不能确定首轮异常的根因，未把它计为成功。专门 close-app 与两项实时课表抓取/模拟 WebVPN 回归也通过。没有手机、macOS/Linux 或新的真实学校登录验收。

成品：desktop/release/几微-0.2.1-Windows-20261020-050440/几微.exe；ZIP 158,474,322 bytes，SHA-256 为 4d9c671a469e5579b8191f91e7d38c87976edab8430ea913e7b75dd964e9db8f。源码指纹 27881f6b21aa1c53920eeec1f02dcaf6ab65cf9668d525196cf4521af3a56d60，50 项构建记录（含 package.json）逐一匹配源码，分发 data 为空。源码/Release 上传及远端 CI 随后执行，不以本地验证冒充远端成功。

仓库审查：268 个维护文件，49 个运行输入，本地链接与索引无缺漏；259 个文本文件严格 UTF-8 解码通过，未发现常见真实令牌/私钥模式，生成/私人目录排除。git diff --check 通过。GitHub CLI 未安装，改用 Git 与官方 Release API；Node 初次连接遇到证书链错误，使用系统证书库后成功，没有关闭 TLS 校验或把凭据写入文件。

Context7 技能文件存在但工具清单没有 resolve/query，**未完成 Context7 查询**；Electron 打包与 GitHub Release 操作以[Electron 官方说明](https://www.electronjs.org/docs/latest/tutorial/application-distribution)、[GitHub Release](https://docs.github.com/en/rest/releases/releases)及[附件文档](https://docs.github.com/en/rest/releases/assets)核实。未安装新依赖或改变框架。

## 入口与下一步

日常开发使用 desktop/debug.cmd；检查使用 scripts/verify.ps1 与 package.json 的桌面测试；封装使用 desktop/package.cmd。成品位置/校验以[打包记录](development/桌面打包进度.md)为准，公开源码与交付范围见[提交记录](development/GITHUB_REVIEW.md)。

待开发顺序：[路线图](ROADMAP.md)中的 A0 契约/选型实验 → A1 适配 → N1 随记 → N2 对象/事项互通 → O2 多段投入，随后逐功能迁移。具体见[随记](product/随记功能与开发流程.md)、[插件化底座](design/插件化底座与迁移流程.md)、[ADR-016](DECISIONS.md#adr-016--随记与最小宿主业务插件)。本次发布不会把这些规划变成已实现能力。
