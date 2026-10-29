# 几微 · 当前接手说明

更新：2026-10-29。主线 Desktop，新增复用其业务的 Android Beta；Windows 0.3.0 已完成发布，手机 APK 仅本地生成、未上传。0.2.1 保留为回退，不能用旧 exe 体验新版功能。

## 2026-10-29：Windows 0.4.0发布

用户要求核对GitHub并补发最新安装包。官方API确认最新公开包仍为v0.3.0（10月23日），不含新增AI/提醒；因此根版本升级0.4.0，作者ArrSk，重打Windows包并准备发布同名tag/Release。ROOT README更新最新下载入口与范围：Windows包含Flash-1017助手、草稿与独立提醒插件，手机APK不更新；密钥和原生提醒不包含在.jiwei迁移包中。

新成品两次无调试参数启动/完全退出通过。首次成品CDP检查10秒等待超时、自动清理副本；为超时补充调用表达式定位信息后，同一个原包复查通过：示例、采集、插件开关、提醒注册/取消、目录移动持久化、窗口退出全部进程。运行源码指纹与0.4.0候选包一致，data空白；ZIP与SHA256重新生成。打包残留、测试工作区/profile/截图/OS任务清理。未因版本更新再次跑整仓行为测试，沿用此前207项桌面单测和项目检查结果。

配套版本提交保留在main共同历史，web/pc/mobile以同一提交快进同步。GitHub发布采用先草稿、上传Windows ZIP/SHA256及BUILD-INFO、核对尺寸与摘要后公开并标为latest的流程；不上传APK或个人资料。具体发布结果以GitHub v0.4.0及本地检查摘要为准。

## 2026-10-29：三端分支和ArrSk署名

用户授权源码提交GitHub并以web/pc/mobile划分三端。保留main作共用/验收集成基线，三端从同一完整源码提交建立，不删除目录、不创建孤立历史；shared和手机复用的desktop业务使用同一Git对象，后续以merge同步共用提交，避免反复cherry-pick。根README和分支协作文档说明操作；本地后续桌面开发停留pc。Pages保留main发布并增加路径过滤，避免纯桌面/手机合入触发网页部署。

package.json作者改ArrSk，本仓库后续Git提交配置同名，使用GitHub公开noreply身份；LICENSE原已为ArrSk。历史提交和第三方研究引用不改写。所有此前已验证的本地源码纳入共同基线；个人资料、缓存、签名、SDK及本地exe/APK继续被忽略。本轮只提交源码和分支，不上传Release成品。检查以索引、忽略项、提交内容和远程引用为主，不重复上一轮全量功能测试。

## 2026-10-29：封装前自查、精简与仅本地Windows包

自查修正提醒平台返回ok:false时助手仍把操作当成功的问题：公共提醒服务统一抛出平台失败，不发committed事件，追加真实失败回归。移除合并面板遗留的details/ul中转DOM和无效侧栏/旧列表CSS，既有界面结构与视觉保持。成品smoke补实际助手/提醒开关、默认Flash、定时任务注册取消；finally在成功或失败后停止限定测试目录内的进程，取消测试OS任务，删除应用副本/profile/资料，仅保留不含业务数据的摘要。打包命令显式--publish never，并在ZIP生成前自动执行成品检查。

207项Desktop单测、五个包类型检查、core/data/web单测、Web构建和24项构建smoke全部通过；助手真实IPC隔离UI及窗口排版通过。成品原路径普通启动/完全退出两次通过；成品副本验证示例、文件采集、插件、提醒、文件夹移动后持久化、叉号退出全部进程。临时测试工作区/截图/OS任务自动删除；另清理三处Vitest缓存、旧设计检查输出和原生成品探测日志，保留检查摘要。原desktop/data、旧release、手动资料、工具与签名未删除。

仅本地生成：desktop/release/几微-0.3.0-Windows-20261029-090731/几微.exe及同名ZIP、SHA256、使用说明和构建指纹。ZIP校验值与80项运行白名单源码指纹核对一致，分发data为空，不含私人记录/密钥。未提交、推送、上传Release或部署；源版本号0.3.0保持，以时间戳和指纹区分此前已发布包。后续仍需用户真实API、教务网络和日常提醒体验，不把受控回复检查当成真实模型所有复杂要求均可完成。

## 2026-10-29：Flash-1017默认模型及助手/提醒独立插件

按用户指令将默认文本改为DeepSeek-V4.1-Flash-1017；Context7先resolve/query核对API名，官方当前定价页再次核对1017版本，实际发送deepseek-flash，不发送flash-1017字面别名。配置迁移标记3，将此前默认Pro/legacy映射为Flash，保留密钥、自定义模型及之后主动保存的选择。未发付费请求，未改手机功能/打包/发布。

新增assistant-plugin、reminder-plugin，各自注册manifest/service/command/UI effect，只依赖workspace；原prototype-modules只接线，动作调度/目录/本地索引移到assistant-plugin。reminder-ui/core/platform与windows-shell抽出，主进程独立创建两平台实例。插件管理两个开关默认开；desktopOnly元数据在手机宿主隐藏，不迁移手机版。停用会撤销服务/命令/页面，卸载DOM、观察器和计时器；停用助手中止API，主进程拒绝直接IPC和过期结果。停用提醒取消OS任务，保留reminders.json；重开恢复未来/每日任务，不补发过期单次。worker投递前按workspace开关保护，排队写入执行前再检查。assistant-secrets.bin及workspace版本/目录保持不变。

23项助手/提醒单测、1项定向运行时测试及真实IPC/UI隔离链路通过，含挂起请求实际abort、两个独立开关、页面卸载/重开无重复、密钥/提醒保留和每周计划关联。只有本功能及必要入口检查，无全仓行为回归；插件页截图沿用既有样式确认后删除。临时profile、测试数据、截图及OS任务自动清理。新运行文件加入打包白名单、用途索引；旧运行进程需要完全退出重开才生效。

