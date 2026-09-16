# 每日学习状态跟踪（legacy HTML）LOGIC 规格

> 目标文件：`daily-status/学习状态跟踪.html`，业务 `<script>` 1907–4321（IIFE 内 new Vue）。行号为原文件行号；[未知] 表示无法确定。

## 1. 初始化流程与生命周期

- 无 `created`/`beforeMount`/`beforeUpdate`/`updated` 钩子；只有 data 工厂 + mounted + beforeDestroy + watch（2073–2494）。
- Vue 实例：`el:'#app'`，data 返回 `createInitialState()`（1943，见 DATA-UI §2）。
- **mounted 顺序**（2444–2458）：
  1. `restoreState()`（读主 key + 损坏回退）；
  2. `restoreTableLayout()`（读布局 key）；
  3. `normalizeTableLayout()`（夹取范围 + 重建 projectColumnWidths）；
  4. `ensureTodayRecord()`（今天无记录则补一行空记录）；
  5. `ensureRecurringDraftsForMonth(本月)` + `(选中月)`；
  6. `setupReminderTimer()`（若开启按 30s 轮询）；
  7. `$nextTick`：`initCharts()`（echarts 存在才 renderCharts）→ `resize` 监听 → `promptStorageRecoveryIfNeeded()`（上次损坏才弹）→ `promptExportIfBackupExpired()`（超 7 天未备份且未 snooze 才弹）。
- 数据装载入口 `normalizeState()` 内亦会 `persistState()` 落一次盘（3058），把"旧格式迁移 + 补默认"的结果固化。
- **beforeDestroy**（2459–2474）：移除 resize 监听、清 3 个定时器、dispose 4 组图表实例。
- 默认样例：首次无缓存时 `createInitialState` 自带 3 条 2026-04-25/26/27 的学习样例行（2033–2067），Todo 与记账为空数组；`ensureTodayRecord` 会再补"今天"空行。

## 2. 数据装载 / 迁移 / 合并算法

装载链路：restoreState(2910) → normalizeState(2954)。白名单逐字段恢复（2919–2942）：仅接受校验过的 groups/projectColumns/noteFields/tableData/todoItems/bookkeepingEntries/bookkeepingCategories/recurringRules/todoCompletedCollapseActive 数组与 chartDisplayMode('grouped'|'single')/heatmapMonth/notesCollapsed/reminderConfig/lastExportAt/backupReminderSnoozeUntil/storageRecoveryRequired。JSON.parse 失败：删除主 key、回退初始状态，若 meta 曾记录 lastValidSaveAt 则置 `storageRecoveryRequired=true`（2943–2951）；meta 自身坏则直接删 meta（2916）。

normalizeState 迁移步骤（2954–3059）：
1. 缺 `group-ungrouped` 则头部插入（不可删组，见 removeGroup 3665）；
2. tableData 空 → 放 1 条 `createEmptyRow()`；
3. 列：groupId 失效 → 归"未分组"；`targetValue` ''/null/undefined → null，否则 Number（非法→null）；
4. 行：补 id；durationMinutes ''/undefined→null、再 Number 化；`metrics` 补对象并 `deserializeRowMetrics` **兼容合并三套旧存储格式**（2802–2833 读取顺序：嵌套 `{组:{项目名}}` → `组::列id` → 列原 id），值为 `sanitizeMetric` 清洗（3316：空/`/`/`\d+\.` 草稿值/整数或 1 位小数保留，其余清空）；notes 按 noteFields 补默认 ''；
5. `getNormalizedRows`（3095）：`enforceUniqueDates`（同日重复行置 date:''，3112）→ 升序 → 无日期行仅保留前 3（MAX_EMPTY_DATE_ROWS）；——删除/导入/改日期后都走该归一处，保证"同一天唯一"；
6. 补今日记录；todo 标准化（trim/缺省优先级"中"/done 无 completedAt 时回填 createdAt/过滤空文本 2988–2999）；记账条目标准化（time 截 10 位、amount Number|null、保留 isDraft/generatedFromRuleId 3017–3028）；类别 Set 去重、为空回默认；周期规则 day 夹 1–28（3038–3047）；reminderConfig 兜底 + 刷新 Notification.permission + 时间格式校正（3048–3052）；heatmapMonth 校验（3053）；最后为"当前月 + 选中月"补周期草稿并 persistState。
- 导入合并：整体覆盖（非逐项 merge）applySnapshot（3721–3744），校验必需数组 groups/projectColumns/noteFields/tableData 后赋值，随后 normalizeState（会重跑全部迁移/归一），末 nextTick renderCharts。

