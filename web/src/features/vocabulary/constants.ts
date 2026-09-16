/**
 * 词汇模块常量 —— 与 legacy study_words.html 保持一致。
 */

/** localStorage / IndexedDB 存储键 */
export const STORAGE_KEY = 'apple-word-trainer-v4'
export const IDB_NAME = 'apple-word-trainer'
export const IDB_STORE = 'kv'

/** 难词复习间隔（小时），失败时落在第 0 档 = 立即再次到期 */
export const REVIEW_INTERVALS_HOURS = [0, 12, 24, 72, 168, 360]
export const REVIEW_INTERVALS_MS = REVIEW_INTERVALS_HOURS.map((h) => h * 60 * 60 * 1000)

/** studyLog 封顶条数 */
export const STUDY_LOG_LIMIT = 6000

/** 预设词源 */
export type PresetSourceType = 'reading538' | 'listening179' | 'core' | 'listeningCorpus'

export const PRESET_SOURCE_LABELS: Record<PresetSourceType, string> = {
  reading538: '阅读 538',
  listening179: '听力 179',
  core: '核心词汇',
  listeningCorpus: '听力语料库词汇',
}

export const ACTIVE_TABS = ['study', 'overview', 'difficult'] as const
export const PRACTICE_MODES = ['standard', 'quiz', 'spell'] as const
export const DIFFICULTY_SORT_MODES = ['default', 'levelDesc', 'levelAsc'] as const

/** 会话模式徽标文案 */
export const SESSION_MODE_LABELS: Record<string, string> = {
  group: '分组练习',
  difficulty: '难词练习',
  search: '搜索练习',
}

export const MODE_LABELS: Record<string, string> = {
  standard: '单词模式',
  quiz: '选中文',
  spell: '拼写模式',
}

/** 词源徽标文案 */
export const SOURCE_LABELS: Record<string, string> = {
  core: '核心词汇',
  reading538: '阅读538词汇',
  listening179: '听力179词汇',
}

/** 难词提醒条件：距上次备份超过 7 天 */
export const BACKUP_REMIND_DAYS = 7
