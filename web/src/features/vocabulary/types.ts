/**
 * 词汇模块类型定义 —— 与 legacy study_words.html 的数据模型严格对应。
 * 字段命名沿用旧代码，便于按报告逐项核对。
 */

/* ============ 数据（来源 words/data） ============ */

export interface RawWord {
  id: string
  word: string
  eng_phonetic?: string
  meaning: string
  eng_sound?: string
}

export interface RawGroup {
  group: string
  groupNumber: number
  wordCount: number
  /** 如 "output_word_groups/Chapter_1_自然地理_第一组.json"，全库唯一，作 groupId */
  id: string
  words: RawWord[]
}

export interface RawChapter {
  chapter: string
  chapterNumber: number
  groups: RawGroup[]
}

export interface RawLibrary {
  chapters: RawChapter[]
  totalChapters: number
  totalGroups: number
  totalWords: number
}

/** normalizeLibrary 之后的运行时词（key 全局唯一） */
export interface VocabWord extends RawWord {
  key: string
  chapter: string
  chapterNumber: number
  group: string
  groupNumber: number
  groupId: string
  wordIndex: number
}

export interface VocabGroup extends Omit<RawGroup, 'words'> {
  chapter: string
  chapterNumber: number
  words: VocabWord[]
}

export interface VocabChapter {
  chapter: string
  chapterNumber: number
  groups: VocabGroup[]
}

export interface VocabLibrary {
  totalChapters: number
  totalGroups: number
  totalWords: number
  chapters: VocabChapter[]
  groupsById: Record<string, VocabGroup>
  allWords: VocabWord[]
}

export interface SynonymSource {
  source: string
  groups: string[][]
  groupCount: number
}

export interface SynonymTerm {
  displayWord: string
  normalized: string
}

export interface SynonymGroupEntry {
  id: string
  source: string
  groupIndex: number
  terms: SynonymTerm[]
}

export interface SynonymIndex {
  /** normalizeLexeme → 组列表（当前词所在组） */
  lookup: Record<string, SynonymGroupEntry[]>
  sources: { id: string; name: string; groupCount: number }[]
}

export interface PresetLists {
  reading: string[]
  listening: string[]
  core: string[]
}

/** 听力语料音频索引条目（corpus.json，legacy window.LISTENING_WORD_AUDIO_DATA） */
export interface CorpusEntry {
  '单词名': string
  'mp3路径': string
  word: string
  mp3Path: string
  chapterId: string
  chapterTitle: string
}

/** 归一化后的语料条目（供 UI 展示与播放） */
export interface CorpusItem {
  content: string
  mp3Path: string
  chapterId: string
  chapterTitle: string
}

/* ============ 状态（DEFAULT_STATE 树） ============ */

export type PracticeMode = 'standard' | 'quiz' | 'spell'
export type ActiveTab = 'study' | 'overview' | 'difficult'
export type DifficultySortMode = 'default' | 'levelDesc' | 'levelAsc'
export type StudyLogKind = 'study' | 'mastered' | 'review'

export interface PracticeQuizState {
  options: string[]
  selectedMeaning: string
  answered: boolean
  correct: boolean
}

export interface PracticeState {
  mode: PracticeMode
  showWord: boolean
  showMeaning: boolean
  autoRunning: boolean
  quiz: PracticeQuizState
}

export interface SettingsState {
  playbackRate: number
  intervalSeconds: number
  repeatCount: number
  showSynonym: boolean
  showListeningCorpus: boolean
  /** null = 全部启用 */
  enabledSynonymSources: string[] | null
  muted: boolean
}

export interface GroupProgress {
  currentIndex: number
  lastStudiedAt: string
  completedRuns: number
  runStarted: boolean
  nextExpectedIndex: number
}

/** wordStats / difficultWords 条目中内嵌的整份词快照 */
export interface StoredWordSnapshot {
  key: string
  id: string
  word: string
  eng_phonetic?: string
  meaning: string
  eng_sound?: string
  chapter: string
  chapterNumber: number
  group: string
  groupId: string
  wordIndex: number
}

export interface WordStatEntry extends StoredWordSnapshot {
  count: number
  lastStudiedAt: string
  note?: string
  mastered: boolean
  masteredAt: string
}

export interface DifficultWordEntry extends StoredWordSnapshot {
  count: number
  lastStudiedAt: string
  mastered: boolean
  masteredAt: string
  note: string
  addedAt: string
  lastReviewAt: string
  nextReviewAt: string
  /** 0..5，显示“第 reviewStage+1 轮” */
  reviewStage: number
  reviewFailures: number
  /** 0..10，默认加入时 1 */
  difficultyLevel: number
}

export interface StudyLogEntry {
  kind: StudyLogKind
  wordKey: string
  at: string
  success?: boolean
}

export interface VocabState {
  selectedGroupId: string
  selectedLibraryChapter: string
  wordNotes: Record<string, string>
  searchQuery: string
  searchAssistQuery: string
  searchChapterFilter: string
  difficultyQuery: string
  difficultyVisibleCount: number
  difficultySortMode: DifficultySortMode
  activeTab: ActiveTab
  selectedDifficultKeys: string[]
  progressByGroup: Record<string, GroupProgress>
  wordStats: Record<string, WordStatEntry>
  studyLog: StudyLogEntry[]
  difficultWords: Record<string, DifficultWordEntry>
  backup: { lastBackupAt: string; lastImportAt: string }
  settings: SettingsState
  practice: PracticeState
}

/* ============ 运行期会话（不持久化） ============ */

export type SessionMode = 'group' | 'difficulty' | 'search'

/** 会话条目：分组=VocabWord；难词/搜索 = 词快照（字段超集，结构兼容） */
export type SessionWord = VocabWord & Partial<DifficultWordEntry>

export interface StudySession {
  mode: SessionMode
  label: string
  chapter: string
  groupId?: string
  items: SessionWord[]
  currentIndex: number
}

/** 词来源标记 */
export interface WordSourceFlags {
  isCore: boolean
  isReading538: boolean
  isListening179: boolean
}

export const BACKUP_APP = 'apple-word-trainer-v4'
export type BackupEnvelope = { app: typeof BACKUP_APP; exportedAt: string; state: VocabState }