## 3. 学习记录 CRUD

- 行结构（内存）：`{id,date('yyyy-MM-dd'|''),durationMinutes:number|null,metrics:{colId:value},notes:{fieldId:text}}`；新建用 `createEmptyRow`（3360）。
- **校验/输入清洗**：metric 输入 `updateMetric`→sanitizeMetric（合法：正整数 / 最多 1 位小数 / `/`；输入"1."为草稿态暂存，blur 时 `finalizeMetric` 补零归一；非法输入提示并清空 3324–3339）；时长 `updateDuration` 非负 Number 或 null（3340）；文本框 maxlength=5（模板 1448）。
- **历史锁定**：`isPastDate` 日期<今天；`isLockedRow` 则禁用该行日期/时长/项目/复盘控件且不可复制删除（3060–3061、模板 1406/1422/1450/1485/1498）；日期选择器 `getDatePickerOptions` 禁选过去日（3062）。行操作按钮同禁用，另在操作列显示 🔒（模板 1497）。
- **排序** `compareTableRows`（3206）：日期升序/降序、时长降、平均分升、未补齐优先，末级按 id 稳定。
- **筛选** `filteredTableData`（2115）：日期区间 + 关键字（getRowSearchText=日期+时长+项目名&值+复盘拼接，3179）+ 分组（displayedColumns）+ 仅低分（rowHasLowScore<60）+ 仅未补齐 + 排序；reviewTableRows 只搜日期与复盘字段。
- **行增删复制**：ensureTodayRecord 今日缺失自动补（3102，切到 table tab 时 handleTabChange 亦触发，4309）；createTomorrowRecord（4154）以今日行/最近一行克隆：日期=明天、分数清空、时长 null、仅保留"计划类"复盘字段（createTomorrowNotes 3513），并把今日计划拆成 Todo（appendPlanTodosToList）；copyRow（3587）复制为无日期行（走空位上限）；addBlankRow（3604）；removeRow 需 $confirm，且至少留 1 行、历史行拒绝（3616）。空日期行容量上限 3（ensureEmptyDateRowCapacity 3579）。
- 行统计：行均分=getRowMetricNumbers 均值（3164）；未补齐=活动列中值为空计数（3171）；today 行 class `study-row-today`（3137，CSS 高亮）；滚动定位 `scrollToDateRow` 用 querySelector+scrollIntoView（3141）。
- **无 Excel 模板导入解析功能**：文件导入仅 JSON（input accept=".json"；handleDataImport 3699）。Excel 仅"导出"（HTML table 伪装 .xls，见 §6）。[若历史版本存在 Excel 模板导入，本次读取的 4323 行内未见对应代码]

## 4. Todo 逻辑

- 字段：id/text/priority(高 中 低 长期)/done/createdAt(ISO)/completedAt(ISO 或 '')。
- 录入：addTodo 去空格→unshift 顶部→重置表单（3962）；编辑三件套 startTodoEdit/saveTodoEdit/cancelTodoEdit（3977/3987/3982，Enter 保存、Esc 取消）。
- 勾选完成：handleTodoToggle 置 completedAt=now；若"已完成"折叠面板正开着则自动收起（3970–3976）。已完成保留不删（removeTodo 拒绝已完成的，4000；clearCompletedTodos 仅提示 4007）。
- 排序（computed sortedTodoItems 2258）：未完成在前 → 未完成按优先级高→低 → 时间倒序（完成按 completedAt，未完成按 createdAt）。
- **明日计划同步算法**：syncTodayPlanToTodos（2688）取"今天行，否则最近一条有日期行"为源 → appendPlanTodosToList（2663）→ 源行中"计划类复盘字段"（字段名含 计划/plan/next，isPlanLikeField 3507）按 `\n`/`\r?\n` 拆行、剥掉行首 `-•*数字.、)）` 前缀（splitPlanTextToTodoItems 2637）→ 去重（normalizeTodoText 小写压缩空格）→ **排除已存在未完成项** → 逐个 unshift（先序反插保顺序）优先级"中"。createTomorrowRecord 内也会自动调用一次并提示同步条数。