## 2026-10-29：原句草稿失败的实际复现与格式纠正

用户原句：“创建新的提高身体素质对象，关联所有篮球课与锻炼笔记，拟在事项中加入每周锻炼计划”。隔离复制workspace、加密配置和profile/Local State，只生成、不确认。首次脚本误用Electron包路径及未复制必要加密上下文，未成功请求；修正后真实请求复现：实际模型仍为deepseek-v4-flash，返回7步，将objects.save/items.save等直接作为action，并生成未注册的notes.capture。旧代码把任一步校验错误吞成通用提示，不能据此归咎用户表达。原失败回复未持久保存，本次为同句重新请求的证据。

配置迁移标记改为2，将版本1遗留Flash映射为Pro，仍保留密钥并尊重新版本后明确保存的模型选择。解析兼容JSON代码块、steps包装、合规功能名作为action及字段/参数对象，之后仍严格校验注册命令、引用、上限；不会把未注册命令转换为可执行操作。默认普通请求2048输出；格式/长度校验失败时带具体原因自动纠正一次，纠正上限3072，两次共用60秒超时；HTTP/鉴权失败不自动重试。汇总两次用量，最终失败显示具体原因而非泛化“格式不完整”。补齐每周计划date/weekdays/until/timed参数说明和有标注的起始日期/星期默认值。

19项助手定向单测通过；隔离真实IPC/UI使用受控模型回复，确认新建“提高身体素质”对象、关联篮球课程/锻炼笔记、保存weekly计划全部成功。随后真实API确认实际使用deepseek-v4-pro，原句第一轮即返回5步可接收草稿（新对象、weekly计划及三个只读查询），无格式纠正/原文降级，约2479总token。该次真实模型草稿未确认，不证明查询后的关联已自动完成；当前仍是单次规划/本地执行，未增加查询后自动再规划。副本/profile/加密配置/截图及测试OS任务均自动删除，真实资料未写入。旧桌面进程必须完全退出重开才能载入主进程修正；未打包/发布/改手机。

## 2026-10-29：Pro模型、推断补全与多步草稿

默认文本模型改为deepseek-v4-pro。读取旧版默认Flash/legacy配置时映射到Pro并保留密钥，设置保存版本标记，后续明确保存的Flash/自定义模型不再次覆盖；不读取或记录真实密钥。Context7完成resolve，但query传输失败；改查DeepSeek官方当前模型、价格及JSON/非思考参数。输出512提升2048，保持单次请求、45秒超时及128KiB限制；独立视觉配置保留。未请求真实付费API，模型理解质量尚待用户用自己的密钥体验。

assistant-core增加draft/assumptions/steps及真实结果引用@0.id/@0.kind，最多8步，不执行模型代码。旧ask、格式失败及网络/密钥失败降级为保留原输入的本地笔记草稿并明确说明；事件缺时长先拟1小时，模糊晚些按当天约两小时后、已过明确时刻建议明天同刻，均标明推测。提醒date/time由本地按北京时间换算，减少模型心算毫秒。模型可按公开命令先建缺失对象/课表/课程再关联事项；无排课依据时先建课程对象，不编造教务安排。上下文增加相关时间、课程字段、对象目的和当前课表配置，最多8条相关记录，优先对象/课程及高数/线代等常见简称匹配；不发送笔记全文。

UI沿用现有桌面风格，编辑草稿字段后再确认；逐项执行、进度保留和失败续做，当前面板内不会重复成功项；不是跨插件原子事务或跨重启执行队列。课程create返回字符串编号，执行器适配为引用结果；事项/笔记适配返回创建记录。查询仍为本地结果，不自动多轮上传。15项定向单测和隔离真实IPC/UI链路（用模拟API回复，不产生模型费用）覆盖草稿字段修改、对象+作业关联、新课表/课程及归属、缺密钥仍有草稿、原提醒和加密链路；虚构工作区/profile/截图与OS任务自动清理。截图核对现有排版；检测只提示已有侧栏和受控隐藏图片预览。未改手机/网页，未打包或提交。

## 2026-10-29：统一提醒页、定时/静默/长期类型

按用户要求将提醒从特殊管理弹窗改成普通功能页，复用host页面导航、侧栏选中、页面隐藏/切换动画、面板/筛选/列表样式；新增仍为编辑弹窗。通过workspace拥有的页注册接入reminders，其他页面进入时hideBaseViews隐藏提醒，避免残留。API配置与全局助手不变。

新增mode:timed/silent/attention、date及archived字段，旧记录无mode按timed兼容。定时仍注册OS任务；静默只按日期展示，长期无时间并持续展示；后两者从不注册/修复/取消OS任务。reminder-state仅允许后两类标记已处理或恢复；所有记录仍在原data/reminders.json，不生成每日副本。今天按三类分组并可收起，已处理隐藏，可在提醒页筛选恢复。全局助手协议及reminders公共命令支持三类，“长期注意”和“今天静默提示”本地识别。

9项定向单测通过（含静默/长期不调用调度器、处理恢复、跨日展示），真实IPC隔离检查通过三类型、今天出现/处理消失、页面导航与类型字段显示。两轮有界截图检查修正侧栏SVG尺寸、编辑器默认details文字及操作按钮排列。测试任务/profile/截图自动清理；不重复全仓回归。没有付费API、未改手机、未打包/提交。现有应用需重新打开源码体验。

## 2026-10-29：提醒独立/进入今天，全局助手与集中API配置

用户要求提醒支持几分钟后或今日稍晚、独立入口/跨插件，今天可见；AI针对全局，API和模型统一进设置。保留桌面主线。本轮把提醒表单/列表移到独立dialog和侧栏入口；今天追加提醒分区，用remindersForDay筛选当地日期，包含每日计划、排除尚未开始的每日计划及明日单次，展示投递状态并15秒刷新。支持中文/数字相对时间、今天HH:mm，含糊“晚些”追问；有5/15/30分钟快捷与今天时刻。API字段移动到settingsPanel的AI与模型section，助手只跳转，状态反馈分开。

