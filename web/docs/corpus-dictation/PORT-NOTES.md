# corpus-dictation（语料库听写）移植设计备忘

> 目标：listening-word/王璐语料库_源码.html（14056 行；数据 1236–11043，引擎 11044–14054）
> 原生 JS 无框架；分析代理报告未落盘 → 本文件为自行梳理的事实基线（行号=原文件）。

## 常量与存储（11046+）
- EXPORT_FILE_PREFIX='语料库'
- localStorage：settings `ielts-dictation-settings-v2`；错词本 `…-mistake-book-v1`；词统计 `…-word-stats-v1`；章统计 `…-chapter-stats-v1`；备份时间 `…-backup-exported-at-v1`
- IndexedDB 音频缓存：`ielts-dictation-audio-db` v1 store `audios`（openAudioDb/getAudioRecord/putAudioRecord/countAudioRecords/clearAudioCacheData/clearAudioRecords；AUDIO_CACHE_ENABLED=false 常量为假但函数存在，本地 assets 有 buildLocalAudioPath）
- 数据 DB：`ielts-dictation-data-db` v1 store `kv`（dataDbGet/dataDbSet，存大对象/迁移）
- MISTAKE_MAX_ERROR_LEVEL=10；听写错误 +3；手动加入 +1

## 页面拓扑（915–1234）
- hero：标题/说明/6 统计 pill（stat-unit/total/remaining/mastered/mistakes/cached）
- Tab bar（练习/错词本/章节统计）→ tab-panel
- 练习 tab：
  - config-panel：章节 select/每词间隔/单词速度/词组速度/练习模式(听写|听音)/听音顺序(顺序|随机)/单词循环次数/大循环次数/词表 textarea + 状态行 + guide-note + tool-grid（备份导入导出带预览确认；数据管理清空 4 类）
  - practice：练习中心（progressChip/promptText/answerInput/wordDisplay 开关）+ mini-actions（start/pause/replay/submit/reveal/prev/next/restartWrong/错误等级±/移除错词）+ feedback(+播放按钮)
  - list-grid：待练习 pendingList / 已掌握 masteredList / 本轮错词 mistakeList（toggle 显示单词）
- 错词本 tab：章节多选筛选(Command)+7 操作按钮+排序(等级/错误率/错误次数/最近)+列表
- 章节统计 tab：章节 select + 自定义 SVG 折线 chart + 历史列表
- confirm-dialog 通用确认

## 引擎关键函数（148 个，见上轮抓取清单）
- 词表：parseWords/buildEntriesFromCurrentWords/resolveInputWords/resolveWordMeta/applyChapterSelection/buildWordLibrary（CHAPTER_WORD_SETS→wordLibrary）；buildAudioUrl/buildLocalAudioPath/buildPlayback…
- 练习队列：startPractice/shufflePracticeEntries/resetSession/moveToNextWord/queueNextWordAfterInterval/isAutoAdvanceEnabled/goToNext/PrevWordManually/restartWrongWords/startSelectedMistakePractice/createPracticeEntriesFromWords|FromMistakes
- 听写/听音：playWord/replayCurrentWord/pauseOrResume/submitAnswer/revealCurrentWord/resolveWord…（modeSelect dictation|listen；listenRepeat/BigLoop/speed 等）
- 错词/统计：upsertMistakeBook/bumpMistakeBookEntry/…/recordMistake/recordWordPractice/recordChapterPracticeIfNeeded/wordStats/chapterStats/sanitize*/getWordAccuracy/getPracticeMetrics
- 音频缓存：fetchAndCacheAudio/clearAudioCacheData/updateCachedCount（IndexedDB）
- 备份：downloadBackup/importData 预览确认/applyImportedPayload/migrateBackupPayload/buildImportSummary/recordBackupExportTime/promptBackupReminderIfNeeded
- 渲染：render（统一）/renderPendingList/MasteredList/MistakeList/MistakeBook/Stats/StatsChart(SVG)/Summary/Tabs/ModeControls 等
- 通用：setFeedback/setStatus/confirm 弹窗/键盘（听音：↑重播/←→切换）/listen_navigation 动作 handleListenNavigationAction

## 数据模型要点
- wordMeta：chapter/title/word→audio（按 chapter 匹配，仅本chapter词匹配；词组走词组速度）
- practiceEntry：word+meta+status 三状态（pending/mastered/mistake）
- mistakeEntry：word/meta/errorLevel(1..10)/错误次数/正确率/最近错误时间/recentAnswers（最新 N 次判题记录 normalizeRecentAnswers）
- chapterStats：单章完整练习一轮后写入历史（仅按章节+完整列表）

## 待实现分轮
1. 数据模型/store（settings/mistakeBook/wordStats/chapterStats + IDB 音频缓存 + 迁移 sanitize）
2. 练习 tab UI（配置/练习中心/三列表）与听写引擎状态机
3. 听音模式循环/顺序随机 + 键盘
4. 错词本 tab（筛选/批量选择/练习/排序）与章节统计 SVG + 备份导入导出（预览确认）