## 5. 记账（bookkeeping）

- 字段：id/time(yyyy-MM-dd)/amount(item? no: amount Number|null)/item/category/reason/isDraft/generatedFromRuleId；`newBookkeepingEntry` 表单以日历选中日期为 time 写入（addBookkeepingEntry 4010，校验金额与事项；新类别自动并入 bookkeepingCategories）。
- 类别管理：bookkeepingCategories 主存储；下拉用 computed bookkeepingCategoryOptions（含条目历史+规则+表单输入，Dedupe 2378）；addBookkeepingCategory 防重；removeBookkeepingCategory 把条目/规则/表单上同名类别清空（4036–4061）。
- 列表：sortedBookkeepingEntries 时间倒序 → visibleBookkeepingEntries 只显示前 N；`handleBookkeepingScroll`（scrollHeight 距底 ≤24px 时 +10，4068）。行内直接改 time/amount/item/category/reason（el-控件双向绑 row），删除走 $confirm + 历史记录二次确认（removeBookkeepingEntry 4076）。
- **周期规则**：addRecurringRule（3556）校验 item+amount → 存规则 {dayOfMonth 1–28,amount,item,category,reason}；ensureRecurringDraftsForMonth(monthText)（3526）为每个规则生成 `time=monthText-{day}` 的 `isDraft:true`、`generatedFromRuleId` 草稿（已有则跳过），触发点=normalizeState / mounted / selectedAccountingDate watch / recurringRules watch / handleTabChange(accounting)；草稿可在明细表打勾确认（confirmBookkeepingDraft 4062）；删除规则同时删除其未确认草稿（removeRecurringRule 3572）。
- 口径：accountingSummary.totalAmount=全部、currentMonthAmount=今日 yyyy-MM 当月（2299）；`getWeeklyAccountingStats` 用 ISO 周 key `yyyy-Www`（getWeekKey 4102，周一对齐周四法）；`getMonthlyAccountingStats` 按月 yyyy-MM 聚合；`getBookkeepingCategoryStats` 金额>0 按类别求和排序（3420）；日历数据=bookkeepingDailySummary（日期→{totalAmount,count}，2338），getCalendarDaySpend/Count 查表。

## 6. Overview / 统计口径与热力图

