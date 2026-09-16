/** study-tracker 默认配置 —— 与 legacy createInitialState 一致 */
import type { StudyColumn, StudyGroup, NoteField, StudyRow } from './tableModel'

export const LOW_SCORE_THRESHOLD = 60

export const DEFAULT_GROUPS: StudyGroup[] = [
  { id: 'group-ungrouped', name: '未分组' },
  { id: 'group-study', name: '学习' },
  { id: 'group-health', name: '身心' },
  { id: 'group-custom', name: '自定义' },
]

export const DEFAULT_PROJECT_COLUMNS: StudyColumn[] = [
  { id: 'listen', name: '听', groupId: 'group-study', width: 100, targetValue: LOW_SCORE_THRESHOLD },
  { id: 'speak', name: '说', groupId: 'group-study', width: 100, targetValue: LOW_SCORE_THRESHOLD },
  { id: 'read', name: '读', groupId: 'group-study', width: 100, targetValue: LOW_SCORE_THRESHOLD },
  { id: 'write', name: '写', groupId: 'group-study', width: 100, targetValue: LOW_SCORE_THRESHOLD },
  { id: 'diet', name: '饮食', groupId: 'group-health', width: 100, targetValue: LOW_SCORE_THRESHOLD },
  { id: 'exercise', name: '运动', groupId: 'group-health', width: 100, targetValue: LOW_SCORE_THRESHOLD },
  { id: 'sample', name: '示例项目', groupId: 'group-custom', width: 118, targetValue: LOW_SCORE_THRESHOLD },
]

export const DEFAULT_NOTE_FIELDS: NoteField[] = [
  { id: 'summary', name: '总结' },
  { id: 'weakness', name: '弱项' },
  { id: 'plan', name: '明日计划' },
]

export const SAMPLE_ROWS: StudyRow[] = [
  {
    id: 'row-1',
    date: '2026-04-25',
    durationMinutes: 110,
    metrics: { listen: '40', speak: '25', read: '30', write: '20', diet: '8', exercise: '35', sample: '/' },
    notes: {
      summary: '上午完成听读训练，晚上完成简短写作。',
      weakness: '口语输出不够流畅，复述有停顿。',
      plan: '明天增加 20 分钟跟读，并整理写作模板。',
    },
  },
  {
    id: 'row-2',
    date: '2026-04-26',
    durationMinutes: 95,
    metrics: { listen: '35', speak: '30', read: '/', write: '15', diet: '9', exercise: '45', sample: '12' },
    notes: {
      summary: '整体执行较稳定，运动完成度较高。',
      weakness: '阅读部分临时中断，没有按计划完成。',
      plan: '明天优先补阅读，安排在上午精力更集中的时段。',
    },
  },
  {
    id: 'row-3',
    date: '2026-04-27',
    durationMinutes: 130,
    metrics: { listen: '50', speak: '/', read: '42', write: '18', diet: '8', exercise: '/', sample: '6' },
    notes: {
      summary: '听力和阅读投入较多，整体专注度不错。',
      weakness: '口语没有单独练习，输出链路断掉了。',
      plan: '明天先完成 1 次口语复述，再继续保持听读节奏。',
    },
  },
]
