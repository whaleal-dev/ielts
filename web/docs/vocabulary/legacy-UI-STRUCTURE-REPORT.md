# study_words.html UI 结构与样式体系盘点报告

目标文件：`words/study_words.html`（6426 行，2.4MB，单文件）。
行号均为文件绝对行号。巨型数据行：2660(1.4MB)/2665(631KB)/2724(113KB)/2768-2770，读取时务必用 `awk 'length($0)<800'` 过滤（本次盘点已全程过滤）。

## 0. 文件骨架（行号锚点）

| 区段 | 行号 | 内容 |
|---|---|---|
| `<head>` | 1–6 | meta、title「单词学习」 |
| `<style>` | 7–2246 | 全部 CSS（约 278 条顶层规则，247 个类名） |
| `<body>` | 2249–2653 | 全部静态标记 |
| echarts CDN | 2655 | `jsdelivr echarts@5.5.1` |
| 内嵌听力音频索引 | 2656–2663 | `window.LISTENING_WORD_AUDIO_DATA`（1.4MB，外链 mp3 表） |
| 主逻辑 `<script>` | 2664–6424 | 内嵌词库数据 + 全部应用逻辑 |
| 数据常量 | 2665 `EMBEDDED_DATA`(词库主数据) / 2724 `SYNONYM_SOURCE_DATA` / 2768 `READING_538_DATA` / 2769 `LISTENING_179_DATA` / 2770 `CORE_VOCAB_DATA` | 均为单行大数组/对象 |
| `elements` 映射 | 2793–2928 | 134 项 `name → getElementById` |
| `init()` | 2930–2948 | 载入状态→绑定事件→初次全量 render |

## 1. 顶层结构与面板树（2249–2653）