- 卡片口径（overviewCards 2406）：本周平均分=近 7 天所有数值项目分的"平均值的平均"、周均时长=近7天 duration 的算术平均（含 0 时长日）、待办执行、本月/累计支出、风险项目数。
- 周对比：studyTrendSummary（2326）=getRecentStudyRows(7,0)/(7,7) → calculateRowsAverageScore（Σ数值分/Σ项目数，**非逐日均分再平均**，3372）→ calculateRateChange（环比，上期为 0 则 NaN 显示 '--'，3390）；calculateAverageDuration=含零天数平均（3381）。
- 风险提醒：`getConsecutiveLowCount(columnId)`（3262）从最近日期往前数"连续 <60 且为数值"的行数，遇达标/非数值中断；≥3 进 alerts（type error）、≥2 进 overviewRiskColumns 与 detailedTips；alerts 另含"无日期草稿行（>3 error 否则 info）、今天没记录、今天仍有空项目"（2192–2237），截 MAX_ALERTS=5。
- 图表数据源：`getSortedChartRows`=升序且 date≤今天（3244）；单值 `getChartValue` 非数值显示 '-'；markLine=列目标虚线（getSeriesTargetLine 3298），markPoint=低于目标点（getBelowTargetMarkPoints 3273）。
- **热力图公式**：buildStudyHeatmapSeries（3410）=当月每天 `[date, (该行全部数值项目分之和) + durationMinutes]`（"综合强度"），ECharts calendar+heatmap、visualMap max=该月最大强度。
- 趋势摘要/今日动作链：`ensureTodayRecord`→`getTodayText`→studyRows(升序有日期)→overviewRecentReviews(最近3行,72字摘要)；overviewPendingTodos=前 5 未完成。渲染统一走 renderCharts（4198）一个函数：grouped 模式按组出图（同组多线一图），否则单列一图；随后周/月柱状、热力图、时长折线、类别饼图；notMerge=true、dispose 旧实例防泄漏。
- "学习状态跟踪"核心数据链：键盘输入 → updateMetric/updateDuration → watch tableData(deep) → schedulePersistState(80ms) → persistState；同时 $nextTick(renderCharts) 重画；任何列/组/复盘字段变更 watch 亦触发布局归一 + 持久化 + 重画。排序/筛选是纯 computed，不改数据。

## 7. 导入导出与报告

- **JSON 导出**（exportData 3772）：`{version:4, exportedAt, state:getSerializableState()}`，缩进 2，文件名 `学习状态跟踪-完整数据-{今日}.json`；下载走 Blob+临时 <a>（downloadFile 3745）。每次成功导出（含 Excel/PDF）`recordBackupExportTime`（3756：lastExportAt=now、清 snooze、清 recovery 标记）。
- **JSON 导入**（handleDataImport 3699）：≤2MB → FileReader → JSON.parse → `parsed.state || parsed`（兼容无信封旧文件）→ $confirm"覆盖当前数据" → applySnapshot。
- **Excel 导出**（exportExcel 3780）：表头 = `日期 | 时长（分钟） | [项目名（组）]×显示列 | noteFields×n`；行=当前 filteredTableData（跟随筛选）；HTML `<table border=1>` 字符串以 `application/vnd.ms-excel` 下载 `学习状态跟踪-{今日}.xls`；html 特殊字符 escapeHtml 转义（3777）。
- **PDF 周/月报**（exportPdfReport 3835 + buildReportData 3878 + buildReportHtml 3925 + buildReportBarsHtml 3913）：
  - 数据：周=近 7 天 studyRows、月=今天所在月；title='周报'/'月报'；periodText；avgScore/avgDuration；scoreBars/durationBars 按天；bookkeepingStats：周期内条目总金额+按类别合计（周口径=与学习行同日期、月口径=同 yyyy-MM，未分类归 '未分类'）；reviews=最近 5 行复盘字段 join。
  - 渲染：离屏 wrapper（fixed/left:-99999px/width900/白底/内联样式）→ `html2canvas(wrapper,{scale:2})` → `jsPDF('p','pt','a4')` 单张 PNG 长图按页高（pageHeight-40）循环 addPage/addImage 切页 → `学习状态跟踪-{周报|月报}-{今日}.pdf`；失败 $message.error，finally 移除 wrapper。依赖缺失（!html2canvas||!jspdf）先拦截提示。

## 8. 键盘 / UI 交互、确认与错误恢复

