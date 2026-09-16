# 旧版「语料库雅思单词听写」数据/UI 规格（重构参考）

> 源文件：`listening-word/王璐语料库_源码.html`（14056 行）。行号锚点一律为原文件行号。
> 页面结构：`<style>` 7–912（≈906 行 CSS）；`<body>` 915–1232；`listen_navigation.js` 1234；主逻辑 `<script>` 1235–14054。
> 结论先行：**纯原生 JS，无 Vue/无框架/无构建/无外部依赖**（无 CDN、无 ECharts）；词库数据整体内联于 HTML，数据持久化用 localStorage + IndexedDB。

---

## 0. 总览与文件构成

| 行号 | 内容 | 说明 |
|---|---|---|
| 1–6 | `<head>` 元信息 | `<title>` 语料库雅思单词听写；viewport；charset |
| 8–912 | 全部 CSS（内联 `<style>`） | 含 `:root` 主题变量 8–26；两处媒体查询 869、880 |
| 916–1232 | body 骨架 | `.shell` 单列容器 + Tab 三面板 + 模态 |
| 1234 | `<script src="./scripts/listen_navigation.js">` | 注入 `window.listenNavigation`（40 行小文件，见 §2.2） |
| 1235–14054 | 主逻辑单 `<script>`（经典脚本、非 module、无 IIFE 包裹） | 词库数据 1236–11044；其余 11046–14054 为逻辑 |

辅助文件（目录内，重构数据可复用）：`word.json`（与 HTML 内联词库同构的导出副本）、`chunks/section{1..5,41,42,43}/` 与 `chapter8/{分组}/`（本地 mp3）、`scripts/download_audio*.js/.rb`（生成脚本）。

---

## 1. 全局常量与数据声明清单

### 1.1 词库常量 `CHAPTER_WORD_SETS`（1236–11044）
- 声明：`const CHAPTER_WORD_SETS = { … };`（1236 起始，11044 `};` 收尾；顶层键对象字面量）。
- 形状：`{ [unitId: string]: { title: string, words: string[] } }`。
  - `title` 例：`"Chapter 3 雅思听力特别名词语料库: Test Paper 1"`（1239）；第 8 章类：`"Chapter 8 1 number 01_Training_1-Test_1基本语料_chunks"`（4414）。
  - `words` 为**原始字符串数组**（已小写，含词组如 `"prime sites"`/`"fish bone"`；无音标、无释义、无路径字段）。
- 规模：**88 个 unit，共 9366 词条**（每 unit 词数 5–1035）。
- 键→章节分组（键为“章号+卷号”拼接）：
  - `31`–`39`：Chapter 3 名词 9 卷；`41`–`44`：Chapter 4（41–43 形容词 / 44 副词 1 卷 12 词）；`51`–`512`：Chapter 5 吞音连读 12 卷。
  - `811`–`819`、`821`–`829`、`831`–`833`、`841`–`849`、`851`–`859`、`861`–`863`、`8110`–`8115`、`8410`–`8412`：Chapter 8（title 以 `"Chapter 8 "` 开头，本地音频）。
  - `1101`–`1104`：Chapter 11 Section 1–4；`1201`–`1205`：Chapter 11_剑20版 Section 1–5；`12041`–`12043`：剑20版 Section 4_1–4_3（本地音频）。
- 派生：`chapterEntries`（11154）= 按 `Number(key)` 升序的 `Object.entries`；`wordLibrary`（11155）= `buildWordLibrary()` 建的 **`Map<小写词, meta[]>`**（同词可命中多 unit，见 §5）。

