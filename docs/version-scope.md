# 新旧版本范围说明

自 2026-10-11 起，后续只开发新版。旧版保持原样，仅供功能、交互和数据参考；现行说明、开发规范与验收均以新版为准。

这里的「旧版／新版」指独立 HTML 实现与当前 Vue 网站的区别；`dist/releases/` 中每次构建生成的版本目录属于新版构建历史。

## 新版范围

新版是使用 Vue 3、Vite 和 PrimeVue 4 的 IELTS Studio，无后端，构建为纯静态网站，学习记录保存在当前浏览器来源。

| 模块 | 功能范围 | 代码与入口 |
| --- | --- | --- |
| 单词学习 | 内置主题词汇、个人 CSV／TXT 词库、笔记、难度复习与统计 | `src/` 中的单词组件与逻辑；`index.html`、`words/study_words.html` |
| 听力 | 原声语料、听音／听写、错词本与完整分组成绩 | `src/listening/`；`listening-word/王璐语料库_源码.html` |
| 同义词 | 分组词库导入、缓存、搜索、循环播放与已有笔记 | `src/synonyms/`；`synonyms/index.html` |
| 单词播放 | 粘贴词表、Web 英文语音、顺序／乱序与逐词听写 | `src/word-player/`；`word-player/index.html` |

四个模块共五个 HTML 入口，首页与单词入口加载同一模块。入口以 [vite.config.js](../vite.config.js) 为依据，模块加载由 [src/main.js](../src/main.js) 负责。

新版配套范围包括：

- `src/practice/`、`src/ui/` 及 `src/` 中的共用导航、样式与存储逻辑。
- 根目录 `scripts/`、`tests/`、`package.json`、`package-lock.json`、`vite.config.js`；`src/generated/` 是自动生成数据，`dist/` 是构建产物。
- `deploy/` 中当前静态网站的部署配置副本；修改配置和公开发布仍遵守 [项目规范](../CLAUDE.md) 的授权要求。
- 根目录现行文档、`docs/` 中的使用、架构、开发维护和范围说明；具体职责见 [文档索引](README.md) 。

新版当前不包含旧学习状态页的 Todo、复盘、记账和导出，也不包含旧独立音频顺序播放器；新版不提供学习记录备份、导入或导出。旧版存在的功能不自动成为新版需求。

## 旧版范围

旧版包括独立 HTML 阶段的页面实现、配套脚本和记录；以下范围全部冻结，仅作参考。

| 范围 | 文件或目录 | 参考内容 |
| --- | --- | --- |
| 原单词与听力独立 HTML | 替换为 Vue 入口之前的历史实现，以及 `words/`、`listening-word/` 中的旧版审查和发布记录 | 原学习流程、语料组织与历史行为；当前同名 HTML 已属于新版 |
| 独立学习状态页面 | `daily-status/` | 学习记录、Todo、复盘、记账及统计 |
| 独立发音与听写页面 | `dictionary/`、`发音/` | 原词表发音与听写实现 |
| 独立同义词页面 | `同义词学习/` | 原分组、导入与循环播放实现 |
| 独立音频顺序播放器 | `audio-playlist-player/` | 原音频库与播放清单实现 |
| 旧采集与处理工具 | `words/scripts/`、`listening-word/scripts/`、`_root/` | 旧抓取、下载、处理、测试与 HTML 内联刷新流程 |
| 旧版文档与中间产物 | 上述旧模块的版本、发布、采集说明，以及未被新版读取的旧内联和打包数据 | 原日期、版本与验证背景 |

不修改旧版页面、脚本或旧版文档，不为旧版修复问题、升级依赖、追加功能或重新发布。参考旧版得到的需求与实现只落在新版。若确需改变冻结范围，须先取得主人明确授权，再更新 [CLAUDE.md](../CLAUDE.md) 和本说明。

## 旧版数据的复用边界

`words/` 与 `listening-word/` 混有新版入口、现有数据和旧资料，应按具体文件区分。

| 新版读取的资源 | 用途 |
| --- | --- |
| `words/data/generated/word_groups/` | 内置单词分组，生成新版精简章节 |
| `words/data/source/synonyms/` | 单词关联词来源 |
| `words/assets/audio/eng/`、`words/assets/audio/eng_by_word/` | 内置单词与个人词条复用的本地 MP3 |
| `listening-word/data/corpus.json` | 已提取的新版听力语料源 |
| `listening-word/assets/audio/`、`listening-word/chunks/`、`listening-word/chapter8/` 中索引引用的 MP3 | 听力原声与个人词条复用音频 |

新版数据准备和音频复制按现有链路只读复用这些输入，生成结果写入 `src/generated/` 与本轮构建目录。复用数据不意味着恢复旧版维护，也不意味着整个旧目录进入新版开发范围；不得使用旧内联刷新脚本覆盖现有 Vue 入口。

## 后续开发与文档规则

1. 开始任务先读 [CLAUDE.md](../CLAUDE.md) 、本说明和 [ROADMAP.md](../ROADMAP.md) ，按新版代码确认修改范围。
2. 新功能、问题修复、界面调整与回归验证只针对新版；旧版仅作只读参考。
3. 使用方式、代码架构和开发命令分别更新 [使用指南](usage.md) 、[架构说明](architecture.md) 与 [开发维护指南](development.md) ，新增文档补进索引。
4. 验证后更新 `ROADMAP.md`；旧版审查、发布结论和 `docs/history/` 中的历史记录保留原日期与基线，不代表新版当前行为或本次验收。
