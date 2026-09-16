# 词汇模块重构 · Parity 清单与文件地图（study_words.html → web）

> 目标：把 `words/study_words.html`（2.4MB 单文件）1:1 重构为 Vue3 模块化实现。
> legacy 侧三份分析报告：`legacy-STATE-DATA-REPORT.md` / `legacy-BEHAVIOR-REPORT.md` / `legacy-UI-STRUCTURE-REPORT.md`。

## 数据层（已完成，等价性已断言）
- `web/scripts/sync-vocab-data.mjs`：从 `words/data`（manifest + word_groups + synonyms + vocabulary 预设词表）确定性重建：
  - `web/src/data/vocabulary/library.json`（EMBEDDED_DATA 同构，词=5 字段投影）
  - `web/src/data/vocabulary/synonyms.json`（normalize_group 清洗）
  - `web/src/data/vocabulary/presets.json`（reading/listening/core）
- legacy 页面存在时逐项与内联数据深度相等断言（`npm run data:vocab`）。已验证 ✓
- 听力语料：`web/src/data/vocabulary/corpus.json` 目前为 legacy `window.LISTENING_WORD_AUDIO_DATA` 的直接快照（懒加载，独立 chunk），待 listening 模块数据层统一后改由其重建（脚本内已注明）。

## 代码分层（`web/src/features/vocabulary/`）
| 层 | 文件 | 状态 |
| --- | --- | --- |
| 类型 | `types.ts` | 完成（与 legacy 字段同名） |
| 常量 | `constants.ts` | 完成 |
| 工具 | `utils/index.ts` | 完成（函数逐字对应） |
| 词库 | `data/library.ts` / `data/sources.ts` | 完成 |
| 同义词 | `data/synonyms.ts` | 完成（索引/源规范化/过滤） |
| 快照模型 | `model/snapshot.ts` / `model/studyLog.ts` | 完成 |
| 领域 | `domain/review.ts` `domain/stats.ts` `domain/search.ts` `domain/quiz.ts` | 完成 |
| 持久化 | `persist/idb.ts` `defaults.ts` `state-io.ts` | 完成（IDB 主 + localStorage 兜底/迁移） |
| 音频 | `lib/audio.ts` | 完成（mp3 单例 + token 竞态） |
| Store | `stores/vocabulary.ts` | 完成（会话/播放/练习/难词/搜索/统计/备份动作） |
| 视图 | `VocabularyModule.vue` + `components/{OverviewPane,StudyPane,DifficultPane,SettingsDialog,HeatmapGrid}.vue` | 首版完成 |

## 功能 parity 状态
已完成：
- 三 tab（总览/学习页/难词页）、章节-分组导航、会话队列预览（已学优先排序）
- 三种练习模式（standard/quiz/spell），quiz 干扰项=全词库释义 3+1
- 自动播放引擎（倍速/间隔/重复/静音/手动发音 ignoreMute）
- recordExposure / studyLog / mastered 幂等 / 难词 6 档复习调度 + due 到期文案
- 搜索（词/义/章节/音标 assist、Enter 开始、前 24 预览）、预设词源（reading/listening/core/**listeningCorpus**）
- 听力语料：corpus.json 懒加载快照 + token 级句子匹配卡 + 语料音频播放（不受 muted 门控，同 legacy）
- 备份导出/导入（{state} 与裸 state 兼容）、7 天备份提醒
- 全局快捷键（←/→/↑/Enter/Space/Ctrl+Space 重听）、输入框与 composition 守卫
- 起始序号（1-based）跳转、拼写模式输入自动聚焦
- 总览：今日卡、7 天 ECharts 折线、词库覆盖率、30 天热力图（DOM）
- 设置弹窗（播放参数/显示开关/同义词源启用过滤/备份）
- 单元测试 28 项（数据等价计数、同义词、语料匹配、复习调度、统计、搜索、难词筛选、快照归一化、状态合并/水合首启兼容）

待补（均为非功能差异/视觉层）：
- [x] legacy 玻璃拟态视觉迁移（基础版）：`styles/legacy-theme.css` 移植 token/渐变底/玻璃卡/渐变主按钮/输入焦点环，仅作用于 `.vocab-app`
- [ ] 同义词 chip → legacy 悬浮 popover（钉住/复制/操作按钮组）精细交互
- [ ] spell 模式下 quiz 面板语义空态细节、语料行高亮当前命中 token
- [ ] 旧数据首启在真实浏览器中的端到端确认（单元层已覆盖 merge/hydrate）
- [ ] 细部视觉打磨（间距/字号/分节标题对齐 legacy）

## 运行
```bash
cd web
npm run data:vocab     # 重建数据产物（含 legacy 断言）
npm run dev            # http://127.0.0.1:5173/#/vocabulary
```
