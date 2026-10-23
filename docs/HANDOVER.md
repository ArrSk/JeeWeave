# 几微 · 当前接手说明

更新：2026-10-23。主线 Desktop；0.3.0 已完成验证、源码推送和 Release 发布。0.2.1 保留为回退，不能用旧 exe 体验新版功能。

## 当前状态与入口

- 开发入口：desktop/debug.cmd；Electron + HTML/CSS/ES Modules，不依赖 Web 开发服务。真实数据在 desktop/data，测试必须指定隔离目录。
- 现有课程/导入、事项/日历、对象 Beta、笔记、网页采集和聚合页均接入可信内置插件底座。近期 1—5 已本地实现，用户简单体验未见明显问题；以代码及实测为准，第三方插件、同步、记账、APK 与原生提醒仍未完成，群消息暂停。
- 今天主页仅列明确包含当天的事项，其余通过「其他待处理事项」弹窗查看；分组和逐条详情可折叠，同次运行保留状态。
- 核心数据仍为同一 data/workspace.json，schemaVersion 1；旧 ID、两份事项集合、未知字段与关闭模块的数据保留。两端备份不能互相恢复。
- 开发规范只读 [AGENTS](../AGENTS.md)；实现边界见 [架构](ARCHITECTURE.md)，接口入口见 [内置插件接口](development/内置插件接口.md)，后续范围见 [路线图](ROADMAP.md)。

## 2026-10-23：0.3.0 交付

用户授权清理、打包与上传。清理旧验证数据和无业务数据的 0.2.0 成品共 362 项，释放约 2472 MiB；真实 desktop/data、所有备份、原课表分析资料、含数据的 0.1.0 与回退 0.2.1 均保留。维护源码 299 文件，文档链接与运行白名单检查通过；可复用测试没有删除。

完整验证：core 81/data 71/Web 17/Desktop 178，共 **347 项单测**、5 项类型检查、Web build 与 smoke 23 项通过；features、课表 UI、模拟教务导入、真实 workspace create/reopen、迁移专用分支、清空备份重启与 close 通过。首次截图遇 UnknownVizError，测试仅对该错误有界重试；旧工作区夹具更新为迁移包原生保存窗口的断言。

成品 desktop/release/几微-0.3.0-Windows-20261023-070339/几微.exe，ZIP 158511808 bytes；SHA-256 为 2924adc7117e31420f54a7eaf688a7c9e16c631cd9f054c975aefc9cf133c823。69 项运行输入与源码指纹一致，最终目录两次普通启动/退出通过，ZIP 解压后的副本验证示例、日历、对象、真实 IPC 采集、移动重开与 WM_CLOSE 退出通过，分发 data 为空。CDP 测试中 .NET 主窗口选择返回空标题，改按精确 PID/可见标题枚举后发送 WM_CLOSE；同一 ZIP 重跑通过，未改应用关闭逻辑或放宽进程归零断言。依据核对 [EnumWindows](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows) 与 [PostMessageW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-postmessagew) 官方文档，Context7 工具仍不可调用。

