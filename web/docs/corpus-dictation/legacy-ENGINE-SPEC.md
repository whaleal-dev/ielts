# 王璐语料库听写引擎与行为逻辑规格（旧实现复刻基线）

- 分析对象：`listening-word/王璐语料库_源码.html`（14056 行；`CHAPTER_WORD_SETS` 数据 1237–11044，主脚本 1235–14054，代码段实际 11045 起；外链 `scripts/listen_navigation.js` 于 1234 引入）。
- 术语：词=单词/词组（库内一律小写存储）；条目 id=`${chapterId}::${word}`；练习 entry id=`${chapterId||auto}::${word}::${index}`。
- 功能面：章节(88 卷)选词→听写/听音→判分统计→错词本→章节统计折线→JSON/CSV 备份。UI 三个 tab：练习 945、错词本 1157、章节统计 1196。`[未知]`=源码无法确定。

## 1 章节/词选择与练习队列构建

- 数据：`CHAPTER_WORD_SETS`（1237–11044）：键=卷/章节 id（字符串数字，如 31…39/41…44/51…59/510–512/811–863/1101–1104/1201–1205/12041–12043/8110–8115/8410–8412 等，共 88 个），值 `{title:"Chapter N …Test Paper M", words:[小写词…]}`。无“卷”独立概念：id 即卷号。chapterEntries=按数字升序 entries（11154）。
- 载入：选章节 → `applyChapterSelection`（12444）把整章 words join("\n") 填 textarea 并 saveSettings；`autoLoad:true` 直接 `loadWordSet`。选“手动输入/自定义”（value=""）只保存不载入。chapterSelect change（13705）。
- 词校验链：`parseWords`（11209）行切分+trim+小写+Set 去重 → `resolveWordMeta`（11301）经 `buildWordLibrary`（11279，Map<词, 出现章节数组>，取选中章节命中或首条）→ `resolveInputWords`（11314）把词分三类：库内（进 wordMetaMap）、属于别章（chapterMismatch）、不在库（missing）。
- `loadWordSet`（13113）：校验间隔≥0、语速 0.4–2；validWords 为空抛错列出两类异常词；有异常词自动改写 textarea 为有效词并提示；写入 state：unit/activeChapterId/fullChapterPractice/intervalMs/两个 rate/practiceMode/listenOrder/listenRepeatCount/bigLoopCount。
- 队列条目：`createPracticeEntriesFromWords`（11229）→ 每个词 {id,word,meta}；仅在「听音模式 && listenOrder=random」时 Fisher–Yates `shufflePracticeEntries`（11254），听写永远顺序。`resetSession`（13067）重建 practiceEntryMap/words(=id 数组)/pendingWords/mistakeEntries/masteredWords 等并 render。
- 入口 ①章节/自定义词列表：开始按钮 `startPractice`（13266）=loadWordSet→`moveToNextWord`。②本轮错词重练：`restartWrongWords`（13433）用本轮 mistakeEntries 建 meta（错词书 entry 结构）队列，回填 chapterSelect（仅单一章节时）/textarea，activeChapterId 同、fullChapterPractice=false。③错词本练习：`startSelectedMistakePractice`（13681）范围=已勾选(跨筛选)否则=当前章节筛选结果（12752），id 去重，单章回填章节，resetSession 后立即 moveToNextWord 并切 practice tab。
- 无“子集/仅收藏”概念；范围控制只有：全章自动填充、textarea 自定义、错词筛选/勾选。fullChapterPractice 判定 `isFullChapterSelection`（12292）=与章节词集合完全相等（长度+逐词包含）。

## 2 听写引擎状态机（dictation）