```
body (2249)
└─ div.shell (2250)  z-index:1；单列 grid，gap 12px，宽 min(100%-20px,1480px)
   ├─ section.page-tabs.glass (2251) 顶部导航条（三个页面 Tab + 右侧状态/操作区）
   │  ├─ div.tab-row (2252): button#overviewTab / #studyTab(.active) / #difficultTab (2253-55)
   │  └─ div.page-tabs-right (2257)
   │     ├─ div.pill-row: #heroDatasetStat「N章/N组/N词」#heroModeStat #heroSelection (2259-61)
   │     └─ div.top-actions (2263)
   │        ├─ div#topSettingsWrap > button#topSettingsButton(齿轮svg, aria-label=打开设置) (2264-70)
   │        ├─ div#modalSettings[role=dialog aria-modal].modal-settings.hidden-visual (2272) 学习页展示设置弹窗
   │        │   ├─ .modal-settings-content > header(#closeModalSettings ✕ 按钮) + body:
   │        │   │    #toggleShowSynonymInput / #toggleShowListeningCorpusInput 复选框 (2280-85)
   │        │   │    #synonymSourceList(空容器) + #synonymSourceHint + 全选/清空按钮 (2291-96)
   │        ├─ button#inlineImportButton「导入记录」(2300)
   │        └─ button#inlineExportButton.primary「导出记录」(2301)
   ├─ section#backupBanner.glass.hidden-visual (2306) 备份提醒条(>7天)：
   │     #backupBannerText / #backupExportButton / #backupImportButton / input#backupFileInput[type=file] (2306-16)
   ├─ section#overviewPage.page-section.hidden-visual (2318) ============= 总览页
   │  └─ section.glass.overview-card (2319)
   │     ├─ .chapter-header: label「Overview」+ h2.chapter-title 学习总览 + 说明 (2320-28)
   │     ├─ div#overviewGlobalStats.metrics-grid (2329)  ← JS 填 4 张 .metric-card
   │     ├─ section.secondary-panel.learning-footprint (2330) 月足迹热力图：
   │     │    #overviewLearningHeatmap.footprint-grid (2340) + #overviewLearningHeatmapEmpty (2342)
   │     │    + #overviewLearningHeatmapLegend(.footprint-legend 少/多, 内置5个 .footprint-cell.level-0..4) (2343-53)
   │     └─ section.secondary-panel.insight-card (2356) Learning Pulse：
   │          #dailyStatsRange pill + #dailyStatsSummary.daily-stats-grid (2364) + #dailyStatsChart.daily-chart (2365, ECharts)
   ├─ section#studyPage.page-section (2370, 默认可见) ================= 学习页
   │  ├─ section.chapters-panel.glass (2371) 章节/分组选择：
   │  │    select#chapterSelect + #chapterMeta + #heroStatus(aria-live) + #backupMetaText (2378-83)
   │  │    + div#chapterGrid.chapter-grid (2386) ← 当前章分组按钮卡（.group-btn）
   │  ├─ section.hero-search.glass (2389) 搜索/练习入口：
   │  │    input#searchInput + #searchAssistInput(音标筛选) + select#searchChapterFilter (2395-97)
   │  │    #searchPracticeButton / #clearSearchButton (2398-99)；#searchResultMeta / #searchModeBadge pill (2402-03)
   │  │    4 个快捷源按钮：阅读538/听力179/核心词汇/听力语料库 (2406-09)；#searchResults 结果列表 (2411)
   │  ├─ section.settings-card.workspace-settings.glass (2414) 播放设置：
   │  │    range×3：#rateInput(0.6-2.0)→#rateValue / #intervalInput(0-5)→#intervalValue / #repeatInput(1-5)→#repeatValue (2425-39)
   │  │    #startIndexInput + #setStartIndexButton / #resetPositionButton / #muteButton (2444-48)；#statusText(aria-live) (2450)
   │  └─ section.practice-workspace.glass (2453) 练习工作区
   │     └─ div.practice-layout (2454) = 左右两栏 grid
   │        ├─ div.practice-main.word-card (2455) ====== 主卡片
   │        │  ├─ section.secondary-panel.session-panel (2456) 会话/进度：#sessionFocus + 快捷键chips区(.shortcut-list) (2462-66)
   │        │  │   + 进度条×2：.progress-strip>#sessionProgressText/#sessionProgressBar 与 #groupProgressText/#groupProgressBar(gold) (2468-87)
   │        │  ├─ div.word-top (2490): #modeBadge.mode-pill.active + 模式按钮 #practiceModeStandard/Quiz/Spell (2494-97)
   │        │  │   + 状态 pill 群：#sourceBadge/#progressBadge/#studyCountBadge/#masteredBadge/#difficultyBadge/#difficultyLevelBadge (2498-2503)
   │        │  ├─ div.word-heading (2508): #chapterLine + h2#wordText.word-title + #phoneticText + ★金徽章#coreVocabBadge/#reading538Badge/#listening179Badge (2511-16)
   │        │  ├─ div#meaningBox.meaning-box (2521): label Meaning + #meaningText
   │        │  ├─ section#quizPanel.secondary-panel.hidden-visual (2526): #quizPrompt + #quizResultBadge + #quizOptions (选中文4选1)
   │        │  ├─ section#spellPanel.secondary-panel.hidden-visual.spell-panel (2537): #spellPrompt + #spellInput + #spellReplayButton + #spellSubmitButton
   │        │  ├─ section.action-panel (2551): #practiceActionRow → 加入难词/标记学会/隐藏单词/显示中文/播放发音/难度±1 (2552-60)
   │        │  ├─ section.transport-card.secondary-panel (2563): #prevButton #playPauseButton(primary) #nextButton (2566-68)
   │        │  ├─ section#relatedPanel.secondary-panel.related-panel (2572): #relatedList ← 同义词/听力语料卡片(带可点 term-chip)
   │        │  ├─ section#notePanel.action-panel (2579): #noteInput textarea 笔记
   │        │  └─ div#currentStats.compact-grid (2587) ← 4 张 .compact-card 统计
   │        └─ aside.practice-side (2591) ====== 右栏
   │           ├─ div#globalStats.metrics-grid (2592) ← .metric-card 全量统计
   │           └─ section#groupOverviewPanel.queue-card.secondary-panel (2593) 队列预览：
   │                .queue-toolbar.clickable#queueToggleTrigger(role=button, aria-expanded) + #queueToggleButton + #queueList (2601)
   ├─ section#difficultPage.page-section.hidden-visual (2608) ========= 难词页
   │  └─ section.difficulty-card.glass (2609)
   │     ├─ .difficulty-toolbar: select#difficultyFilter(章节) + select#difficultySortSelect (2616-21)
   │     ├─ .difficulty-search-row: #difficultySearchInput + #difficultySearchClearButton (2625-26)
   │     ├─ .difficulty-actions: #practiceSelected/Due/Filtered/AllDifficultButton (2629-32) + #difficultySelectionStatus (2634)
   │     ├─ #difficultyList (2635, 分页: 每次 24 条) + footer #difficultyListMeta + #difficultyLoadMoreButton (2637-38)
   └─ section.footer-card.glass (2643): .footer-copy 文案 + #savedBadge/#updatedBadge chip (2646-47)
body 末尾浮动层（shell 外）:
- div#learningHeatmapTooltip.footprint-tooltip.hidden-visual[role=tooltip] (2652)
- div#synonymPopover.synonym-popover.hidden-visual[role=dialog aria-live=polite] (2653)
```