全局助手基于host所有已注册公共命令动态目录；新增各业务服务的有限公共方法包装（不暴露存储/事务/回调），覆盖事项、课程、对象、笔记、日历、网页、查找、工作区导出及各功能入口，补插件开关/主题切换。注册时过滤实际存在的方法，停用时scope清理；执行校验命令存在，仍过host/原服务守卫。参数和目标不明先询问；删除/变更类明确预览并额外确认。保留旧简易意图兼容。对当前输入本地匹配最多8条title/ref索引，连同紧凑命令签名发送，不上传正文或完整数据；输出上限保持512。不声称任意私有函数可调用。

7项定向测试通过，含中文相对时间、含糊时间追问、日期筛选和全局API返回；真实IPC隔离检查通过独立提醒按钮、今天展示、设置字段移出助手、全局命令读取与未注册命令拒绝。截图一批核对今天和设置布局后删除，设置保存按钮尺寸/反馈串页一起修正。测试任务/profile/截图自动清理；没有付费API请求。现有运行桌面需要重启体验，未改手机/打包/提交。

## 2026-10-29：电脑端智能输入/API/Windows提醒

按用户明确要求先完成电脑端并提供体验，本轮未写mobile文件。新增Desktop自有assistant-core/UI/platform与reminder-task.ps1；侧栏“帮我安排”打开同主题输入面板，文字、Windows听写、图片缩略图/移除、操作预览确认、API设置和提醒表单。DeepSeek文本与独立视觉配置分流；主进程重建限长协议、单次HTTPS请求、45秒超时/128KiB响应上限、禁止重定向、回复512token/禁用文本推理。整个工作区不上传。配置用safeStorage加密在同一data下，异步解密按result字段读取，查询脱敏；只允许本地主窗口主frame IPC，学校页面无接口。

意图只允许新增事项、同日区间事件、笔记、打开指定页面与提醒；简单倒计时本地解析。插件items/journal完成写入，禁用守卫保留；拒绝不支持/删除请求及覆盖笔记草稿。图片系统窗口限12MiB，压缩JPEG75/最长边1024且上限700KB。语音请求Win+H填入当前文本框，需要Windows识别服务，未擅自开启麦克风权限。

Windows提醒为当前用户InteractiveToken、LeastPrivilege任务，无需常驻应用；任务到期按data/reminders.json读记录并显示30秒自动关闭窗口/声音。每日按当地日历触发，支持取消和重新注册；注册失败回滚文件，不假报成功。仅对PowerShell子进程设置执行策略，不修改全局策略。任务/worker/资料路径需稳定，提醒与密钥暂不随.jiwei工作区迁移。两次实际OS检查曾发现PS5单元素JSON数组不枚举、Electron异步解密返回对象，均已修正；图片测试fixture损坏改为nativeImage生成。

5项主进程定向单测通过；真实主进程/预载IPC检查通过加密、图片、零token提醒创建取消、事项/事件/笔记写入及950/1280宽度，无全仓重测。截图一次检查后清理。Context7连接失败，改查Electron safeStorage、Microsoft任务计划/键盘和DeepSeek官方文档；Impeccable用于现有桌面布局。真实API密钥未配置，没有发付费请求；语音识别效果仍需用户体验。实际Windows任务已运行并写入投递回执，等待30秒窗口周期后删除任务和目录；每日任务实际注册/取消通过。UI截图检查布局后清理；检测提示隐藏的待选图片无初始src及现有侧栏样式，按受控预览和保留布局处理。桌面完整链路最终通过，测试包装器修正为非TTY查看模式自动退出清理。已使用原desktop/data打开最新版桌面端，未注入测试资料。测试源码和摘要保留，虚构数据/profile/OS任务清理；手动体验使用原desktop/data，不注入测试数据。未打包发布。

## 2026-10-29：开发顺序改为电脑端验收后移植

用户明确要求：以后先开发电脑端，用户认为没有问题后再移植。此约定已写入AGENTS，覆盖此前手机优先的近期排序。现有手机智能输入/API/提醒代码保留，但暂停继续扩展；不把其编译或模拟检查当成桌面交付。下一轮功能开发应先补齐Windows桌面统一文字/语音/图片输入、DeepSeek/视觉API配置与请求、自然语言调用入口、临时/每日提醒及Windows后台调度，桌面体验获用户明确确认后再安排手机移植。当前这一步仅更新顺序和规划，没有声称桌面功能已完成，也没有打包或发布。

## 2026-10-29：手机智能输入与原生提醒源码

用户选择DeepSeek文本API、另配视觉模型。新增assistant-core协议/白名单、本地倒计时与assistant-ui统一输入面板；移动桥assistantRequest调用NativeAssistant，HTTPS单次请求、15/30秒超时、不跟随重定向、响应128KiB上限、输出512token；只发送当前输入，图片最长边1024/JPEG75。系统RecognizerIntent语音和图片选择器接入；API配置用Android Keystore AES-GCM加密，配置查询不返回密钥。CSP与学校登录隔离不放宽。桌面宿主增加小型适配入口，复用items/journal插件服务完成创建与笔记草稿发布，关闭模块守卫保留。

支持事项、同日事件时间段、笔记、打开页面及提醒；含糊/删除/批量要求追问，模型输出绝不作为代码执行。所有写入先预览确认。原生ReminderReceiver保存data/reminders.json，AlarmManager单次/每日排程，系统通知与精确提醒权限显式申请，短时无准点权限拒绝；每日允许非精确并提示延迟。重启/升级/时间改变恢复，重复按本地钟点计算。原生提醒和API配置目前不随工作区迁移；真实投递及厂商省电行为待验。