- 键盘：Todo 输入回车新增、编辑态 Enter 保存 Esc 取消（模板 1120/1137–1138）；无其他全局快捷键。
- 列宽拖拽：el-table `@header-dragend` → handleTableHeaderDragEnd 按 column-key 归类（date/duration/notes/actions/metric:{id}）写 tableLayout，80ms 防抖落 localStorage；**列宽不进入导入导出**。
- 表格间距：2 个 el-slider 绑 cellPaddingX/Y → coreTableSpacingStyle 输出 CSS 变量 `--core-table-cell-padding-x/y`（2241）即时生效；resetTableSpacing 回 8/8。
- 确认弹窗：删除行 / 删除列 / 导入覆盖 / 删除记账（历史二次确认）/ 备份提醒 / 缓存恢复提示 均 element-ui $confirm/$alert；删除行、删除项目列、删除周期规则等给出明确后果文案；$message 反馈成功/警告/错误。
- 错误恢复：localStorage 损坏 → 初始化 + 一次性 error 弹窗"缓存恢复提醒"（promptStorageRecoveryIfNeeded 3762）；JSON 导入解析失败/缺字段提示；PDF 依赖缺失、导出超 2MB、非法分数输入、日期重复（handleRowDateChange 拦截"同一天两条"）等均有 warning；重复日期/重复类别/删除保留组均有拦截提示。
- 备份提醒：>7 天未导出 → promptExportIfBackupExpired（3815）"立即导出 / 24小时后提醒我"（snoozeBackupReminder 写 snoozeUntil，24h 后再次）。
- 桌面提醒：Notification API（enabled+time 到点+当日未发 → new Notification('学习状态跟踪提醒')，checkReminderTrigger 3488；30s setInterval；权限流转 handleReminderToggle/requestNotificationPermission 3454/3433；permission 非 granted 自动回关开关）。

## 9. 方法职责清单（行号=定义处）

