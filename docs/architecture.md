# 代码与数据架构

本文按 2026-10-10 工作区代码核对，2026-10-11 补充新版复核后的实现。使用方式见 [使用指南](usage.md) ，命令与部署见 [开发维护指南](development.md) ，提交及验收状态见 [路线图](../ROADMAP.md) 。

## 网站入口

项目使用 Vue 3、Vite、PrimeVue 4 和官方主题包，没有后端、路由库或独立状态管理库。五个 HTML 入口都加载 [src/main.js](../src/main.js) ，按 `location.pathname` 动态加载模块，顶部导航通过普通链接切换页面。

| 构建入口 | 页面组件 | 核心状态与逻辑 |
| --- | --- | --- |
| [index.html](../index.html) 、[words/study_words.html](../words/study_words.html) | [App.vue](../src/App.vue) 、[StudyCard.vue](../src/StudyCard.vue) | [useLearning.js](../src/useLearning.js) |
| [listening-word/王璐语料库_源码.html](../listening-word/王璐语料库_源码.html) | [ListeningApp.vue](../src/listening/ListeningApp.vue) | [useListening.js](../src/listening/useListening.js) |
| [synonyms/index.html](../synonyms/index.html) | [SynonymsApp.vue](../src/synonyms/SynonymsApp.vue) | [useSynonyms.js](../src/synonyms/useSynonyms.js) |
| [word-player/index.html](../word-player/index.html) | [WordPlayerApp.vue](../src/word-player/WordPlayerApp.vue) | [useWordPlayer.js](../src/word-player/useWordPlayer.js) |

[vite.config.js](../vite.config.js) 固定 `base: '/'`，导航与音频也使用根路径，现行部署按域名根目录提供服务。两个单词入口显示同一模块；相同来源下读取相同记录。现有单词与听力 HTML 仅为 Vue 入口，不能再按旧指南写入内联词库。

## 核心文件职责

| 范围 | 文件 | 职责 |
| --- | --- | --- |
| 通用界面 | [ModuleNav.vue](../src/ModuleNav.vue) 、[HeaderTools.vue](../src/HeaderTools.vue) | 四模块导航、北京时间日期与未开放的设置按钮 |
| 选择控件 | [theme.js](../src/ui/theme.js) 、[style.css](../src/ui/style.css) | PrimeVue 主题、中文提示与共用选择控件样式 |
| 内置单词 | [library.js](../src/library.js) | 读取精简章节、完整词条音频索引、关联词源并建立词条索引 |
| 个人词库 | [wordImport.js](../src/wordImport.js) 、[wordLibraries.js](../src/wordLibraries.js) | CSV／TXT 解析与模板、稳定 ID、目录／内容分块及目标词库删除范围 |
| 单词复习与统计 | [learningModel.js](../src/learningModel.js) 、[progress.js](../src/progress.js) | 难度、复习间隔、北京时间日键、学习连续天数与每日位图去重 |
| 听力数据与播放 | [library.js](../src/listening/library.js) 、[model.js](../src/listening/model.js) 、[player.js](../src/listening/player.js) | 语料索引、输入匹配、判题记录、完整分组判定及原声播放 |
| 同义词 | [model.js](../src/synonyms/model.js) 、[fileCache.js](../src/synonyms/fileCache.js) | TXT／JSON 解析、中文过滤、容量边界、紧凑循环队列及文件缓存 |
| 单词播放 | [model.js](../src/word-player/model.js) | 词表解析、去重、设置校验、乱序与答案比较 |
| 共用练习 | [player.js](../src/practice/player.js) 、[VoiceSelect.vue](../src/practice/VoiceSelect.vue) | Web 语音、重复与取消、队列播放、发音人选择 |
| 浏览器提示 | [browser.js](../src/practice/browser.js) 、[BrowserNotice.vue](../src/practice/BrowserNotice.vue) | Chrome 识别、同来源共享的北京时间每日提醒 |
| 共用存储 | [storage.js](../src/storage.js) 、[records.js](../src/practice/records.js) 、[usePracticeStorage.js](../src/practice/usePracticeStorage.js) | IndexedDB／localStorage、记录限制、分块、真实键删除及读取／保存重试 |