- 状态字段见 state（11157–11201）＋动态 practiceMode/currentListenRepeatIndex（13097）。关键：sessionStarted/isFinished/isPaused/currentWord/currentWordResolved/currentAudioFinished/waitingForAnswer/showWords/pendingTimer。
- 推进 `moveToNextWord`（13178）：取 pendingWords[0] → waitingForAnswer=!listen；听写时聚焦 answerInput、清空；填进度 chip/prompt；`await playWord`。队列空→`recordChapterPracticeIfNeeded`→置 finished、提示总结。顶部一律 clearTimer。
- 播放→答题顺序：开始即播音频；音频 `ended`（13998）置 currentAudioFinished=true → `queueNextWordAfterInterval`（12536）。间隔=0（isAutoAdvanceEnabled false，12532）不自动跳转，等手动“下一题”。
- 判分 `submitAnswer`（13314）：`answerInput.value.trim().toLowerCase()` 与库词（已小写）全等比较——大小写不敏感、首尾空白容忍；**不做**内部空白/标点/连字符归一，词组须逐空格一致；无首字母提示、无正则模糊。Enter 提交（13737）。
  - 对：recordWordPractice(true)→pending 移除→masteredWords 追加（去重）→即时 moveToNextWord（不等音频/间隔，清 timer；13329 注释明示）。
  - 错：`finishCurrentWordAsMistake`（13296）→recordWordPractice(false)→`recordMistake`（13282，本轮错词列表 upsert＋错词书 upsert +3）→pendingWords.shift→waitingForAnswer=false、resolved=true→`handleResolvedWordState`（12573）。
- 判错动作/节奏：pending 队列 shift（词本轮不再复现）；音频未结束则提示“等待当前音频播放结束后进入下一题”，ended 后再起间隔计时；间隔到时若仍未 resolve 则按已输入或“未作答”判错（12562-12565）。重试=本轮结束后“只练错词/错词本重练”，非题内重试。
- 超时/跳过/查看：间隔到期未答=错词（12562-12565）；“显示单词”revealBtn=按错词处理（`revealCurrentWord` 13344，记录答案“已查看单词”）；重播 replay 13425 仅重播不计分。restartWrongBtn=13433。
- 每词 UI 更新：renderPendingList（12636，待练列表 label 默认 `.masked` 545 模糊：transparent+text-shadow+user-select:none，state.showWords=false），“显示/隐藏单词”toggle 1126 全局开关（13768）；“当前”角标仅 waitingForAnswer 显示（12633）；wordDisplay 大字仅听音模式使用（见 §3）。
- 自动下一题计时守卫：queueNextWordAfterInterval 捕获 scheduledWord，回调校验 isPaused/isFinished/currentWord 是否仍是它（12549-12552）；moveToNextWord/submit/暂停/重播均先 clearTimer（11415）。无 per-src token。
- 进度 chip：`第 i/n 个`；结束置“本轮结束”。列表空判定完成，非百分比。

## 3 听音模式（listen）差异

- 进入：modeSelect=listen（1001）。控件启用/禁用 `renderModeControls`（13009）：仅听音可用听音顺序(sequence/random)/单词循环次数(≥1)/大循环次数(≥1)；听音专属按钮 prevBtn 显示。
- 与听写差异：waitingForAnswer=false、currentWordResolved=true（13128）；answerInput 禁用；进入每题 activeElement.blur（13234）；不 focus 输入框。
- 每词显示：把词写进 wordDisplayText；state.listenWordHidden（默认 true，持久化）决定 wordDisplay 隐藏/显示（13241-13252、13774 hideWordBtn）。wordDisplay 有 hidden 属性默认收起，仅听音使用。
- 播放节奏：audio ended（13998）→ currentListenRepeatIndex+1 未达 listenRepeatCount 则立即重播当前词（提示第 x/次数）；达次→currentAudioFinished=true→按间隔排队 shift+下一词。大循环：一轮排空后若 bigLoopIndex<bigLoopCount-1，random 则重洗全队列（13182-13195），提示“第 x/y 轮大循环”。进度 chip 显示（第 x/y 轮）。
- 停止/继续/重播/上下首：pauseOrResume（13401）暂停=清 timer+audio.pause；继续=音频未完则重播当前、否则续间隔。goToNextWordManually（13350）/goToPreviousWordManually（13363，仅听音、回退原 words 顺序、unshift 前一条）。听音结束不写任何统计（recordChapterPracticeIfNeeded 12403 内 isListenMode 直接 return）。
- 展示词显隐与“先听后写”：听写流程固定先听后答，展示词功能属听音；听写防看答案靠待练列表模糊+答后 promptText 才显示正解。