### 1.2 逻辑区常量（11046–11208）
| 行号 | 常量 | 值/说明 |
|---|---|---|
| 11046 | `EXPORT_FILE_PREFIX` | `"语料库"`（导出文件名前缀） |
| 11047–11051 | `STORAGE_KEY`/`MISTAKE_BOOK_KEY`/`WORD_STATS_KEY`/`CHAPTER_STATS_KEY`/`BACKUP_EXPORTED_AT_KEY` | localStorage 键，见 §4.5；错词本/统计键名带 `-v1`，settings 键带 `-v2` |
| 11052 | `BACKUP_REMINDER_INTERVAL_MS` | 7 天备份提醒间隔 |
| 11053–11055 | `MISTAKE_MAX_ERROR_LEVEL`/`MISTAKE_ERROR_LEVEL_ON_DICTATION`/`MISTAKE_ERROR_LEVEL_ON_MANUAL_ADD` | 错误等级上限 10；听写答错记 3；手动 ±1 |
| 11056–11058 | `DB_NAME`/`DB_VERSION`/`STORE_NAME` | 音频 IndexedDB：`"ielts-dictation-audio-db"` v1，store `"audios"` |
| 11061 | `AUDIO_CACHE_ENABLED` | `false`：**mp3 本地缓存已关闭**（改流式播放；开启后才会写音频 IDB，见 §4.5） |
| 11064–11068 | `DATA_DB_NAME`/`DATA_DB_VERSION`/`DATA_STORE_NAME`/`dataDbAvailable`/`dataDbPromise` | 数据 IndexedDB：`"ielts-dictation-data-db"` v1，store `"kv"` |
| 11154–11155 | `chapterEntries`/`wordLibrary` | 派生存量（见上） |
| 11157–11201 | `state` | 会话运行时状态对象（见 §1.3） |
| 11203 | `MAX_IMPORT_FILE_SIZE` | 备份导入上限 2MB |
| 11205 | `pendingWordNodeMap` | `Map` 缓存待练习列表 DOM 节点（增量复用） |
| 11207 | `audio` | 单例 `new Audio()`（全页唯一播放器） |

### 1.3 运行时状态 `state`（11157–11201）— 会话/UI 型字段
`unit`（章节或 `"自动匹配"`）、`activeChapterId`、`intervalMs`（默认 2000）、`playbackRate`(1)/`phrasePlaybackRate`(0.8)（含空格即词组，用词组速度 12469）、`listenOrder`(sequence/random)、`listenRepeatCount`(1)/`bigLoopCount`(1)/`bigLoopIndex`、`words`(entryId 数组)、`wordMetaMap`、`practiceEntryMap`、`pendingWords`/`masteredWords`/`mistakeEntries`（本轮三栏）、`mistakeBook`/`wordStats`/`chapterStats`（持久数据镜像）、`currentWord`(entryId)/`currentWordMeta`/`currentWordIndex`、`sessionStarted`/`isFinished`/`isPaused`/`currentWordResolved`/`currentAudioFinished`/`waitingForAnswer`、`showWords`/`listenWordHidden`（列表显隐）、`cachedCount`、`pendingTimer`、`objectUrl`、`activeTab`、`mistakeSortKey`、`selectedMistakeIds`(Set)/`selectedMistakeChapterIds`(Set)/`selectedStatsChapterId`、`fullChapterPractice`、`sessionRecordSaved`、`pendingImportPayload`/`pendingImportSummary`、`pendingConfirmResolver`/`lastFocusedElement`。

### 1.4 window / 全局注入
- 无 `window.xxx` 业务注入（主 script 顶层 const/function 处于该 script 全局词法作用域，供页面内互调；不挂 window 属性）。唯一外部注入来自 listen_navigation.js：`window.listenNavigation.resolveListenNavigationAction`。

---

## 2. 技术栈确认 / 初始化

### 2.1 框架判定：原生 DOM
- **无 `new Vue`/`createApp`/`$mount`/JSX/模板字符串渲染引擎**（全文检索无 Vue、无 ECharts、无第三方库）。UI = 全局 `elements` 缓存 + 全局渲染函数直接操作 DOM；事件全在 `bindEvents()`（13704–14011）用 `addEventListener` 绑定（含文档级委托/键盘）。
- 主 script 为经典脚本、顶层直接执行：`initialize().catch(...)`（14051）在解析末尾立即启动，无 DOMContentLoaded 包装（script 位于 body 尾部，DOM 已就绪）。