## 数据来源与准备顺序

| 数据 | 维护来源 | 生成与读取 |
| --- | --- | --- |
| 内置主题词汇 | `words/data/generated/word_groups/*.json` | `prepare-words.mjs` 生成 `src/generated/chapter-*.json`，由单词 `library.js` 读取 |
| 单词关联词 | `words/data/source/synonyms/同义词*.json` | 单词 `library.js` 在构建时导入，当前词最多展示 8 个关联词 |
| 听力语料 | [corpus.json](../listening-word/data/corpus.json) | `prepare-listening.mjs` 生成章节、音频清单与缺失报告 |
| 同义词默认示例 | [default-groups.json](../src/synonyms/default-groups.json) | 首次无已保存词库时加载，不占文件缓存名额 |
| 个人词库与自定义词表 | 用户在页面上传或粘贴的内容 | 浏览器解析和保存，不写回仓库或服务器 |

`words/data/generated/` 虽沿用旧目录名，但其中的分组 JSON 是当前单词构建输入。`src/generated/` 是每次开发／构建前生成的目录，已忽略，不手工编辑或提交。

准备顺序必须为 [prepare-listening.mjs](../scripts/prepare-listening.mjs) → [prepare-words.mjs](../scripts/prepare-words.mjs) 。后者读取前者的章节与已核验音频清单，建立个人词条可复用的 MP3 映射；仅准备单词不能同步听力数据变动。

现有源文件核对结果：内置单词为 22 章、67 组、3632 个词条；听力为 Chapter 3、4、5、8、11 共 88 组，分组内规范化去重后 9330 条；默认同义词为 179 组、672 个词条。音频覆盖以重新生成的 `src/generated/listening-audio-report.json` 为准，不能拿历史文件数替代检查。

## 发音链路

内置单词使用词条 ID 对应的主题 MP3。个人词条按规范化后的完整英文查询 `word-audio-index.json`，来源优先级为主题 MP3、`eng_by_word/` 按词命名的 MP3、已核验的听力 MP3。规范化统一大小写、首尾及连续空白和常见英文撇号；不做词干、子串或近似匹配。

没有 MP3 映射的个人词条使用 Web 英文语音；已有映射播放失败时显示错误并暂停。同义词与单词播放使用 Web 语音，听力使用原声音频，缺失时提示或跳过。

默认 Web 发音由播放器按当前可用语音列表选择，语音列表恢复不把临时回退写成单词的手动选择；非空的已保存选择暂不可用时保留，发音使用默认英语语音，可用后恢复。同义词中文标签与单词播放过滤共用 Unicode Han 脚本判断，包含扩展汉字。

[copy-audio.mjs](../scripts/copy-audio.mjs) 向本轮构建目录复制整个 `words/assets/audio/eng/`、听力清单中的文件，以及单词索引引用的 `eng_by_word/` 文件。多个词条可以共用一个文件，因此词条数、音频映射数与实际 MP3 文件数可能不同。构建与索引保留路径编码，文件名中的空格、加号、百分号、中文及问号需按实际 URL 核验。

运行时听力 URL 由 `model.js` 的 `audioUrl()` 生成，保留文件名中的字面加号，转义百分号、空格、问号等字符；复制脚本通过文件 URL 逐段编码后写入原文件名。HTTP 验证使用实际生成的 URL，不能把复制时的文件 URL 编码方式直接替代页面音频 URL。

## 浏览器存储

所有记录只保存在当前浏览器来源。数据库均为版本 `1`、对象存储 `kv`，没有数据库结构变更。

