# IELTS 旧版核心文件解释说明

本文档用于快速回答三个问题：
- 这个仓库的核心文件有哪些。
- 每个核心文件负责什么、依赖什么、产出什么。
- 修改某个核心文件后，应该联动检查哪些位置。

## 1. 总体分层

仓库可以按三层理解：

1. 页面层（HTML）
- `daily-status/学习状态跟踪.html`
- `dictionary/发音.html`
- `dictionary/发音和听写.html`
- `audio-playlist-player/音频顺序播放器.html`
- `listening-word/王璐语料库_源码.html`
- `words/study_words.html`

2. 数据与构建层（scripts + data）
- `words/scripts/*.py`
- `listening-word/scripts/*`
- `data/generated/*`
- `words/assets/audio/*`
- `listening-word/assets/audio/*`

3. 文档与发布层（version/release）
- 各模块的 `version.md`、`release.md`、`docs/version.md`、`docs/release.md`

## 2. 根目录核心文件

### 2.1 `README.md`

作用：
- 仓库总入口文档。
- 定义模块边界、运行方式和主要维护流程。

改动时机：
- 新增模块。
- 维护流程变化（例如脚本命令、环境要求变化）。
- 核心能力变化（例如页面新增大功能）。

联动检查：
- 模块文档是否与 README 描述一致。
- 脚本命令、路径、环境变量是否仍可执行。

### 2.2 `todo`

作用：
- 维护任务清单和审查步骤。
- 用于记录“先做什么、再核对什么、最后发布什么”。

改动时机：
- 新任务进入开发。
- 审查流程增加/变化。

联动检查：
- `todo` 中列出的步骤，是否在对应 `version.md` / `release.md` 有落地记录。

## 3. daily-status 模块核心文件

### 3.1 `daily-status/学习状态跟踪.html`

作用：
- 学习记录、Todo、复盘、记账、统计图表的一体化页面。

关键能力：
- 全量导入导出（JSON/Excel/PDF）。
- 学习记录表 + 筛选排序 + 目标线/热力图统计。
- Todo 管理与明日计划同步。
- 记账管理（分类、周期规则、图表联动）。

主要依赖：
- Vue 2、Element UI、ECharts、html2canvas、jsPDF（CDN）。
- 浏览器本地存储（localStorage）。

高风险改动点：
- 状态结构字段名变更（会影响导入导出兼容）。
- 统计口径改动（会影响图表和周/月报结果）。
- 通知提醒时间和权限处理逻辑。

### 3.2 `daily-status/docs/version.md`

作用：
- 功能清单和关联链路的“当前真实基线”。

要求：
- 每次关键功能增删、数据结构变化都应更新。
- 结论要可追溯到页面代码实现。

### 3.3 `daily-status/docs/release.md`

作用：
- 面向发布记录“本次修复/优化/风险”。

要求：
- 描述必须对应本次实际改动，避免陈旧条目。

## 4. dictionary 模块核心文件

### 4.1 `dictionary/发音.html`

作用：
- 轻量发音练习入口。

### 4.2 `dictionary/发音和听写.html`

作用：
- 发音 + 听写组合练习页面。

维护建议：
- 该模块通常是轻量入口页，若引入新词库或新评分规则，要在 README 中补充入口说明。

### 4.3 `audio-playlist-player/音频顺序播放器.html`

作用：
- 本地音频顺序播放与复读配置页面。

关键能力：
- 上传本地音频并形成播放清单。
- 每个条目独立设置倍速、播放次数，或跟随全局默认值。
- 支持复制同一音频条目，构造“同一文件不同配置”的训练链路。
- 定时自动暂停，适合限时跟读或精听。

高风险改动点：
- 暂停/继续逻辑，必须保证继续时从暂停点恢复而不是重播当前条目。
- 清单重渲染时机，避免在输入过程中替换节点导致浏览器报错或丢失焦点。
- 自动暂停定时器与播放状态的联动，避免暂停、继续、播放完成时出现计时残留。

## 5. listening-word 模块核心文件

### 5.1 `listening-word/王璐语料库_源码.html`

作用：
- 章节化语料听写练习主页面。

关键能力：
- 章节词库匹配与练习队列。
- 听写模式/听音模式分流。
- 错词本、词统计、章节统计。
- 导入导出与历史备份。
- 音频缓存（IndexedDB）与本地状态存储。

主要依赖：
- 远程音频源。
- localStorage + IndexedDB。

高风险改动点：
- 判题流程和统计写入时机（容易导致统计口径污染）。
- 备份导入迁移逻辑（v1/v2 兼容处理）。

