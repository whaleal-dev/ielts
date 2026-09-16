# IELTS Web 架构文档

> 面向维护者的系统说明：目录/分层约定、数据链路、主题与移植工具、模块清单、命令。

## 1. 总览与技术栈
单仓库结构：**`web/` 现代前端应用** + **`legacy/` 归档的旧单文件 HTML 工具**。

- Vue 3.5 · Vite 8 · TypeScript 6 · Pinia 4 · Vue Router 5（hash 模式）
- Element Plus 2.14 · ECharts 6（按需懒加载，随模块分包）
- Vitest 5（单元测试）；无后端，全部本地存储

`web/src/views/modules/<id>.vue` 为训练模块路由入口，每模块实际实现位于
`web/src/features/<id>/`；模块路由与全部训练页由 `web/src/modules.ts`（模块注册表）驱动。产品级入口独立承载今日工作台、学习路径和全局设置，不再把 8 个模块平铺为首页。

当前是“统一应用壳＋渐进式模块化”的混合架构：词汇模块分层最完整；语料库听写和学习跟踪已拆出部分数据、状态或组件；其余模块仍以单文件组件承载主要逻辑。下述分层是新开发和后续拆分的目标约定，不代表每个历史模块已经拥有全部目录。

## 2. 目录结构
```
web/
  scripts/            # 数据与样式工具（维护者运行）
    sync-vocab-data.mjs    # 词汇模块数据（legacy/words/data → web/src/data/vocabulary/）
    sync-corpus-data.mjs   # 语料章节词集（legacy listening html → web/src/data/corpus/）
    scope-legacy-css.mjs   # 旧 <style> 容器化移植工具（postcss）
  src/
    modules.ts         # ★ 模块注册表（8 个模块：路由/标题/legacy 源/功能/状态）
    features/
      vocabulary/ study-tracker/ pronunciation/ dictation/ synonyms/ audio-player/
      corpus-dictation/ listen-dictation/
      # 按复杂度使用：data/ model/ domain/ persist/ stores/ lib/
      #              components/ styles/ __tests__/
    data/
      vocabulary/      # 词库/同义词/预设/听力音频索引（json，sync 生成）
      corpus/          # 语料章节词集（json，sync 生成）
    shared/
      backup/          # 应用级备份信封、模块 Provider、导入校验与失败回滚
      learning-events/ # 版本化训练事件与跨模块摘要
      settings/        # 应用设置持久化
      speech/          # Web Speech 语音列表监听、重试与生命周期清理
      files/           # Blob、文本与 JSON 浏览器下载
      charts/          # ECharts 按需组件注册入口
      storage/         # localStorage 兼容读取、分块写入、失败回滚与清理
    views/             # 今日、学习路径、全部训练、全局设置及模块路由薄壳
  docs/                # 各模块 legacy 规格 + 移植决策 + 本架构文档
legacy/                # 归档：旧 HTML 页 + 数据源 + 脚本 + 各模块版本文档
  words/  daily-status/  dictionary/  listening-word/ 同义词学习/
  audio-playlist-player/ 发音/  _root/ (旧根脚本与数据)
```

## 3. 信息架构与模块清单

产品级路由：

| 路由 | 职责 |
|---|---|
| `/` | 今日工作台：Todo、继续训练、事件摘要与能力入口 |
| `/plans` | 学习路径：呈现跨模块训练闭环和真实进度 |
| `/tools` | 全部训练：按训练目的组织模块 |
| `/settings` | 全局设置：应用完整备份导入导出与恢复预览 |

训练模块共 8 个：
| 路由 | 标题 | legacy 源（现位于 legacy/） |
|---|---|---|
| `/study-tracker` | 记录与复盘 | daily-status/学习状态跟踪.html |
| `/vocabulary` | 词汇学习 | words/study_words.html |
| `/pronunciation` | 单词精听器 | dictionary/发音.html |
| `/dictation` | 单词听写 | dictionary/发音和听写.html |
| `/listen-dictation` | 只听循环听写 | 发音/发音和听写.html（变体） |
| `/synonyms` | 同义替换学习 | 同义词学习/同义词学习.html |
| `/audio-player` | 音频顺序播放器 | audio-playlist-player/音频顺序播放器.html |
| `/corpus-dictation` | 语料库章节听写 | listening-word/王璐语料库_源码.html |

每个模块 `legacy:` 字段保留可点击对照路径；模块内 `notes` 说明剩余打磨项。

## 4. 分层约定（features/<id>/）