### 2.2 listen_navigation.js（40 行，1234 引入）
- `window.listenNavigation = { resolveListenNavigationAction }`（37–39）；纯函数：给定 `{eventType,key,target,isListenMode,sessionStarted,isFinished,currentWord}` 返回动作或 null（13–35）。
- 仅在「听音模式 + 已开始 + 未结束 + 有当前词 + 目标非 INPUT/TEXTAREA/SELECT/contentEditable」时生效；keydown 映射：**ArrowUp→repeat、ArrowLeft→previous、ArrowRight→next**（22–31）；mousedown/contextmenu 分支未实现（恒 null）。主逻辑侧 `handleListenNavigationAction`（13382）分发到 goToPrevious/Next/Replay。另有非此文件的全局快捷键：Enter 提交（13738）、F2 开始（13924）、F4 下一题（13932）、Escape 关确认框（13918）。

### 2.3 初始化顺序（`initialize` 14013–14049）
1. `populateChapterSelect()`（14014；构建章节下拉 12426）。
2. `loadSettings()`（14015；localStorage 回填控件与 state，11447）。
3. `await loadMistakeBook()` → `await loadWordStats()` → `hydrateWordStatsFromMistakeBook()` → `await loadChapterStats()`（14016–14019；IDB 优先/迁移，见 §4.5）。
4. `bindEvents()`（14020）；`answerInput.disabled=true`（14021）。
5. 恢复上次会话：有章节 → `applyChapterSelection(id,{autoLoad:true})`；否则 wordInput 有词 → `loadWordSet()`；否则 `render()`（14023–14037）。
6. `AUDIO_CACHE_ENABLED=false` 时清空遗留音频缓存（14039–14046）；`updateCachedCount()`（14047）；`promptBackupReminderIfNeeded()`（14048，超 7 天弹「立即导出」确认）。

---

## 3. 页面骨架（模板 915–1232）

### 3.1 整体
`.shell`(916, CSS 56) → 三个顶级面板：`section.hero`(917) 顶部概况；`div.tab-bar`(944) Tab 按钮；三块 `div.tab-panel`（practice 950 / mistakes 1157 / stats 1196），以 `data-tab-target`/`data-tab-panel` 配对（`hidden` 切换，renderTabs 12307）。页面级自定义模态 `#confirmDialog`（1218）。

### 3.2 hero 顶部（917–942）
- `.title`(918)：`p` “IELTS Dictation Lab” + `h1` 页名（921）+ 使用说明段（924）。
- `.hero-note`(927)：`<strong>使用说明</strong>` + 4 段规则/版权文本（928–932）。
- `.stats`(934) 六个统计 chip（label + strong 输出）：`#stat-unit` 当前匹配(935)、`#stat-total` 总单词(936)、`#stat-remaining` 剩余待练(937)、`#stat-mastered` 答对数量(938)、`#stat-mistakes` 错误数量(939)、`#stat-cached` 已缓存音频(940)。由 `renderStats()`(12582) 写。

### 3.3 Tab 栏（944–948）
按钮 945–947：练习(practice，默认激活)/错词本(mistakes)/章节统计(stats)；`is-active` 态由 renderTabs 维护。

### 3.4 面板 A「练习」（950–1155）：左右两栏 `.grid`
**左 `.panel.config-panel`(952) 练习配置**：`.form-grid`(959)：
- `.inline-grid`(960) 控件：`#chapterSelect` 章节(963, `""`=手动)；`#intervalInput` 每词间隔秒(967, 0 不自动跳题)；`#speedInput` 单词速度(971, 0.4–2.0)；`#phraseSpeedInput` 词组速度(985, 默认 0.8)；`#modeSelect` 练习模式(999, dictation 听写/listen 听音)；`#listenOrderSelect` 顺序(1006)；`#listenRepeatInput` 单词循环次数(1013)；`#listenBigLoopInput` 大循环次数(1017)。后三者仅听音模式可用（renderModeControls 13009）。
- `#wordInput` textarea 单词列表（1023，粘贴/章节自动填充）。
- 两条状态条：`#cacheStatus`(1026) 播放/载入反馈、`#libraryNotice`(1027, hidden) 提示/错误条（`notice-success/notice-error`）。
- `.guide-note`(1028) 5 条操作提示文案。
- `.tool-grid`(1036) 两张 `.tool-card`：
  - 备份与迁移(1037)：`#exportDataBtn`(1043)、`#importDataBtn`(1044)、隐藏 `#importDataInput` file(1046)、导入预览区 `#importPreview`(1047，含 `#importPreviewTitle/Text/List` 1050/1052，`#confirmImportBtn` 1054、`#cancelImportBtn` 1055)。
  - 数据管理(1059)：`#clearMistakeBookBtn`(1065)/`#clearChapterStatsBtn`(1066)/`#clearWordStatsBtn`(1067)/`#clearAudioCacheBtn`(1068)，均走 `confirmClearAction`(11970) 二次确认。

