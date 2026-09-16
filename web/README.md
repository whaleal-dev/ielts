# IELTS Web

IELTS 学习工具集的新版前端，也是后续二开的唯一业务入口。8 个旧版单文件 HTML 工具已迁入统一的 Vue 单页应用，旧实现保留在仓库根目录的 `legacy/` 中用于数据与行为对照。

## 技术栈

Vue 3.5 · Vite 8 · TypeScript · Pinia · Vue Router（hash 模式）· Element Plus · ECharts 6

## 快速开始

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run test     # Vitest 单元测试
npm run build    # vue-tsc 类型检查 + 产物 dist/
npm run preview  # 预览构建产物
```

## 目录结构

```
src/
  main.ts                 # 入口：Pinia / Router / Element Plus（zh-cn）
  App.vue                 # 应用外壳：顶部主导航 + 内容区
  modules.ts              # ★ 训练模块注册表：新路由 ⇄ 旧 HTML 的映射
  router/index.ts         # 路由（hash），由 modules.ts 生成
  features/<id>/          # 8 个模块的业务实现
  shared/backup/          # 应用级备份信封、Provider 与失败回滚
  shared/learning-events/ # 跨模块训练事件与聚合摘要
  shared/settings/        # 应用设置持久化
  data/                   # 由同步脚本生成的词汇与语料静态数据
  views/
    HomeView.vue          # 今日工作台的兼容薄壳
    TodayView.vue         # Todo、继续训练、学习动态与能力入口
    PlansView.vue         # 跨模块学习路径
    ToolsView.vue         # 按训练目的组织全部模块
    SettingsView.vue      # 全局设置与完整备份
    modules/<id>.vue      # 路由薄壳，转发到 features/<id>/
```

## 模块开发约定

1. 每个模块对应 `src/views/modules/<id>.vue`，该文件只负责挂载 `src/features/<id>/` 中的实现。
2. 新训练模块必须登记在 `src/modules.ts`，模块路由和全部训练页从注册表生成。
3. 复杂模块按需使用 `components/`、`data/`、`domain/`、`model/`、`persist/`、`stores/` 和 `__tests__/`；不要为了目录整齐创建空抽象。
4. 用户状态沿用 legacy 的 localStorage、IndexedDB 键与模块快照；应用完整备份统一从 `src/shared/backup/` 聚合，任何不兼容调整都必须提供迁移和测试。
5. 生成数据不得手工维护：词汇运行 `npm run data:vocab`，语料运行 `npm run data:corpus`。
6. 完整约定见仓库根目录 `CLAUDE.md`，真实进度见 `ROADMAP.md`，架构说明见 `docs/ARCHITECTURE.md`，回归与存储契约见 `docs/BASELINE.md`。

## 当前质量基线

- 当前合计 17 个测试文件、95 项测试。
- 覆盖状态合并、旧版备份导入、应用备份校验与回滚、学习事件聚合、词表解析、听写判分与推进、播放顺序及语料统计清洗。
- 浏览器音频生命周期、权限降级和真实文件导入导出仍按人工冒烟清单验证。
- 4 个 TTS 模块共用 `src/shared/speech/voices.ts` 管理语音列表监听、重试和卸载清理。
- JSON、CSV、Excel 等浏览器下载共用 `src/shared/files/download.ts`；ECharts 与 Element Plus 采用按需注册。
- 所有 `localStorage` 读写共用 `src/shared/storage/chunked-local-storage.ts`，大记录自动分块，并对写入失败、缺块和旧值迁移做保护。
- 每次业务修改至少执行 `npm test` 和 `npm run build`。
