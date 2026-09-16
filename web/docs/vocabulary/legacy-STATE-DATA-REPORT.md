# legacy 状态/持久化/数据模型 提取报告（study_words.html）

> 来源：重构分析子代理报告；行号锚点均指 `words/study_words.html`（6426 行）。
> 主逻辑在 2664–6424 行 `<script>`；文件内含多条几百 KB 巨型数据行（2660/2665/2724/2768–2770），
> 读取时用 `awk 'length($0)<600'` 过滤。

## 1. DEFAULT_STATE 完整字段树（2725–2766）
存储常量：`STORAGE_KEY="apple-word-trainer-v4"`(2667)；IDB `apple-word-trainer`/store `kv`(2668–2669)；`REVIEW_INTERVALS_MS=[0,12,24,72,168,360]`小时→ms(2720)。

顶层字段（整树 JSON 序列化持久化）：
- `selectedGroupId:""`、`selectedLibraryChapter:""`
- `wordNotes:{}`（key=wordKey→备注）
- `searchQuery/searchAssistQuery:""`；`searchChapterFilter:"all"`；`difficultyQuery:""`；`difficultyVisibleCount:24`；`difficultySortMode:"default"`（∈default|levelDesc|levelAsc）
- `activeTab:"study"`（∈study|overview|difficult）；`selectedDifficultKeys:[]`
- `progressByGroup`、`wordStats`、`studyLog:[]`、`difficultWords:{}`（schema 见 §2）
- `backup:{lastBackupAt:"",lastImportAt:""}`
- `settings:{playbackRate:1,intervalSeconds:1,repeatCount:1,showSynonym:true,showListeningCorpus:true,enabledSynonymSources:null(=全部),muted:false}`
- `practice:{mode:"standard",showWord:true,showMeaning:true,autoRunning:false,quiz:{options:[],selectedMeaning:"",answered:false,correct:false}}`

## 2. 持久化结构 schema
**wordStats**（键=word.key）：条目=createStoredWordSnapshot(4045–4074)全字段副本+规范字段；normalizeWordStatEntry(5040–5052)保证 `{key, count:max(0,round), lastStudiedAt:ISO或"", note:仅string, mastered:Boolean, masteredAt(mastered时有值)}`。recordExposure(4171–4211) 每次"到达"词 +1 并写 studyLog。

**progressByGroup**（键=groupId）：ensureGroupProgress(3435) 惰性建 `{currentIndex:0,lastStudiedAt:"",completedRuns:0,runStarted:false,nextExpectedIndex:0}`；updateRunProgress(3779–3810) 仅 group 会话：回退复位；0→1 开启一轮；`runStarted&&末→0&&next===total`→completedRuns+1 复位；顺续 next+1；乱序复位。**整轮回开头=1 完整轮**。

**difficultWords**（键=word.key）：条目=快照+normalizeStoredDifficultWord(4076–4089)保证 `note:"",addedAt,lastReviewAt:"",nextReviewAt(=addedAt 默认→立即到期),reviewStage:0..5(默认0),reviewFailures, difficultyLevel:0..10(默认1)`。进入/移除=toggleWordDifficulty(3972–3992)。**markDifficultyReview(4150–4169)**：success→stage=min(+1,5)，fail→stage=0 且 failures+1（成功不清零）；next=now+INTERVALS[新stage]；写 `{kind:"review",success}` 日志。adjustCurrentWordDifficultyLevel(4005–4043)：±1 夹 0..10；到 0 删除；上调重置 reviewStage=0/next=now，下调不重置。due=nextReviewAt<=now(6391)。

**studyLog**（上限6000 slice(-6000)，appendStudyLog 5976–5981）：`{kind:"study"|"mastered"|"review",wordKey,at:ISO}`，review 另有 success。写入：exposure→study；review→review；mastered 经 syncMasteryStudyLog(5054–5060) 去重单条；hydrate 剔除 mastered 后 rebuildMasteryStudyLog(5062–5069) 从 wordStats 重放。computeDailySeries(6005–6050) 按 formatDayKey 分桶、Set 去重计数。

