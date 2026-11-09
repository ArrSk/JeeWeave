---
name: 几微桌面 · 澄纸 / 墨夜
description: 以安静纸面与细线组织对象、事情和时间的个人工作台
colors:
  accent: "#3a4a93"
  accent-soft: "#ebebef"
  on-accent: "#ffffff"
  canvas: "#f1efe9"
  surface: "#faf9f7"
  elev: "#ffffff"
  sunken: "#edecea"
  line: "#dbdad9"
  line-soft: "#cdcdcc"
  line-strong: "#7f8081"
  ink-1: "#1b1d21"
  ink-2: "#515254"
  ink-3: "#68696a"
  ok: "#167a54"
  ok-soft: "#e6f0ea"
  bad: "#c13041"
  bad-soft: "#f5e7e7"
  warn: "#8c6313"
  warn-soft: "#f3eee3"
typography:
  display:
    fontFamily: '"Segoe UI Variable Text","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif'
    fontSize: "34px"
    fontWeight: 600
    lineHeight: "40px"
    letterSpacing: "-.02em"
  title:
    fontSize: "26px"
    fontWeight: 600
    lineHeight: "34px"
    letterSpacing: "-.02em"
  section:
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontSize: "13px"
    lineHeight: "20px"
  meta:
    fontSize: "12px"
  label:
    fontSize: "11px"
rounded:
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
spacing:
  space-2: "8px"
  space-4: "16px"
  space-6: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "8px 13px"
  button-secondary:
    backgroundColor: "{colors.elev}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "8px 13px"
  button-ghost:
    backgroundColor: "transparent"
    rounded: "{rounded.sm}"
    padding: "8px 13px"
  input:
    backgroundColor: "{colors.elev}"
    textColor: "{colors.ink-1}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  navigation-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink-1}"
    rounded: "{rounded.sm}"
  tag:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.xs}"
    padding: "2px 5px 2px 8px"
    height: "24px"
  today-card:
    backgroundColor: "{colors.elev}"
    rounded: "{rounded.lg}"
  picker:
    backgroundColor: "{colors.elev}"
    textColor: "{colors.ink-1}"
    rounded: "{rounded.xl}"
    padding: "16px"
    width: "286px"
---

# Design System: 几微桌面

## Overview

**Creative North Star: "澄纸 / 墨夜 · 纸面上的线头"**

以安静纸面与细线组织对象、事情和时间的个人工作台。纸面毛线边的意象落在细分隔线、课程色线、焦点线头与短促动作织尘上；它不是一层持续飘动的装饰。整体以阅读与操作为主，保留原有真实记录、编辑入口和用户偏好。

实现采用 Electron 原生 HTML/CSS/ESM，没有新增组件库、外链字体或图片。此文件记录 2026-10-31 的实际代码，扫描来源为 appearance.mjs、design-tokens.css、design-inputs.css、design-pages.css、design-motion.css、page-motion.mjs、design-dust.mjs，以及 workbench.css、desktop-design.css 与相应组件模块。颜色前置表是澄纸的已计算实例，不是所有主题的固定颜色；运行时 appearanceTokens 是动态颜色的权威来源。

**Key Characteristics:**

- 纸面层次、细线和少量强调色共同组织信息。
- 七种布局独立于配色；保留原九主题、新八主题与自定义。
- 原生字段是数据源，增强控件保留标签、键盘和校验反馈。
- 动画表达进入、完成、安排与搜索反馈，支持减少动态效果。

## Colors

澄纸以暖灰纸面配靛色线头；墨夜以近黑画布配浅靛强调色。前置表按 `appearanceTokens(normalizeAppearance(null, 'studio-linen'))` 实算，不能直接把预设的三个 seed 当成完整渲染颜色。

### Primary

- **靛色线头**：accent 用于主要按钮、选中线、焦点与搜索游标；accent-soft 用于选中背景，on-accent 用于实心按钮文字。

### Secondary

- **完成绿**：ok 与 ok-soft 表示成功和完成反馈。
- **警示红**：bad 与 bad-soft 用于错误、删除及截止提示。
- **提醒赭**：warn 与 warn-soft 用于假设提示和今天列的少量暖意。

### Neutral

