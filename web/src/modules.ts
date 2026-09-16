/**
 * 模块注册表：新路由 ⇄ 旧单文件 HTML 的一一映射。
 *
 * 这是业务模块的“单一事实来源”：
 * - 模块路由与“全部训练”页面由这里驱动；
 * - legacy 字段保留旧版归档路径，用于行为、数据与样式对照。
 */
import type { Component } from 'vue'

import {
  DataAnalysis,
  EditPen,
  Headset,
  MagicStick,
  Mic,
  Notebook,
  VideoPlay,
} from '@element-plus/icons-vue'

export type ModuleStatus = 'todo' | 'active' | 'done'

export interface IeltsModule {
  /** 路由段与唯一标识，如 vocabulary */
  id: string
  /** 中文标题 */
  title: string
  /** 一句话副标题 */
  subtitle: string
  /** 被替换的旧单文件 HTML（相对仓库根） */
  legacy: string[]
  /** 模块简介 */
  summary: string
  /** 核心功能清单（重构验收依据） */
  features: string[]
  /** Element Plus 图标组件 */
  icon: Component
  /** 重构进度：todo = 待重构（占位页），active = 重构中，done = 已完成 */
  status: ModuleStatus
  /** 附加说明（如数据来源、多个旧稿待比对） */
  notes?: string
}