| 模块 | IndexedDB 数据库 | 当前记录前缀 | 同来源旧记录 |
| --- | --- | --- | --- |
| 单词 | `apple-word-trainer` | `ielts-words-v1:` | 业务层设置 `legacyKey: null`，不读取旧 `apple-word-trainer-v4` 整包 |
| 听力 | `ielts-dictation-data-db` | `ielts-listening-v1:` | 通过 [listening/storage.js](../src/listening/storage.js) 读取原设置、错词、词统计与章节统计，保留原键 |
| 同义词 | `apple-word-trainer` | `ielts-synonyms-v1:` | 读取旧 `ielts_notes_v4` 笔记，保留原键 |
| 单词播放 | `apple-word-trainer` | `ielts-word-player-v1:` | 读取旧 `ielts_listen_repeat` 词表与设置，保留原键 |

`RecordStore` 默认仍保留旧整包键参数，单词业务层显式禁用读取；不能只看存储类默认值就认为单词仍在迁移旧记录。

新记录以完整键、时间戳和值的序列化 UTF-8 大小检查，上限 8 KiB。设置、位置、词条状态与每日汇总独立保存，词库、词表、来源与长笔记分块保存。`valueRecords()` 按 1024 个 UTF-16 代码单元切分序列化文本，分块长度与最终记录的字节上限分别校验。

个人词库目录使用 `libraryInfo:<id>`，内容使用 `library:<id>`；读取时合并旧 `libraries` 共享目录，不迁移旧目录。导入和删除只写目标词库，操作前读取最新持久化记录，并通过变更通知、storage 事件和重新获得焦点同步。每日汇总独立于词库内容，删除词库保留已产生的每日汇总。

同义词文件缓存使用 `file-cache:index` 与 `file-cache:<slot>`，最多 20 个固定槽位。同名文件替换并排到队尾，超限淘汰最早文件；选择缓存不改变淘汰顺序。文件缓存与当前词库一起保存，成功后才更新已缓存列表。

分块值缩短、清空、替换或缓存删除时，同批真实删除多余键，`DELETE_RECORD` 与保存 `null` 不同。IndexedDB 提交后清理相关 localStorage 回退镜像；清理失败保留可重试状态，避免旧镜像复活内容。

单词的 `word:<key>` 以 `noteParts` 指定 `note:<key>:<index>` 的块数；回收同时识别该元数据，缩短或清空笔记不留下旧尾块。

无法打开 IndexedDB 时回退 localStorage。首次读取失败、空记录与保存失败分别处理；完整恢复包含旧记录读取，同义词与单词播放读取成功前不开放编辑和播放，重试先恢复已有内容。听力旧记录先读取，完整恢复失败时关闭保存；临时练习不保存，重试重新读取。JSON 格式错误的容错不吞掉存储读取异常。保存失败保留待保存数据，不能显示已保存。localStorage 批次失败会尝试恢复旧值，但没有跨键事务或页面崩溃时的原子保证。

单词日键、近期统计与连续学习，以及听力章节成绩的 `localDay()` 均使用北京时间，历史日期键和计数原样保留。单词曝光去重包含日键，保持同词跨午夜继续学习时计入新一天。浏览器不保存音频二进制，也不提供学习记录备份、导入或导出。

## 维护范围

后续只开发新版，本文描述新版代码与数据链路；具体边界见 [新旧版本范围说明](version-scope.md) 。`src/`、根目录 `scripts/`、`tests/` 与当前数据来源构成在用网站。`daily-status/`、`dictionary/`、`audio-playlist-player/`、`发音/`、`同义词学习/` 和 `_root/` 中的旧页面、参考实现与脚本冻结，仅作参考，不在五入口构建中。`words/scripts/`、`listening-word/scripts/` 的旧采集、处理与 HTML 内联刷新也不由 npm 构建调用；旧内联刷新工具不能用于现有 Vue HTML。

详细历史入口见 [文档索引](README.md#历史与参考资料) 。