**右 `.panel.practice`(1075) 练习中心**：
- `.practice-card`(1083)：`#progressChip`(1084, `第 i / n 个`)、`#promptText`(1085, 主提示/正确答案展示)、`#promptHint`(1086)、显词 span `#wordDisplay`(1090，内含 `#wordDisplayText`+`#hideWordBtn`)、`#answerInput` 输入(1091)。
- `.mini-actions`(1094) 按钮组：`#startBtn` 开始(1095)/`#pauseBtn` 暂停(1096)/`#replayBtn` 重播(1097)/`#submitBtn` 提交(1098)/`#revealBtn` 显示单词(1099)/`#prevBtn` 上一个(1100, 仅听音)/`#nextBtn` 下一题(1101)/`#restartWrongBtn` 只练错词(1102)/`#addMistakeBtn` 错误等级+1(1103)/`#decreaseMistakeBtn` -1(1104)/`#removeMistakeBtn` 移除错词本(1105)。前两组禁用态在 `render()`(13021) 按会话状态批量计算。
- `.feedback`(1108)：`#feedbackText`(1109) + `#feedbackSpeakBtn`(1110, 圆钮/发音图标，hidden 默认)；`.feedback.success/.error/.warning` 三色（CSS 484–494）。
- `#summaryStatus`(1116, `.status-bar`, white-space:pre-wrap 664–673) 本轮小结（renderSummary 12973）。
- `.list-grid`(1119) 三张 `.list-card` 列表（`<ul>` 空态文案在 `data-empty`）：
  - `#pendingList` 待练习(1128，每项含 `data-role="word-label"` 与“当前”标签，`.masked` 模糊 545)、右上 `#toggleWordBtn` 显示/隐藏单词(1126)。
  - `#masteredList` 已掌握(1138)；`#mistakeList` 本轮错词(1148，行含“你的答案：…” 12695)。
- `.footer-note`(1152) 版权行。

### 3.5 面板 B「错词本」（1157–1194）
`section.panel`：章节说明(1159–1164)；`.chip-grid`(1165) 内 `#mistakeChapterFilters` 多选 select(1168，`multiple`，选项=有错词的章节+计数) + `#mistakeClearFilterBtn`(1170)；批量操作按钮行(1173–1181)：`#mistakeSelectLowAccuracyBtn`(正确率<50%)、`#mistakeSelectHighWrongCountBtn`(错≥3 次)、`#mistakeSelectRecentBtn`(7 天内)、`#mistakeInvertSelectionBtn`、`#mistakeClearSelectionBtn`、`#mistakeExportSelectedBtn`(导出 CSV)、`#mistakePracticeBtn` 主按钮(开始错词练习)；`#mistakeSortSelect` 排序(1184–1189：errorLevel 错误等级降序默认 / errorRate / wrongCount / recent)；`#mistakeBookStatus`(1191)；`#mistakeBookList`(1192, `.record-list`) 行 = checkbox(`data-mistake-id`) + 词+章节 + 元信息(`错误等级 x/10 · 错误次数 · 练习次数 · 正确率%`) + `最近 5 次错误拼写` + `发声`/`删除`按钮（事件委托 13822–13844）。

### 3.6 面板 C「章节统计」（1196–1215）
`#statsChapterSelect`(1206)；`#statsStatus`(1208)；`.chart-shell`(1209) 内 `#statsChartEmpty`(1210) 与 `svg#statsChart`(1211, `class="chart-svg"`, viewBox 0 0 640 240)；`#statsHistoryList`(1213, 倒序时间线记录)。

