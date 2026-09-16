# 二开回归与数据基线

更新时间：2026-09-12

本文档用于二开前后的人工验收、浏览器存储兼容审查和自动化测试规划。执行涉及“清空缓存”“覆盖导入”的步骤时，只能使用临时浏览器配置或专门准备的测试数据，不得操作真实学习数据。

## 1. 全局冒烟基线

每次跨模块、路由、共享音频或持久化改动后，至少检查：

- 今日、学习路径、全部训练和全局设置四个一级入口可达；全部训练中的 8 个模块都能进入对应页面。
- 直接访问 `/#/<module-id>` 可打开训练模块，未知路径回到今日工作台。
- 在模块播放音频或启动计时后切换路由，不再继续播放或推进旧会话。
- 刷新页面后，声明支持持久化的状态能够恢复。
- 全局设置能预览应用级备份和受支持的旧模块备份；错误文件不会部分覆盖当前数据。
- 导出产生的 Object URL 在触发下载后释放。
- 浏览器不支持 TTS、IndexedDB、Notification 时，页面仍能使用其余功能。
- 控制台没有未处理异常；测试和生产构建均通过。

## 2. 分模块冒烟清单

### 2.1 记录与复盘 `/study-tracker`

- 今日工作台新增和完成 Todo 后，记录与复盘能读取待办摘要，刷新后保持状态。
- 新增学习记录，修改日期、时长、指标和复盘字段，刷新后恢复。
- 新增、改名、移动、删除分组或指标列，历史记录字段映射不串列。
- 新增、修改、删除复盘栏位，复盘视图同步变化。
- 新增普通记账和周期记账草稿，月度汇总正确。
- 图表、周统计和月统计随记录变化。
- 全局设置可导入学习跟踪 v4 信封和旧版裸状态 JSON。
- Excel 与周／月 PDF 能下载；CDN 不可用时显示失败原因。
- 通知未授权、已拒绝和已授权三种状态均可控。

### 2.2 词汇学习 `/vocabulary`

- 章节、分组和预设词源能启动练习。
- 标准、选中文和拼写三种模式能够推进。
- 自动播放、暂停、手动切词和路由离开均正确停止音频。
- 掌握、难词等级、复习成功／失败、笔记和搜索状态保存。
- 听力语料卡片按需加载，不阻塞首屏。
- 全局设置可导入词汇 v4 备份信封和旧版裸状态，非法字段被归一化。
- IndexedDB 不可用时降级到 localStorage。

### 2.3 单词精听器 `/pronunciation`

- 支持换行、英文逗号和中文逗号混合词表。
- 去空值并保持合法词的输入顺序。
- 英音优先、手动选声、语速、上一词、下一词和点击跳转正常。
- 路由离开后停止语音。
- 浏览器无 Web Speech API 时给出提示。

### 2.4 单词听写 `/dictation`

- 听写模式正确判分，正确词移出队列，错误词进入错词本。
- 只听模式能自动推进并标记掌握。
- 开始、暂停、重播、停止和模式切换不会留下定时器。
- 单词、错词、掌握状态、语音和语速刷新后恢复。
- 播放间隔刷新后恢复。
- 清空测试缓存后仅删除 `ielts_dual_apple`。

### 2.5 只听循环听写 `/listen-dictation`

- 输入解析、去重和中文过滤正确。
- Web TTS 与百度 TTS 两种来源能够切换并处理失败。
- 每词重复次数、间隔、语速和随机顺序正确。
- 听写自检、上一词、下一词和点击跳转正常。
- 词表、声音、重复次数、播放间隔、TTS 来源和听写开关刷新后恢复。
- 路由离开后停止语音、音频和定时器。

### 2.6 同义替换学习 `/synonyms`

- `.txt` 按行分组、逗号分词；`.json` 接受二维字符串数组。
- 多文件导入合并，错误文件不污染成功文件。
- 搜索、前后导航、点击朗读和自动循环正常。
- 含中文内容不送入英文 TTS。
- 单词笔记刷新后恢复，删除笔记只影响目标词。
- 路由离开后停止自动播放和 TTS。

### 2.7 音频顺序播放器 `/audio-player`

- 上传、拖拽、重复文件识别、时长读取和历史缓存正常。
- 播放项新增、复制、上下移动和删除正确。
- 全局倍速／次数与单项覆盖的优先级正确。
- 顺序、单曲循环和随机模式能选择正确下一项。
- 暂停、恢复、停止、播放结束和定时暂停正确维护状态。
- 删除历史和清空历史只作用于专用 IndexedDB。
- 路由离开后停止播放、清理计时器并释放全部 Object URL。

### 2.8 语料库章节听写 `/corpus-dictation`