Context7先resolve再query核对DeepSeek当前JSON输出、thinking禁用、模型名（本次返回deepseek-flash）；Android闹钟及系统语音查官方文档。Impeccable用于现有手机界面的局部扩展，不迁移技术栈。没有真实API密钥，联网费用/真实模型输出、设备语音图片与通知投递均未实测，不能称全部验收。当前beta.3 APK未覆盖，本轮未授权打包或发布。3项意图测试及隔离UI中的事项/事件区间/笔记发布链路通过；Android全量Java源码javac编译通过（仅旧API警告）。截图在测试结束后自动删除，未作为真机视觉验收；真实设备体验仍待做。

## 2026-10-28：beta.3 APK 与测试数据自动清理

用户明确授权将最新版手机端打包APK，并要求以后测试结束自动删除测试数据。生成 mobile/release/JeeWeave-0.3.0-mobile-beta.3.apk（263287字节）与同名.sha256；versionCode3，包名cn.jeeweave.mobile不变，沿用本地Beta签名，新旧beta.2/beta.3证书SHA-256一致。v2/v3签名验证通过；62项资产逐文件与当前生成资源SHA-256一致，无data/profile/测试内容。APK SHA-256：cc07effa5564f9df91547d01db22e1fe3a9cfa975e0c9aac7af5bc0c7f203415。旧发布包、真实资料及密钥保留。未提交或上传GitHub、未访问USB手机；真机安装、系统返回/键盘及真实学校账号仍待体验。

UI测试改用 mobile/test-ui.mjs 启动子Electron，在专用随机目录运行，等待进程退出后删除工作区、profile和截图；成功与缺少fixture导致的失败路径均确认清理。原生附件检查用 -WithDesktopRoundtrip 将native→Desktop→native放在一次临时目录流程内，finally删除附件样例和classes。六份Desktop文件测试增加after清理其创建的临时目录。打包build目录同样finally清理；签名工具/缓存、release成品和摘要日志保留。AGENTS记录长期清理约定，mobile/README更新正确命令与版本。

集中发布前检查：5项类型检查、core81/data71/Web17/Desktop182单测、4项手机bridge/静态预览测试、1项Desktop附件兼容测试、JVM原生附件与返回检查、手机320/390/900像素及短屏交互通过；Web构建和24项smoke通过。仅清理机制调整后重跑Desktop182项及UI失败清理，没有无理由再跑全仓。证据摘要 mobile/.cache/release-beta3-*.log；331维护文件/691本地链接和diff格式检查通过。Context7查询Android签名/版本返回偏泛，具体版本升级与apksigner参数转官方文档核对，未声称Context7命中具体更新接口。

按核实的专用目录/测试前缀清除历史与本轮684个测试目录：mobile/.cache/verification、旧native-files-test/classes、旧自动示例preview/profile-数字目录、desktop/.cache/verification/reset-unit目录及系统Temp下本仓测试使用的明确前缀。每个绝对路径均验证在对应缓存或Temp父目录下；当前mobile/.cache/test-runs为空、build目录不存在。mobile/.cache/preview/browser-profile（手动预览）、desktop/data、mobile/.signing和toolchain未清空。旧日志里的截图与工作区路径可能已删除，是历史证据而非当前文件清单。

## 2026-10-27：手机 UI 减字与双击预览

用户要求先完成UI收敛，不进入APK打包。使用 Impeccable distill/Android 指引与 ui-ux-pro-max 图标可访问性建议，保留统一SVG系统。各页intro说明、设置解释、导入注意事项改为信息图标展开；主按钮仅显示新增/书写图标，保留aria-label/title。导入简化为登录/查询/导入，原抓取结果、错误和业务数据不隐藏；课表设置标签采用图标加短标签，关闭、导入导出、对象关联/返回原记录等统一48px触控区。保存/删除/确认保留明确文字。图标布局增加明确hidden守卫，开发者模式关闭时示例仍不可见。

新增 mobile/启动手机预览.cmd、preview.mjs、preview-window.cjs：双击启动手机尺寸窗口与固定4175局域网静态服务；手机同一Wi-Fi浏览器直开终端显示的地址，无PowerShell、模拟器或USB要求。资料分别存在电脑隔离profile/手机浏览器站点存储，重开保留、不自动同步、不读取desktop/data。服务只读取生成资产，拒绝写入方法、越界/隐藏路径，不提供工作区接口。关闭窗口由Electron退出触发Node服务关闭；重复运行聚焦现有窗口。浏览器预览不能验证Android教务登录、系统文件窗口、返回或后台，导入导出仍明确提示需APK。网络隔离时README说明同网/私人防火墙/手机热点处理，不自动改系统设置。

Context7按先resolve再query核对Node24 HTTP生命周期与Electron隔离窗口。LAN HTTP预览缺少crypto.randomUUID时仅在浏览器适配层使用getRandomValues生成UUID，以保持新增阶段等操作可用，不改Desktop业务模型。隔离mobile/ui-test.cjs在本机真实LAN HTTP地址通过原导航/课表导入样例、图标命名与开发模式隐藏、笔记保存重开、320/390/900像素和短屏保存检查；这是电脑HTTP实测，不是手机连接已验。4项bridge/预览服务测试通过，含静态资源、禁写与越界请求。Impeccable detect只提示保留的Android Roboto系统字体。日志 mobile/.cache/ui-compact-lan.log、ui-compact-confirm.log；首轮/确认截图仍在mobile/.cache/verification，最后导入减字补丁以交互检查确认。双击CMD启动已实际加载手机页面；通过窗口自身close事件验证Electron退出后4175服务停止。启动环境曾让默认窗口保持隐藏，已改为loadURL完成后显式show/focus；未据窗口句柄缺失强杀其他进程。330项维护文件/690条本地链接及语法、diff检查通过。未执行无关全仓回归、未打包或提交。

## 2026-10-27：手机导航与操作层级优化

按用户要求参考 Tasks.org 与 Notesnook 的公开项目/使用文档，保留现有配色、SVG及原业务编辑器。使用新安装的 Mermaid 技能，在 mobile/README.md 记录导航与创建关系；Impeccable context、原生适配指引与两轮有界视觉检查辅助实现，ui-ux-pro-max 检索图标命名/可访问性建议。没有复制外部项目源码或增加生产依赖。