### 3.7 确认模态（1218–1232）
`#confirmDialog`(1218, hidden) → `.confirm-dialog-card`(1219) 内 `#confirmDialogTitle/Text`(1223/1224)、`#confirmDialogCancelBtn`(1228 “再想想”)、`#confirmDialogOkBtn`(1229, `.danger`)。Promise 化：`openConfirmDialog`(11949)/`closeConfirmDialog`(11932)；打开时 body 加 `.is-dialog-open`(11940)；文案支持 `<strong>/<br>` 白名单（setDialogMessage 11365）。

---

## 4. 数据模型与持久化

### 4.1 词条目/词元数据（内存推导，非持久）
- 库内词原始形态：字符串（低小写）。解析：`parseWords`(11209)：`trim().toLowerCase()` + 去重(Set) + 去空行。
- 词元数据 `meta`（buildWordLibrary 11279 产物）字段：`{ word, unit(即 chapterId), chapterId, chapterTitle }` —— **无音标/释义/中文/真实文件路径**；文件路径由 `unit+word` 现算（见 §4.4）。同词跨卷时按“选中章节优先，否则命中第一个”解析（resolveWordMeta 11301）。
- 练习条目（内存）：`{ id: `${chapterId||"auto"}::${word}::${index}`, word, meta }`（createPracticeEntriesFromWords 11229；错词源版本 11239 复用持久错词 id 前缀）。`entryId` 与词一一对应，session 内 `practiceEntryMap` 以 id 索引。

### 4.2 层级（“章节→卷”两级，无更深嵌套）
- 库内：`unit`(卷/测试卷) 即 select 的最小可选粒度，例 1101=Chapter 11 Section 1、31=Chapter 3 Test Paper 1；同一“章”（Chapter 3/4/5/8/11/剑20版）为标题前缀/编号区间概念（§1.1），**无独立 chapter 数据对象**；逐词归属仅记 `chapterId=unitId`。
- 练习会话：整卷/自定义词表 → 词列表；仅当「选了章节 && 词表与该卷完全一致 && 听写模式 && 一轮走完」才写章节历史（`isFullChapterSelection` 12292 / `recordChapterPracticeIfNeeded` 12403）。

### 4.3 持久记录条目形状（sanitize 函数即 schema 权威）
- **错词条目（错词本，版本 2）**（sanitizeMistakeBook 11593 产出；bumpMistakeBookEntry 12325 维护）：
  `{ id:`${chapterId}::${word}`, word, chapterId, chapterTitle, unit, wrongCount(≥1), errorLevel(0–10), recentAnswers: string[](≤5 个最近错误拼写/“未作答”), lastWrongAt: epochMs }`；id 即 `getMistakeEntryId`(12236)。听写答错一次：wrongCount+1、errorLevel+3（上限 10）、recentAnswers 头插截 5、lastWrongAt 刷新；手动按钮 ±1（+1 不记 wrongCount）。旧 v1（有 `lastAnswer` 无 `recentAnswers`）由 `detectMistakeBookVersion`(11640) 识别并在清洗时迁移。
- **单词统计（练习统计）**（sanitizeWordStats 11706）：`{ [entryId:`${chapterId}::${word}`]: { practiceCount, correctCount } }`；听写模式每次提交 +1 practiceCount，答对 +1 correctCount（recordWordPractice 12388）。
- **章节统计**（sanitizeChapterStats 11723）：`{ [chapterId]: [ { timestamp, accuracy(0–100，1 位小数), correct, total } ] }`；一轮完整卷练习结束 push 一条（accuracy=答对数/总数）。
- **设置**（localStorage，saveSettings 11422/loadSettings 11447/sanitizeSettings 11564）：
  `{ chapter, interval, speed, phraseSpeed, mode(dictation|listen), listenOrder, listenRepeat, listenBigLoop, words(原始 textarea 文本), showWords, listenWordHidden, activeTab, mistakeSortKey(errorLevel|errorRate|wrongCount|recent，旧值 accuracy 归一为 errorRate 11466), statsChapterId }` —— **payload 本身无版本字段，版本写在键名后缀**。
