# 每日学习状态跟踪（legacy HTML）DATA/UI 规格

> 目标文件：`daily-status/学习状态跟踪.html`（4323 行）。CSS `<style>` 8–1076；Vue2 模板 `<body>` 1079–1901；外部脚本 CDN 1902–1906（vue2 / element-ui / echarts@5 / html2canvas@1.4.1 / jspdf@2.5.1 umd）；业务 `<script>` 1907–4321（IIFE）。行号均为原文件行号。未确定处标注 [未知]。

## 1. 全局常量与默认数据（1909–1921）

| 常量 | 值 | 含义 |
|---|---|---|
| STORAGE_KEY | `daily-learning-tracker-state-v4` | 主状态 localStorage key |
| STORAGE_META_KEY | `daily-learning-tracker-state-meta-v1` | 保存元信息 key（含 lastValidSaveAt） |
| TABLE_LAYOUT_STORAGE_KEY | `daily-learning-tracker-table-layout-v1` | 表列宽/间距 key |
| MAX_IMPORT_FILE_SIZE | 2*1024*1024 | JSON 导入大小上限 |
| LOW_SCORE_THRESHOLD | 60 | 低分阈值 |
| MAX_EMPTY_DATE_ROWS | 3 | 无日期草稿行上限 |
| MAX_ALERTS | 5 | 告警条数上限 |
| BACKUP_REMINDER_DAYS / _SNOOZE_HOURS | 7 / 24 | 备份提醒周期/延后 |
| DEFAULT_BOOKKEEPING_CATEGORIES | 36 项数组（餐饮/早餐…其他） | 记账默认类别 |
| PLAN_FIELD_KEYWORDS | ['计划','plan','next'] | 判断复盘字段是否"计划类" |
| TODO_PRIORITY_OPTIONS / RANK | ['高','中','低','长期'] / 高0中1低2长期3 | Todo 优先级 |

## 2. Vue data 完整树（工厂 createInitialState 1943–2071）

UI/运行态（非持久化）：`activeTab:'overview'`（overview/table/charts/review/accounting/tips）；4 个 ECharts 实例数组 `groupChartInstances/projectChartInstances/bookkeepingChartInstances/extraChartInstances`；`persistTimer/tableLayoutPersistTimer/reminderTimer` 定时器句柄；`chartDisplayMode:'grouped'|'single'`；`heatmapMonth:'yyyy-MM'`；`notesCollapsed:true`；`lastExportAt:''`（ISO 时间）；`backupReminderSnoozeUntil:''`；`backupReminderShown:false`；`storageRecoveryRequired:false`。

对话框/表单态：`groupConfigVisible/noteFieldsVisible:false`；`newTodoText:''、newTodoPriority:'中'、todoEditingId:''、todoEditingText:''、todoEditingPriority:'中'`；`todoCompletedCollapseActive:[]`（el-collapse 展开名）；`newGroupName/newNoteFieldName/newBookkeepingCategory:''`；`newColumnForm:{name:'',groupId:'',targetValue:null}`；`newBookkeepingEntry:{amount:null,item:'',category:'',reason:''}`；`newRecurringRule:{dayOfMonth:1,amount:null,item:'',category:'',reason:''}`。

筛选/布局：`tableFilter:{dateRange:[],keyword:'',groupId:'all',onlyLowScore:false,onlyIncomplete:false,sortMode:'date-asc'}`；`reviewFilter:{dateRange:[],keyword:''}`；`tableLayout=createDefaultTableLayout()`（1931：dateWidth170/durationWidth100/notesWidth420/actionWidth116/cellPaddingX8/cellPaddingY8/projectColumnWidths{}）。

配置数据（持久化）：`bookkeepingVisibleCount:10`、`bookkeepingUnlockedEntryIds:[]`（[未知]是否废弃，模板未引用）；`reminderConfig:{enabled:false,time:'21:30',permission:来自 window.Notification,lastSentDate:''}`（1991–1996）；`selectedAccountingDate:new Date()`；`bookkeepingCategories`=默认类别副本；`recurringRules:[]`；`groups`（2013–2018，默认 4 组，含保留组 `group-ungrouped` 未分组）；`projectColumns`（2019–2027，默认 7 列：听/说/读/写=group-study、饮食/运动=group-health、示例项目=group-custom，`{id,name,groupId,width,targetValue}`，targetValue 默认=60）；`noteFields`（2028–2032，默认 id summary/weakness/plan → 总结/弱项/明日计划）。