底栏统一为今天/课表/事项/笔记，独立的带文字主按钮负责按页新增；手机顶栏重复新增收起。模块关闭、抽屉、编辑器或软键盘打开时对应入口收起；宽屏保留原页面操作。课表周导航居中与设置同排，摘要独立一行，整周/单日图标增加短标签，教室数字保持成组；单日继续展示完整信息。笔记正文支持点击/Enter/空格编辑，归档/回收站保留横排文字菜单，次要操作收起。未更改 Desktop/Web 业务、数据模型或 APK 版本。

隔离 mobile/ui-test.cjs 检查通过：导航不误新建、主按钮屏内命中/模块隐藏/弹窗隐藏、重复新增收起、笔记保存重载与正文点击/键盘编辑、原课表抓取样例单双周导入、320/390/900像素与短屏保存。仅覆盖本轮及必要关联入口，未运行全仓库回归。日志 mobile/.cache/ui-improvement-final.log；截图 mobile/.cache/verification；detect 仅提示保留的 Android Roboto 通用字体。327项维护文件/683条本地链接审计及diff格式检查通过。第一次新增检查脚本有引号错误，修正后通过；此前失败进程已结束。

电脑预览使用 mobile/.cache/preview 独立示例profile，不读取 desktop/data；不把电脑视口检查当成 Android 真机验收。尚未生成新APK/Windows包、提交或推送；系统键盘、返回、学校真实登录继续待设备验收。

## 2026-10-27：复核后删除本次本地备份

用户明确要求确认无误后删除备份。对照改名前清单检查1589项：1572项完全一致、16项为本轮改名的预期修改；1条编辑器临时引用已自动过期，对应Git对象仍存在。没有缺失项目文件或未解释改动，Git基线相同；数据、签名及原有发布成品保留。327项维护文件/683条本地链接、24项smoke、Electron44.7.0版本检查及diff检查通过，未扩展为全业务回归。

仅删除 E:\CodeAndProj\JeeWeave-backups\JeeWeave-20261027-101824（ZIP、清理清单、校验与恢复说明）；空的外层JeeWeave-backups目录一并移除。desktop/backups、web/backups、desktop/data、mobile/.signing及已发布成品未删除。下方“清理测试产物并做本地备份”为当时的历史记录，其外部备份路径现在已不存在。没有提交或推送。

## 2026-10-27：目录与仓库统一为 JeeWeave

用户完成本地目录和远端仓库更名，本轮补齐后续引用。当前工作目录 E:\CodeAndProj\JeeWeave，origin 为 https://github.com/ArrSk/JeeWeave.git；GitHub 插件读取确认公开仓库 ArrSk/JeeWeave，主分支 main。README、Web/Desktop说明、使用与iOS指南、Pages子路径注释、维护脚本及根package仓库/主页元数据已更新。当前Pages地址 https://arrsk.github.io/JeeWeave/ 无需登录GET实测200；这不代表本地未提交功能已上线。历史记录、旧备份及旧发布附件名保留；数据库jiwei、旧存储键、.jiwei格式和应用ID未改。

Windows node_modules联接点、pnpm模块元数据和命令入口原先保存旧绝对路径，已按原pnpm11.25.0与锁文件重建。首次非交互安装无TTY退出，改非交互后离线缓存缺包，随后复用401项并下载锁定的208项，未升级依赖。安装时跳过生命周期脚本，显式重建已有allowBuilds允许的esbuild；Electron44.7.0原运行文件事先保留并原样恢复，避免重新下载二进制。模拟器AVD已在上一轮清理，没有旧AVD绝对路径需迁移；SDK/JDK/系统镜像保留。

新目录下Electron版本命令、Web构建、24项smoke、维护脚本语法检查通过；Web仅有构建块体积提示，未重跑全仓库业务测试。GitHub元信息脚本只执行dry-run，save脚本未执行。依赖修复的临时运行副本已清除；327项维护文件和683条本地链接审计通过，锁文件、工作区、签名及数据库配置与改名前备份的SHA-256一致，依赖联接点没有指向旧项目目录。没有更改Git作者身份、提交/推送、触发部署或生成APK/Windows包。旧PWA主屏幕入口需从新网址重新添加，先导出数据，不清除站点资料。

## 2026-10-27：清理测试产物并做本地备份

按用户要求清理临时测试profile、模拟器验证AVD磁盘、截图/日志、原生测试构建、Web/Vite缓存、手机生成资产以及已解压工具的下载压缩包，共 3172 个文件，逻辑大小 13.36 GiB。保留全部测试源码/fixtures、desktop/data、旧备份、已生成发布包、Android签名及已安装SDK/JDK/系统镜像，未清空真实应用数据。此前截图与本地验证日志已按本次清理要求移除；历史检查文字仍为历史记录，不代表本轮复验。

清理明细与备份清单在 `E:\CodeAndProj\JeeWeave-backups\JeeWeave-20261027-101824`，保留未提交/未跟踪源码和Git历史，依赖与工具不放入归档；通过锁文件恢复依赖。备份是否完成及逐文件校验结果以该目录的manifest.json、SHA256SUMS.txt为准。此轮只做文件完整性检查，不重跑业务测试、不打包新APK、不提交/推送，也未重命名项目或远端。

## 当前状态与入口