| 方法（行号） | 职责 |
|---|---|
| **持久化/布局** |
| persistState(2856) | 序列化全部业务+UI 状态写 STORAGE_KEY，并写 meta 时间戳 |
| getSerializableState(2881) | 返回导出的深拷贝 state（列去 width、metrics 嵌套分组） |
| schedulePersistState(2901) | 80ms 防抖落盘（watch 主入口） |
| restoreState(2910) | 读主 key 白名单恢复；损坏删除并回退初始态 |
| normalizeState(2954) | 全量迁移/标准化/补今日/补周期草稿并持久化 |
| persistTableLayout(2559)/schedulePersistTableLayout(2563)/restoreTableLayout(2572) | 布局 key 的写/防抖/读 |
| normalizeTableLayout(2535)/normalizeTableLayoutWidth(2525) | 布局字段夹范围；getColumnWidth(2586) 取列宽 |
| handleTableHeaderDragEnd(2603) | 表头拖拽列宽按 column-key 记入 tableLayout |
| resetTableSpacing(2629) | 单元格间距重置 8/8 并提示 |
| **行 CRUD/日期** |
| ensureTodayRecord(3102) | 今日无记录补一行并滚动定位 |
| createTomorrowRecord(4154) | 按今日/最近行克隆"明天"空记录，计划类字段保留并拆 Todo |
| addBlankRow(3604)/copyRow(3587)/removeRow(3616) | 增空行（受容量限）/复制为空日期行/确认后删除（至少留 1 行） |
| handleRowDateChange(3125) | 改行日期，拦截重复后重排+滚动 |
| scrollToDateRow(3141)/scrollToTodayRow(3612) | 平滑滚动到指定日期/今日行 |
| updateMetric(3324)/finalizeMetric(3333)/updateDuration(3340) | 分数清洗写入 / blur 归一草稿值 / 时长非负写入 |
| createEmptyRow(3360)/createEmptyMetrics(3350)/createEmptyNotes(3355) | 各类空对象工厂 |
| getNormalizedRows(3095)/enforceUniqueDates(3112) | 排序 + 空行截断 / 同日重复置空日期 |
| isDuplicateDate(3121)/findRowIndex(3240)/isLockedRow(3061)/isPastDate(3060)/getDatePickerOptions(3062)/getTableRowClassName(3137) | 日期去重判定 / 行定位 / 历史锁定系 |
| **列/组/复盘字段配置** |
| openGroupConfigDialog(3632)/submitNewColumn(3636) | 打开分组配置 / 新增项目列并给所有行补空值 |
| removeColumn(3648)/addGroup(3657)/removeGroup(3664) | 确认删列（连数据）/加分组（防重名）/删组（项目转未分组，保留组禁删） |
| openNoteFieldsDialog(3681)/addNoteField(3682)/removeNoteField(3690) | 复盘字段弹窗/新增并补行/删除并清行 |
| **Todo** |
| addTodo(3962) | 校验后 unshift 新待办并重置表单 |
| handleTodoToggle(3970) | 勾选/取消时维护 completedAt 并收起已完成折叠 |
| startTodoEdit(3977)/cancelTodoEdit(3982)/saveTodoEdit(3987) | 进入编辑/放弃/保存文本与优先级 |
| removeTodo(3997)/clearCompletedTodos(4007) | 删除未完成项（已完成拒绝） / 仅提示已归档不删 |
| splitPlanTextToTodoItems(2637)/collectPlanTodoTextsFromRow(2642)/appendPlanTodosToList(2663) | 拆行去前缀 / 收集计划字段文本去重 / 插为 Todo 并跳重 |
| syncTodayPlanToTodos(2688) | 把今天(或最近)行的明日计划一键同步 Todo |
| isPlanLikeField(3507)/createTomorrowNotes(3513)/normalizeTodoText(2634) | 计划字段识别 / 明天行计划复制 / 去重 key |
| **记账** |
| addBookkeepingEntry(4010) | 校验金额事项，按日历日期写入，自动收录新类别 |
| addBookkeepingCategory(4022)/removeBookkeepingCategory(4036) | 新增防重类别 / 删除并清空关联记录类别 |
| confirmBookkeepingDraft(4062) | 周期草稿转已确认 |
| removeBookkeepingEntry(4076) | 确认删除；历史记录二次确认 |
| handleBookkeepingScroll(4068) | 滚动近底 +10 条增量加载 |
| ensureRecurringDraftsForMonth(3526)/getRecurringTargetDate(3504) | 补某月周期草稿（幂等）/ 目标日期=月-日 |
| addRecurringRule(3556)/removeRecurringRule(3572) | 新增周期规则并补草稿 / 删除规则连带未确认草稿 |
| **统计/图表数据** |
| getSortedRows(3087)/getSortedChartRows(3244)/getChartDateLabels(3253)/getChartValue(3261) | 行排序族 / 图表行(≤今天) / x 轴标签(无日期标"未填写日期-n") / 数值化 |
| getRowAverageScore(3164)/getRowMetricNumbers(3363)/getRowIncompleteCount(3171)/isRowIncomplete(3176)/rowHasLowScore(3157) | 行级平均分/数值集/未补齐/低分判定 |
| getRowSearchText(3179)/hasRowReviewDetail(3191)/getRowNoteDetail(3199) | 行搜索文本拼接 / 复盘是否有内容 / 取字段或"未填写" |
| compareTableRows(3206) | 5 种排序模式比较器 |
| getConsecutiveLowCount(3262)/getBelowTargetMarkPoints(3273)/getSeriesTargetLine(3298) | 连续偏低计数 / 低于目标散点 / 目标虚线 |
| projectChartHasData(3308)/groupChartHasData(3311)/chartHasData(2175 计算属性) | 单列/整组是否有可画数据 |
| calculateRowsAverageScore(3372)/calculateAverageDuration(3381)/calculateRateChange(3390)/getRecentStudyRows(3396) | 均分(全数值均值)/含零日均时长/环比/滑动 7 天窗口 |
| getDurationTrendSeries(3405)/buildStudyHeatmapSeries(3410) | 每日时长序列 / 热力图[date, 分和+时长] |
| getBookkeepingCategoryStats(3420)/getWeekKey(4102)/getWeeklyAccountingStats(4112)/getMonthlyAccountingStats(4122) | 类别聚合 / ISO 周 key / 周金额 / 月金额 |
| getCalendarDaySpend(4131)/getCalendarDayCount(4135) | 日历单元格当日支出/笔数查表 |
| **提醒/备份恢复** |
| requestNotificationPermission(3433)/handleReminderToggle(3454) | 请求通知权限(更新开关态) / 开关联动权限检查 |
| setupReminderTimer(3475)/checkReminderTrigger(3488) | 30s 轮询定时器 / 到点且当日未发则弹桌面通知 |
| promptStorageRecoveryIfNeeded(3762) | 缓存损坏后弹一次性恢复提示 |
| isBackupExpired(3794)/isBackupReminderSnoozed(3801)/snoozeBackupReminder(3810)/promptExportIfBackupExpired(3815) | 备份是否超 7 天 / 是否 snooze 中 / 延后 24h / 弹备份提醒 |
| **导入导出/PDF** |
| triggerDataImport(3694)/handleDataImport(3699)/applySnapshot(3721) | 触发文件选择 / 读文件解析校验确认 / 覆盖应用快照 |
| downloadFile(3745)/recordBackupExportTime(3756) | Blob 下载工具 / 记录最近导出时间并清提醒状态 |
| exportData(3772) | 导出完整 JSON（version:4 信封） |
| exportExcel(3780) | 当前筛选行拼 HTML 表下载 .xls |
| exportPdfReport(3835)/buildReportData(3878)/buildReportBarsHtml(3913)/buildReportHtml(3925) | html2canvas+jspdf 分页导出 / 报告数据 / 条形图 HTML / 报告 DOM |
| escapeHtml(3777) | 导出内容 HTML 转义 |
| **筛选/视图/图表生命周期** |
| resetFilters(4140)/resetReviewFilter(4139) | 重置学习表/复盘筛选 |
| applyDateRangeShortcut(4149)/getPresetRange(4141) | 快捷区间(周6/半月14/月29/全部)应用到 table/review |
| handleTabChange(4309) | 切 tab：进表格补今日行、进记账补周期草稿、重绘图表 |
| toggleChartMode(4189)/toggleNotesCollapsed(2703) | 组图↔单列图切换 / 折叠复盘栏 |
| initCharts(4197)/renderCharts(4198)/resizeCharts(4303) | 初始化(依赖检查)/统一重画全部 6 类图/窗口 resize 跟随 |
| disposeGroupedCharts(4193)/disposeProjectCharts(4194)/disposeBookkeepingCharts(4195)/disposeExtraCharts(4196) | 对应图表实例 dispose 清数组 |
| **工具/格式化** |
| getTodayText(2704)/getTomorrowText(2708) | 本地 yyyy-MM-dd 今天/明天 |
| formatDateOnly(2713)/formatDateTime(2726)/formatNumber(2739)/formatPercent(2743)/formatMinutes(2751)/formatCurrency(2758) | 日期/时间/数值/百分比/分钟/金额展示格式化 |
| createId(2759) | 前缀+时间戳+随机后缀生成 id |
| normalizeTodoPriority(2511)/getTodoPriorityRank(2514)/getTodoPriorityType(2518)/normalizeReminderTime(2496) | 优先级合法化/排序权重/el-tag type/提醒时间夹取 |
| isNumericMetric(2760)/isMetricDraftValue(2763)/formatMetricNumber(2766)/sanitizeMetric(3316)/isLowScore(3072) | 项目值合法性与清洗（见 §3） |
| getMetricStorageGroupKey(2776)/getMetricStorageProjectKey(2779)/getLegacyMetricStorageKey(2782)/getMetricStorageKey(2785)/findMetricValueInGroupedStore(2788)/serializeRowMetrics(2802)/deserializeRowMetrics(2815)/createSerializableRows(2834)/createExportableProjectColumns(2845)/getGroupName(2852) | metrics 嵌套存储/多版本读取/行与列的可序列化版本/组名 |
| getColumnTarget(3073)/isBelowTarget(3079)/getColumnMeta(3083)/getTableActiveColumns(3161) | 列目标读取 / 低于目标标记 / 表头副文案 / 活动列集 |

说明：表格覆盖方法全集（约 130 个，其中纯格式化/纯 dispose 等按行合并）；data 域中 `stats`、`bookkeepingUnlockedEntryIds`、`clearCompletedTodos` 模板未直接使用，[未知]是否遗留。行号均为定义行。