### 5.2 `listening-word/scripts/download_audio.js`

作用：
- 通过 JavaScript 批量下载听写音频。

何时使用：
- 需要提前本地化音频资源时。

### 5.3 `listening-word/scripts/download_audio.rb`

作用：
- Ruby 版本的音频下载脚本。

何时使用：
- 需要 Ruby 环境下批处理时。

### 5.4 `listening-word/docs/version.md` 与 `listening-word/docs/release.md`

作用：
- `docs/version.md` 保持功能基线。
- `docs/release.md` 记录发布增量。

补充：
- `listening-word/version.md` 与 `listening-word/release.md` 是索引入口，应与 docs 保持一致。

## 6. words 模块核心文件

### 6.1 `words/study_words.html`

作用：
- 词汇学习主页面，是全仓库最核心的学习页之一。

关键能力：
- 章节/分组学习，标准/选择/拼写三模式。
- 搜索（英文、中文、章节、音标）与搜索结果练习。
- 难词系统（复习阶段、到期复习、失败统计）。
- 关联词/同义词展示。
- 学习统计与热力图。
- 备份导入导出。

主要依赖：
- 页面内联数据（词库、同义词源数据等）。
- localStorage。
- ECharts CDN。
- 音频 URL。

高风险改动点：
- 会话状态切换（普通学习/搜索练习/难词练习）。
- 导入恢复逻辑（对象结构校验、字段兼容）。
- 同义词聚合与渲染（容易出现空数据回退问题）。

### 6.2 `words/scripts/fetch_words.py`

作用：
- 从外部来源抓取章节分组词汇。

输入：
- 环境变量（如授权 token、book id）。

输出：
- `data/generated/word_groups/*.json`。

### 6.3 `words/scripts/generate_manifest.py`

作用：
- 根据分组词汇生成 manifest。

输出：
- `data/generated/manifests/word_groups_manifest.json`。

### 6.4 `words/scripts/generate_synonym_bundle.py`

作用：
- 生成同义词聚合产物，供分离式加载方案使用。

### 6.5 `words/scripts/refresh_study_words_inline_data.py`

作用：
- 刷新 `study_words.html` 中的内联数据块。

风险提示：
- 改动该脚本后，应立即验证页面是否能正常加载、搜索、开始练习。

### 6.6 `words/scripts/download_word_audio.py`

作用：
- 批量下载词汇音频。

输出：
- 本地音频目录与清单文件。

### 6.7 `words/version.md`、`words/release.md`、`words/docs/version.md`

作用：
- 对外发布摘要（version/release）。
- 审查细节与链路核对（docs/version）。

维护原则：
- 如果页面行为改变，优先更新 `words/docs/version.md`，再同步到 `words/version.md` 和 `words/release.md`。

## 7. data 目录核心文件

### 7.1 `data/generated/manifests/word_groups_manifest.json`

作用：
- 词汇分组清单索引，支撑章节与分组装载。

### 7.2 `data/generated/word_groups/*.json`

作用：
- 章节分组的原子词汇数据。

### 7.3 `data/generated/synonyms/synonym_groups.js`

作用：
- 同义词聚合结果。

### 7.4 `data/generated/inline/core_vocab.js`

作用：
- 提供可内联到页面的数据中间产物。

维护要点：
- 该目录产物通常由脚本生成，尽量避免手工编辑。

## 8. 推荐维护顺序（核心文件视角）

1. 先改页面或脚本实现
- 例如改 `words/study_words.html` 或 `words/scripts/*.py`。

2. 再做链路验证
- 页面主流程是否可用。
- 数据输入输出路径是否正确。
- 导入导出与本地状态是否兼容。

3. 最后更新文档
- 模块 `docs/version.md` 记录真实功能基线。
- 模块 `release.md` 记录本次增量。
- 必要时更新 `README.md` 的总览和维护流程。

## 9. 常见改动与联动检查速查

- 修改页面状态字段：检查导入导出兼容 + 历史备份兼容。
- 修改统计逻辑：检查图表口径 + 文档口径一致。
- 修改音频链路：检查离线降级提示 + 缓存计数更新。
- 修改搜索/难词入口：检查会话标题、按钮可用状态、结果为空提示。
- 修改脚本输出路径：检查页面读取路径与 manifest 是否同步。

## 10. 文档更新规则建议

- 功能变更后，至少同步更新一个版本文档（建议 docs/version.md）。
- 发布前，确保 release 文档只写“本次真实发生的变化”。
- README 负责总览，不承载太细的实现细节；实现细节应放在各模块版本文档。
