# legacy 行为规范报告（study_words.html）——会话/音频/练习/快捷键

> 行号均指 `words/study_words.html`。主逻辑 `<script>` 2664–6424。

## 会话
- currentSession 字段：`{mode:"group"|"difficulty"|"search",label,chapter,items,currentIndex}`（group 另有 groupId）；无构造器，各 start 函数直构。
- 来源：setGroupSession(3448)/难词选中 startSelectedDifficultPractice(3613, mode:"difficulty", label `选中难词 · N 个`)/startDifficultPractice(3638, mode:"difficulty", due/filter label)/startSearchPractice(3668, mode:"search")/startPresetSourcePractice(3691, mode 复用 "search", label `来源：${label}`)。
- moveRelative(step,countExposure)(3745–3777)：**mod 循环无边界**；difficulty+standard+前进且旧词在难词表→先 markDifficultyReview(旧词,true)；updateRunProgress→resetQuiz→quiz ensureQuizRound→countExposure 则 recordExposure(新词) 否则 saveState→renderAll→autoRunning 则 restartPlaybackLoop。
- 队列 preview(5132–5195)：当前词固定第一；其余先已学(count>0)后未学、组内按循环 offset 升序。

## 播放引擎（纯 mp3，无 TTS）
- togglePlayback(3812)：翻转 autoRunning；开→recordExposure(当前词)+restartPlaybackLoop。
- stopPlayback(3840)：playbackToken+=1、autoRunning=false、stopActiveAudio。
- restartPlaybackLoop(3848)：token+=1→stopActiveAudio→autoRunning 才 runPlaybackLoop(token)。
- runPlaybackLoop(token)(3860–3887)：循环：speakWord(词,true,token)→interval<=0 则 return→waitFor(interval*1000,token)→difficulty+standard+旧词→markDifficultyReview(旧,true)→前进 mod+updateRunProgress+recordExposure(新)+renderAll。
- speakWord(word,quiet=false,token,ignoreMute=false)(3889)：muted 且非 ignoreMute→提示；无 eng_sound→提示；for turn<repeatCount: playAudio(eng_sound, playbackRate, token)。
- playAudio(url,rate,token)(3918)：单例 new Audio，onended resolve/onerror reject；play() rejection：token 过期则按结束 resolve。stopActiveAudio(3952)：pause+currentTime=0+resolve 挂起+清单例。
- 竞态：playbackToken 单调递增 + waitFor 回调校验 + activeAudioResolver。
- **自动运行不区分模式**（standard/quiz/spell 都"播→等→前进"）；仅 difficulty+standard 记复习成功。
- manual 发音：pronounce 按钮/↑键 ignoreMute=true；语料播放直接 playAudio 不受 muted 门控。

## 练习模式（仅 standard/quiz/spell）
- setPracticeMode(3495)：非法回落 standard；resetQuiz；quiz ensureQuizRound；spell 清输入；不触碰 autoRunning。
- ensureQuizRound(3526)：已有 4 选项且含当前释义则保留；否则干扰项=全词库 key≠当前且释义不同的词释义去重 shuffle 3 条+正确释义=4（**非同义词池**）。
- submitQuizAnswer(3554)：判对写 answered/correct；错→markDifficultyReview(word,false)；对且 difficulty 会话且词在难词表→markReview(true)；**答完不自动前进**。
- submitSpellAnswer(3582)：guess/answer=trim+toLowerCase（忽略大小写/首尾空格，不断词内空格）；空→提示；对→清输入+moveRelative(1,true)→新词有音自动 speakWord；错→markReview(false)+提示正确答案（不前进）；无 eng_sound 不可拼写。**difficulty 会话 spell 答对不记 success（原逻辑不对称，保留或取舍需标注）**。
- spell 面板(4657)：有音且非焦点自动 focus；词显示 •••••；quiz 下释义答前隐藏（shouldRevealMeaning=standard||answered）；toggleMeaning 仅 standard 可用。

## 状态推进
- recordExposure(word)(4171)：**触发点=togglePlayback 首词、moveRelative(countExposure)、loop 每步**。count+1、lastStudiedAt=now、保留 mastered；写 studyLog study 事件；难词条目同步 count/lastStudiedAt；group 词 progress.lastStudiedAt、group 会话 progress.currentIndex=session 索引。saveState(false)。
- mastered：isWordMastered=wordStats[key].mastered(5071)；toggleWordMastered(4119) 翻转+masteredAt+同步难词+日志；**无自动规则**。
- 难词快照字段(4045–4089)：key,id,word,eng_phonetic,meaning,eng_sound,chapter,chapterNumber,group,groupId,wordIndex,count,lastStudiedAt,mastered,masteredAt,note,addedAt,lastReviewAt,nextReviewAt,reviewStage(0–5),reviewFailures,difficultyLevel(0–10)。