业务数据：`tableData`（2033–2067，默认 3 条 2026-04-25~27 样例，行结构见下）；`todoItems:[]`；`bookkeepingEntries:[]`。

行对象内存结构（normalizeState 后）：`{id, date:'yyyy-MM-dd'|'', durationMinutes:number|null, metrics:{[columnId]:string}（扁平、值=整数/1位小数/'/'/''）, notes:{[fieldId]:string}}`。
存储/导出结构（serializeRowMetrics 2802）：`metrics` 重排为嵌套 `{[groupId]:{[项目名]:value}}`，避免列增删错位；`projectColumns` 导出时删除 width（2845–2851）；TODO/记账条目：`{id,text,priority,done,createdAt,completedAt}` / `{id,time(yyyy-MM-dd),amount,item,category,reason,isDraft,generatedFromRuleId}`；周期规则 `{id,dayOfMonth(1–28),amount,item,category,reason}`。

## 3. localStorage 三把 key 与 JSON 结构

1) 主状态（persistState 2856–2880）：`chartDisplayMode, heatmapMonth, notesCollapsed, reminderConfig, lastExportAt, backupReminderSnoozeUntil, storageRecoveryRequired, todoCompletedCollapseActive, bookkeepingCategories(=bookkeepingCategoryOptions 计算值), recurringRules, groups, projectColumns, noteFields, tableData(已序列化嵌套 metrics), todoItems, bookkeepingEntries`。**payload 内无版本字段**，版本体现在 key 后缀 v4。
2) meta（2876–2879）：`{initializedAt, lastValidSaveAt}`（ISO），用于判断"是否有过有效旧数据"以决定缓存损坏后是否提示恢复。
3) 表布局：`tableLayout` 对象 JSON（列宽/间距；不进主文件与导入导出）。
外部导出文件（exportData 3772–3776）：`{version:4, exportedAt:ISO, state:<同 getSerializableState 2881–2900>}`；`version` 仅存在于导出 JSON 信封。

## 4. load/save 时机与迁移/合并

- 保存：watch（见 §6）→ schedulePersistState/schedulePersistTableLayout 80ms 防抖 → persistState/persistTableLayout；todoItems watch 直接同步 persistState（2491）；mounted 尾部与 normalizeState 末尾直接 persistState。
- 装载：mounted 内 restoreState→restoreTableLayout→normalizeTableLayout→ensureTodayRecord→ensureRecurringDraftsForMonth(本月、选中月)→…（见 LOGIC 文档）。
- restoreState（2910–2953）：先读 meta 判 hadPriorValidState；无主 key → 重置 UI 标记后 normalizeState；有 → 逐字段白名单覆盖（数组用 Array.isArray 校验，字符串/布尔/枚举逐项校验），JSON 解析失败则删除 key、回退 createInitialState 并把 storageRecoveryRequired=hadPriorValidState。
- normalizeState（2954–3059）迁移/合并要点：强制存在 `group-ungrouped`；tableData 空则补 1 空行；列 groupId 非法→未分组；targetValue ''/undefined/null→null 否则 Number；行补 id/metrics/notes、durationMinutes 转 Number|null、`deserializeRowMetrics` 把旧格式（嵌套分组 / `组::列id` / 列 id）合并成扁平 map、为 noteFields 逐字段补 ''；`getNormalizedRows` 去重日期（enforceUniqueDates，重复者置 date:''）+ 升序 + 无日期行只保留 3 条；补今日记录；todo 标准化并过滤空文本；记账条目标准化（time 截 10 位）；类别去重、缺省回默认；周期规则 day 夹 1–28；reminderConfig 兜底 + permission 刷新；heatmapMonth 格式校验；最后补本月/选中月周期草稿并 persistState。
- 导入合并：applySnapshot（3721–3744）整体覆盖上述业务字段后 normalizeState（覆盖式，无按 key 合并）。

## 5. computed 清单（2078–2442）

