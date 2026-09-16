# legacy/ 旧版归档

旧版“单文件 HTML”学习工具及其中间产物、脚本、文档的归档目录（2026-09 移入）。

- `words/`：词汇学习模块旧版（study_words.html、数据源、生成脚本、音频资源）
- `daily-status/`：学习状态跟踪旧版
- `dictionary/`：发音 / 发音和听写 旧版
- `发音/`：只听循环变体（已收编为 web 的 /listen-dictation）
- `同义词学习/`：同义替换旧版
- `audio-playlist-player/`：音频顺序播放器旧版（含系统词库增强脚本）
- `listening-word/`：语料库听写旧版（含大量本地音频）
- `_root/`：旧根目录杂项（脚本/旧数据/旧文档）

说明：
1. 新版前端的“数据重建”脚本读取本目录下的源数据（`web/scripts/sync-vocab-data.mjs`、
   `sync-corpus-data.mjs` 已指向 `legacy/`），请勿随意移动这些子目录。
2. `_root/` 下旧脚本与数据为“原样归档”：其中的路径若仍写 `words/…`、`listening-word/…`
   在旧版结构下有效；如需运行请先自行改为 `legacy/words/…` 等。
3. 各旧模块自带 version/release 文档，可作历史审查。