## 4 音频

- URL 构造：远程 `http://www.1kao.com.cn/iSpell/Spell/audio/{encodeURIComponent(unit)}/{encodeURIComponent(word)}.mp3`（buildAudioUrl 11361）。本地：`isLocalSection`（11336）命中 unit∈{1201-1205,12041-12043} 或 chapterTitle 以 "Chapter 8 " 开头 → `buildLocalAudioPath`（11343）：文件名=空格换下划线+".mp3"；Chapter 8 按 title 正则 `^Chapter 8 (.+?) (\d{2}_.+_chunks)$` 拼 `chapter8/{groupDir}/{chunkDir}/{file}`；其余按 sectionMap 拼 `chunks/section{N}/{file}`；base 为绝对路径 `/Users/lhp/Desktop/codeProject/ielts-dev/listening-word/`。`[未知]`远程服务器路径语义/可用性。
- 播放器：单例 `new Audio()`（11207）复用。`playWord`（12474）：按词查 entry 取 spelling/meta；词含空格判定词组用 phrasePlaybackRate（0.8 默认）否则 playbackRate（12469）；先 disposeObjectUrl→currentAudioFinished=false→本地则 src=路径、rate、currentTime=0、await play；远程则 AUDIO_CACHE_ENABLED=false（11059-11061，注释：改流式播放不写 IDB 以免占满配额）→ 直接 audio.src=远程 URL 播放，catch 仅提示。
- 缓存（遗留能力，未启用）：IDB `ielts-dictation-audio-db` v1 store `audios`(keyPath id)，record `{id:`${unit}::${word}`,unit,word,blob,updatedAt}`（11056-11058、12153-12225 openAudioDb/get/put/clear/count/fetchAndCacheAudio）；AUDIO_CACHE_ENABLED=true 时命中走 objectURL、未命中下载入缓存、失败回退直连远程。initialize（14039-14046）在禁用态清空历史音频库。statCached=countAudioRecords（启用时为 0）。
- 试听：feedbackSpeakBtn（13744）用反馈词再 playWord；错词本“发声”playMistakeEntry（13516），会话中禁止试听，rate=1，同样分流本地/远程。
- 竞态防护：src 更换前 revoke objectURL（disposeObjectUrl 12462，playWord/playMistakeEntry 开头调用）；ended 回调只在 listen 重复计数内重播、否则统一走 currentAudioFinished→queue；timer 用 scheduledWord 身份校验；判对即时切词（旧 src 播放被新 src 打断，无错词记录）。
- 失败回退：本地加载失败/远程 play() 拒绝仅 setFeedback 错误文案（12493-12498），提示“可先重播…通常是音频源不可达或混合内容拦截”。**无 audio 'error'/'canplay'/'stalled' 监听**：远程 404/挂起时可能无 ended、静默卡在当前词 `[未知风险]`。

## 5 进度/统计写入

