import { parseDictationCache } from '@/features/dictation/model/cache'
import { parseListenDictationCache } from '@/features/listen-dictation/model/cache'
import {
  BACKUP_EXPORTED_AT_KEY,
  CHAPTER_STATS_KEY,
  MISTAKE_BOOK_KEY,
  SETTINGS_KEY,
  WORD_STATS_KEY,
  sanitizeChapterStats,
  sanitizeMistakeBook,
  sanitizeSettings,
  sanitizeWordStats,
} from '@/features/corpus-dictation/stores/corpus'
import { unwrapStudyTrackerBackup } from '@/features/study-tracker/persist/backup'
import { STORAGE_KEY as VOCAB_STORAGE_KEY } from '@/features/vocabulary/constants'
import { idbDelete, idbGet, idbSet } from '@/features/vocabulary/persist/idb'
import {
  hydrateState,
  mergeLoadedState,
  readLocalStorageState,
  saveStateToLocalStorage,
} from '@/features/vocabulary/persist/state-io'
import {
  readLocalStorageValue,
  removeLocalStorageValue,
  writeLocalStorageValue,
} from '@/shared/storage/chunked-local-storage'
import {
  LEARNING_EVENTS_KEY,
  parseLearningEvents,
  readLearningEvents,
  writeLearningEvents,
} from '@/shared/learning-events/events'

import type { BackupProvider } from './types'

const STUDY_TRACKER_KEY = 'daily-learning-tracker-state-v4'
const STUDY_TRACKER_META_KEY = 'daily-learning-tracker-state-meta-v1'
const DICTATION_KEY = 'ielts_dual_apple'
const LISTEN_DICTATION_KEY = 'ielts_listen_repeat'
const SYNONYM_NOTES_KEY = 'ielts_notes_v4'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  const result = writeLocalStorageValue(key, JSON.stringify(value))
  if (!result.ok) throw new Error(`storage_write_failed:${key}`)
}

function restoreJson(key: string, value: unknown | null): void {
  if (value === null) {
    if (!removeLocalStorageValue(key)) throw new Error(`storage_remove_failed:${key}`)
    return
  }
  writeJson(key, value)
}

function countRecord(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : 0
}

const studyTrackerProvider: BackupProvider = {
  id: 'studyTracker',
  label: '学习记录与复盘',
  async read() {
    const state = parseJson(readLocalStorageValue(STUDY_TRACKER_KEY))
    if (!isRecord(state)) return null
    const meta = parseJson(readLocalStorageValue(STUDY_TRACKER_META_KEY))
    return { version: 4, state, meta: isRecord(meta) ? meta : {} }
  },
  normalize(value) {
    const state = unwrapStudyTrackerBackup(value)
    if (!isRecord(state)) throw new Error('学习记录数据格式无效。')
    const source = isRecord(value) ? value : {}
    return {
      version: 4,
      state,
      meta: isRecord(source.meta) ? source.meta : {},
    }
  },
  async write(value) {
    if (!value) {
      restoreJson(STUDY_TRACKER_KEY, null)
      restoreJson(STUDY_TRACKER_META_KEY, null)
      return
    }
    const normalized = this.normalize(value)
    restoreJson(STUDY_TRACKER_KEY, normalized.state)
    restoreJson(STUDY_TRACKER_META_KEY, normalized.meta)
  },
  summarize(value) {
    const state = value.state as Record<string, unknown>
    const rows = Array.isArray(state.tableData) ? state.tableData.length : 0
    const todos = Array.isArray(state.todoItems) ? state.todoItems.length : 0
    return `${rows} 条学习记录，${todos} 条待办数据`
  },
  matchesLegacy(value) {
    if (!isRecord(value)) return false
    const state = unwrapStudyTrackerBackup(value)
    return isRecord(state) && (Array.isArray(state.tableData) || Array.isArray(state.projectColumns))
  },
}

