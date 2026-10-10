# IELTS Studio

无后端的雅思学习网站，使用 Vue 3、Vite 和 PrimeVue 4，构建产物为纯静态文件。学习记录与用户导入的词库保存在当前浏览器来源。

后续只开发新版，本文及现行指南均以新版为准。旧版页面、脚本与旧版文档保持原样，仅供参考；具体功能和文件边界见 [新旧版本范围说明](docs/version-scope.md) 。

| 模块 | 主要功能 | 本地入口 |
| --- | --- | --- |
| 单词 | 内置主题词汇、个人 CSV／TXT 词库、笔记、难度复习与统计 | [单词学习](http://127.0.0.1:5173/words/study_words.html) |
| 听力 | 原声语料、听音／听写、错词本与完整分组成绩 | [听力语料库](http://127.0.0.1:5173/listening-word/王璐语料库_源码.html) |
| 同义词 | 分组词库导入、文件缓存、搜索、循环播放与已有笔记 | [同义词](http://127.0.0.1:5173/synonyms/index.html) |
| 单词播放 | 粘贴词表、Web 英文语音、乱序与逐词听写 | [单词播放](http://127.0.0.1:5173/word-player/index.html) |

顶部统一导航；[首页](http://127.0.0.1:5173/) 与单词入口显示同一模块，共五个 HTML 构建入口。当前不提供学习记录备份、导入或导出。

## 快速启动

需要 Node.js 和 npm。当前 Vite 与官方 Vue 插件要求 Node.js `^20.19.0 || >=22.12.0`，依赖版本以项目锁文件为准。

```sh
npm ci
npm run dev
```

访问 [http://127.0.0.1:5173/](http://127.0.0.1:5173/) 。开发只绑定本机，固定端口 5173；Vue 入口通过 HTTP 使用，不能双击 HTML。启动会先准备听力数据，再准备单词数据与音频索引。

请固定访问地址和浏览器。旧 `file://`、本地与服务器、不同主机名或端口的记录不会自动共享，清除网站数据会失去个人词库和学习记录。

## 验证与构建

首次检出或缺少生成数据时，先准备数据再测试：

```sh
npm run prepare:listening
npm run prepare:words
npm test
npm run build
npm run preview
```

完整构建输出到新的 `dist/releases/build-*/`，成功后更新 `dist/latest.json`；预览读取该指针，使用与开发相同的地址，切换前停止原进程。发布仅使用指针指定目录内的内容，旧产物保留。详细命令、失败处理和授权要求见 [开发维护指南](docs/development.md) 。

## 文档

- [文档索引](docs/README.md) ：现行文档、方案、审查与历史资料的统一入口。
- [新旧版本范围说明](docs/version-scope.md) ：新版开发范围、旧版冻结范围与现有数据的复用边界。
- [使用指南](docs/usage.md) ：四模块操作、导入格式、播放参数与快捷键。
- [架构说明](docs/architecture.md) ：入口、核心代码、数据生成、发音和浏览器存储。
- [开发维护指南](docs/development.md) ：安装、命令、验证、构建、预览与服务器部署。
- [CLAUDE.md](CLAUDE.md) ：项目规范，任务开始前阅读。
- [ROADMAP.md](ROADMAP.md) ：当前阶段、提交／发布状态、待办与最近验证。
- [个人词库方案](WORD_LIBRARY_PLAN.md) 、[代码审查记录](CODE_REVIEW.md) ：格式与验收约定、审查修复依据。

`src/` 是在用网站代码，根目录 `scripts/` 负责数据与构建，`tests/` 负责回归，`deploy/` 保存 Nginx 配置副本。`words/data/` 与本地 MP3 是现有数据来源；`src/generated/`、`dist/` 与 `node_modules/` 不提交。

旧独立页面、脚本和报告冻结，仅供参考，入口见 [历史与参考资料](docs/README.md#历史与参考资料) 。当前提交和最近一次服务器验证见路线图，本地构建不会自动公开发布。