- 每词曝光：wordStats（IDB kv）`{[`${chapterId}::${word}`]: {practiceCount, correctCount}}`。仅在「被判分」时写：判对 recordWordPractice(true)（13323）、判错/超时/查看 recordWordPractice(false)（13302）各一次。听音不写。重复词自动累积。
- 正确率口径：词级=getWordAccuracy（12251）=round(correct/practice×1000)/10；显示 metrics.practiceCount=max(stats.practice, wrongCount+correct)（12244）。会话级正确率=mastered/words。
- 章节统计：`recordChapterPracticeIfNeeded`（12403）仅在满足（听写 && activeChapterId && fullChapterPractice && words 非空 && 本会话未记）时于队列走空处（13197）追加 `{timestamp, accuracy(1 位小数), correct=masteredWords.length, total=words.length}` 到 chapterStats[chapterId]，并把 selectedStatsChapterId 指向该章。
- 统计持久化：settings→localStorage；错词本/wordStats/chapterStats→data DB（`ielts-dictation-data-db` v1 store `kv`，11064-11068），带 localStorage 旧值迁移并删除原键（12063-12088），写入失败回退 localStorage 并报 libraryNotice（12047）。启动顺序 initialize（14013）：populate→loadSettings→loadMistakeBook→loadWordStats→hydrateWordStatsFromMistakeBook（12139，错词 wrongCount 兜底 practiceCount、correct≤practice）→loadChapterStats→bindEvents→恢复上次选章/自定义词→音频清理→缓存计数→备份提醒。
- 图表/历史数据源：stats tab 折线=chapterStats[选中章] 记录数组按插入序绘制 SVG polyline（12907-12937），guide 0-100%，点=accuracy；列表倒序展示 {时间,正确率,correct/total}（12954）。
- 口径注意：错词本按错误等级(0–10)/次数排序与筛选、章节筛选只影响显示与默认练习范围；清空 wordStats 会连带错词正确率显示变 0 但不错删错词本。

## 6 错词本/历史与备份

- 错词本条目（sanitizeMistakeBook 11593 定型）：`{id, word(小写), chapterId, chapterTitle, unit, wrongCount, errorLevel, recentAnswers[≤5 字符串]，lastWrongAt}`；recentAnswers 含“未作答”占位（12337-12353）。等级常量：听写错 +3（MISTAKE_ERROR_LEVEL_ON_DICTATION 11054）、手动 +1、上限 10、降到 0=删除（11053-11055、13488-13491）。
- 增改删：`upsertMistakeBook`（12317，判错时错答案计入）+`bumpMistakeBookEntry`（12325 统一 +Δ/记 recentAnswers/wrongCount/lastWrongAt、按 lastWrongAt 降序排序、立即 save）→ 每次判错自动累积、全量落库；手动 add 当前词 +1（13453）；-1（13474）；移除/删除（13500/13571）；勾选即 renderMistakeBook（12758）。
- 背诵/复练入口：错词本 tab 支持多选章节筛选（multi select 1168、syncSelectedMistakeChapters 13587）、预设批量勾选（低正确率<50% 13607 / 错≥3 次 13623 / 近 7 天 13639）、反选/清选、排序 4 键 errorLevel|errorRate|wrongCount|recent（12767-12799，recent 白名单迁移在 11466-11469）；练习按钮优先级=勾选>筛选（12752）；每轮会话错词“只练错词”即时入口（13433）。历史=章节统计记录（§5），无独立“难词本/收藏”概念——错词本等级即难度近似。
- 导出：选中错词 CSV（BOM+UTF-8，`escapeCsvCell` 11808，列：单词/章节/错误等级/错误次数/练习次数/正确率/最近 5 次错误拼写）；JSON 学习记录备份 `downloadBackup`（11800）文件名 `语料库学习记录备份-{stamp}.json`，记录导出时间。
- 备份 envelope（buildBackupPayload 11488）：`{version:2, exportedAt, settings:{chapter,interval,speed,phraseSpeed,mode,listenOrder,listenRepeat,listenBigLoop,words,showWords,activeTab,mistakeSortKey,statsChapterId}, mistakeBook, wordStats, chapterStats}`（不含音频）。
- 导入：≤2MB（11203）→JSON→`migrateBackupPayload`（11763，v1-v2 版本迁移：v1 用 lastAnswer 迁 recentAnswers、v2 结构清洗）→摘要预览（renderImportPreview 11668，展示将覆盖计数）→applyImportedPayload（11866）覆盖四类并重写 settings/刷新界面；`settings` 恢复有白名单与异常兜底（11564-11591、11880-11884）；导入即覆盖、无合并。
- 备份提醒：7 天间隔（11052），首次进入或超期弹 dialog（11527-11551），确认即导出。