const vocabularyProvider: BackupProvider = {
  id: 'vocabulary',
  label: '词汇学习',
  async read() {
    let state: unknown
    try {
      state = await idbGet<unknown>(VOCAB_STORAGE_KEY)
      if (state === undefined) state = readLocalStorageState()
    } catch {
      state = readLocalStorageState()
    }
    if (!isRecord(state)) return null
    return { version: 4, app: 'apple-word-trainer-v4', state }
  },
  normalize(value) {
    const source = isRecord(value) && 'state' in value ? value.state : value
    if (!isRecord(source)) throw new Error('词汇学习数据格式无效。')
    return {
      version: 4,
      app: 'apple-word-trainer-v4',
      state: hydrateState(mergeLoadedState(source)),
    }
  },
  async write(value) {
    if (!value) {
      await idbDelete(VOCAB_STORAGE_KEY)
      if (!removeLocalStorageValue(VOCAB_STORAGE_KEY)) {
        throw new Error('vocabulary_local_storage_cleanup_failed')
      }
      return
    }
    const normalized = this.normalize(value)
    const state = normalized.state
    try {
      await idbSet(VOCAB_STORAGE_KEY, state)
      if (!removeLocalStorageValue(VOCAB_STORAGE_KEY)) {
        throw new Error('vocabulary_local_storage_cleanup_failed')
      }
    } catch {
      if (!saveStateToLocalStorage(state as ReturnType<typeof mergeLoadedState>)) {
        throw new Error('vocabulary_storage_write_failed')
      }
    }
  },
  summarize(value) {
    const state = value.state as Record<string, unknown>
    return `${countRecord(state.wordStats)} 个词条统计，${countRecord(state.difficultWords)} 个难词`
  },
  matchesLegacy(value) {
    if (!isRecord(value)) return false
    if (value.app === 'apple-word-trainer-v4') return true
    const state = 'state' in value ? value.state : value
    return isRecord(state) && isRecord(state.progressByGroup) && isRecord(state.wordStats)
  },
}

const corpusProvider: BackupProvider = {
  id: 'corpusDictation',
  label: '语料库听写',
  async read() {
    const settings = parseJson(readLocalStorageValue(SETTINGS_KEY))
    const mistakeBook = parseJson(readLocalStorageValue(MISTAKE_BOOK_KEY))
    const wordStats = parseJson(readLocalStorageValue(WORD_STATS_KEY))
    const chapterStats = parseJson(readLocalStorageValue(CHAPTER_STATS_KEY))
    if (![settings, mistakeBook, wordStats, chapterStats].some((value) => value !== null)) return null
    return {
      version: 2,
      settings: sanitizeSettings(settings),
      mistakeBook: sanitizeMistakeBook(mistakeBook),
      wordStats: sanitizeWordStats(wordStats),
      chapterStats: sanitizeChapterStats(chapterStats),
    }
  },
  normalize(value) {
    if (!isRecord(value)) throw new Error('语料库听写数据格式无效。')
    const version = Number(value.version ?? 1)
    if (version !== 1 && version !== 2) throw new Error(`不支持语料库备份版本 ${version}。`)
    return {
      version: 2,
      settings: sanitizeSettings(value.settings),
      mistakeBook: sanitizeMistakeBook(value.mistakeBook),
      wordStats: sanitizeWordStats(value.wordStats),
      chapterStats: sanitizeChapterStats(value.chapterStats),
    }
  },
  async write(value) {
    if (!value) {
      for (const key of [SETTINGS_KEY, MISTAKE_BOOK_KEY, WORD_STATS_KEY, CHAPTER_STATS_KEY]) restoreJson(key, null)
      return
    }
    const normalized = this.normalize(value)
    restoreJson(SETTINGS_KEY, normalized.settings)
    restoreJson(MISTAKE_BOOK_KEY, normalized.mistakeBook)
    restoreJson(WORD_STATS_KEY, normalized.wordStats)
    restoreJson(CHAPTER_STATS_KEY, normalized.chapterStats)
    writeLocalStorageValue(BACKUP_EXPORTED_AT_KEY, new Date().toISOString())
  },
  summarize(value) {
    return `${countRecord(value.mistakeBook)} 个错词，${countRecord(value.wordStats)} 个词条统计`
  },
  matchesLegacy(value) {
    return isRecord(value) && ('mistakeBook' in value || 'chapterStats' in value) && 'settings' in value
  },
}

