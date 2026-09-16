# IELTS Dev 项目规范

## 项目定位

- `web/` 是当前唯一的新版应用与二开入口。
- `legacy/` 是旧版单文件 HTML、原始数据、音频资源和历史脚本的归档，只用于数据生成、行为对照和兼容性验证。
- 当前产品是本地优先的 Vue 单页应用。引入后端、账号、云同步或公开部署前，必须先形成单独方案并确认。

## 开发入口

```bash
cd web
npm run dev
npm test
npm run build
```

- 模块注册统一维护在 `web/src/modules.ts`。
- 路由页面保持为 `web/src/views/modules/<id>.vue` 薄壳。
- 业务实现放在 `web/src/features/<id>/`。
- 构建生成的数据放在 `web/src/data/`，不得手工修改可由脚本重建的 JSON。

## Feature 分层约定

按实际复杂度使用以下目录，不要求为空模块创建无意义文件：

```text
features/<id>/
  <Id>Module.vue     路由挂载外壳
  components/        业务组件
  stores/            Pinia 状态与业务编排
  domain/            可独立测试的纯业务规则
  model/             数据模型、归一化和序列化
  data/              静态数据访问与索引
  persist/           localStorage、IndexedDB 和迁移逻辑
  lib/               模块专用浏览器能力适配
  styles/            模块作用域样式
  __tests__/         单元测试
```

- 不继续向大型 `.vue` 文件堆叠可独立测试的业务逻辑。
- 只在至少两个模块存在稳定重复实现时抽取到 `web/src/shared/`。
- 不建立通用业务 Store、通用练习状态机或为未来后端预留空抽象。

## 数据兼容红线

- 未提供迁移函数和回归样本前，不得删除或重命名现有 localStorage、IndexedDB 键或对象字段。
- 新字段必须有默认值，读取旧数据时必须进行类型收敛和边界修正。
- 词汇数据通过 `npm run data:vocab` 重建。
- 语料章节数据通过 `npm run data:corpus` 重建。
- 不得随意移动 `legacy/words/` 和 `legacy/listening-word/`；当前同步脚本仍依赖这些路径。
- 用户学习数据、密钥、token 和包含隐私的真实备份不得进入仓库。

## 浏览器资源纪律

- 音频、TTS、计时器和 Object URL 必须在组件卸载或练习结束时释放。
- 新增远程音频、TTS 或 CDN 依赖前，必须说明离线、跨域、HTTPS、限流和接口失效风险。
- 新版页面不得新增 HTTP 混合内容资源。
- 浏览器通知、文件下载和持久化失败必须给用户可理解的反馈。

## 修改与验证

- 只修改当前任务直接涉及的模块，不顺手重构相邻代码。
- 修复缺陷时优先补复现测试；重构前先补关键业务规则测试。
- 业务修改至少执行 `npm test` 和 `npm run build`。
- 数据脚本修改还要执行对应的 `npm run data:*` 命令，并核对生成 diff。
- 未完成验证的事项不得写入 `ROADMAP.md` 的“已完成”。
- 每次完成开发、修复、文档补齐或重要调研后，同步更新 `ROADMAP.md`。

## 文档职责

- 根 `README.md`：产品定位、快速开始、模块入口和文档索引。
- `web/README.md`：新版应用的开发指南。
- `web/docs/ARCHITECTURE.md`：真实技术架构、数据链路与兼容边界。
- `web/docs/<module>/`：旧版行为规格、移植决策和 parity 清单。
- `ROADMAP.md`：阶段、进度、阻塞、待办和最近验证。