- 开发入口：desktop/debug.cmd；Electron + HTML/CSS/ES Modules，不依赖 Web 开发服务。真实数据在 desktop/data，测试必须指定隔离目录。
- 现有课程/导入、事项/日历、对象 Beta、笔记、网页采集和聚合页均接入可信内置插件底座。近期 1—5 已本地实现；新增 Android Beta 本地 APK，但公开网页在线抓取及真机验收待做。第三方插件、同步、记账与原生提醒仍未完成，群消息暂停。
- 今天主页仅列明确包含当天的事项，其余通过「其他待处理事项」弹窗查看；分组和逐条详情可折叠，同次运行保留状态。
- 核心数据仍为同一 data/workspace.json，schemaVersion 1；旧 ID、两份事项集合、未知字段与关闭模块的数据保留。两端备份不能互相恢复。
- 开发规范只读 [AGENTS](../AGENTS.md)；实现边界见 [架构](ARCHITECTURE.md)，接口入口见 [内置插件接口](development/内置插件接口.md)，后续范围见 [路线图](ROADMAP.md)。

## 2026-10-26：手机课表、操作密度与 VPN404

后续按用户反馈增加统一SVG图标按钮：课表设置/整周/单日/更多，事项、日历和对象新增、笔记新建/编辑/导出/清筛选等；22px图形、48px点击区，保留aria-label/title和原按钮事件，表单保存和不易辨认的低频操作仍保留文字。课表网格与外框留12px横向间距，周网格独立圆角内框、卡片内边距增加，单日时间轴再留8px；周卡只省去重复“教室：”前缀，完整字段仍在单日/编辑及无障碍说明中。手机隔离交互与间距、图标命名/命中尺寸检查通过，更新电脑预览；未生成APK。

用户要求对照Web手机适配优化手机端、查明部分设备教务404，完成后先电脑体验，再决定是否打包。仅改mobile源码；未打包APK、未改Desktop/Web业务或数据格式。原固定WebVPN深层user-login地址无Cookie GET实测404，南邮VPN根首页GET200（curl正常用户环境；沙箱首次DNS失败后同一请求重试）。确认旧入口本身已不可用，不推断所有设备均为同一原因；学校账号登录/跳转尚未实测。默认入口改根首页，兼容旧固定入口；PortalPage新增主页面HTTP错误提示，onPageFinished不覆盖错误，抓取拒绝错误页，更多菜单提供VPN首页/后退/刷新/可选电脑版，保留会话与TLS校验。使用Context7检索Android API未命中具体方法，转官方WebViewClient文档核对；不是已成功查询具体接口的Context7结论。

手机课程默认整周、网格适配屏宽，星期进入单日课程列表，移除日视图空白节次；原课程按钮/字段/编辑/调整委托继续生效。添加/跳周/示例置于更多，原周导航保留；水平手势切周或日期，垂直仍滚动。事项点正文或键盘进入编辑，删除在编辑器；笔记/对象次要操作集中到详情菜单。增加各页边距、课程设置标签间距、收起纯切换提示；跨800像素切换重新构建原网格或单日列表。数据及开发模式守卫保持原契约。

复用mobile/ui-test.cjs隔离示例：课表整周屏宽、前后周、星期/课程点击、日期滑动、菜单开合、事项正文编辑、笔记次要菜单、320/390/900像素及短屏保存检查通过，两轮有界截图。证据mobile/.cache/verification/mobile-refine-confirm.log；Java原生源码单独javac编译通过，未执行APK构建。Impeccable context/detect执行，检测仅提示Roboto通用字体，按Android系统字体保留；没有改栈。真实手机返回、手势/键盘及SSO仍待验，电脑预览不作为原生验收。按用户要求提供电脑手机布局预览，使用独立示例profile，不读取desktop/data。

## 2026-10-25：手机各功能 UI 适配与模拟器入口

启动入口后续修正：用户终端没有 pwsh，开发环境里的命令实际来自 Codex 私有运行时；Windows PowerShell 5.1 再试显示脚本未签名，未修改执行策略。启动模拟器.cmd 改为直接调用官方 emulator.exe，独立完成加速检测/AVD初始化/日志，不依赖任何 PowerShell；中文说明同步更新。cmd -CheckOnly 实际执行到 emulator，仍返回加速状态6并停止，无模拟器窗口或系统修改。日常启动不再要求安装 PowerShell 7；构建与工具下载仍为单独开发命令。

本次仅针对 mobile，不改桌面样式或业务模型。新增 mobile-layout.mjs 展示适配层：事项目标/标准/对象、笔记日期/用途/标题/标签和课程配色归入可展开选项，已有内容编辑时自动展开；原字段ID与事件契约保留。编辑器固定标题/保存栏，中间单独滚动，短屏仍可点保存；课程默认日视图并保留本次运行的周视图选择。事项筛选横向排列，笔记/日历次要筛选和网页使用说明可折叠，对象详情按分组展开，设置主题整行显示。修复课程视图切换提示挡住底部常用入口。原生学校工具栏48dp触控区、跟随系统字号，主页面按键盘状态隐藏底栏；这些原生行为尚未在设备实测。

复用隔离 mobile/ui-test.cjs，有界截图核对，验证320/390/900像素、390×480短屏、保存按钮实际命中、可选字段保存后重编、笔记筛选清除和对象展开；原导航/数据/模拟课表导入链路通过，日志 mobile/.cache/verification/mobile-adapt-behavior.log。JS语法检查通过；本次不重跑无关全仓库检查。独立“几微验证”测试APK重新编译、v2/v3签名及62项资产逐文件核对通过，路径 mobile/.cache/verification/JeeWeave-native-testbed.apk；release内原beta.2未覆盖。没有提交或上传。

新增启动模拟器.cmd/start-emulator.ps1 与 guides/模拟器启动.md：先检测硬件加速，通过后只启动项目 jeeweave-phone AVD，保留模拟器资料并输出日志，用户拖入测试APK安装。CheckOnly实测仍返回加速状态6，未启动Android；需用户开启Windows虚拟机监控程序平台并重启后再试。没有自动修改Windows功能/BIOS/驱动，没有访问USB手机。此前USB读取请求被拒绝，授权边界仍保留；系统返回、软键盘、文件窗口和真实学校登录依旧待设备验收。Context7查询Android官方加速与WebView资料；Impeccable上下文与截图流程用于现有风格内的适配。

