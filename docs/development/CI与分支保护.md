# CI 与 main 分支保护

2026-11-09：用户要求同步 main 回 pc，并补齐分支保护和 Windows 桌面自动验包。

## 自动检查

[quality.yml](../../.github/workflows/quality.yml) 在推送 main/pc、向 main 提交 PR 时运行，也可手动触发。必需检查不按文件路径过滤，因此仅修改文档的 PR 同样会产生检查结果，不会因跳过工作流而一直 Pending。

- **Core and Web**：Ubuntu / Node 22，锁定依赖安装、仓库索引与依赖检查、类型检查、core/data/web 单测、网页构建和 smoke。
- **Desktop Windows**：Windows / Node 22，桌面单测、真实工作区创建/迁移/重开、工作台和插件生命周期、课程导入、编辑器关联、四骨架及返回路径；随后生成免安装 Windows 包，验证普通启动与退出、提醒注册/取消，最后校验 ZIP 并对实际解压副本重复完整成品验收。

继续复用现有隔离测试，不读取真实 data、登录态或密钥。ZIP 检查通过 [package-zip.cjs](../../desktop/tests/package-zip.cjs) 管理专用目录，校验失败与子测试异常均清理；原 [package-smoke.cjs](../../desktop/tests/package-smoke.cjs) 支持被该目录收纳。只保留无业务正文的 JSON 检查摘要，Actions artifact 保留 7 天，不上传测试截图、profile 或虚构原文，也不自动上传 Release。

关闭抓图只用于现有骨架测试，以免依赖本机参考图和 Python；并不跳过真实业务断言。系统任务注册成功不等于到点投递保证，也不覆盖长期真实使用、读屏、数字签名或安装器。

既有端到端用例使用 +08:00 的固定期望，因此 CI 设置 Asia/Shanghai，Windows 临时 runner 同步设为 China Standard Time；这只约束测试环境，不修改应用用户的系统时区，也不等于已覆盖所有时区。

## 首次实跑与启用（2026-11-09）

首次完整运行 [42612732557](https://github.com/ArrSk/JeeWeave/actions/runs/42612732557) 的两项检查均通过，随后合并 PR #2（main `fd57b48`），pc 快进同步到同一提交。此前运行依次暴露两类只影响云端的问题，已随该 PR 修复：

- 快速切换日历视图或页面后，旧断言要求恰好一个活动动画；动画可能已结束、被减少动态跳过或窗口隐藏而根本没有。现断言不累积、最终视图正确，并结算剩余动画。
- Node 22 的 `fs.cp` 在 Windows 非 ASCII 路径上会漏拷或写出乱码目录，导致打包停在 `release/几微…/data`、解压冒烟也会失败。打包与成品冒烟改用显式递归复制（[copy-tree.cjs](../../desktop/copy-tree.cjs)）。应用运行时使用 Electron 自带的 Node 24，不受影响。

main 已按下列配置启用保护，`GET /branches/main/protection` 实测与表格一致。

## main 保护配置

配置目标为 main；pc 保留日常直接推送方式。

- 要求通过 PR 合并，必需检查为 `Core and Web`、`Desktop Windows`，并要求分支与 main 保持同步。
- 管理员也受检查约束；所有代码讨论需解决。
- 禁止强制推送与删除 main；不要求线性历史，保留正常 merge commit。
- 当前由个人维护，批准人数设为 0，不要求作者无法自行满足的第二人审批，也不要求最近推送必须由他人批准。

首次实跑通过后才把同名 GitHub Actions 检查设为 required；以后检查名变更时同步更新保护设置。Pages 部署工作流只针对 main 推送及相关路径，因此不将其“发布”任务设为 PR 必需检查。

## 后续操作

桌面继续在 pc 开发。准备集成时提交 pc → main 的 PR，检查通过后选 Create a merge commit；合并后将 main 正常 merge 或快进同步回 pc，不删 pc，不用 squash/cherry-pick 复制共用提交。其他端只在相应授权范围内同步和验收。

若 CI 未通过，先查看实际失败步骤；不通过删 required check、改为 deferred 或绕过保护来伪装成功。新增第三方 PR 不使用 pull_request_target 执行其代码，不向检查注入发布凭据。