- 选择章节和自动匹配能生成正确练习队列。
- 听写正确、听写错误、显示答案、超时和听音模式按规则推进。
- 错词等级、词统计和完整章节统计正确写入。
- 错词筛选、批量重练、CSV 导出和手动移除正常。
- 全局设置可导入语料库 v2 备份，v1 备份兼容导入；模块仅保留错词 CSV 业务导出。
- 远程音频失败时有反馈；启用缓存时可从 IndexedDB 重放。
- HTTPS 页面不应请求 HTTP 回退音频。

## 3. 持久化契约

### 3.0 共享 localStorage 保护层

- 所有模块继续使用原有主键，旧版未分块字符串无需迁移即可读取。
- 单值超过 200,000 字符时，主键保存版本化分块清单，内容写入同主键命名空间下的分块 key。
- 新分块全部写完后才切换主键；任一写入失败会删除本轮临时块并保留上一版记录。
- 清单缺块、长度不符、存储不可用时安全返回空值，不向业务层暴露半条 JSON。
- 分块不增加浏览器总配额；配额耗尽时必须提示用户导出备份并清理浏览器空间。

### 3.1 词汇学习

| 项目 | 契约 |
|---|---|
| IndexedDB | 数据库 `apple-word-trainer`，版本 1，object store `kv` |
| 状态键 | `apple-word-trainer-v4` |
| 降级存储 | 同名 localStorage 键 |
| 读取顺序 | IndexedDB → legacy localStorage 迁移 → 默认状态 |
| 备份信封 | `{app:'apple-word-trainer-v4', exportedAt, state}` |
| 兼容策略 | 信封和裸状态均可导入；merge 后执行 hydrate |

禁止无迁移修改 `VocabState`、词快照 key、复习阶段、学习日志和备份信封语义。

### 3.2 学习状态跟踪

| 项目 | 契约 |
|---|---|
| 主状态 | localStorage `daily-learning-tracker-state-v4` |
| 保存元信息 | localStorage `daily-learning-tracker-state-meta-v1` |
| 备份信封 | `{version:4, exportedAt, state}` |
| 行数据 | 保存前通过 `serializeRows` 将指标映射序列化 |
| 兼容策略 | 新版信封和旧版裸状态都必须可导入 |

2026-09-12 已补回归测试并修复：导入流程会解包新版备份信封的 `state`，同时继续接受旧版裸状态。

### 3.3 单词听写

| 项目 | 契约 |
|---|---|
| localStorage | `ielts_dual_apple` |
| 当前字段 | `mode`、`wordItems`、`wrongDict`、`masteredSet`、`selectedVoiceURI`、`speechRate` |
| 应保存字段 | 在当前字段基础上增加 `intervalSec`，读取旧状态时默认 `2` |

2026-09-12 已补回归测试并修复：`intervalSec` 写入缓存，旧缓存缺少字段时回落到 `2`。

### 3.4 只听循环听写

| 项目 | 契约 |
|---|---|
| localStorage | `ielts_listen_repeat` |
| 当前字段 | `wordItems`、`selectedVoiceURI`、`speechRate`、`repeatCount`、`ttsSource`、`dictationMode` |
| 应保存字段 | 在当前字段基础上增加 `intervalSec`，读取旧状态时默认 `1.5` |

2026-09-12 已补回归测试并修复：`intervalSec` 写入缓存，旧缓存缺少字段时回落到 `1.5`。

### 3.5 同义替换学习

| 项目 | 契约 |
|---|---|
| localStorage | `ielts_notes_v4` |
| 内容 | `Record<string,string>`，键为词面，值为笔记 |
| 非持久状态 | 导入词组、导航位置、搜索和播放设置 |

词面当前直接作为 key，后续统一词库时必须处理大小写、空格和同形词冲突，不能直接原地归一化旧 key。

### 3.6 音频顺序播放器

| 项目 | 契约 |
|---|---|
| IndexedDB | `audio_playlist_history_db`，版本 1 |
| object store | `history_files`，keyPath `id` |
| 历史 ID | `name::size::lastModified::type` |
| 历史内容 | 文件元信息、`updatedAt` 和 Blob／File |
| 非持久状态 | 当前播放列表、排序、单项倍速／次数和定时暂停 |

### 3.7 语料库章节听写

| 项目 | 契约 |
|---|---|
| 设置 | localStorage `ielts-dictation-settings-v2` |
| 错词 | localStorage `ielts-dictation-mistake-book-v1` |
| 词统计 | localStorage `ielts-dictation-word-stats-v1` |
| 章节统计 | localStorage `ielts-dictation-chapter-stats-v1` |
| 备份时间 | localStorage `ielts-dictation-backup-exported-at-v1` |
| 音频缓存 | IndexedDB `ielts-dictation-audio-db`／`audios` |
| 预留数据 DB | `ielts-dictation-data-db`／`kv`，当前未接入读写链路 |
| 备份信封 | `{version:2, exportedAt, settings, mistakeBook, wordStats, chapterStats}` |