## 2026-10-25：Android 近期 1—4 / beta.2

用户要求完成真机/模拟器验证、手机高频操作、带附件双向迁移和原生教务抓取。第2—4项已完成代码与本地验证，第1项仍待设备授权验收，不能报告全部完成。常用栏新增今天、课表、新增事项、记一笔，沿用模块守卫；修正旧 body grid 使底栏落到屏幕外的问题，补屏内命中断言。截图两轮有界检查，保留 Android 系统字体。

WorkspaceFiles 原生实现 Desktop transfer/packageVersion1 附件契约：路径/保留文件名/重复大小写/Base64/SHA256/大小检查，独立 captures/migrations 目录，最后提交工作区，失败和 revision 冲突撤回新附件，旧资料不改。JSON兼容，导出带附件 .jiwei，时间统一 ISO。新增 JVM 实际文件测试（org.json仅测试依赖，不打进APK）；覆盖真实附件、空文件、哈希与路径、提交失败/冲突回滚、Android导出→Desktop恢复/导出→Android恢复，ID、未知扩展和原文保留。手机 JS/兼容共4项单测通过，UI验证底栏可见命中、新建、笔记保存/重开、搜索、单双周/合并节次抓取到导入及320/390/900像素。没有逐功能重跑无关全仓库检查。

PortalPage 独立承载 HTTPS WebVPN 及弹窗 WebView，无本地原生桥，证书错误取消，登录/验证码仍手动。顶部抓取回到原导入入口，复用 course-page 生成的DOM读取脚本与原课程解析。主工作区 CSP/网络隔离保留，APK仅为登录页新增Internet权限；调试原文用纯文本，不在带桥的主页面渲染远程HTML。关闭时撤销超时回调，避免退出后写入已销毁WebView。公开网页在线抓取仍未移植；Android无Electron隔离世界和跨源frame接口，真实学校登录与页面兼容仍待验。

beta.2 versionCode2，同一Beta签名；本地 mobile/release/JeeWeave-0.3.0-mobile-beta.2.apk。正式包与独立 cn.jeeweave.mobile.testbed“几微验证”均编译通过；独立 Instrumentation 测试APK编译通过，未在设备执行。包内61项资产与源文件匹配、v2/v3签名通过。未提交/上传。

设备验证受阻：本机SDK/JDK之外新增官方 emulator37.3.5、adb37.0.1及Android15镜像，清单哈希核对。Windows加速不可用；软件模式先遇本机 .android/Temp 权限，已为工具建独立缓存临时目录；仍未成功启动，Netsim失败/软件模式退出日志保留，不反复重试同一失败方式。用户表示有手机并可连接，已说明使用独立验证副本；随后读取USB设备状态的执行请求返回 rejected by user，已停止访问手机，未安装任何手机应用。继续真机需用户重新明确授权。键盘、系统返回、系统文件窗口、后台回收及真实学校账号均不能写作已验收。工具日志/JVM/UI证据见 mobile/.cache/verification；Context7及Android官方参考核对了WebView/模拟器/Instrumentation接口。

## 2026-10-25：Android 离线 Beta

用户要求按 DeepSeek 手机布局将 Desktop 改为可安装的非苹果手机版，并指定通用设备而非某一品牌。新增 [mobile](../mobile/README.md)：保留桌面版，构建复用同一可信业务插件和数据模型；Android Java Activity + 本机系统 WebView 离线包，无新增 npm 框架依赖，不要求 Google 服务。轻顶栏、抽屉目录、搜索、手机全屏编辑、宽屏侧栏，保留所有示例开发模式守卫；设置文案和模块说明按手机实际能力调整。Desktop 只新增课程/笔记导出的可选平台文件钩子，原默认 Blob 导出保留。

原生工作区在应用私有 files/data/workspace.json，完整 JS 格式校验后同步 AtomicFile 提交、revision 防冲突、上一版和导入前备份。JSON 工作区及无附件 .jiwei 包可预览/确认迁移，未知新版和含外部原文附件的包明确拒绝；课程 CSV/ICS 与笔记 Markdown 经系统文件窗口导出。未迁移教务与网页在线抓取，入口明确说明；现有网页资料仍可查阅整理。APK 无 Internet、账号或广泛文件权限，主 WebView 只允许包内 HTTPS 虚拟源，CSP 禁远程脚本和 iframe。Android 8/API26 以上、WebView108 以上，过旧提示更新；纯鸿蒙 NEXT 不支持 APK。

本机 OpenJDK21 与 Android SDK Platform/BuildTools35 下载到 mobile/.cache/toolchain，官方清单哈希核对通过，无全局 PATH/代理修改。构建入口 mobile/build.ps1：javac/D8/AAPT2/zipalign/apksigner，Beta 密钥只在忽略目录 mobile/.signing，覆盖更新需保留；成品 mobile/release/JeeWeave-0.3.0-mobile-beta.1.apk。包内资产逐文件比对当前生成资源，不含真实 data/profile 或 SDK；签名 v2/v3 校验通过。首次 Java 编译的 Android bootclasspath 缺 LambdaMetafactory，改用 --release 8 与 Android API classpath 后通过；首次预览的平台外观接口未返回 Promise，已修正并重验。

验证：移动端 3 项数据/迁移单测通过；隔离 Chromium 测试抽屉、面板与返回、笔记保存/重开/搜索、课程 CSV/ICS 与 Markdown 平台导出接口，320/390/900 像素页面无横向溢出。两轮有界截图核对并修正小屏插件说明挤压。完整发布前检查 5 项类型检查、core81/data71/Web17 单测、Web build/smoke24 通过；桌面首次沙箱原子 rename EPERM，正常用户环境同一测试182项全部通过，共354项单测。证据在 mobile/.cache/verification。Context7 现已可实际调用，本次查询了 Capacitor/Android 官方文档；最终选择无需额外框架的最小 Java 宿主。Impeccable context/detect 实际运行；唯一 Roboto 通用字体提示按 Android 系统字体惯例保留。