要点：`页面/面板显隐全靠 .hidden-visual(display:none!important)`，tab 切换 = `renderTabs()`(4282-93) 在 3 个 page-section 间 toggle，`setActiveTab(tab)`(3487) 写入 `state.activeTab` 并持久化；无路由、无 v-if 语义、无过渡。

## 2. elements 映射清单（2793–2928，共 134 项）

按用途分组（name → 元素；全部为 `document.getElementById`）：

- **页面/导航(6)**：overviewTab/studyTab/difficultTab；overviewPage/studyPage/difficultPage
- **顶部状态(3)**：heroDatasetStat / heroModeStat / heroSelection
- **备份条(7)**：backupBanner/backupBannerText/backupExportButton/backupImportButton/backupFileInput/backupMetaText/inlineExportButton + inlineImportButton(在组中)
- **设置弹窗(8)**：topSettingsWrap/topSettingsButton/topSettingsPanel**[映射但 HTML 中不存在=死引用]**/toggleShowSynonymInput/toggleShowListeningCorpusInput/synonymSourceList/synonymSourceHint/synonymSourceSelectAllButton/synonymSourceClearButton；`closeModalSettings` 不在映射内（单独 `getElementById` 绑定，3352/5437）
- **总览面板(11)**：dailyStatsRange/dailyStatsSummary/dailyStatsChart/overviewGlobalStats/overviewLearningHeatmap/overviewLearningHeatmapEmpty/overviewLearningHeatmapLegend/learningHeatmapTooltip + learningHeatmap/learningHeatmapEmpty/learningHeatmapLegend**[死引用，HTML 无此 id]**
- **搜索/练习入口(12)**：searchInput/searchAssistInput/searchChapterFilter/searchPracticeButton/clearSearchButton/practiceReading538Button/practiceListening179Button/practiceCoreVocabButton/practiceListeningCorpusButton/searchResultMeta/searchModeBadge/searchResults
- **状态/徽章 pill(14)**：modeBadge/sourceBadge/progressBadge/studyCountBadge/masteredBadge/difficultyBadge/difficultyLevelBadge/coreVocabBadge/reading538Badge/listening179Badge/savedBadge/updatedBadge/globalStats/currentStats
- **单词学习区(12)**：chapterLine/wordText/phoneticText/meaningBox/meaningText/noteInput/sessionFocus/sessionProgressText/sessionProgressBar/groupProgressText/groupProgressBar
- **模式与动作按钮(12)**：practiceModeStandardButton/practiceModeQuizButton/practiceModeSpellButton/toggleWordButton/toggleMeaningButton/pronounceButton/difficultButton/masteredButton/difficultyLevelUpButton/difficultyLevelDownButton/practiceActionRow/relatedPanel/notePanel
- **quiz(4)**：quizPanel/quizPrompt/quizResultBadge/quizOptions
- **spell(5)**：spellPanel/spellPrompt/spellInput/spellReplayButton/spellSubmitButton
- **传输控制(3)**：playPauseButton/prevButton/nextButton
- **队列区(6)**：queueHint/queueList/groupOverviewPanel/queueToggleTrigger/queueToggleButton
- **库/章节(3)**：chapterSelect/chapterMeta/chapterGrid + heroStatus(状态行)
- **播放设置(8)**：rateInput/intervalInput/repeatInput/rateValue/intervalValue/repeatValue/startIndexInput/setStartIndexButton/resetPositionButton/muteButton/statusText
- **难词页(12)**：difficultyFilter/difficultySortSelect/difficultySearchInput/difficultySearchClearButton/practiceSelectedDifficultButton/practiceDueDifficultButton/practiceFilteredDifficultButton/practiceAllDifficultButton/difficultySelectionStatus/difficultyList/difficultyListMeta/difficultyLoadMoreButton
- **浮层(1)**：synonymPopover；另 modalSettings 在映射尾部(2927)