- **备份文件**（buildBackupPayload 11488 / migrateBackupPayload 11763）：`{ version: 2, exportedAt, settings, mistakeBook, wordStats, chapterStats }`（无音频缓存）；导入仅支持 v1–v2；导入预览摘要 buildImportSummary 11654；文件名 `语料库学习记录备份-YYYY-MM-DD-HH-mm-ss.json`（11803）。
- 本轮会话错词（非持久）：`{ id, word, answer, chapterId, chapterTitle, unit }`（recordMistake 13286）。

### 4.4 音频寻址（unit+word → URL）
- 远程：`http://www.1kao.com.cn/iSpell/Spell/audio/{unit}/{word}.mp3`（buildAudioUrl 11361；在线卷）。
- 本地（isLocalSection 11336 = 键 1201–1205/12041–12043，或 title 以 `"Chapter 8 "` 开头）：
  - Chapter 8：title 正则 `^Chapter 8 (.+?) (\d{2}_.+_chunks)$` → 路径 `/Users/lhp/Desktop/codeProject/ielts-dev/listening-word/chapter8/{分组目录}/{chunk目录}/{word 空格→_}.mp3`（buildLocalAudioPath 11343，**硬编码绝对开发路径**）。
  - 剑20版：`chunks/section{sectionNum}/{word 空格→_}.mp3`，sectionNum 映射 1201→1…1205→5、12041→41…（11356–11358）。

### 4.5 localStorage / IndexedDB key 全集与 JSON 结构
- **localStorage（6 键）**：
  1. `ielts-dictation-settings-v2` = 设置 JSON（§4.3；键名版本 v2）。
  2. `ielts-dictation-backup-exported-at-v1` = **裸时间戳字符串**（非 JSON，11519–11525）。
  3. `ielts-dictation-mistake-book-v1`（错词 JSON 数组）、4. `ielts-dictation-word-stats-v1`、5. `ielts-dictation-chapter-stats-v1`：**仅作旧数据回退层**——新写入走 IDB；loadData(12064) 读 IDB 为空则读此 localStorage 并迁入 IDB 后删键。
- **IndexedDB A `ielts-dictation-data-db`(v1)**：object store `"kv"`（无 keyPath，key/value 裸存，12014–12031）；逻辑键 = 上述 3 个数据键名；写入持久化统一经 `persistData`(12047)/`loadData`(12064)，IDB 不可用自动回退 localStorage。
- **IndexedDB B `ielts-dictation-audio-db`(v1)**：store `"audios"`，keyPath `"id"`，record `{ id:`${unit}::${word}`, unit, word, blob, updatedAt }`（12153–12225）；**默认禁用**（`AUDIO_CACHE_ENABLED=false` 11061），初始化时清空遗留记录（14042），故“已缓存音频”统计（`updateCachedCount` 12227）平时为 0；`clearAudioCacheBtn` 仍保留清库能力（11926）。
- **无 cookie、无 sessionStorage、无独立日志存储**；“最近 5 次错误拼写”即错词条目的 recentAnswers（充当轻量错词日志）；统计均非时间线（仅章节历史带 timestamp）。

---

## 5. “数据推导”类纯函数/只读查询清单（渲染输入）

