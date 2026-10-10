# 核心文件指南入口

本文件保留原路径。2026-10-10 文档整理后，当前代码说明统一放入 [架构说明](../docs/architecture.md) ；整理前的旧指南完整保存在 [历史归档](../docs/history/core-files-guide-legacy.md) 。

## 当前网站

| 需要定位的内容 | 现行文档 |
| --- | --- |
| 五个 HTML 入口、模块组件与业务逻辑 | [网站入口与核心文件](../docs/architecture.md#网站入口) |
| 单词分组、听力语料、同义词与音频索引 | [数据来源与准备顺序](../docs/architecture.md#数据来源与准备顺序) |
| MP3 复用、Web 语音与音频复制 | [发音链路](../docs/architecture.md#发音链路) |
| 数据库、记录键、分块、失败重试与旧数据读取 | [浏览器存储](../docs/architecture.md#浏览器存储) |
| 命令、构建版本、预览与服务器部署 | [开发维护指南](../docs/development.md) |
| 项目规则、实际进度和文档分类 | [CLAUDE.md](../CLAUDE.md) 、[ROADMAP.md](../ROADMAP.md) 、[文档索引](../docs/README.md) |

`words/study_words.html` 与 `listening-word/王璐语料库_源码.html` 现为 Vue 入口，不能再按旧指南刷新内联词库。听写保留在听力与单词播放内，旧独立播放器与当前「单词播放」模块分别维护。

## 保留的独立与历史资料

`daily-status/`、`dictionary/`、`audio-playlist-player/`、`发音/`、`同义词学习/` 和 `_root/` 的资料不在当前五入口构建中。`words/scripts/` 的旧采集与内联刷新脚本也不是日常构建步骤。

旧页面功能、审查日期及发布记录见 [历史与参考资料](../docs/README.md#历史与参考资料) ，不作为当前功能或验证依据。