不要求简单模块机械创建全部目录。业务逻辑能够独立测试、持久化逻辑存在版本兼容要求，或组件已明显过大时，再按以下边界拆分：
- `types.ts` / `constants.ts`：类型与常量（尽量沿用 legacy 字段名便于对照）
- `data/`：从 `web/src/data/*.json` 装载 + 归一/索引（library/synonyms/corpus…）
- `model|domain/`：纯逻辑（归一化、复习/错词/统计规则、搜索排序）
- `persist/`：localStorage + IndexedDB 适配；key 与 legacy 一致（旧数据兼容）
- `stores/`：Pinia store（会话、练习和进度）
- `components/`：视图组件；`<Id>Module.vue` 为路由挂载外壳
- `styles/legacy-full.css`：原页面 `<style>` 容器化产物（`scope-legacy-css.mjs` 生成），
  选择器全部限定在 `<scopeClass>-app` 下，避免跨模块冲突
- `__tests__/`：vitest 单测（数据/领域规则）

主题说明：每个模块外壳类名 = `<id>-app`（如 `.vocab-app`、`.study-tracker-app`），
其下直接用 legacy 同构类名享受原样式；Element Plus 变量可在容器内重映射。

## 5. 数据链路（重跑方式）
```bash
cd web
npm run data:vocab    # legacy/words/data → src/data/vocabulary/*.json
                      # （legacy 页面仍存在时自动做深度 parity 断言）
npm run data:corpus   # legacy listening HTML 的 CHAPTER_WORD_SETS → src/data/corpus/chapters.json
npm run test          # vitest（当前 95 项）
npm run build         # vue-tsc + vite
npm run dev           # http://127.0.0.1:5173
```
- 词汇模块数据产物由仓库源（manifest+分组/同义词/预设词表）确定性重建，改造 legacy 数据后重跑即可。
- 语料章节数据来自 legacy listening html 内嵌 `CHAPTER_WORD_SETS`；archive 移除后需切换到
  `legacy/listening-word/word.json` 等数据源（脚本内有 TODO 说明）。
- 样式移植（新 legacy → web）：`node scripts/scope-legacy-css.mjs <html> <scopeClass> <out.css>`
  （自动处理 tokens/body 光斑/前缀化/@media；见各模块 styles/legacy-full.css）。

## 6. 兼容性与迁移要点
- 沿用旧存储键：如 `apple-word-trainer-v4`（词汇）、`ielts-dictation-settings-v2` 等（语料）、
  `ielts_listen_repeat`（只听循环）、`daily-learning-tracker-state-v4`（状态跟踪）、
  IndexedDB 音频缓存等 —— 浏览器旧数据可直接延续。
- `localStorage` 保持原主键不变：旧版普通字符串直接读取；超过 200,000 字符的新值写为版本化清单＋分块 key。新分块全部写入成功后才切换主键，失败时清理临时块并保留上一版记录。
- 分块解决单 key 过大和长字符串读写风险，不扩大浏览器的总存储配额；达到总配额时页面会提示先导出备份并清理空间。
- 应用完整备份使用 `{app:'ielts-dev',schemaVersion:1,...}` 全局信封，只聚合白名单 Provider；旧词汇 v4、语料 v2／v1、状态跟踪 v4 等模块快照继续兼容导入。
- 导入在写入前完成全量解析和覆盖预览；应用失败时使用导入前快照回滚已经写入的 Provider。音频 Blob、临时 URL 与运行中会话不进入备份。
- 跨模块学习事件使用独立版本化 localStorage，首轮记录语料听写会话、错词与词汇掌握事实，供今日工作台、学习路径和记录复盘派生展示。
- 全部模块为本地数据；无账号体系。

## 7. 质量
- 单元测试：17 个测试文件、95 项；关注数据、状态恢复、旧版及应用备份导入、备份回滚、学习事件、解析、听写判分与推进、播放顺序、语音选择、文件下载、分块存储和序列化规则。
- 检查项：`npm run build` 无 TS 错误；测试全绿；工作树干净后再提交。

## 8. 迁移/重构资料
- `web/docs/*/legacy-*.md`、`PORT-NOTES.md`、`PARITY-CHECKLIST.md`：各模块 legacy 规范与决策
- `web/docs/audio-player/ENHANCER-PLAN.md`：audio 系统词库增强（数据驱动方案，待专项）
- `web/docs/PRODUCT-INTEGRATION-PLAN.md`：统一学习中心、备份边界和首轮事件链路
- 备份：legacy 页面整体保留于仓库 `legacy/`。