交叉校验：HTML 内 131 个唯一 id，除上述 4 个死引用外全部被映射；唯一未映射 id = closeModalSettings。**组件拆分时以本表为 ref 清单**：每个被 JS 直引的 id 即一个组件 prop/暴露点；死引用 4 项与 `renderTopSettingsPanelState()` 空桩(4258-62) 说明历史上曾有「顶部下拉设置面板(.top-settings-panel)」和「学习页旧热力图」两套 UI，已替换为 modal + overview 版热力图，可整体删除。

## 3. ECharts 实例

- **全文件仅 1 次 `echarts.init`（L5471）** → 容器 `#dailyStatsChart`(2365, `.daily-chart`, 总览页 Learning Pulse 卡内)。
- 图表：**7 天多折线**（series 学习/掌握/复习，平滑曲线+面积渐变，颜色 #1473ff/#17b26a/#f1b53d），xAxis 日期类目、grid/legend/tooltip(trigger:axis)（option 见 5473-5528）。
- 实例为模块级单例 `let dailyStatsChart`(2785)；`renderDailyInsights()` 每次重绘 setOption，无 dispose；window resize → `dailyStatsChart?.resize()`(2944)。
- **CDN 失败降级**：`if (!window.echarts)` 时向容器写入 `<div class="daily-chart-empty">CDN 图表库未加载成功，稍后重试即可。</div>`(5467)。无本地回退库。
- **热力图不是图表**：30 天学习足迹 = 纯 HTML/CSS 网格 `#overviewLearningHeatmap` 内由 JS 生成 `<button class="footprint-cell in-range level-0..4 [recent-window]">`（renderLearningHeatmap 4384-4413，单元格 aria-label=tooltip 文本）；level 由 `resolveHeatmapLevel`(4415) 按 最大日次数比例分 5 档。空态文案「最近 1 个月还没有学习记录，从今天开始打卡吧！」(2342)。
- 其余“统计”均为 DOM 卡片：`.metric-card`(metrics-grid)、`.daily-mini-card`(dailyStatsSummary)、`.compact-card`(currentStats)。

## 4. CSS 体系盘点（8–2246）

### 4.1 :root 自定义属性（L8-35，27 个 token）
```
背景/面板: --bg --bg-strong --panel --panel-strong --panel-soft
线/文字:  --line --line-strong --text --muted --subtle
强调色:   --blue --blue-soft --blue-strong --violet --violet-soft --green --red --gold
阴影:     --shadow --shadow-soft
圆角:     --radius-xl(22) --radius-lg(18) --radius-md(14) --radius-sm(10)
布局:     --max-width: 1480px
```
风格：`color-scheme: light`；主色 blue #1473ff / violet #615fff / green #17b26a / red #ec5b5b / gold #f1b53d；**玻璃质感白面板以 rgba 白渐变写在 .glass 等规则内，未 token 化**。**无深色模式**（全文无 prefers-color-scheme/data-theme）。