## 3. 读写协议（IDB 主 + localStorage 兜底/迁移）
- IDB `apple-word-trainer` v1 / store `kv` / key=STORAGE_KEY / value=state 对象；openIdb 单例(2673–2700)、idbGet(2702)、idbSet(2711)。
- 启动 loadStateAsync(3109–3130)：idbGet→空则读 localStorage(3092) 并迁入 IDB→mergeLoadedState(3065–3090，子结构 isPlainObject/数组校验，backup/settings/practice 逐层 DEFAULT 合并)→异常则 idbAvailable=false 永久降级 localStorage。
- hydrateState(3132–3187) 值域归一：settings clamp、布尔归位、enabledSynonymSources 规范化(6275)、枚举白名单、逐条 normalize、修正 selectedLibraryChapter/selectedGroupId 合法性（3180–3185 首启落到第一组），末尾 saveState(false)。
- saveState(flash=true)(5826–5841)：IDB 异步成功显示"已保存"；失败仅报错不降级不落 localStorage；否则同步 localStorage(5813)。
- 写盘触发（flash=true）：toggleWordDifficulty/adjust/toggleMastered/quiz 作答/spell 失败/难词删除/showWord|Meaning/settings 开关/updateSetting/resetGroupPosition/export/import；（flash=false）recordExposure/handleWordNoteInput/setGroupSession/setActiveTab/setPracticeMode/stopPlayback/togglePlayback/hydrate/章节切换/clearSearch/难词勾选/难词搜索。

## 4. 备份 envelope
exportBackup(5725)：`{app:"apple-word-trainer-v4",exportedAt,state}` → 下载 `word-trainer-backup-YYYY-MM-DD.json`。importBackup(5745) 接受 {state} 包裹或裸 state；applyImportedState(5771–5804)=DEFAULT 打底+incoming 展开→整体替换→hydrate→lastImportAt→setInitialSession。**无 schema 版本号**。needsBackupPrompt(5806)：有 lastBackupAt 且超 7 天才提示。

## 5. normalizeLibrary（3014–3063）
输入 EMBEDDED_DATA `{chapters,totalChapters,totalGroups,totalWords}`（词=5 字段投影）。输出 `{...,chapters,groupsById,allWords}`。
- groupEntry=`{chapter,chapterNumber,group,groupNumber,id(透传,如 "output_word_groups/Chapter_1_自然地理_第一组.json"),wordCount,words}`
- word=`{key,id:String,word,eng_phonetic,meaning,eng_sound,chapter,chapterNumber,group,groupNumber,groupId,wordIndex}`
- **groupId=数据自带 id**；**word.key=`${group.id}::${word.id||index}::${word.word}`** 全局唯一。
- 解析期索引(2773–2778)：reading538/listening179/core 的 normalizeLexeme Set；synonymIndex=buildSynonymLookup(6184–6215)→`{lookup:Record<norm,group[]>,sources:[{id,name,groupCount}]}`。
- 词"来源"为推导：getWordSourceFlags(5916)→`{isCore,isReading538,isListening179}`。
- 听力语料独立数据集：`window.LISTENING_WORD_AUDIO_DATA`(2660，字段 单词名/word/mp3路径/mp3Path/chapterId/chapterTitle)；归一化 6108–6129；mp3 兜底 URL `http://www.1kao.com.cn/iSpell/Spell/audio/{chapterId}/{word}.mp3`(6091–6098)。
- preset=getPresetSourceWords(3727–3739)：from allWords 按 Set(normalizeLexeme) 筛选。

## 6. 通用工具
normalizeLexeme(6334)=trim+小写+空白折叠；clone(6338)；escapeHtml(6416)五实体；clampIndex(6396)round夹[0,len-1]；mod(6403)；clampNumber(6407)；normalizeDateString(6383)=可解析→ISO；formatDayKey(6052)=本地YYYY-MM-DD；formatDateTime(6342) zh-CN 全；formatReviewDate(6353)=MM/DD HH:mm/"待安排"；formatReviewDueText(6366)=今日到期/1小时内/N小时后/N天后。

## 7. init() 序列（2932–2948）
提示→`Object.assign(state, await loadStateAsync())`→hydrateState→bindEvents→bindSynonymPopoverEvents→render 过滤器/设置→setInitialSession→renderAll→resize 监听。
setInitialSession(3419)：restore 搜索/难词输入；有有效组则 setGroupSession 否则第一章节第一组。
setGroupSession(3448–3481)：ensureGroupProgress→session(mode:"group",items,index=clamp(progress.currentIndex))→progress 同步(index≠0 复位 runStarted/next)→quiz 建 4 选项→写 selected*→preserveTab?→stopPlayback→saveState(false)→renderAll→announce setStatus。

**迁移注意**：mastered 日志为派生数据；studyLog 6000 上限；难度会话 items 与 difficultWords 条目同引用；wordStats 内嵌整份词快照；时间统一 ISO；localStorage 与 IDB 同 key。