- 词库解析与匹配：`parseWords` 11209、`buildWordLibrary` 11279、`resolveWordMeta` 11301、`resolveInputWords`(返回 `{missingWords, chapterMismatchWords, wordMetaMap}`) 11314、`isFullChapterSelection` 12292。
- 词表组装：`createPracticeEntriesFromWords` 11229、`createPracticeEntriesFromMistakes` 11239、`shufflePracticeEntries`(Fisher–Yates) 11254、`buildEntriesFromCurrentWords` 11275。
- 会话上下文文案：`getDisplayUnit` 12264、`getSessionLabel` 12280、`getChapterLabel` 11220、`isListenMode` 12288、`isAutoAdvanceEnabled` 12532。
- 统计指标（错词本核心列，由 wordStats+错词联合推导）：`getPracticeMetrics` 12244（practiceCount=max(stat, wrongCount+correct)、correctCount 截断）、`getWordAccuracy` 12251、`getRecentMistakeAnswers` 12260、`getWordStatsForId` 12240、`countChapterStatsRecords` 11650。
- 错词本筛选/排序集合运算：`getFilteredMistakeBookEntries` 12737、`getSelectedMistakeEntries` 12733、`getSelectedFilteredMistakeEntries` 12743、`getMistakePracticeEntries` 12752（勾选优先、否则筛选集、按 id 去重）、排序在 renderMistakeBook 12767–12799 内联（errorLevel→wrongCount→lastWrongAt 多级）。
- 进度/计数渲染：`renderStats` 12582（6 个 hero 数字）、`renderSummary` 12973（本轮小结文本）、`renderChapterStats` 12939、`renderMistakeActionButtons` 13049、`render()` 13021（总闸：逐按钮设 disabled/hidden/textContent）。
- 备份/导入：`buildImportSummary` 11654、sanitize* 一族（11564/11593/11706/11723）、`migrateBackupPayload` 11763、`hydrateWordStatsFromMistakeBook` 12139（导入后以错词 wrongCount 兜底练习统计）。

---

## 6. 图表/统计可视化（非 ECharts）

- **无 ECharts、无 canvas**。章节统计折线由 `renderStatsChart(records)`（12907–12937）生成 **内联 SVG 字符串** 注入 `svg#statsChart`（模板 1211；容器 `.chart-shell` 1209；空态 `#statsChartEmpty` 1210）。
- 画布固定 640×240，padding 28，按记录下标均分 x、accuracy% 映射 y；绘制 0/25/50/75/100% 虚线网格 + 数据点圆 + polyline（色 `#0071e3`）。记录倒序历史列表 `#statsHistoryList` 渲染为“时间 + 正确率% · correct/total”（12954–12970）。
- 其余“可视统计”仅是 DOM 文本（hero stat chip、status-bar 摘要、错词行元信息）。

---

## 7. CSS 体系要点（8–912）

- **主题变量** `:root`(8–26)：`--bg-top/-bottom`(浅灰蓝渐变背景)、`--panel/--panel-strong`(白 0.72/0.88 半透明面板)、`--line/-strong`、`--ink:#111827`、`--muted:#6b7280`、`--accent:#0071e3`、`--accent-deep:#0058b0`、`--accent-soft`、`--success:#14804a`、`--warning:#b76e00`、`--danger:#c0362c`、`--shadow/--shadow-soft`、`--radius:28px`。字体栈 SF Pro / PingFang（35）；正文背景三层 radial+linear（37–40）；`body::before` 固定光斑层 45–54。
- **布局类名族**：`.shell`(56, 1180px 居中网格 gap24) → `.hero`(75) → `.tab-bar/.tab-btn`(137/144) → `.stats/.stat`(160/166) → `.grid`(189, 配置:练习两栏) → `.panel`(219 通用卡片) → `.form-grid/.inline-grid`(243/248) → `.mini-actions`(325)/`.action-grid`(331, 按钮网格)/`.action-grid--compact`(906) → `.tool-grid/.tool-card`(701/708) → `.list-grid/.list-card`(496/502) → `.record-list/.record-main/.record-title/.record-actions/.chapter-note/.mistake-answer/.checkbox-row`(594–639) → `.chart-shell/.chart-svg/.chart-empty/.stats-history`(640–662) → `.status-bar`(664, pre-wrap 多行) → `.guide-note`(680) → `.import-preview`(727) → `.confirm-dialog*`(797) 。
- **按钮变体**：`.primary`(371)/`.ghost`(396)/`.danger`(403) + 修饰 `.small`；练习卡片 `.practice-card`(414)、`.feedback`(450) 及 `.feedback.success/.error/.warning` 文字色 484–494、`.feedback-audio-btn`(463)。
- **主题态类**：`.is-active`(tab)、`.is-dialog-open`(body, 弹窗锁定)、`.is-practicing`(grid, 13023 切换)、`.masked`(545, 词条模糊)、`.notice-success/.notice-error`(库提示条)、`.tag`(当前词标签)。
- **响应式**：`@media (max-width:980px)`(869, grid 变单列) 与 `(max-width:640px)`(880, 更紧凑)。**无深样式覆盖问题**——无第三方组件库、无框架 class、无 reset 外链、无 `@keyframes`/字体/CDN 外链；全部为手写自定义类（上文所列 ~70 个，正文 §3 用到的即全量 UI 类）。