## 7 键盘/焦点/清理/节流

- 快捷键：answerInput Enter=提交（13737）；全局 keydown（13902）：listenNavigation 动作优先→Escape 关确认框→F2（未开始且有词）开始→F4（当前已 resolve 且未结束）下一题。
- listen 专属方向键（仅 listen 模式、会话中、未结束、焦点不在可编辑元素）：↑ 重播 / ← 上一个 / → 下一个，经 `window.listenNavigation.resolveListenNavigationAction` 判定后 handleListenNavigationAction（13382）分发。听写模式方向键无效。
- mousedown/contextmenu（13938/13955）也调 listenNavigation（现恒返回 null，属预留契约）。
- 焦点管理：听写每词 focus answerInput；听音 blur；确认框 openConfirmDialog 记录 lastFocusedElement、queueMicrotask focus 取消钮、关闭后还原（11932-11968）；Escape/遮罩点击=取消。
- 卸载清理：**无** beforeunload/unload/pagehide/visibilitychange 处理器，音频继续/中断行为未定义 `[未知]`；会话内清理靠 clearTimer + audio.pause + objectURL revoke（resetSession 13071-13073、pause 13419）。
- 防抖/节流：无；settings 的 input/change 直写 localStorage（13787-13797），textarea 输入逐键落盘。数据量小心得：错词/统计经 IDB，settings 每次全量 JSON 写 LS。

## 8 方法职责清单（分组，名称→职责；行号=定义处）