APK 逐文件审计另定位到 Windows AAPT2 将子目录资产名写成反斜线，Android AssetManager 无法按正斜线加载。构建在签名前规范化 ZIP 条目，保持严格资源名与内容哈希校验，避免“签名通过但页面缺资源”的空白包。

未连接 Android 真机/模拟器：安装、系统文件窗口、软键盘、系统返回手势、后台进程回收与跨厂商行为尚待用户验收。Chromium 尺寸检查不是 Android 原生实测。未读取 desktop/data、未改学校登录、未提交/推送或公开发布 APK；Windows 已发布包未变。

## 2026-10-24：事情上下文、课次来源、复杂安排与两端布局

后续工具安装：用户确认后，将 Impeccable engine 0.1.12 安装到 C:/Users/Ramon/.impeccable/bin/0.1.12/impeccable.exe；19193384 bytes，SHA-256 33ab0dd342ec9f6891103d45c9ce357b3260c9cd494a14c33a528b07c7ee9ac8，与官方发布资产一致。默认直连下载失败，使用 Windows 已配置的本地代理下载成功，未更改系统代理。引擎探针、现有启动器调用和 context --target desktop/prototype.html 均退出 0，已解决“引擎缺失”问题；缺少 PRODUCT.md/DESIGN.md 只是项目设计上下文提示，本次未创建设计文件或修改界面。安装校验记录在同目录 INSTALLATION.json，后续无需重复安装；Context7 工具是否接通仍另行核对。

用户明确授权按 DeepSeek 观察结果调整两端布局，并完成发布后 1—5。Desktop 新增事项 goal/completionCriteria、对象 completionCriteria；从具体课次记录作业，courseOrigin 固定为课表/课程/原日期与标题快照，可返回原课次。课程调动、停课或删除不改作业截止，也不按同名课程重连。旧数据缺字段仍可用，完整备份保留新增资料。查找入口拒绝覆盖正在打开的编辑弹层；搜索类型中的事项统一包含旧 task/plan 两个集合。

阶段时段可选 phaseId，日期须位于阶段或计划范围内；重复时段必填 occurrenceDate，明确属于原定那次。移动执行时间不改整组重复，日历完成写原定日期；阶段完成隐藏其时段而不完成父事项。统一查找经公开服务聚合课程、事项目标/标准、笔记与标签、网页原文和对象；按类型/对象筛选，返回原编辑器，关闭来源不参与搜索，故障来源明确降级。最多显示 80 项，无后台全文索引或正文副本。

Desktop 保留课表与主题，加入可收起侧栏、Ctrl+K 查找，统一内容宽度与间距。Web 宽屏常驻可收起侧栏、窄屏常用导航与更多；公共原生 dialog 覆盖课表设置、课程/计划编辑、批量/调整和课表管理，宽屏上限 820px、手机全宽，含焦点、Esc 与内部滚动。移除顶部闹钟能力悬浮字；转场为 120ms 淡入。未把桌面业务移植到 Web，没有 APK 或跨端同步。

本轮验证：5 项类型检查、core 81/data 71/Web 17 单测、Web build 与更新后的 smoke 24 项通过。Desktop 全量首次在沙箱遇文件 rename/端口限制，正常用户环境 180/182 通过；两条旧“不支持复杂时段”断言按新契约更新后，其所在 18 项测试通过，新增 4 项领域测试通过。隔离 next-development 验证课次建任务/返回、目标标准、阶段/重复排期、原日期完成、搜索路由、侧栏/窄窗及重开；JEEWEAVE_NEXT_NATIVE=1 分支使用实际 main/preload 与独立 workspace 文件重跑通过，确认来源、完成标准和本次完成记录落盘。该分支定位旧 body 900px 硬下限造成原生窄窗 1px 溢出，移除后保持严格无溢出断言通过。Web UI 验证导航、翻周、设置、刷新保存与 390/320px、原生焦点/Esc。截图批量检查后修正搜索行对齐和窄窗文字；证据在 desktop/.cache/verification/next-development、web/.cache/ui-verification。仓库审计覆盖 303 维护文件、648 本地链接与 70 运行输入，diff 检查通过。

未完成 Context7 查询（当前无 resolve/query 工具）；按 [React Effect](https://react.dev/reference/react/useEffect) 与 [dialog 官方参考](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)核对。Impeccable 引擎缺失且缓存不可写，按技能降级读取现有产品/设计与布局、适配指导；design-system 复用语义间距。未新增依赖、未访问真实 data 或学校账号、未做物理输入法/手机真机/换机验收，未打包或提交。旧 0.3.0 不支持新复杂时段组合，降级前保留原 data，勿覆盖恢复到旧版。

## 2026-10-24：DeepSeek UI 与交互研究

应用户要求用 REA 抓取 DeepSeek 未登录网页的宽/窄屏登录页与密码登录切换，另核对官方下载页手机展示图、Android APK 2.7.1 清单及独立解码的界面文案；结论和证据边界见 [观察报告](research/DeepSeek%E7%95%8C%E9%9D%A2%E4%B8%8E%E4%BA%A4%E4%BA%92%E8%A7%82%E5%AF%9F.md)。未登录网页聊天主页，也未运行原生 App；REA Android 深层解码因 JADX 未配置及资源返回无法读取而未完成。只新增研究文档与索引，没有更改 UI、代码、用户数据、打包或发布；文档检查见本次任务记录。

## 2026-10-23：整理发布后规划

[路线图](ROADMAP.md)已从旧“近期 1—5”改为 0.3.0 发布后顺序：实际反馈与兼容修复 → 事情上下文 → 具体课次来源 → 阶段/重复执行安排 → 资料与查找。UI/交互仍由用户主导，内置插件化不重复重做，外部插件/同步等保持储备。本次只调整规划、导航和笔记发布状态，检查文档编码、链接与 diff；未改应用代码或重新运行全局验证，未打包/提交。

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