function createCacheProvider(options: {
  id: string
  label: string
  key: string
  version: number
  parse: (raw: string | null) => unknown
  legacyMarker: (value: Record<string, unknown>) => boolean
  summarize: (state: Record<string, unknown>) => string
}): BackupProvider {
  return {
    id: options.id,
    label: options.label,
    async read() {
      const state = options.parse(readLocalStorageValue(options.key))
      return isRecord(state) ? { version: options.version, state } : null
    },
    normalize(value) {
      const source = isRecord(value) && 'state' in value ? value.state : value
      const state = options.parse(JSON.stringify(source))
      if (!isRecord(state)) throw new Error(`${options.label}数据格式无效。`)
      return { version: options.version, state }
    },
    async write(value) {
      if (!value) {
        restoreJson(options.key, null)
        return
      }
      const normalized = this.normalize(value)
      restoreJson(options.key, normalized.state)
    },
    summarize(value) {
      return options.summarize(value.state as Record<string, unknown>)
    },
    matchesLegacy(value) {
      const state = isRecord(value) && 'state' in value ? value.state : value
      return isRecord(state) && options.legacyMarker(state)
    },
  }
}

const dictationProvider = createCacheProvider({
  id: 'dictation',
  label: '单词听写',
  key: DICTATION_KEY,
  version: 1,
  parse: parseDictationCache,
  legacyMarker: (value) => Array.isArray(value.wrongDict) && typeof value.mode === 'string',
  summarize: (state) => `${Array.isArray(state.wordItems) ? state.wordItems.length : 0} 个练习词，${Array.isArray(state.wrongDict) ? state.wrongDict.length : 0} 个错词`,
})

const listenDictationProvider = createCacheProvider({
  id: 'listenDictation',
  label: '只听循环听写',
  key: LISTEN_DICTATION_KEY,
  version: 1,
  parse: parseListenDictationCache,
  legacyMarker: (value) => 'repeatCount' in value && 'ttsSource' in value,
  summarize: (state) => `${Array.isArray(state.wordItems) ? state.wordItems.length : 0} 个循环词`,
})

const synonymsProvider: BackupProvider = {
  id: 'synonyms',
  label: '同义替换笔记',
  async read() {
    const notes = parseJson(readLocalStorageValue(SYNONYM_NOTES_KEY))
    return isRecord(notes) ? { version: 1, notes } : null
  },
  normalize(value) {
    const source = isRecord(value) && isRecord(value.notes) ? value.notes : value
    if (!isRecord(source)) throw new Error('同义替换笔记格式无效。')
    const notes: Record<string, string> = {}
    for (const [key, note] of Object.entries(source)) {
      if (typeof note === 'string') notes[key] = note
    }
    return { version: 1, notes }
  },
  async write(value) {
    if (!value) {
      restoreJson(SYNONYM_NOTES_KEY, null)
      return
    }
    restoreJson(SYNONYM_NOTES_KEY, this.normalize(value).notes)
  },
  summarize(value) {
    return `${countRecord(value.notes)} 条单词笔记`
  },
}

const learningEventsProvider: BackupProvider = {
  id: 'learningEvents',
  label: '跨模块学习动态',
  async read() {
    const events = readLearningEvents()
    return events.length ? { version: 1, events } : null
  },
  normalize(value) {
    if (!isRecord(value) && !Array.isArray(value)) throw new Error('学习动态格式无效。')
    return { version: 1, events: parseLearningEvents(value) }
  },
  async write(value) {
    if (!value) {
      if (!removeLocalStorageValue(LEARNING_EVENTS_KEY)) throw new Error('learning_events_remove_failed')
      return
    }
    writeLearningEvents(parseLearningEvents(this.normalize(value)))
  },
  summarize(value) {
    return `${parseLearningEvents(value).length} 条跨模块学习动态`
  },
}

export const backupProviders: BackupProvider[] = [
  studyTrackerProvider,
  vocabularyProvider,
  corpusProvider,
  dictationProvider,
  listenDictationProvider,
  synonymsProvider,
  learningEventsProvider,
]