- 词库/匹配：parseWords 11209 行切 trim 小写去重；getChapterLabel 11220 章节标题带 id；createPracticeEntriesFromWords 11229 词→entry{id,word,meta}（random 听音才洗）；createPracticeEntriesFromMistakes 11239 错词→entry(unit 兜底)；shufflePracticeEntries 11254 Fisher-Yates；getPracticeEntry/Word/Meta 11263/11267/11271 三合一按 entryId 取词/元数据；buildEntriesFromCurrentWords 11275 words→entry 数组；buildWordLibrary 11279 词→章节列表 Map；resolveWordMeta 11301 命中/选章过滤/首条；resolveInputWords 11314 缺词与跨章词分类；isFullChapterSelection 12292 整章等集判定。
- 会话构建/校验：populateChapterSelect 12426 章节下拉（首项手动输入）；applyChapterSelection 12444 选章回填词表+save/autoLoad；loadWordSet 13113 校验+写 state+建队列；resetSession 13067 全量重置会话态；startPractice 13266 loadWordSet+首词；moveToNextWord 13178 推进/结束/大循环边界。
- 判分/反馈：submitAnswer 13314 判对即切、判错走 finish；finishCurrentWordAsMistake 13296 判错统一处理+移出 pending；revealCurrentWord 13344 按错处理；recordMistake 13282 本轮错词列表+错词书联动；recordWordPractice 12388 词统计+1；recordChapterPracticeIfNeeded 12403 章节历史条件写入。
- 听音控制：goToNextWordManually 13350；goToPreviousWordManually 13363；handleListenNavigationAction 13382 动作分发；pauseOrResume 13401；replayCurrentWord 13425；restartWrongWords 13433 只练错词会话；queueNextWordAfterInterval 12536 间隔定时（含守卫）；isAutoAdvanceEnabled 12532；handleResolvedWordState 12573 判错后按音频状态排队。
- 音频/缓存：buildAudioUrl 11361 远程 1kao URL；isLocalSection 11336 本地章节判定；buildLocalAudioPath 11343 本地路径（空格→_）；getPlaybackRateForSpelling 12469 词组/单词速率；disposeObjectUrl 12462；playWord 12474 主播放（本地/远程/缓存）；playMistakeEntry 13516 错词试听；openAudioDb 12153/getAudioRecord 12169/putAudioRecord 12180/clearAudioRecords 12190/countAudioRecords 12200 IDB 音频库五件套；fetchAndCacheAudio 12210 下载缓存；updateCachedCount 12227 计数刷新。
- 渲染：render 13021 总装（is-practicing class、按钮态）；renderStats 12582 四统计；renderPendingList 12636 待练（masked/当前角标）；createPendingWordNode 12606/updatePendingWordNode 12627；renderMasteredList 12666；renderMistakeList 12680 本轮错词；renderMistakeBook 12758 错词本全量（筛选/排序/勾选/行动作）；renderMistakeChapterFilters 12703；renderMistakeActionButtons 13049 当前词加/减/移除钮态；renderTabs 12307/setActiveTab 12301；renderModeControls 13009；renderSummary 12973 结束摘要；renderStatsChapterOptions 12881/renderStatsChart 12907 SVG 折线/renderChapterStats 12939；renderList 12591 通用列表。
- 错词本操作：upsertMistakeBook 12317；bumpMistakeBookEntry 12325；removeMistakeBookEntryByMeta 12363；getMistakeBookEntryByMeta 12380；addCurrentWordToMistakeBook 13453；decreaseCurrentWordErrorLevel 13474；removeCurrentWordFromMistakeBook 13500；getCurrentPracticeMeta 13449；deleteMistakeEntry 13571；toggleMistakeSelection 13578；syncSelectedMistakeChapters 13587；clearMistakeChapterFilters 13598；selectLowAccuracyMistakes 13607；selectHighWrongCountMistakes 13623；selectRecentMistakes 13639；invertFilteredMistakeSelection 13656；clearMistakeSelections 13675；startSelectedMistakePractice 13681；getSelectedMistakeEntries 12733/getFilteredMistakeBookEntries 12737/getSelectedFilteredMistakeEntries 12743/isMistakeEntrySelected 12748/getMistakePracticeEntries 12752。
- 统计访问器：getMistakeEntryId 12236；getWordStatsForId 12240；getPracticeMetrics 12244；getWordAccuracy 12251；getRecentMistakeAnswers 12260；getDisplayUnit 12264；getSessionLabel 12280；isListenMode 12288。
- 持久化：saveSettings 11422/loadSettings 11447；openDataDb 11986；dataDbGet 12014/dataDbSet 12023；readLocalStorageJson 12033；persistData 12047；loadData 12064；save/loadMistakeBook 12090/12094；save/loadWordStats 12111/12115；save/loadChapterStats 12107/12127；hydrateWordStatsFromMistakeBook 12139；clearMistakeBookData 11901；clearChapterStatsData 11910；clearWordStatsData 11919；clearAudioCacheData 11926。
- 备份/导入导出：buildBackupPayload 11488；downloadFile 11786；downloadBackup 11800；escapeCsvCell 11808；exportSelectedMistakeWords 11812；previewImportFile 11841；applyImportedPayload 11866；buildImportSummary 11654；renderImportPreview 11668；clearImportPreview 11700；migrateBackupPayload 11763；sanitizeSettings 11564/sanitizeMistakeBook 11593/sanitizeWordStats 11706/sanitizeChapterStats 11723；detectMistakeBookVersion 11640；countChapterStatsRecords 11650；normalizeRecentAnswers 11553；getLastBackupExportTime 11513/recordBackupExportTime 11519/isBackupReminderDue 11527/promptBackupReminderIfNeeded 11532。
- 工具/对话：clearTimer 11415；setDialogMessage 11365（白名单 STRONG/BR）；setCacheStatus 11398；setFeedback 11402（含发音钮）；setLibraryNotice 11409；openConfirmDialog 11949/closeConfirmDialog 11932/confirmClearAction 11970；bindEvents 13704（全部事件绑定，含设置输入直存 13787-13797、模式切换重置会话 13813）；initialize 14013 启动序列。

## 9 关键易错点复刻清单

