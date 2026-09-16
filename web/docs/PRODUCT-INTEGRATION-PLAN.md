# IELTS Dev 产品整合方案

更新时间：2026-09-12

## 1. 目标

将当前“统一应用壳中的 8 个独立工具”改造成连续学习系统：

```text
今日计划 → 进入训练 → 记录训练事件 → 汇总时长与结果 → 错词复习 → 晚间复盘
```

本轮先建立三个可验证闭环：

1. 首页从宣传页改为今日学习工作台。
2. 完整数据导入导出统一到全局设置。
3. 语料库听写、词汇学习和学习记录通过共享学习事件串联。

## 2. 信息架构

- `/`：今日学习工作台，展示继续训练、今日任务、学习动态和能力入口。
- `/plans`：学习路径，展示跨模块训练步骤和当前进度。
- `/tools`：全部训练，按训练目的而非 legacy 文件分组。
- `/settings`：全局设置，首轮实现数据与备份；提醒、播放与语音、外观保留明确边界。
- `/study-tracker`：保留兼容路由，收缩为记录、复盘、趋势和记账，不再承担全局 Todo 与完整备份入口。
- 其余模块路由保持不变，避免破坏现有深链接。

## 3. 全局备份边界

全局备份信封使用应用级版本，模块快照继续保留各自版本和旧字段：

```ts
interface AppBackupV1 {
  app: 'ielts-dev'
  schemaVersion: 1
  exportedAt: string
  appSettings: Record<string, unknown>
  modules: Record<string, VersionedSnapshot>
}
```

约束：

- 只导出注册表声明的数据，不扫描或打包整个 `localStorage`。
- 不修改、删除或重命名既有 localStorage／IndexedDB 键。
- 导入先完整解析和校验，再展示覆盖预览；确认前不写入。
- 写入前生成当前应用恢复快照；某模块应用失败时尝试回滚已写入模块。
- 全局入口兼容应用级备份和既有单模块备份。
- 音频 Blob、临时 Object URL、播放会话和未持久化输入不进入备份。
- Excel、PDF、CSV 属于业务结果导出，继续留在对应业务页面。

## 4. 学习事件

共享事件只记录跨模块聚合所需的最小事实：

```ts
interface LearningEvent {
  id: string
  moduleId: string
  type: 'session_started' | 'session_completed' | 'mistake_added' | 'word_mastered'
  occurredAt: string
  durationSeconds?: number
  sessionId?: string
  title?: string
  metrics?: Record<string, number>
  references?: Record<string, string>
}
```

- 事件采用追加写入和版本化 localStorage；首轮限制最多 2,000 条。
- 首页、学习路径和学习记录从事件派生展示，不复制模块业务状态。
- 模块只在已经存在可靠完成时机时发事件，不为尚未稳定的状态机添加推测性埋点。

## 5. 首轮串联

```text
语料库听写完成一题
  ├─ 产生 session_completed 事件，记录练习次数与正确率
  └─ 答错时产生 mistake_added 事件
        ↓
今日工作台展示最近训练、累计时长和待复习错词
        ↓
词汇学习作为统一复习入口
        ↓
学习记录页展示自动采集摘要，用户补充主观评分与复盘
```

统一错词实体和跨模块去重属于后续轮次；首轮先确保事件链路和入口闭环真实可用。

## 6. 视觉与交互约束

- 页面只保留一个标题区和一个主操作，不再叠加路由 masthead 与模块 Hero。
- 首页优先展示当前动作和真实学习状态，不展示宣传原则和模块开发状态。
- 控制卡片层级，避免卡片套卡片、过度阴影和大面积玻璃拟态。
- 模块内只保留当前任务需要的局部控制，全局设置进入 `/settings`。
- 390px、768px、1440px 均不得出现横向溢出、操作遮挡或关键内容仅靠 hover 可见。

## 7. 验证

- 全局备份导出 → 清洁测试环境导入 → 各模块关键状态一致。
- 旧版学习跟踪、词汇和语料库备份仍能从全局设置导入。
- 非法、未知版本、部分损坏文件不会修改现有数据。
- 训练事件可跨刷新恢复，首页聚合结果与事件一致。
- `npm test`、`npm run build` 全部通过。