### 4.2 视觉基调
- body 背景 = 多层径向渐变光斑(#1473ff/#615fff) + 白蓝线性渐变(45-56)；body::before/::after 两张 blur(22px) 固定装饰光斑(58-82)。
- 字体单栈(48)：`"SF Pro Display","PingFang SC","Helvetica Neue",sans-serif`；数字用 `.mono`(2098)。标题大量负字距 letter-spacing -0.02/-0.03em；正文 13-14px、辅助 .small-text 12px。
- 卡片：`.glass`(104) backdrop blur 26px saturate + 白色线性渐变 + 大阴影；组件卡通用白卡基座 + `:hover translateY(-1~2px)` 微抬升；入场 `@keyframes rise`(2106, opacity+translateY(12px))。
- 交互过渡约 160ms；按钮 :hover/:active/:focus-visible 齐备（见 §5）。

### 4.3 主要模式类（作用一句话）
| 类 | 作用 |
|---|---|
| `.shell`(95)/`.glass`(104) | 全局容器 / 毛玻璃主面板 |
| `.page-tabs`(1749)/`.tab-btn`(1939,.active 1950) | 顶部三页签条；z-index 80 |
| `.secondary-panel`(313/839) | 卡内分区子面板白底 |
| 共享大组 L235 `.metrics-grid,.setting-grid,.transport-grid,.stat-grid,.chapter-grid` 等 | 响应式 grid 布局骨架 |
| 白卡基座组 L289/L306 `.metric-card,.compact-card,.word-card,.queue-card,.difficulty-card,.transport-card,.footer-card,.setting-box,.daily-mini-card`(及 .badge-card 遗留) | 统一白卡 padding/bg/radius/阴影 |
| 标签组 L328 `.section-label,.metric-label,.compact-label,.setting-caption,.small-text` 等 | 标题/辅助文字排版 |
| 胶囊 `.pill/.mode-pill/.icon-pill`(417) `.chip`(420) `.gold-badge`(441) | 状态胶囊/小 chip/金色徽章 |
| 按钮族 `.control-btn/.mini-btn/.group-btn/.segment-btn/.danger-btn/.ghost-btn/.play-btn/.toggle-btn`(534) + `.primary/.soft` 变体 | 全套按钮体系（ghost/danger 现无静态使用） |
| `.search-bar/.search-input/.search-results/.search-item(-word/-meaning/-actions)` | 搜索条与结果卡 |
| `.word-card` 内 `.word-title-row/.phonetic/.meaning-box/.meaning-text/.progress-strip/.progress-track/.progress-fill(.gold)` | 大词卡排版 + 双进度条 |
| `.quiz-options/.quiz-option(.correct/.wrong)`(859 起) | 选中文答题按钮 |
| `.spell-panel/.spell-input/.spell-actions` | 拼写模式 |
| `.transport-card/.transport-grid` | 上一词/开始/下一词 |
| `.queue-card(2593 结构)/.queue-toolbar/.queue-list/.queue-item(.active)/.collapsed` | 队列预览卡（可折叠，aria-expanded） |
| `.chapter-grid/#chapterGrid 内 .group-btn(.active) > .group-main/.group-side/.group-name/.group-meta/.group-foot` | 章节分组按钮卡 |
| `.footprint-grid(.compact-month)/.footprint-cell(.level-0..4,.in-range,.outside-range,.recent-window)/.footprint-legend/.footprint-tooltip`(1196-1330) | 热力图网格与图例（level-4 深蓝 1291；tooltip fixed z60） |
| `.overview-card/.insight-card/.learning-footprint/.footprint-card/.daily-chart(.daily-chart-empty)/.daily-stats-grid/.daily-mini-card` | 总览页专属 |
| `.related-list/.related-group-card/.related-item/.related-chip-grid/.related-actions/.term-chip(.linked/.current/.external)` | 同义词/关联词块（term-chip 是点出 popover 的锚） |
| `.synonym-popover*(1541-…)` head/title/phonetic/meaning/source/actions/copy-btn | 同义词浮层 fixed z30 |
| `.difficulty-*`（toolbar/search-row/actions/item(+.due)/item-select/meta-line/meaning/note/review-row/stat/word/word-row/source/…) | 难词页整树 |
| `.modal-settings`(1851)/`.modal-settings-content` fixed z2000 全屏遮罩 | 学习页展示设置弹窗 |
| `.setting-grid/.setting-box/.setting-head/.setting-caption/.setting-value` | 学习页内嵌播放设置卡 |
| `.backup-banner`(2306 结构)/`.footer-card`(1723)/`.footer-copy` | 备份条/页脚 |
| `.hidden-visual`(2102) | 全局显隐开关（!important） |
| `.status-line`/`.session-focus`/`.mode-pill` 等 | 状态文案/会话焦点 |