- 展示/排序：`todoPriorityOptions`；`studyRows`（有日期的升序行）；`orderedColumns`（按组序+中文名）；`displayedColumns`（按 tableFilter.groupId 过滤）；`displayedColumnGroups`（组→列分组，空组剔除，驱动表头两层结构）；`filteredTableData`（日期区间/关键字/低分/未补齐过滤+compareTableRows 排序）；`reviewTableRows`（复盘展览表行：日期+noteFields 关键字）；`chartGroups/chartHasData`；`lastVisibleRow/isLastRowActionDisabled`。
- 表头文案：`noteColumnTitle`（'总结 / 复盘栏'）、`noteFieldNamesText`。
- 告警/统计：`alerts`（无日期行/今日缺失/今日未填完/每列连续低分≥3，截 MAX_ALERTS）；`stats`（{visibleDays}，[未知]模板未引用）；`coreTableSpacingStyle`（把 padding 写为 CSS 变量）。
- Todo：`completedTodoCount/pendingTodoCount/sortedTodoItems`（未完成优先→优先级→时间倒序）/`pendingTodoItems/completedTodoItems`。
- 记账：`sortedBookkeepingEntries`（时间倒序）、`visibleBookkeepingEntries`（前 bookkeepingVisibleCount 条）、`bookkeepingHasData`、`accountingSummary`（totalAmount/currentMonthAmount，本月=今日 yyyy-MM）、`selectedAccountingDateText`（yyyy-MM-dd）、`selectedDateBookkeepingEntries/Total`、`bookkeepingDailySummary`（日期→{totalAmount,count}，喂日历）、`bookkeepingCategoryOptions`（类别+历史+规则+表单值并集去重）、`bookkeepingCategoryHasData`。
- Overview：`studyTrendSummary`（近7天/前7天均分、环比、周均时长）、`overviewRiskColumns`（连续低≥2）、`overviewPendingTodos`（前5未完成）、`overviewRecentReviews`（最近3天复盘摘要，取首个非空复盘字段、72字截断）、`overviewRecentBookkeeping`（最近5笔）、`overviewCards`（5 张卡）。
- 图/杂项：`durationChartHasData/studyHeatmapHasData`；`notificationStatusText`（4 态文案）；`lastExportAtText`；`detailedTips`（记录建议 tab 6 条动态文案）。

## 6. watch 清单（2475–2494）

| 字段 | 动作 |
|---|---|
| tableData(deep) | 防抖存主状态 + nextTick 重绘图表 |
| projectColumns(deep) | 归一化表布局 + 存布局 + 存状态 + 重绘 |
| groups/noteFields(deep) | 存状态 + 重绘 |
| chartDisplayMode / notesCollapsed / todoCompletedCollapseActive / lastExportAt / backupReminderSnoozeUntil / storageRecoveryRequired | 防抖存状态 |
| heatmapMonth | nextTick 重绘 |
| reminderConfig(deep) | 存状态 + 重启提醒定时器 |
| bookkeepingCategories(deep) / recurringRules(deep) | 存状态（规则另触发补草稿）+ 重绘 |
| selectedAccountingDate | 补选中月周期草稿 + 存状态 |
| todoItems(deep) | 直接（非防抖）persistState |
| tableLayout(deep) | 防抖存布局 |
| bookkeepingEntries(deep) | 存状态 + 重绘 |

## 7. 页面骨架（模板 1079–1901）