导入会分别归一化 settings、mistakeBook、wordStats 和 chapterStats，再写入本地状态。

### 3.8 单词精听器

当前不持久化用户状态，不存在存储迁移契约。

### 3.9 应用完整备份与学习事件

| 项目 | 契约 |
|---|---|
| 应用备份 | `{app:'ielts-dev', schemaVersion:1, exportedAt, appSettings, modules}` |
| Provider 边界 | 只读写显式登记的模块状态，不扫描整个 localStorage |
| 导入流程 | 全量解析 → 覆盖预览 → 用户确认 → 写入；失败时回滚已写入 Provider |
| 旧备份兼容 | 一次识别并导入一个匹配的词汇、学习跟踪或语料库旧备份 |
| 排除项 | 音频 Blob、Object URL、运行中会话和未持久化输入 |
| 学习事件 | localStorage `ielts-dev-learning-events-v1`，追加写入，最多保留 2,000 条 |

Excel、PDF、CSV 等业务结果导出保留在相应模块；完整 JSON 导入导出只能从全局设置执行。

## 4. 外部能力边界

| 能力 | 当前来源 | 主要风险 |
|---|---|---|
| 浏览器 TTS | Web Speech API | 声音列表、权限和各浏览器行为不一致 |
| 百度 TTS | `fanyi.baidu.com/gettts` | 跨域、限流、接口变更、联网依赖 |
| 语料音频 | 静态索引远程地址 | 资源失效和跨域 |
| 音频回退 | `http://www.1kao.com.cn/...` | HTTPS 混合内容，生产环境可能被直接拦截 |
| PDF 导出 | jsDelivr 动态加载 html2canvas、jsPDF | 离线不可用、CDN 失效、CSP 限制 |
| 桌面提醒 | Notification API | 权限不可逆拒绝、后台计时不稳定 |

## 5. 自动化测试优先级

| 优先级 | 模块 | 首批测试边界 |
|---|---|---|
| 已覆盖 | 学习跟踪 | 备份信封解包、行字段序列化、旧指标恢复和统计边界 |
| 部分覆盖 | 单词听写 | 缓存序列化与恢复；判分和队列变化待补 |
| 部分覆盖 | 只听循环 | 中文过滤、缓存序列化与恢复；乱序和播放推进待补 |
| 部分覆盖 | 音频播放器 | 有效倍速／次数、下一项选择、随机排除当前项 |
| 部分覆盖 | 同义词 | TXT／JSON 解析、非法内容和词组过滤 |
| 部分覆盖 | 单词精听器 | 混合分隔符解析和空输入 |
| P1 | 语料库 | wordStats／chapterStats 导入 schema 收敛 |
| 已覆盖 | 词汇 | 数据、搜索、复习、统计、状态水合共 28 项 |

## 6. 验证命令

```bash
cd web
npm test
npm run build
```

数据生成脚本发生变化时追加：

```bash
npm run data:vocab
npm run data:corpus
git diff -- src/data
```

## 7. 最近执行结果

- 2026-09-12：使用独立的本地浏览器环境验证首页和 8 个模块路由，根组件与页面标题均正确加载。
- 2026-09-12：完成学习跟踪新增后刷新恢复、两套听写的词表解析与间隔恢复、发音词表生成、同义词示例载入、词汇页签与搜索、语料章节切换、播放器空态与全局配置等关键本地交互。
- 2026-09-12：依次加载和操作全部模块后，浏览器控制台无 error／warning。
- 2026-09-12：真实音频上传与播放、JSON 文件导入导出、通知权限和浏览器能力降级仍需按第 2 节人工验证。
- 2026-09-12：共享语音列表监听接入 4 个 TTS 模块后，语音选项加载与页面切换清理复验通过，控制台无 error／warning。
- 2026-09-12：共享文件下载入口覆盖 JSON、CSV 和 Excel 导出；单元层验证文件名、MIME、内容及 Object URL 释放。
- 2026-09-12：ECharts 与 Element Plus 改为按需注册；入口 JS 由约 829 kB 降至 406 kB，ECharts chunk 由约 1117 kB 降至 583 kB。
- 2026-09-12：按需注册后复验首页、8 个模块和两套图表，页面均正常，浏览器控制台无 error／warning。
- 2026-09-12：全部 `localStorage` 使用点接入共享分块层；覆盖旧值兼容、大记录重组、短值覆盖清理、失败回滚、缺块保护和完整删除。
- 2026-09-12：真实浏览器确认原有学习跟踪数据可读取并在刷新后恢复，8 个模块加载正常，控制台无 error／warning。
- 2026-09-12：`npm test` 通过，14 个测试文件、84 项测试全部通过。
- 2026-09-12：`npm run build` 通过；大于 500 kB 的 chunk 警告登记到 M2。
