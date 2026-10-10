# 旧词库采集流程（历史参考）

本文保留原词库采集思路，供追溯数据来源；没有在本次审查中请求外部接口或验证其当前协议。旧采集工具不属于当前 Vue 网站的启动与构建流程，重新采集需另定任务范围。当前操作以 [CLAUDE.md](../../CLAUDE.md) 、[README.md](../../README.md) 与 [ROADMAP.md](../../ROADMAP.md) 为准。

## 原采集步骤

1. 从 `dictationBookDetail` 获取书籍章节和分组目录。原示例使用 `book_id=10174`，目录关注 `data.sub_step.title`、`data.sub_step.sub_step.level`、`book_id` 与 `book_hierarchy_id`。
2. 按分组的 `book_hierarchy_id` 调用 `getPracticePageInfo`，从 `data.words` 读取词条；本地响应样本见 [分组数据demo.json](../data/source/reference/分组数据demo.json) 。
3. 原流程逐组采集，组间间隔为 2 秒；每组分别保存章节名、组号和 `words`。这些是历史采集约定，不表示本次已联网核验接口或重新生成数据。

## 凭据约定

旧说明中的明文授权凭据已移除。`words/scripts/fetch_words.py` 从 `GUIXUE_AUTH_TOKEN` 与 `GUIXUE_BOOK_ID` 环境变量读取配置；文档仅记录变量名，不提供真实值，不把凭据写入代码、命令示例、提交或日志。

本次只清除文档中的明文，不更改实际凭据或 Git 历史，也未确认旧凭据是否有效。

## 当前数据链路

已有分组数据位于 `words/data/generated/word_groups/`。日常开发由 `npm run dev`、完整静态构建由 `npm run build` 自动先准备听力数据，再生成单词精简章节和音频索引；不需要运行旧采集或 HTML 内联刷新脚本。