1. entry id 三段（chapterId::word::index）随建随改；错词/统计/章节键一律两段 chapterId::word——两套 id 体系勿混。
2. 听写判错即 shift 出队且写错词书 +3；判对却“立即切词”不等音频/间隔，播放器同 src 复用；两分支节奏完全不同。
3. 间隔计时只由 audio ended 触发（非题开始计时）；答案记录早于 ended 时须等 ended 才排下一题；timer 回调校验 scheduledWord 身份。
4. 听音重复循环在 ended 里自增 index 并即时重播，达到 listenRepeatCount 才置 currentAudioFinished——ended 回调是唯一推进点。
5. 大小写不敏感/trim 但内部空格与标点零容错；多词词组须与库内单空格写法一致；答案空串判错记“未作答”。
6. 词库所有词在 build 时小写归一；章节 id 键是字符串（"31" 非 31），比较必须一致。
7. 随机只对听音生效；听写恒顺序；大循环随机在轮间重洗且保持 ids 不变（仅重排 entry 数组）。
8. 章节统计只写「听写+完整章+词全过」一次/会话（sessionRecordSaved），听音/不完整/自动匹配一律不写。
9. 数据“先 IDB 后 localStorage 迁移并删旧键、失败回落”的读写路径与 settings 直写 LS 分开；数据库首次 open 失败整体降级 dataDbAvailable=false。
10. 音频缓存默认关闭却在启动清空历史缓存；但 cachedCount 仍数 IDB——用户点“清空音频缓存”走同一库。
11. 本地音频路径含绝对机器路径与空格转下划线文件名；章节 8 靠 title 正则拆两级目录；编码用 encodeURI 而非 encodeURIComponent（斜杠保留）。
12. recentAnswers 是“最近 5 次错误拼写”且把超时/未答记为“未作答”字符串；导入清洗按 v1 lastAnswer→v2 recentAnswers。
13. 错词 errorLevel 上限 10、判错 +3、手动 +1、减到 0 即删除；排序键迁移把旧 accuracy 归一为 errorRate（白名单）。
14. “显示单词/隐藏单词”在待练列表用 CSS masked 模糊（防看答案）与听音 wordDisplay 的 hidden 是两套独立开关（showWords vs listenWordHidden）。
15. 导入覆盖为全量覆盖并立即重渲染/重载（applyChapterSelection autoLoad），预览须先算清当前 vs 备份计数；settings 写入失败整体抛错阻断。

## 10 listen_navigation.js 的角色与主页面契约

- 纯函数模块：IIFE 挂 `window.listenNavigation={resolveListenNavigationAction(context)}`；无状态、无 DOM 副作用，仅按键映射决策。主页面 1234 引入，keydown/mousedown/contextmenu 三处调用（13902/13938/13955）。
- 输入契约 context：{eventType:"keydown"|"mousedown"|"contextmenu", key, target, button?, isListenMode, sessionStarted, isFinished, currentWord}（主页面构造）。输出：null 或 "repeat"/"previous"/"next"。
- 现行为：仅 eventType==="keydown" 且（listen 模式&&sessionStarted&&!isFinished&&currentWord 存在）且目标非 INPUT/TEXTAREA/SELECT/contentEditable 时：ArrowUp→repeat、ArrowLeft→previous、ArrowRight→next；其余（含鼠标两事件）恒 null。
- 与主页面契约：动作字符串由主页 handleListenNavigationAction（13382）执行；判定前置条件（模式/会话态/焦点可编辑排除）大部分在模块内完成，主页只传原始事件字段；Escape/F2/F4/Enter 由主页自有 handler 处理，不经模块。
- 重构含义：方向键语义被刻意外置、便于替换/扩展（如加鼠标手势时改这里并放宽 contextmenu 分支）；主页对 mousedown/contextmenu 已布点但模块不放行，属预留挂点，复刻时保持可空实现。  `[未知]`：鼠标分支原本意图。