源码 [e471c62](https://github.com/ArrSk/jiwei/commit/e471c62b4a7793595bcae447723bbe61e4444df8) 已推送，[Actions](https://github.com/ArrSk/jiwei/actions/runs/39921783634) 成功；[Release v0.3.0](https://github.com/ArrSk/jiwei/releases/tag/v0.3.0) 已公开，包含 jeeweave-0.3.0-Windows-x64.zip 和同名 .sha256，服务端大小与 digest 均核对一致。发布标签对应运行源码提交；后续文档记录不改变成品。

本轮日志在 desktop/.cache/release-0.3.0；完成验证后另清理 63 项新测试副本，约 1936 MiB，共清理 425 项约 4408 MiB，实际成品与日志保留。文中旧缓存证据目录可能已移除，不改变原验证事实。未重新登录真实学校、物理输入法、跨电脑或其他系统验收，未签名。此次明确授权发布，UI 与交互重新设计仍等待用户方案。

## 2026-10-23：登记 UI 与交互优化分支

按用户要求在[路线图](ROADMAP.md#独立分支ui-优化与交互优化)加入独立设计工作分支，UI 和交互由用户亲自重新设计，当前等待方案，不自行开始页面改版。无关功能可继续，实际阻断使用的问题可单独修复；设计范围确定后再实施并由用户体验验收。本次仅修改路线图、文档导航和接手说明，检查编码、链接及差异；没有修改应用代码、创建 Git 分支、打包或提交。

## 2026-10-22：迁移包与文档精简

设置 → 数据迁移与备份：导出单个 .jiwei 文件，在新版选择导入，先预览来源/兼容状态/数量，再确认替换。包含业务数据与 captures 原文，排除 profile、Cookie、接入密钥、缓存和旧备份。已有 JSON 或旧版应用/data 文件夹也可导入；缺 workspace.json 的早期 profile 需先用旧版导出，不直接猜读 Chromium 数据。

包格式 jeeweave-desktop-transfer/packageVersion 1，应用版本仅作来源说明，实际按工作区/子模块格式校验；支持当前 schema 1、旧 jiwei 名称和旧平铺 JSON，未知新格式拒绝且不覆盖。旧空课表在内存补齐，旧导出未知字段保存在 extensions。包限制 128 MiB、原文 64 MiB/10000 文件，超限保留整目录迁移方法。格式与限制集中在 [DATA_FORMAT](../desktop/DATA_FORMAT.md)。

主进程只接受本地页面，预览只保留候选；确认检查当前 revision。原文校验后写入独立目录，业务原子恢复前保留快照，失败撤回本次新原文，旧文件与登录状态不动。成功后同步渲染缓存并刷新功能；导入后的界面异常明确提示重新打开，避免误报业务提交失败。代码复用统一 prepareWorkspaceRestore，删除重复恢复准备和运行时文案重写。

本轮仅跑迁移/工作区恢复 11 项单测，以及 workspace 的 transfer 专用真实主进程/preload/UI 分支：预览/取消、旧文件夹转换、磁盘失败回滚/重试、原文件未改、缓存与界面刷新、迁移包导出再导入均通过。宽/窄迁移预览完成一次检查和一轮可见性修正。日志 desktop/.cache/verification/transfer-domain.log、transfer-ui.log；具体截图目录见日志。沙箱临时文件 rename EPERM 与 Electron 启动失败后正常用户环境隔离重跑通过。未运行全局检查，未读取或迁移真实 data，未做跨电脑实测。

Context7 查询未完成（本会话无 resolve/query 工具）；原生选取/保存窗口按 [Electron 官方 dialog 文档](https://www.electronjs.org/docs/latest/api/dialog)核对。界面复用此前读取的 Impeccable 流程和既有设置布局，未重试缺引擎的启动器。未新增依赖或更改业务 schema。

## 验证与后续

- 单功能仅验证相关行为与必要关联入口；较大里程碑、封装或发布前再统一全量检查。用户确认体验不等于授权打包/提交。
- 最新全量交付基线为上文 0.3.0 的 347 项单测与成品检查；此前迁移功能加入前为 342 项。日常局部检查与交付检查分开记录。
- 仍待：真实教务账号/验证码与实体中文输入法手感；其他系统/设备、真实 0.1 数据及换机迁移未验。旧学校链路曾经由用户确认成功，不等于本轮重验。
- 当前不主动再改其他功能。下一步以用户体验反馈为准；较大交付前补全量验证和空数据成品检查。

## 历史事实

完整的笔记、插件迁移、近期 1—5、稳定性与今天页验证见 [10 月 22 日记录](history/HANDOVER-20261022.md)；更早见 [0.2.1 发布前](history/HANDOVER-20261020.md)、[10 月 19 日](history/HANDOVER-20261019.md)。当前页保留操作入口和最新结果，不再逐次复制长过程。