### 4.4 布局/断点/层级
- 主容器 grid：`.shell`(gap12)；学习页卡片串列；`.practice-layout`(练习区 main+aside)；总览 .overview-card 内纵向卡片。
- **媒体查询仅 2 个**：`@media (max-width:1220px)`(2117，各主网格 2 列、practice-layout 单列) 与 `(max-width:760px)`(2136，全部 1 列、padding/圆角/按钮放大、word-title clamp 36-64px)。无深色模式、无 reduced-motion、无打印样式。
- z-index 栈：body 装饰光斑 0 → shell 1 → 热力图 tooltip 60 → 页签条 80 → top-settings 90 → 同义词 popover 30 → (遗留 .top-settings-panel 999) → 弹窗 modal 2000。

### 4.5 CSS 迁移评估
- **可平滑搬运的全局层（进全局样式/base 或设计 token 文件）**：:root 27 token；.glass/.shell/.hidden-visual/.mono；文字与胶囊组(L328/L417/L420)；整套按钮族(L534+变体)；shared 白卡基座大组(L289/L306)；共享 grid 组(L235)；焦点样式群(617-635)。
- **适合 scoped 的页面/组件专属**：总览页（overview/insight/learning-footprint/footprint*/daily-*）、学习页 word-card 大卡及 quiz/spell/queue/transport/workspace-settings、搜索卡、难词页整块、related/term-chip、synonym popover、modal-settings、backup-banner、footer。
- **风险点**：① 大量跨文件共享 selector 大列表（如 L289/306/328/375/417/534）把 20-40 个类揉进同一规则，切 scoped 会撕裂 → 先落共享 base 类再逐组件搬；② 颜色/阴影/背景仍有相当多硬编码 rgba/hex（未走 token），拆分时建议补 token；③ `.hidden-visual` 与“页面/面板切换”强耦合，Vue 迁移用 v-show 替换最省事；④ 媒体查询逻辑隐含在 2 个断点 + grid 模板里，Element Plus 断点可近似替代；⑤ ECharts option 内颜色为硬编码 hex，需与 token 同步（建议 getComputedStyle 读取或共享 JS 常量）。

## 5. 可访问性与交互模式

