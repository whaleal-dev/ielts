# listen-dictation（只听循环听写）决策与移植备忘

决策：legacy 变体 `发音/发音和听写.html`（1464 行，原生 JS，34 函数）是独立于
`dictionary/发音和听写.html`（/dictation 已收编）的“只听循环”学习工具 → **新模块收编**，
id=`listen-dictation`。

已知基线（自查）：
- 页面：hero(总词/进度) → 导入(textarea, 过滤含中文) → 主卡（当前词/音标/释义 + 隐藏的听写练习面板 toggle）
  → 设置（发音人/发音源 web|baidu/语速/间隔/循环次数 1-5）→ 控制（发音/上一个/开始暂停/下一个）→ 右列词表(乱序/点击跳转)
- 逻辑函数 34 个：loadAndReset/fullClearCache/persistData/loadCache（key `ielts_listen_repeat`）、
  loadVoices、speakWord(speakWordWithRepeat)/speakBaidu、startPractice/scheduleNextListen（interval 驱动）、
  goToNext/Prev、jumpToWord/shuffleWordList、toggleDictationMode/checkDictationAnswer/showDictationAnswer、
  setStatus/setDictationFeedback/renderWordList/updateCurrentWordDisplay/updatePlayPauseButton 等
- 样式已容器化 `.listen-dictation-app`（legacy-full.css 755 行）
- 下一步：实现模块（列表模型/自动循环/过滤/乱序/双发音源/缓存），接路由与注册表 done
