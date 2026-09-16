# IELTS Tool

一个面向雅思学习的本地前端工具集合仓库，2026-09 起完成现代化重构：

> ✅ 旧「单文件 HTML」工具已全部重构为 **Vue 3 + Vite + TypeScript** 现代应用（`web/`）。
> ✅ 全部旧文件与数据源已归档至 **`legacy/`**（可继续作为样式/数据对照；另有整库备份
> `~/Desktop/ielts-dev-backup-20260909-205928/`）。

仓库顶层仅保留新版应用、旧版归档和项目治理文档：

- `web/`：新版前端与二开主入口。
- `legacy/`：旧版行为、数据源、历史脚本和音频归档。
- `CLAUDE.md`：项目级开发规范与兼容红线。
- `ROADMAP.md`：二开阶段、真实进度、阻塞与最近验证。

## 快速开始

```bash
cd web
npm install
npm run dev        # http://127.0.0.1:5173
npm run test       # 单元测试（95 项）
npm run build      # vue-tsc 类型检查 + 产物
```

## 一级入口

| 路由 | 用途 |
|---|---|
| `/` | 今日学习工作台：Todo、继续训练、学习动态与能力入口 |
| `/plans` | 学习路径：串联输入、训练、复习和复盘 |
| `/tools` | 全部训练：按听力、词汇、记录等目的组织 8 个模块 |
| `/settings` | 全局设置：应用完整备份的导入、导出与恢复预览 |

## 训练模块（共 8 个）

| 路由 | 模块 | legacy 源（legacy/ 内） | 状态 |
|---|---|---|---|
| `/study-tracker` | 记录与复盘 | `daily-status/学习状态跟踪.html` | ✅ 已完成 |
| `/vocabulary` | 词汇学习 | `words/study_words.html` | ✅ 已完成 |
| `/pronunciation` | 单词精听器 | `dictionary/发音.html` | ✅ 已完成 |
| `/dictation` | 单词听写 | `dictionary/发音和听写.html` | ✅ 已完成 |
| `/listen-dictation` | 只听循环听写 | `发音/发音和听写.html`（变体） | ✅ 已完成 |
| `/synonyms` | 同义替换学习 | `同义词学习/同义词学习.html` | ✅ 已完成 |
| `/audio-player` | 音频顺序播放器 | `audio-playlist-player/音频顺序播放器.html` | ✅ 已完成（核心） |
| `/corpus-dictation` | 语料库章节听写 | `listening-word/王璐语料库_源码.html` | ✅ 已完成 |

训练模块注册表（模块路由与全部训练页的数据源）：`web/src/modules.ts`；
架构/分层/数据链路/移植工具说明：`web/docs/ARCHITECTURE.md`。

## 目录结构

```
web/                 新版前端（Vue 3 + Vite + TS + Element Plus + ECharts）
  scripts/           数据与样式工具：sync-vocab-data / sync-corpus-data / scope-legacy-css
  src/modules.ts     ★ 模块注册表
  src/features/*     8 个业务模块（按复杂度逐步落地分层）
  src/shared/backup  应用级备份信封、模块 Provider 与回滚
  src/shared/learning-events  跨模块学习事件与摘要
  src/data/*         由 sync 脚本生成的数据产物（词库/同义词/语料章节/音频索引）
  src/views/*        今日、学习路径、全部训练和全局设置
  src/views/modules/* 路由薄壳
  docs/              ★ 架构文档 + 各模块 legacy 规格/移植决策/parity 清单
legacy/              旧版归档
  words/ daily-status/ dictionary/ listening-word/ 同义词学习/
  audio-playlist-player/ 发音/ _root/
```

## 常用维护命令

```bash
# 重建词汇模块数据（legacy 页存在时自动做一致性断言）
cd web && npm run data:vocab

# 重建语料章节词集
cd web && npm run data:corpus

# 旧页面样式移植进新模块（容器级 scoping）
cd web && node scripts/scope-legacy-css.mjs <html> <scopeClass> <out.css>
```

## 二开约定

- 新功能只在 `web/` 开发；`legacy/` 仅作数据和行为对照。
- 新模块统一登记在 `web/src/modules.ts`，路由页保持为薄壳。
- 不直接修改可由 `web/scripts/` 重建的静态 JSON。
- 不得在没有迁移函数和回归验证的情况下修改持久化键或备份结构。
- 详细规范见 `CLAUDE.md`，阶段进度见 `ROADMAP.md`。

## 特点
- 数据/进度/备份均存本地（沿用 legacy 的 localStorage / IndexedDB 键，旧数据直接兼容）。
- 应用完整备份使用版本化全局信封；既有模块快照和存储键保持兼容。
- `localStorage` 大记录超过 200,000 字符时自动分块，兼容旧版未分块值，并在写入失败时保留上一版数据。
- 完整 JSON 导入导出统一在全局设置；Excel、PDF、CSV 等业务结果导出保留在模块内。
- 语料听写、词汇掌握、今日工作台和记录复盘通过共享学习事件形成首条闭环。
- 学习数据 100% 本地，无账号体系。

## 文档索引
- 项目规范与进度：`CLAUDE.md`、`ROADMAP.md`
- 架构与开发：`web/docs/ARCHITECTURE.md`、`web/README.md`
- 产品整合方案：`web/docs/PRODUCT-INTEGRATION-PLAN.md`
- 下一版本计划：`web/docs/V0.2-PLAN.md`
- 二开回归与数据契约：`web/docs/BASELINE.md`
- 各模块移植规格与决策：`web/docs/<module>/`（legacy-DATA-UI / legacy-ENGINE / PORT-NOTES / PARITY-CHECKLIST）
- 遗留说明：audio 系统词库增强方案 `web/docs/audio-player/ENHANCER-PLAN.md`
