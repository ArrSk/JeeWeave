# 文档导航：按对象与用途阅读

更新：2026-10-20。先区分当前实现与新设计，再进入工程记录。对象视图已有本地 Beta；随记与插件化底座仍是待开发设计。

## 产品对象与设计

| 要理解的问题 | 文档 | 用途 |
| --- | --- | --- |
| 几微做什么，当前哪些功能可用 | [项目介绍](product/项目介绍与规划.md)、[项目 README](../README.md) | 产品定位与实际边界 |
| 课程、这节课、作业、行动有什么区别 | [对象与事情设计](product/对象与事情设计.md) | 新设计的阅读入口，含完整例子、页面分工与文本归类 |
| 同一事情怎样关联多模块、多段时间 | [对象关联与迁移](design/对象关联与迁移.md) | 字段、身份、完成、删除和兼容契约 |
| 随手留下灵感、思考和经验，之后怎样整理 | [随记开发流程](product/随记功能与开发流程.md) | 待开发范围、草稿/关联/行动提炼与分期验收 |
| 底层如何让业务插件互通 | [插件化底座](design/插件化底座与迁移流程.md) | 宿主职责、接口/生命周期、存储兼容和渐进迁移 |

## 使用与资料

| 目的 | 文档 |
| --- | --- |
| 使用 Desktop、教务导入和备份 | [Desktop README](../desktop/README.md) |
| 使用 Web/PWA 与本地运行 | [使用说明](guides/使用说明.md)、[Web README](../web/README.md) |
| 不懂编程，想知道各部分怎样配合 | [外行人技术说明](guides/外行人技术与项目架构说明.md) |
| 迁移 data、恢复 JSON、判断哪些资料需保留 | [数据格式](../desktop/DATA_FORMAT.md)、[目录速查](开发目录说明.md) |

## 开发与实施

| 目的 | 文档 |
| --- | --- |
| 接手当前工作，查最新真实验证范围 | [HANDOVER](HANDOVER.md) |
| 比较桌面端与网页版的实际功能 | [功能对照](development/桌面与网页版功能对照.md) |
| 看当前架构与目标之间的差异 | [ARCHITECTURE](ARCHITECTURE.md) |
| 看设计取舍与历史决策 | [DECISIONS](DECISIONS.md)，对象 Beta 为 ADR-015，随记/底座规划为 ADR-016 |
| 看下一步顺序和验收 | [ROADMAP](ROADMAP.md) |
| 开发助手与技能约定 | [维护文档](AI开发维护文档.md)、[AGENTS](../AGENTS.md) |
| 查每份源码/配置/测试的职责 | [文件用途索引](文件用途索引.md) |
| 查成品和 Windows 启动排错 | [打包记录](development/桌面打包进度.md) |
| 查上一批 GitHub 提交与 Release 审查 | [提交审查稿](development/GITHUB_REVIEW.md) |

## 信息接入与研究

| 对象/目的 | 文档 | 状态 |
| --- | --- | --- |
| 学校原始课表与课程提取 | [课表信息提取](integrations/课表信息提取.md) | 南邮规则读取已实现，外部 AI 未接入 |
| 通知、邮箱、聊天等信息来源 | [来源接入计划](integrations/信息来源接入计划.md) | 规划，不能当作已连接/已授权 |
| 授权网页与插件构想 | [网页计划与插件](research/AI网页计划与插件构想.md) | 早期研究，按当前路线取舍 |
| 随记案例与 DeepSeek Harness 参考 | [案例调研](research/随记与插件架构案例.md) | 官方来源已阅读，框架未安装/未选型，区别借鉴与实现 |
| QQ/微信及历史/公告/文件 | [群消息研究](research/CHAT_MONITOR.md) | 开发暂停，代码和历史资料保留 |
| 计划/待办的日历投影 | [日历记录](research/CALENDAR.md) | 已有 Desktop 实现与边界 |
| 闹钟、iOS、移动端与商业化 | [闹钟](research/ALARM-STUDY.md)、[iOS](research/iOS上架指南.md)、[移动端](research/移动端存储与调试研究.md)、[产品研究](research/产品与商业化研究.md) | 执行前重新核实的研究 |

## 历史资料

历史记录用于追溯当时的判断和检查，不承担当前产品说明。

- [架构快照](history/ARCHITECTURE-20261019.md)、[路线快照](history/ROADMAP-20261019.md)、[交接快照](history/HANDOVER-20261019.md)：本轮整理前的长文，保留历史事实。
- [0.2.1 发布前交接](history/HANDOVER-20261020.md)：对象、课程移植、开发者清空和随记/底座规划的详细验证历史。
- [阶段进度](history/2026-10-16-阶段进度.md)、[环境排错](history/ENVIRONMENT.md)、[旧界面版本](history/DESIGN-VERSIONS.md)：更早的阶段资料。

维护规则：产品概念放 product，字段和兼容约束放 design，当前代码边界放 ARCHITECTURE，实施顺序放 ROADMAP，本轮结果放 HANDOVER。其他文档链接到相应来源，不再每次复制一套产品介绍。