- **Tab 切换**：三个 button `.tab-btn`，激活态靠 `.active`（1950）；`renderTabs()`(4282) 给对应 page-section toggle hidden-visual，aria 上无 role=tablist（原生按钮）。
- **焦点样式**：控件族 `:focus-visible` 群组规则（约 623-635，覆盖 control/segment/toggle/play/mini/group/danger/ghost/tab-btn/term-chip/search-input/note-input/select）；`input:focus` 边框+阴影变蓝（215 附近）；checkbox 用 `accent-color: var(--blue)`。
- **快捷键**：全局 document keydown `handleKeyboardShortcuts`(5630)：←/→ 切词、↑ 发音、Enter 下一词、Space 播放暂停、Ctrl+Space 拼写重听（5631）；INPUT/TEXTAREA 内短路(5639)，BUTTON/A/SELECT 聚焦时只放行方向键（5660）。可视提示：session-panel-top `.shortcut-list > .chip`「Enter 搜索练习 / ← → 切词 / 空格 开始或暂停」(2462-66)；spell 提示在 #spellPrompt(2541)。Esc 全局关闭设置弹窗(3364)。
- **弹窗 modal**：全屏遮罩 fixed z2000；打开聚焦 #closeModalSettings(5437)、点击遮罩 mousedown 关闭(3356)、Esc 关闭(3364)；无焦点圈定/无还原焦点 [未知，未见 hide 后 focus 还原]。
- **同义词 popover（positionSynonymPopover L4970-80）**：CSS `position:fixed`（1542，非 absolute 于锚点）；JS 用 `anchor.getBoundingClientRect()` 与 popover 自身 rect 计算 top/left（bottom+10、边距 12，随视口 clamp），写 inline style；显示/隐藏 = remove/add `.hidden-visual`；鼠标进入/离开延迟 120ms 隐藏(scheduleHideSynonymPopover 4982)；单击 term-chip 锚点钉住(pinned)，外部 click 文档级关闭(3000)；内容含“当前词/词库内/外部词”状态与 发音/难词/学会/复制 动作按钮（data-synonym-action，2955 事件委托）。
- **热力图 tooltip（showLearningHeatmapTooltip L4452）**：同样 `getBoundingClientRect` + fixed 定位（.footprint-tooltip fixed z60，1321）；cell 是 `<button aria-label>`，mouseenter/focus 显示、mouseleave/blur 隐藏（4406-12）；legend「少/多」5 档色（2343-52）。
- **aria**：heroStatus/statusText aria-live=polite(2382/2450)；modal role=dialog aria-modal；synonymPopover role=dialog aria-live=polite；queueToggleTrigger role=button tabindex=0 aria-expanded/controls（2594）；按钮均带中文 label/aria-label。

## 6. 额外盘点