- **暖灰画布**：canvas 是工作面；surface 同时映射 panel、sidebar；elev 是字段、课程与浮层纸面；sunken 是凹面和悬停底色。
- **三阶墨色**：ink-1 承担正文，ink-2 承担次要文字，ink-3 承担元信息和占位文字；不能用降低透明度替代可读性求解。
- **细线层级**：line 分隔内容，line-soft 为派生线色，line-strong 承担字段边界、时间线等需要较高辨识度的轮廓。

**The Derived Color Rule.** 新界面引用语义 CSS 变量；配色从 normalizeAppearance、appearanceTokens 和既有对比度校验产生，不写死澄纸实例覆盖用户配色。

sidecar 的八阶 OKLCH 色带仅供面板展示，按实例色的色相与色度合成明度阶梯；它不是运行时已实现的配色标尺，也不能替代前置表与 appearanceTokens。

`studio-ink` 经同一路径计算的示例：canvas 为 `#101218`，surface 为 `#1d1f25`，elev 为 `#282a2f`，ink-1 为 `#eae7e0`，accent 为 `#9daaee`，accent-soft 为 `#2f3241`。这些是另一个主题实例，不能混入澄纸原语。保留旧偏好；没有“强制新默认主题”的迁移。

## Typography

全界面继承前置表的本地系统字体栈，不加载网络字体。根字号与正文为 body；数字默认等宽排列。显示层用于今天日期，title 用于页面标题，section 用于面板标题，meta / label 用于时间、说明、分组和设置导航。正文介绍的最大宽度为（72ch）。

事项标题使用中等强调（550）；品牌、日期和标题使用（600）。记录编辑有自己的阅读尺度：标题（24px / 34px），正文（15px / 1.75），正文最大宽度（64ch），最小高度（240px）。保留已有大字阅读模式的局部覆盖，不把一张静态字号表视为全部状态。

## Layout

常规工作面最大宽度（1180px）、左右留白（40px）、文字侧栏宽度（224px）；侧栏折叠为（68px）。专注布局保留其既有（1250px）内容上限。工具条提供当前位置、原地展开搜索与新建动作；搜索展开占用工具条剩余宽度，结果向下展开，不导航到独立搜索页。

今天沿用左时间线、右事项的双栏阅读顺序；基础网格为 `minmax(0,1.45fr) minmax(280px,.8fr)`、间隔（16px），既有窄窗媒体规则会折为单栏。时间线列表左缩进（96px），轴线距列表左侧（66px）。首屏显示真实日期与已有安排；没有资料时显示真实空态，不为了视觉填充业务记录。课程表保留真实日期、节次和课次网格，记录可回到原编辑器。

布局选项包括文字侧栏、图标侧栏、横向顶栏、左侧悬浮栏、底部 Dock、顶部悬浮岛、专注菜单；不得把主题选择与布局绑定。设置使用左分类导航与右单列内容，宽窗列为（168px / 最大720px）、间隔（24px）；在（1150px）及以下改为（136px / 自适应）、间隔（16px），工作面留白为（28px），主题列表由四列变两列，布局列表由三列变两列。其他窄窗规则沿用 workbench.css，应以级联为准。

## Elevation & Depth

以纸面色差、细线和局部阴影构成层次。普通面板保留细边；今天的外容器与记录行使用平面结构，今天卡片使用 elev-1；日期时间浮层、搜索及编辑弹窗使用 elev-2；安排拖动纸片使用 elev-3。阴影的精确值记录于 sidecar，并来自 design-tokens.css。

搜索下拉使用 elev 的半透明混色、背景模糊（18px）与饱和度（1.15）；不支持 backdrop-filter 时回退实色 elev。遮罩使用 canvas 混色，不统一压成纯黑蒙层。

**The Action Dust Rule.** 织尘只响应具体动作，最多保留（24）粒，不监听鼠标移动、不运行闲置动画；后台页面、关闭效果及生命周期停止时停止，窗口失焦后（500ms）停止。

页面进入为（380ms、下移6px渐入），旧页面快照为（180ms、上移3px渐隐）；浮层进入为（240ms），搜索下拉为（320ms），完成勾线与划线分别为（380ms / 620ms）。时长标尺和曲线在 sidecar 中记录。减少动态效果时禁用全局动画与过渡，隐藏过场快照与织尘，保留静态可见反馈。没有持续帧率测试结论。