- 1080 `#app.page-shell > .container`（v-cloak）。
- **hero 头卡** 1082–1107：标题/说明 + `hero-actions` 5 个按钮：导出数据 `exportData`、导入数据 `triggerDataImport`、导出 Excel `exportExcel`、周报 PDF/月报 PDF `exportPdfReport('week'|'month')`；tag 行。
- **Todo 区**（top-todo-card 1109–1189）：输入行（el-input+回车 addTodo、优先级 el-select、按钮）；汇总行 `todo-summary`；未完成列表（行内 check/编辑/删除，编辑时 el-input + el-radio-button 组，Enter 保存 Esc 取消）；已完成 el-collapse 折叠面板（仅展示，不能删）。
- **el-tabs** 1192–1825，6 个 tab：
  - Overview `overview`（1193–1301）：5 张 overviewCards 统计卡；"今日动作面板"（待办前5 + 连续偏低 danger tag + alerts el-alert 列表）；"趋势摘要"（本周均分/环比/周均时长）+ 提醒面板（el-switch、原生 `<input type=time>`、状态 chip）；"最近复盘与支出"卡。
  - 学习记录表 `table`（1302–1510）：工具条卡（配置分组 `openGroupConfigDialog`、配置最后栏位 `openNoteFieldsDialog`、明日计划同步 `syncTodayPlanToTodos`、折叠/展开复盘栏）；`table-guideline` 说明；筛选行（日期范围 el-date-picker daterange + 快捷 chip、关键字 el-input、分组 el-select、仅看低于60/仅看未补齐 el-switch、排序 el-select、重置、间距 2 个 el-slider）；行操作行（定位今天/新增空白行/复制最后一行/新增明天记录）；alerts 面板；**核心表** el-table（1392–1503，row-class-name=study-row-today，@header-dragend 存列宽）：日期列（内嵌 el-date-picker，历史锁定）→ 时长列（el-input-number）→ `v-for displayedColumnGroups` 双层表头（组 el-table-column 嵌套每列 el-table-column，column-key `metric:{id}`，自定义 header 显示项目名+目标）→ 复盘栏（折叠时 el-popover 悬停查看 / 展开时按 noteFields 生成 textarea，`notes[field.id]`）→ 操作列（🔒 标记+复制/删除）；下方"删除最后一行"。
  - 学习统计 `charts`（1512–1565）：模式切换按钮 toggleChartMode；分组模式容器 `groupChart-{groupId}` 与单列模式 `projectChart-{columnId}`；热力图容器 `studyHeatmapChart`+月份 el-date-picker；时长趋势 `durationChart`；各容器均有空态 div。
  - 复盘信息展览表 `review`（1567–1611）：日期区间/关键字筛选；el-table：日期列 + 每个 noteField 一列。
  - 记账本 `accounting`（1613–1787）：类别管理（新增 el-input+按钮、el-tag closable 列表）；新增表单行（金额 el-input-number precision2 /事项/类别 allow-create /原因，按钮 addBookkeepingEntry）；明细表（时间=el-date-picker、金额、事项、类别、原因、状态 tag 草稿/已确认、操作：确认草稿/删除；`@scroll.passive` 无限滚动 +10）；**el-calendar**（1700–1716，dateCell 自定义单元格，显示当日支出/笔数，今日/选中/跨月高亮，`selectedAccountingDate` 双向）；日历 meta（当天笔数/金额）+ 选中日期列表；统计列：总支出/本月卡、`bookkeepingWeeklyChart`、`bookkeepingMonthlyChart`、`bookkeepingCategoryChart`（饼图）、周期规则表单（dayOfMonth1-28/金额/事项/类别/原因 → addRecurringRule）+ 规则列表（删除 removeRecurringRule，连草稿删）。
  - 记录建议 `tips`（1789–1824）：2 个提示卡 + el-descriptions 记录框架。
- **对话框/隐藏控件**：分组配置 dialog（1829–1882，分组改名/删除、列改名/换组/目标分、新增分组/项目）；隐藏 file input（1883，accept=".json"，@change=handleDataImport）；最后栏位 dialog（1885–1899）。

## 8. 导入导出 & 图表/PDF 对象

- JSON 导出：Blob URL 下载（downloadFile 3745），文件名 `学习状态跟踪-完整数据-{今天}.json`；导入：读文本→JSON→取 `parsed.state||parsed`→$confirm 覆盖→applySnapshot。
- Excel：无第三方库，`exportExcel`（3780–3793）拼 HTML table（表头=`日期|时长（分钟）|显示列(名称（组）)|noteFields`，body=filteredTableData 当前筛选），以 `application/vnd.ms-excel` 下载 `.xls`；同过滤联动、记录备份时间。**无 Excel 文件导入能力**（input 仅接受 .json）。
- PDF：`exportPdfReport`（3835–3877）：buildReportData→构造离屏 wrapper（fixed,left:-99999px,width900,白底）→innerHTML=buildReportHtml→`html2canvas(wrapper,{scale:2})`→`jspdf.jsPDF('p','pt','a4')` 纵向分页 addImage 循环切片→`学习状态跟踪-{周报|月报}-{今天}.pdf`；finally 移除 wrapper。报告含：标题/周期、平均分/平均时长卡、日均分与时长条形（纯 CSS 条 buildReportBarsHtml）、类别支出表、复盘摘要（近5条 join）。
- 图表容器 id 汇总：`groupChart-*`、`projectChart-*`、`studyHeatmapChart`（ECharts calendar 坐标系 heatmap，visualMap 蓝阶、中文星期）、`durationChart`（面积折线）、`bookkeepingWeeklyChart/MonthlyChart`（bar）、`bookkeepingCategoryChart`（环形饼）。
- 热力图数据：`buildStudyHeatmapSeries` 每日 `[date, 当日总分和 + durationMinutes]`（总分=该行所有数值项目分求和）。

