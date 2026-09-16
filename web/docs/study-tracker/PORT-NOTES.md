# study-tracker（学习状态跟踪）移植设计备忘

> 来源：daily-status/学习状态跟踪.html（4323 行）逐步人工梳理；完整移植分多轮进行。
> 里程碑：CSS 已容器化 `.study-tracker-app`（legacy-full.css，1080 行）。

## 页面拓扑（自上而下）
1. **Hero**：标题/说明 + 右上导入导出按钮组（导出数据 JSON / 导入数据 / 导出 Excel / 周报 PDF / 月报 PDF）+ hero-tags
2. **Todo List 卡片**（固定顶部，非 Tab）：录入行（el-input+优先级 select+新增）、汇总行、未完成列表（勾选/编辑/删除、优先级 tag、创建/完成时间）、已完成折叠面板
3. **el-tabs**（六个 pane）：
   - `Overview`（name=overview）：overview-summary-grid 统计卡 + 今日动作面板（未完成 Todo 摘要）+ 趋势摘要 + 填写提醒（reminder 设置） + 最近复盘与支出摘要；overview-layout
   - `学习记录表`（name=table）：工具栏（配置分组与组项目 / 配置最后栏位 / 明日计划同步 Todo）、核心数据表格（动态列：日期/时长/分组列/自定义列/备注/操作）、筛选（日期范围/关键词/分组/低分/未完成/排序）
   - `学习统计`（name=charts）：图表区（分组/项目/记账/额外图表容器，chartDisplayMode grouped/…，heatmapMonth 月热力图）
   - `复盘信息展览表`（name=review）：按日复盘导出式表格（reviewTableRows、动态列、日期范围/关键词筛选）
   - `记账本`（name=accounting）：分类管理、录入、列表（bookkeepingVisibleCount/解锁行）、图表与日历联动、周期草稿
   - `记录建议`（name=tips）：静态建议内容
4. 底部/常驻：本地自动保存提示

## 关键常量（原 L1907-1914）
- STORAGE_KEY=`daily-learning-tracker-state-v4`；STORAGE_META_KEY=`daily-learning-tracker-state-meta-v1`；TABLE_LAYOUT_STORAGE_KEY=`daily-learning-tracker-table-layout-v1`
- MAX_IMPORT_FILE_SIZE=2MB；LOW_SCORE_THRESHOLD=60；MAX_EMPTY_DATE_ROWS=3；MAX_ALERTS=5；BACKUP_REMINDER_DAYS=7（+SNOOZE 24h）
- DEFAULT_BOOKKEEPING_CATEGORIES（餐饮…）；PLAN_FIELD_KEYWORDS=['计划','plan','next']；TODO_PRIORITY_OPTIONS=['高','中','低','长期']；TODO_PRIORITY_RANK
- 日期工具：getMonthText → YYYY-MM
- createDefaultTableLayout：dateWidth170/durationWidth100/notesWidth420/actionWidth116/自定义列宽表

## createInitialState 顶层（部分，动态列/记账/提醒等为嵌套对象）
activeTab, groupChartInstances/projectChartInstances/bookkeepingChartInstances/extraChartInstances, persistTimer/tableLayoutPersistTimer/reminderTimer, chartDisplayMode('grouped'), heatmapMonth, notesCollapsed, newTodoText/newTodoPriority('中'), todoEditingId/Text/Priority, todoCompletedCollapseActive, groupConfigVisible, noteFieldsVisible, lastExportAt, backupReminderSnoozeUntil/Shown, storageRecoveryRequired, tableFilter{dateRange,keyword,groupId,onlyLowScore,onlyIncomplete,sortMode}, tableLayout, reviewFilter{...}, newGroupName/newNoteFieldName/newBookkeepingCategory, bookkeepingVisibleCount(10)/UnlockedEntryIds, newColumnForm{name,groupId,targetValue}, reminderConfig{enabled,time:'21:30',permission,lastSentDate} …

## 已确认 computed
todoPriorityOptions, studyRows, orderedColumns/displayedColumns/displayedColumnGroups, filteredTableData, reviewTableRows, noteColumnTitle, chartGroups/chartHasData, alerts, stats, completedTodoCount/pendingTodoCount, sortedTodoItems/pendingTodoItems/completedTodoItems, sortedBookkeepingEntries/visibleBookkeepingEntries/bookkeepingHasData/accountingSummary, selectedAccountingDate*, studyTrendSummary, currentWeekAverage/previousWeekAverage/weekOverWeekChange/currentWeekDurationAverage …

## 下一步（各轮增量）
1. 模块骨架：Hero + Todo（顶部区）全功能 + el-tabs 六 pane 空壳（统一 state v4 持久化）
2. 学习记录表（动态列/筛选/行操作/明日计划同步）
3. 学习统计（ECharts：分组/项目/记账/热力图）
4. 复盘展览表 + 导出 PDF/Excel/JSON（html2canvas+jspdf 链路）
5. 记账本（分类/录入/统计/日历联动/周期）
6. 记录建议 + 提醒（Notification）+ 收尾（build/tests/modules.ts done）