export const modules: IeltsModule[] = [
  {
    id: 'study-tracker',
    title: '记录与复盘',
    subtitle: '每日记录 / 趋势 / 复盘 / 记账',
    legacy: ['legacy/daily-status/学习状态跟踪.html'],
    summary:
      '汇总训练结果并补充每日评分、复盘与记账，提供周/月统计、热力图和业务报告导出。',
    features: [
      '学习记录表：日期、时长、分项指标、复盘字段',
      '读取跨模块训练时长、完成轮次和近期错词摘要',
      '记账本：分类、周期规则、图表、日历联动',
      'Overview 总览：周均、本月、风险项、提醒状态',
      'Excel 记录与 PDF 周月报导出',
      '统计图与学习热力图',
    ],
    icon: DataAnalysis,
    status: 'done',
    notes:
      '已收缩为记录与复盘模块：Todo 上移今日工作台，完整备份上移全局设置，页面接入跨模块训练摘要；Tab、表单、筛选、弹窗和操作控件已统一为 Element Plus，学习记录表、复盘、记账、统计、提醒及 Excel/PDF 业务导出继续沿用 v4 数据。待继续拆分 Store、持久化和报告生成逻辑。',
  },
  {
    id: 'pronunciation',
    title: '单词精听器',
    subtitle: '纯正英音 · 批量播放',
    legacy: ['legacy/dictionary/发音.html'],
    summary: '轻量发音练习入口：按词批量播放英音，适合快速练耳与口语模仿。',
    features: ['批量粘贴词表（换行/逗号分隔）', '本地 TTS 精听（英音优先选声）', '语速可调 / 暂停 / 任意跳词', '单词清单点击即播'],
    icon: Mic,
    status: 'done',
    notes: '已忠实还原 dictionary/发音.html：原样式容器级移植（styles/legacy-full.css）+ 原结构重写。',
  },
  {
    id: 'dictation',
    title: '单词听写',
    subtitle: '听写 / 只听 双模式',
    legacy: ['legacy/dictionary/发音和听写.html'],
    summary:
      '雅思单词听写练习：听写 / 只听双模式切换。听写模式自动校对拼写并移除正确词、只听模式顺序播放自由标记掌握，进度自动缓存。',
    features: ['听写模式：自动校对 + 错词本 + 正确移除', '只听模式：顺序循环 + 一键标记掌握', 'TTS 英音优先 + 语速/间隔调节', '单词网格点击跳转、进度缓存恢复（ielts_dual_apple）'],
    icon: EditPen,
    status: 'done',
    notes:
      '基线为 legacy/dictionary/发音和听写.html，原样式已进行容器级移植。legacy/发音/发音和听写.html 的更新变体已独立迁入 /listen-dictation 模块。',
  },
  {
    id: 'corpus-dictation',
    title: '语料库章节听写',
    subtitle: '章节词库 · 错词本',
    legacy: ['legacy/listening-word/王璐语料库_源码.html'],
    summary:
      '章节化语料听写训练：章节词库匹配、听写/听音模式、错词本、词级与章节统计、训练事件与 IndexedDB 音频缓存。',
    features: [
      '章节词库匹配与练习队列管理',
      '听写模式 / 听音模式',
      '错词本、词级统计、章节统计',
      '纳入应用完整备份（全局设置）',
      'localStorage + IndexedDB 音频缓存',
    ],
    icon: Headset,
    status: 'done',
    notes:
      '已完成主体重构：听写/听音引擎（判分全等、错词 +3 等）、练习队列与三列表、错词本（筛选/批量选择/CSV）、章节统计 SVG；v2／v1 备份由全局设置兼容导入。数据：88 章 9366 词（sync-corpus-data.mjs）。规范：web/docs/corpus-dictation/。待打磨：chapter8 本地音频路径、listen_navigation 鼠标预留分支与缓存开关 UI。',
  },
  {
    id: 'listen-dictation',
    title: '只听循环听写',
    subtitle: '只听循环 · 中文过滤 · 一键乱序',
    legacy: ['legacy/发音/发音和听写.html'],
    summary:
      '只听循环模式学习器：每个单词可设置播放次数与间隔，自动过滤含中文单词，支持一键乱序、英音 TTS / 百度发音源，进度本地缓存。',
    features: [
      '只听循环：每词播放次数 1-5 + 间隔（0.5–5s）自动切换',
      '自动过滤含中文单词',
      '一键乱序 + 点击词条跳转',
      'Web TTS / 百度翻译发音源 · 语速可调',
      '本地进度缓存（ielts_listen_repeat）',
    ],
    icon: Headset,
    status: 'done',
    notes: '已收编 legacy 变体 发音/发音和听写.html：只听循环（次数/间隔）、中文过滤、一键乱序、Web TTS/百度发音源、听写自检面板、进度缓存（ielts_listen_repeat）；样式容器化 .listen-dictation-app。',
  },
  {
    id: 'vocabulary',
    title: '词汇学习',
    subtitle: '章节分组 · 三模式 · 难词复习',
    legacy: ['legacy/words/study_words.html'],
    summary:
      '词汇学习主模块：章节与分组学习、标准/选择题/拼写三种练习、多维搜索、难词阶段复习、同义词与关联词、统计与热力图。',
    features: [
      '章节与分组学习（22 章 + 多组）',
      '标准 / 选择题 / 拼写三种练习模式',
      '搜索：英文、中文、章节、音标',
      '难词复习：阶段、到期、失败次数',
      '同义词与关联词展示',
      '学习统计与热力图',
      '本地状态持久化并纳入应用完整备份',
    ],
    icon: Notebook,
    status: 'done',
    notes:
      '已完成模块化重构（数据层/状态层/组件/视图分离 + 28 项单元测试）。数据链路：web/scripts/sync-vocab-data.mjs 从 words/data 重建并与 legacy 内联数据一致性断言；听力语料卡/词源已接入（corpus.json 懒加载）。待美化项：同义词 popover 精细交互、legacy 玻璃拟态主题 tokens（非功能差异）。',
  },
  {
    id: 'synonyms',
    title: '同义替换学习',
    subtitle: '极简学习 · 手动导航',
    legacy: ['legacy/同义词学习/同义词学习.html'],
    summary: 'IELTS 同义替换词学习页：极简交互、手动导航，辅助写作与阅读替换词积累。',
    features: [
      '同义词组卡片（主词 + 同义词标签）',
      '导入 .txt / .json 词库 / 示例词库',
      'TTS 播报 + 单词/组循环 + 间隔倍速',
      '手动前后导航与点击即读',
      '按词笔记（localStorage 持久化）',
    ],
    icon: MagicStick,
    status: 'done',
    notes: '已忠实还原同义词学习/同义词学习.html：原样式容器级移植 + 结构/逻辑重写（导入、自动循环、笔记、搜索）。',
  },
  {
    id: 'audio-player',
    title: '音频顺序播放器',
    subtitle: '本地音频 · 倍速次数 · 定时暂停',
    legacy: ['legacy/audio-playlist-player/音频顺序播放器.html'],
    summary:
      '本地音频顺序播放与复读工具：上传音频自动成清单，逐项配置倍速与次数，支持定时自动暂停。',
    features: [
      '上传 mp3 / m4a / wav / aac / ogg（多选 + 拖拽），自动生成播放条目',
      '逐项倍速/次数配置 + “跟随全局”开关 + 一键同步全局',
      '顺序 / 循环 / 随机播放模式；复制条目做多配置队列',
      '定时自动暂停（0–999 分钟，含预设按钮）',
      'IndexedDB 历史缓存（重复导入）与音频库/播放项增删排序',
    ],
    icon: VideoPlay,
    status: 'done',
    notes:
      '已忠实还原核心播放器（上传/清单/播放引擎/定时暂停/历史缓存）。原页面还挂载 system_library_enhancer.js 的“系统词库”增强（依赖词库音频数据 js），待 listening 语料数据层统一后单独接入。',
  },
]

export function getModule(id: string): IeltsModule | undefined {
  return modules.find((m) => m.id === id)
}