## 9. CSS 体系（8–1076）

- 依赖：`unpkg element-ui theme-chalk/index.css`（行 7）；对 element-ui 内部类有 ~31 处覆盖（列表式后代选择器）：`.filter-row .el-date-editor/.el-select/.el-switch`(210–215)、`.metric-target-input .el-input__inner`(223)、`.todo-priority-group .el-radio-button__inner`(280)、`.todo-input-row .el-input`(284)、`.todo-completed-panel .el-collapse(-item__wrap/__header)`(420–437)、`.accounting-calendar-card .el-calendar-table .el-calendar-day`(506)、`.accounting-form-row .el-input(-number)/.el-select/.el-button`(631–633,777)、`.table-wrapper .el-table`(838–851，min-width1120/字号/cell padding)、`.core-table-wrapper .el-table th,td`(858–867，吃 CSS 变量 `--core-table-cell-padding-x/y`)、`.el-table .study-row-today>td`(892，!important 高亮)、`.score-input .el-input__inner`(907–919 居中/宽度/红字)。深样式耦合中等：仅组件外层尺寸、表格、折叠、日历单元格与输入。
- 主题变量 :root（9–20）：--page-bg 渐变、--card-bg、--border-color、--text-main/secondary、--accent 等；body 苹果风格字栈（28）。
- 自定义布局/卡片/表头类（清单）：`page-shell`、`container`、`hero-card/-main/-side/-actions/-tags/-tag/-title/-desc`、`content-card`、`section-card`、`toolbar(-title/-note/-actions)`、`table-toolbar-card/-head/-meta`、`filter-toolbar-card`、`filter-row`、`alerts-panel`、`table-guideline`、`tab-pane-block`、`overview-layout/-summary-grid/-grid/-panel/-card/-list(-item/-head)/-empty/-badges/-finance-list`、`trend-summary-grid/-card/-value`、`reminder-panel/-head/-title/-status-chip/-controls/-control-main/-control-box/-control-label/-meta/-meta-item`、`stats-card/-label/-value/-sub`、`table-wrapper`、`core-table-wrapper`、`table-spacing-controls/-label/-value/-slider`、`dynamic-header`、`score-input(.score-danger)`、`date-picker/date-cell`、`notes-editor/-item/-label/-collapsed(-hoverable)`、`review-detail-popover(-title/-list/-item/-empty)`、`row-action-buttons`、`row-lock-indicator`、`todo-*`（toolbar/input-row/summary/list/item(is-done)/content/text/meta/actions/priority-*/empty/completed-panel/edit-input）、`chart-grid`、`project-chart-grid`、`chart-card/-head/-title/-box/-empty`、`heatmap-box`、`accounting-*`（detail-card/calendar-card/calendar-header/form-row/grid/summary(-card)/selected-list/-item/-empty）、`tracker-calendar-cell(-day/-spend/-count/-empty/is-selected/is-today/is-outside)`、`calendar-meta(-card)`、`category-manager(-row/-tag-list)`、`bookkeeping-table-scroll`、`bookkeeping-load-note`、`tips-layout/-card/-title/-kpi(s)/-list/-item`、`config-section-title/-list/-item(-row)/-help`、`metric-target-input`、`dialog-actions-row`、`note-config-list/-row`、`hidden-file-input`、`native-time-input`、`duration-input`。1030–1076 媒体查询（窄屏改 1/2 列网格、表 min-width、字号）。
