# Legacy 回归样本

本目录只保存脱敏、最小化的旧版本数据，用于验证二开后的向后兼容性。样本不得替换为真实学习记录。

- `study-tracker-v4.json`：学习跟踪 v4 备份信封。
- `vocabulary-v4-state.json`：词汇模块旧状态片段。
- `dictation-cache-v0.json`：未包含 `intervalSec` 的旧听写缓存。
- `listen-dictation-cache-v0.json`：未包含 `intervalSec` 的旧只听循环缓存。
- `corpus-dictation-v1.json`：语料库听写 v1 备份信封。

音频播放器的历史缓存包含 File／Blob，不能使用纯 JSON 表达，保留为浏览器冒烟测试项。
