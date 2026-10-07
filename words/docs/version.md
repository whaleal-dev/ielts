# Word Save 版本审查报告

- 审查日期：2026-04-28
- 主运行文件：`study_words.html`
- 审查范围：功能导出、关联链路核对、细节与交互复核、Bug 与风险审查、发布说明整理

## 1. 当前版本功能面

### 学习主界面

- 章节与分组选择
- 三种练习模式：标准、选择题、拼写
- 上一词、下一词、自动播放、发音、难词、已学会操作
- 单词显示开关、中文显示开关
- 速度、间隔、重复次数设置
- 当前轮次摘要、组内进度、当前词统计
- 队列预览，当前词固定在首位，已学词会前移
- 当前词笔记编辑并持久化到浏览器

### 搜索界面

- 英文关键词搜索
- 中文释义搜索
- 章节筛选
- 音标辅助筛选
- 搜索结果内直接发音
- 从搜索结果直接进入练习
- 来源标签：核心词汇、阅读 538、听力 179
- 本轮已修正：没有关键词时，只要设置了章节或音标筛选，也可以浏览结果并开始练习

### 关联词与同义词

- 手工关联词通过 `WORD_RELATIONS` 渲染
- 同义词通过内联 `SYNONYM_SOURCE_DATA` 聚合，不依赖外部 `synonym_sources_manifest.js`
- 关联词芯片支持 hover、focus、click 弹层
- 弹层支持发音、加入难词、标记已学会

### 难词界面

- 按章节筛选难词
- 按关键词筛选难词
- 练习入口：已选难词、今日到期、当前筛选、全部难词
- 复习元数据：阶段、下次复习时间、失败次数
- 卡片操作：发音、删除
- 删除需要二次确认

### 备份与统计

- 使用 `localStorage` 保存状态
- 支持导出 JSON 备份
- 支持导入 JSON 备份
- 超过 7 天未备份时提示
- 日统计与学习热力图展示

## 2. 当前运行依赖

- 词库：`study_words.html` 内联 `EMBEDDED_DATA`
- 同义词：`study_words.html` 内联 `SYNONYM_SOURCE_DATA`
- 来源词表：`CORE_VOCAB_DATA`、`READING_538_DATA`、`LISTENING_179_DATA`
- 图表：ECharts CDN `https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js`
- 音频：各单词 `eng_sound` 远程地址
- 本地持久化：浏览器 `localStorage`

## 3. 关联链路核对

### 运行时链路正确

- 词库链路正确：`EMBEDDED_DATA -> normalizeLibrary -> library`
- 同义词链路正确：`SYNONYM_SOURCE_DATA -> buildSynonymLookup -> resolveSynonymGroups -> renderRelatedTerms`
- 搜索链路正确：`getSearchResults -> renderSearchResults -> startSearchPractice`
- 难词链路正确：`toggleWordDifficulty -> state.difficultWords -> renderDifficultyList`
- 已学会链路正确：`toggleWordMastered -> state.wordStats -> 统计 / 队列 / 图表`
- 备份链路正确：`exportBackup -> importBackup -> applyImportedState -> hydrateState -> renderAll`

### 构建产物与当前 HTML 的关系

- `fetch_words.py` 与 `generate_manifest.py` 仍然是词库生成链的一部分
- `generate_synonym_bundle.py` 仍可生成外部同义词 bundle，但当前 `study_words.html` 已改为内联同义词数据，不再依赖该外部加载链
- `download_word_audio.py` 能导出本地音频文件，但当前 HTML 仍使用远程音频 URL 播放

## 4. 本轮核查结论

### 已确认正确

- `study_words.html` 当前无语法错误
- 页面可以作为本地文件正常打开
- 同义词功能当前是“已内联接入”，旧版 `version.md` 关于“同义词断开”的结论不正确，已更正
- 搜索、难词、笔记、已学会、统计、备份等主要功能链路均成立
- 主要 `innerHTML` 输出点已对动态文本做转义，当前未发现明显 XSS 注入点

### 本轮修正

- 修正搜索交互：支持“仅章节筛选”或“仅音标筛选”返回结果并开始练习
- 修正搜索会话标题：现在会准确带上关键词、章节、音标条件
- 加强备份导入校验：导入数据必须为对象结构，避免异常备份污染运行时状态
- 加强本地状态恢复校验：`localStorage` 中若不是对象结构，会自动回退到默认状态

## 5. Bug 与风险审查

### 未发现高危问题

- 未发现当前可直接利用的脚本注入入口
- 未发现明显的越权、文件写入或本地代码执行风险
- 未发现会阻止页面启动的运行时语法问题

### 仍需注意的残余风险

- 图表依赖 CDN，离线或 CDN 不可达时统计图会降级为空态提示
- 音频依赖远程 URL，离线环境下无法播放
- 备份数据虽然已增加结构校验，但仍允许导入“字段合法但内容不合理”的状态，属于低风险数据质量问题，不是执行型漏洞

## 6. 细节与交互优化建议

- 如果目标是完全离线版本，下一步应把 ECharts 和音频也本地化
- 如果目标是长时间使用，建议增加“导入前预览”和“恢复点回滚”能力
- 如果目标是高频搜索，建议给搜索结果增加“显示更多”或虚拟列表，避免大章节筛选时一次只展示前 24 条