## 难词复习
- getFilteredDifficultWords(5536)：chapter 严格相等；keyword 匹配 `${word}\n${meaning}\n${chapter}\n${group}` 小写子串。getDue=filter due(5550)。
- 列表(5250–5390)排序：level 模式(levelDesc/levelAsc)→due 优先→nextReviewAt 升→count 降→word 降。分页步长 24（loadMore 5569）；筛选/排序变化重置 24。删除用 window.confirm(5373)。
- 到期文案 formatReviewDueText(6366)。

## 搜索
- getSearchResults(5575)：空筛选→[]；章节严格相等；assist 匹配 **eng_phonetic 小写子串**；keyword 匹配 english/meaning/chapter/group 小写子串；**english/meaning startsWith 排前**；无同义词/短语展开。Enter→startSearchPractice。结果只显示前 24 条。highlightText(5893)：indexOf+`<mark>`，无 regex 转义。

## 预设词源（4）
reading538"阅读 538"/listening179"听力 179"/core"核心词汇"/listeningCorpus"听力语料库词汇"（需 showListeningCorpus）；按钮带计数、0 禁用。

## 同义词/关联/语料
- buildSynonymLookup(6184)：lookup[norm]=组列表；canonicalizeSynonymSourceName(6217)：旧名映射+补"-"。
- enableSynonymSources=null 全开；getEnabledSynonymSourceSet(6284)。
- resolveSynonymGroups(6315)：仅 enabled 源；term 附 isCurrent/matchedWord。
- resolveRelatedTerms(6060)：WORD_RELATIONS(2721，现为空)。
- resolveListeningCorpusMatches(6131)：词 token 与句 token 任一相等命中，取前 24。
- popover：mouseenter/focus 显示、mouseleave/blur 120ms 延迟隐藏、click 钉住、外部 click/scroll(捕获)/resize 关闭；fixed 定位视口钳制；内容=音标/释义/来源/四按钮(发音/难词/学会/复制)。外部词显示"当前词库暂无音标、释义…"。

## 统计
- computeDailySeries(days=7)(6005)：从今天向前补零；learned/mastered/reviewed 由 **studyLog**（wordKey 去重）统计。
- computeCurrentStudyStreak(4432)：study/review/mastered 出现的日 Set 自今连续。
- resolveHeatmapLevel(4415)：ratio≤0.25/0.5/0.75→1/2/3/4。
- 热力图=**纯 DOM button 网格**（footprint-cell level-N，最近 7 格 recent-window），非 ECharts；tooltip 共享（60ms 延迟隐藏）。两处：#learningHeatmap + #overviewLearningHeatmap。
- **ECharts 仅 #dailyStatsChart**（7 天三折线 学习#1473ff/掌握#17b26a/复习#f1b53d）；CDN 失败降级文案。
- renderAll 顺序固定 19 个渲染函数（4213–4233）。

## 快捷键（5630–5671）
1. spell+Ctrl+Space→replaySpellAudio（最优先）；2. INPUT/TEXTAREA/contentEditable→return（无 IME 守卫，建议补 isComposing）；3. ←/→切词(±1,countExposure)；↑→speakWord(ignoreMute=true)；4. BUTTON/A/SELECT 聚焦→return；5. Enter→下一个；Space→togglePlayback。

## 其他 UX
- setStatus(msg,isError)(5843)：写两处；error class 2.4s 移除。
- 保存 flash #savedBadge="已保存到浏览器"。
- 备份：export/import 按钮组（#backupExportButton/#inlineExportButton/#backupImportButton/#inlineImportButton）；隐藏 file input。
- 渲染全量重绘 + elements 映射 2793–2928（134 项）；renderAll 单一调用点。

## 复刻易错点（12 条）
1 导航 mod 循环；exposure 仅 3 处。2 spell 答对→前进+自动重播；quiz 答对不前进。3 difficulty+standard 前进记成功；spell 仅答错记失败。4 interval=0 只播一次。5 全 mp3 无 TTS；单例+resolver+token。6 quiz 干扰项=全词库释义 3+1。7 autoRunning 不持久化、会话切换即停。8 heatmap DOM、仅日趋势用 ECharts。9 图表只读 studyLog。10 key=`group.id::id::word`。11 实为 getWordDifficultyLevel。12 enabledSynonymSources=null=全开。13 备份导入兼容 {state}/裸 state。14 [待确认]：IME 无守卫；语料播放不受 muted；preset mode 复用 search；spell 在 difficulty 答对不推进（疑原缺陷）。