---

## 8. 界面文案速查（模式名/状态/反馈，用于重建对齐）

- 模式枚举：`modeSelect` 选项 `dictation`=「听写模式」(1000)、`listen`=「听音模式」(1001)；`listenOrderSelect` `sequence`=「顺序播放」/`random`=「随机播放」(1007–1008)；听音额外参数「单词循环次数」「大循环播放次数」(1012–1018)。听音模式**不写任何统计数据**（guide-note 1031、renderSummary 12982 均明示）。
- 主 prompt 状态机（听写）：初始「点击"开始练习"后开始播放。」(13107)→进行「请听音频并输入单词拼写」(13256)→答对自动进下一题提示「已答对，自动进入下一题。」(13335)→结束「练习结束，本轮全部答对。」/有错「练习结束，可以查看错误单词列表。」(13212)；progressChip：`未开始`(13106)/`第 i / n 个`(13253–13255)/`本轮结束`(13209)。听音态：`正在听音播放`(13256 分支)、`第 i / n 个（第 k / m 轮）`。
- 反馈三态文案/类：答对 `setFeedback("正确：X","success")`(13328)；答错 `错误，正确答案是 X`（短版 13340；完整版 13306 追加“本次错误会记入错词本，并更新单词练习统计。”, class "error"）；超时「超时，正确答案是 X」(12564)；主动看答案「已显示单词：X」(13347)；等级手动操作（+1/-1/移除）成功/上限文案 13469–13509；重播失败/音频加载失败等 error 提示见 13760 一带。
- 错词本状态栏（12801–12803）：`已保存 N 条错词记录，当前筛选显示 M 条，已勾选 K 条…开始练习将优先使用已勾选的 P 条。`；主按钮文字联动「练习已勾选错词（P）」/「练习当前筛选结果（P）」(12807–12809)。批量勾选按钮文案即 §3.5 所列，含动作后提示（13607–13679）。
- 章节统计状态栏（12948–12950）：`章节 X 共记录 N 次完整练习，最近正确率 X%。`/`暂无章节练习记录。`
- 导入导出：导出文件名/内容提示 11803–11805；导入预览摘要条目 11683–11689（`将覆盖设置 1 份/错词 A -> B 条/…`）；备份提醒文案 11539–11540；清空二次确认文案 11970–11976（「确认清空X？…建议先导出学习记录备份。」）。
- 语料库校验提示（13159–13171）：不在所选章节/不在语料库的自动移除并列词；`loadWordSet` 类错误文案 13122–13146（间隔/速度越界等）。听力导航快捷键说明见 guide-note 1032 与 listen hints（13251/13258）。

---

### [未知] / 待重构时人工复核项
1. `word.json` 与内联 `CHAPTER_WORD_SETS` 的生成关系、以及 `chunks`/`chapter8` 目录 mp3 清单与词表的一致性，未在页面内校验（[未知]）。
2. 词条可能含非 `[a-z ]` 字符（如连字符/撇号/数字词）的集合与大小写形态未逐一枚举；远程 URL 用 `encodeURIComponent`（保留空格为 %20），本地文件名仅替换空格为 `_`（11344）——差异字符会否导致本地缺失 [未知]。
3. Chapter 3/4/5/11 键与“卷”的命名规则为推导（§1.1），页面无显式章节分组表。
4. `state.practiceMode`（11157–11201 之外另设）在 loadSettings 11471 有冗余赋值，未发现影响。
5. 硬编码本地绝对路径 `/Users/lhp/Desktop/codeProject/ielts-dev/…`（11351/11358）依赖当前机器目录布局；远程 `http://www.1kao.com.cn`（11362）为 http 明文，存在浏览器拦截风险（文案 13259 有提示）。