- **图标方式**：无 iconfont、无图标库。全文件仅 **2 处内联 SVG**：顶部设置齿轮(2266-68) 与 synonym popover 复制按钮(4939-41)；其余图标 = Unicode/emoji：✕(关闭按钮 2276)、★(gold-badge 徽章 2514-16)、▶(难词行发音 5306 附近、播放按钮区)、← →(chips 文案)、✓/✗（quiz 结果，JS 侧）；部分状态纯文字（开始/暂停/折叠/展开）。
- **媒体元素**：body 无 `<audio>/<iframe>/<video>/<canvas>/<template>/<dialog>`。发音 = JS `new Audio(url)`（playAudio 3918：onended/onerror/playbackRate/并发 stopActiveAudio），音频 URL 来自内嵌索引 `window.LISTENING_WORD_AUDIO_DATA`(2660) 与 `buildListeningCorpusAudioUrl`(6091)，均指向外站 `http://www.1kao.com.cn/.../xxx.mp3`（HTTP 明文，迁移时需注意混合内容）。
- **表格/列表**：全文无 `<table>`；列表一律 div/article + CSS grid/flex + JS innerHTML 渲染。class 命名 = kebab-case、`块-元素-修饰` 风格，前缀即组件域：`difficulty-*`/`search-item-*`/`group-*`/`queue-*`/`quiz-*`/`spell-*`/`footprint-*`/`related-*`/`synonym-popover-*`/`modal-settings-*`/`top-settings-*`/`metric-card`/`compact-card`/`daily-mini-card`；状态修饰统一追加类：`.active/.due/.collapsed/.correct/.wrong/.linked/.current/.gold-badge/.level-0..4/.recent-window/.in-range/.outside-range/.hidden-visual`。动态项事件用 `data-*` 委托（data-group-id/data-search-key/data-difficult-select/data-synonym-action/data-heatmap-label/data-quiz-option）。
- **架构备注（影响拆组件）**：单向“state→renderAll→逐容器 innerHTML”全量渲染 + 高频 `saveState()`（localStorage `apple-word-trainer-v4` + IndexedDB kv 双写，3094/3113/5815）；渲染函数即组件边界（约 40 个 render*/模板函数见 §函数清单）；动态 innerHTML 都经 `escapeHtml`/`highlightText` 清洗。数据渲染关键行：globalStats 4324 / overviewGlobalStats 4361 / heatmap 4399 / searchResults 4536 / quiz 5020 / currentStats 5106 / queueList 5171 / chapterGrid+renderGroupButton 5201-5243 / difficultyList 5293 / synonymSourceList 5420 / dailyStatsSummary 5459 / synonymPopover 4933。
- **疑似遗留 CSS（50 个类，静态扫描 markup+JS 未命中；需逐 renderer 复核，含 classList 三元拼接的类可能误报）**：`hero*`(hero/hero-top/hero-copy/hero-side/hero-badges/hero-title-wrap/main-layout/left-column/right-column)、`chapter-card/chapter-accordion/chapter-actions/chapter-count-pill/chapter-groups/chapter-subtitle/chapter-summary*/chapter-groups`、`group-word-*`、`badge-card/badge-label/badge-value`、`source-path-*`、`stat-grid`、`detail-row/toggle-row`、`difficulty-top/eyebrow/icon-pill`、`ghost-btn/danger-btn`(无静态使用但 CSS 仍完整)、`term-chip/external/current/linked`、`quiz-option correct/wrong`(经 classList 动态加，误报可能性高)、`related-external/related-word-name`、`synonym-popover-meta/top-settings-panel/top-settings-title`。其中 markup 已确证死的 id 引用：topSettingsPanel/learningHeatmap/learningHeatmapEmpty/learningHeatmapLegend。

## 7. 组件切分建议（对照 §1 面板树）

1. `ShellLayout`（.shell + 背景光斑 + footer）→ 全局
2. `PageTabs`（.page-tabs 三 tab + hero 状态 pill + 导入/导出/设置按钮）
3. `SettingsModal`（#modalSettings，含同义词来源复选框组）
4. `BackupBanner`（#backupBanner + 隐藏 file input）
5. `OverviewPage`（内：`StatCards`(metric-card)、`FootprintHeatmap`(复用)、`DailyInsightsChart`(ECharts 封装+降级文案)）
6. `ChapterPickerPanel`（#chapterSelect + #chapterGrid group-btn 卡）
7. `SearchPanel`（搜索输入/源快捷按钮/结果列表）
8. `PlaybackSettingsPanel`（三个 range + 起始序号/重置/静音/状态行）
9. `PracticeWorkspace`（主布局两栏）→ 内：`SessionPanel`(进度)、`WordCard`（词头/释义/quiz/spell/动作/transport/related/note/currentStats 各为卡内子组件）、`QueuePanel`（队列预览）、`StatsSidebar`
10. `DifficultPage`（筛选/动作/列表 + 分页 LoadMore）
11. `SynonymPopover` + `LearningHeatmapTooltip` 两个 fixed 浮层组件（定位逻辑抽 composable：popover-position = rect+clamp）
12. 共享原子：按钮族、pill/chip、白卡、网格、.glass、文本排版、显隐（v-show）

## 8. [未知]/待确认项

- modal 关闭后是否还原焦点（未见代码）→ [未知]
- “疑似遗留 CSS”清单中经 classList 动态拼接的类（correct/wrong/term-chip 状态等）需在 render* 函数逐一复核。
- CSS 内部按组件分区的精确起止行（CSS 内多处 selector 跨行大列表，未逐一标行；正文锚点仅对直接读取验证处精确）。
- quiz-option/related 等多数“第一处规则”行号以说明性类名为准，拆组件时按类名 grep 定位即可。