## Shapes

圆角标尺是 xs 到 xl。普通按钮沿用 sm，字段用 md，纸片和今天卡片用 lg，弹窗与浮层用 xl。边界以（1px）细线为主；选中导航使用左侧（2px）短线，聚焦字段使用左侧（2px）线头及（3px）焦点晕。图标继承现有 SVG，常用（16px）、笔画（1.6），导航图标（20px）。

课程纸片保留左侧色线与底部（2px）线段，用 courseColors 求解色线可读性；不恢复整块高饱和色底。完成按钮与对象缩略头像是（24px）圆形。错误、截止和选中状态同时保留文本、轮廓或形状提示。

## Components

### Buttons

主按钮使用 accent / on-accent，常规最小高度（36px），工具条新建为（34px）。主按钮悬停亮度为（.97）；次按钮使用 elev、ink-2 和 line-strong；幽灵按钮使用透明底。键盘 focus-visible 为（2px）accent 外轮廓、偏移（3px）。禁用状态使用 sunken、ink-3 与 line。新建菜单按当前页面调用原有编辑命令。

### Chips

可删除标签使用凹面、细边、xs 圆角和（11px）字号；搜索建议使用同一凹面语言，但高度为（28px）。星期选择是原生字段的增强按钮，以 aria-pressed 与实心强调色共同表达选中。

### Cards / Containers

普通面板为 surface、lg 圆角和细边；今天卡片为 elev 与 elev-1。事项列表通过分隔线组织，编辑和删除在 hover 或 focus-within 时显现。课程卡片保留真实网格定位，不能当作无时间语义的展示卡片。

### Inputs / Fields

字段使用前置表 input 样式，最小高度（40px）、行高（20px）。聚焦改变边界与焦点晕；字段包装器出现线头。错误通过 aria-invalid、红边和文字说明表达；只读字段用凹面虚线，禁用字段用凹面和弱边界。日期、时间、数值和标签增强器继续同步原生字段；不另建一份脱离表单的数据源。文本域最小高度（72px）、最大高度（260px），允许纵向调整。

### Navigation

常规导航最小高度（36px）、sm 圆角、正文大小，选中态为 accent-soft、ink-1 和左侧线头；键盘焦点使用统一外轮廓。横向、悬浮与专注布局继承既有几何和键盘入口；不把文字侧栏尺寸套用到所有布局。

### Search / Pickers

搜索工具条原地展开，结果分组使用 label，选中结果使用 accent-soft 与（1px）游标；保留命令、筛选和关闭流程。选择器为原生 popover，宽度（286px）、xl 圆角、内边距（16px）；日期网格七列，当前日实心、选中日描边，不能仅靠颜色解释日期状态。

### Completion / Arrange

完成后原位保留撤销纸片（5秒），底部细线显示剩余时间；Ctrl+Z 沿用文本编辑撤销优先级。业务恢复具有并发 JSON 快照守卫，不能宣称无条件恢复。安排把手支持指针和键盘预览；提交追加 slot，保留截止时间，不移动已有 slot。该边界也是界面文案和交互示例的边界。

## Do's and Don'ts

### Do:

- **Do** 使用实际派生的语义颜色、原生字段和现有业务命令。
- **Do** 保留七种布局、十七个预设主题、自定义配色与现有用户偏好。
- **Do** 用真实记录验证日期、安排、课程和原记录编辑；无资料时保留真实空态。
- **Do** 为焦点、错误、选中和完成保留文字、线形或轮廓提示，并遵守减少动态效果设置。

### Don't:

- **Don't** 把澄纸颜色实例或八个新预设强制写成用户新默认值。
- **Don't** 为桌面界面引入新组件库、网络字体、外部图片或上传用户资料。
- **Don't** 将安排追加描述成移动已有安排，或把受并发守卫限制的撤销描述成无条件恢复。
- **Don't** 把规格中的计划、手机适配、持续 FPS 或完整读屏覆盖写成已验证能力。

本次记录边界：父任务报告桌面单测（240项）与真实 IPC UI 检查已通过；最终截图仍在独立核对。本记录只做代码提取和文档结构检查，没有另跑界面测试。手机、持续 FPS 与完整读屏未验。
