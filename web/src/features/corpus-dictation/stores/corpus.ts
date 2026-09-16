/**
 * corpus-dictation Pinia store —— legacy 本地数据模型（设置/错词本/词统计/章统计/音频缓存）。
 */
import { defineStore } from 'pinia'

import { readLocalStorageValue, writeLocalStorageValue } from '@/shared/storage/chunked-local-storage'

export const SETTINGS_KEY = 'ielts-dictation-settings-v2'
export const MISTAKE_BOOK_KEY = 'ielts-dictation-mistake-book-v1'
export const WORD_STATS_KEY = 'ielts-dictation-word-stats-v1'
export const CHAPTER_STATS_KEY = 'ielts-dictation-chapter-stats-v1'
export const BACKUP_EXPORTED_AT_KEY = 'ielts-dictation-backup-exported-at-v1'

export const AUDIO_DB_NAME = 'ielts-dictation-audio-db'
export const AUDIO_STORE_NAME = 'audios'
export const DATA_DB_NAME = 'ielts-dictation-data-db'
export const DATA_STORE_NAME = 'kv'

export interface Settings {
  lastChapter: string
  intervalSeconds: number
  speed: number
  phraseSpeed: number
  mode: 'dictation' | 'listen'
  order: 'sequence' | 'random'
  listenRepeat: number
  listenBigLoop: number
}

export interface MistakeEntry {
  chapterId: string
  word: string
  title: string
  errorLevel: number
  wrongCount: number
  rightCount: number
  lastErrorAt: string
  recentAnswers: ('correct' | 'wrong')[]
}

export interface WordStatEntry {
  practiceCount: number
  correctCount: number
  lastAt: string
  chapterId: string
}

export interface ChapterRunStat {
  at: string
  total: number
  correct: number
  accuracy: number
}

export type ChapterStats = Record<string, ChapterRunStat[]>

export function entryKey(chapterId: string, word: string): string {
  return `${chapterId}::${word}`
}

function defaultSettings(): Settings {
  return {
    lastChapter: '',
    intervalSeconds: 2,
    speed: 1,
    phraseSpeed: 0.8,
    mode: 'dictation',
    order: 'sequence',
    listenRepeat: 1,
    listenBigLoop: 1,
  }
}

export function sanitizeSettings(raw: unknown): Settings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>
  const base = defaultSettings()
  const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }
  const safeMode = src.mode === 'listen' ? 'listen' : 'dictation'
  const safeOrder = src.order === 'random' ? 'random' : 'sequence'
  return {
    lastChapter: typeof src.lastChapter === 'string' ? src.lastChapter : base.lastChapter,
    intervalSeconds: clamp(src.intervalSeconds, 0, 30, base.intervalSeconds),
    speed: clamp(src.speed, 0.4, 2, base.speed),
    phraseSpeed: clamp(src.phraseSpeed, 0.4, 2, base.phraseSpeed),
    mode: safeMode,
    order: safeOrder,
    listenRepeat: Math.round(clamp(src.listenRepeat, 1, 10, base.listenRepeat)),
    listenBigLoop: Math.round(clamp(src.listenBigLoop, 1, 10, base.listenBigLoop)),
  }
}

export function sanitizeMistakeBook(raw: unknown): Record<string, MistakeEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, MistakeEntry> = {}
  for (const [key, entry] of Object.entries(raw as Record<string, any>)) {
    if (!entry || typeof entry !== 'object') continue
    const level = Math.round(Number(entry.errorLevel))
    result[key] = {
      chapterId: String(entry.chapterId ?? ''),
      word: String(entry.word ?? ''),
      title: String(entry.title ?? ''),
      errorLevel: Number.isFinite(level) ? Math.min(10, Math.max(0, level)) : 0,
      wrongCount: Math.max(0, Math.round(Number(entry.wrongCount) || 0)),
      rightCount: Math.max(0, Math.round(Number(entry.rightCount) || 0)),
      lastErrorAt: String(entry.lastErrorAt ?? ''),
      recentAnswers: Array.isArray(entry.recentAnswers)
        ? entry.recentAnswers.filter((a: unknown) => a === 'correct' || a === 'wrong').slice(-5)
        : [],
    }
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0
}

export function sanitizeWordStats(raw: unknown): Record<string, WordStatEntry> {
  if (!isRecord(raw)) return {}
  const result: Record<string, WordStatEntry> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue
    const practiceCount = nonNegativeInteger(value.practiceCount)
    result[key] = {
      practiceCount,
      correctCount: Math.min(practiceCount, nonNegativeInteger(value.correctCount)),
      lastAt: typeof value.lastAt === 'string' ? value.lastAt : '',
      chapterId: typeof value.chapterId === 'string' ? value.chapterId : key.split('::')[0] || '',
    }
  }
  return result
}

export function sanitizeChapterStats(raw: unknown): ChapterStats {
  if (!isRecord(raw)) return {}
  const result: ChapterStats = {}
  for (const [chapterId, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue
    const runs: ChapterRunStat[] = []
    for (const item of value) {
      if (!isRecord(item)) continue
      const total = nonNegativeInteger(item.total)
      const correct = Math.min(total, nonNegativeInteger(item.correct))
      runs.push({
        at: typeof item.at === 'string' ? item.at : '',
        total,
        correct,
        accuracy: total ? (correct / total) * 100 : 0,
      })
    }
    if (runs.length) result[chapterId] = runs.slice(-60)
  }
  return result
}

function readJson<T>(key: string): T | null {
  try {
    const raw = readLocalStorageValue(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): boolean {
  return writeLocalStorageValue(key, JSON.stringify(value)).ok
}

/* ---------- IndexedDB（音频缓存 / 数据 kv） ---------- */
function openDb(name: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('indexeddb_unavailable'))
      return
    }
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('open_failed'))
  })
}

async function dbGet(name: string, store: string, key: string): Promise<unknown> {
  const db = await openDb(name, store)
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('get_failed'))
  })
}

async function dbPut(name: string, store: string, key: string, value: unknown) {
  const db = await openDb(name, store)
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('put_failed'))
  })
}

async function dbClear(name: string, store: string) {
  const db = await openDb(name, store)
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('clear_failed'))
  })
}

export const useCorpusStore = defineStore('corpusDictation', {
    state: () => ({
      settings: sanitizeSettings(readJson(SETTINGS_KEY)) as Settings,
      mistakeBook: sanitizeMistakeBook(readJson(MISTAKE_BOOK_KEY)) as Record<string, MistakeEntry>,
      wordStats: sanitizeWordStats(readJson(WORD_STATS_KEY)) as Record<string, WordStatEntry>,
      chapterStats: sanitizeChapterStats(readJson(CHAPTER_STATS_KEY)) as ChapterStats,
      audioCacheEnabled: false,
      cacheCount: 0,
      lastBackupAt: '',
      storageError: '',
    }),

    actions: {
      persistSettings() {
        this.storageError = writeJson(SETTINGS_KEY, this.settings) ? '' : '本地保存失败，请先导出备份并清理浏览器空间。'
      },
      persistMistakeBook() {
        this.storageError = writeJson(MISTAKE_BOOK_KEY, this.mistakeBook) ? '' : '本地保存失败，请先导出备份并清理浏览器空间。'
      },
      persistWordStats() {
        this.storageError = writeJson(WORD_STATS_KEY, this.wordStats) ? '' : '本地保存失败，请先导出备份并清理浏览器空间。'
      },
      persistChapterStats() {
        this.storageError = writeJson(CHAPTER_STATS_KEY, this.chapterStats) ? '' : '本地保存失败，请先导出备份并清理浏览器空间。'
      },

      updateSettings(patch: Partial<Settings>) {
        this.settings = sanitizeSettings({ ...this.settings, ...patch })
        this.persistSettings()
      },

      /** 记录一次判分：写词统计与错词本 */
      recordAttempt(chapterId: string, word: string, title: string, correct: boolean) {
        const key = entryKey(chapterId, word)
        const stat = this.wordStats[key] ?? { practiceCount: 0, correctCount: 0, lastAt: '', chapterId }
        stat.practiceCount += 1
        if (correct) stat.correctCount += 1
        stat.lastAt = new Date().toISOString()
        this.wordStats[key] = stat
        this.persistWordStats()

        if (!correct) {
          const now = new Date().toISOString()
          const entry = this.mistakeBook[key]
          if (entry) {
            entry.wrongCount += 1
            entry.errorLevel = Math.min(10, entry.errorLevel + 3)
            entry.lastErrorAt = now
            entry.recentAnswers.push('wrong')
            if (entry.recentAnswers.length > 5) entry.recentAnswers.shift()
          } else {
            this.mistakeBook[key] = {
              chapterId,
              word,
              title,
              errorLevel: 3,
              wrongCount: 1,
              rightCount: 0,
              lastErrorAt: now,
              recentAnswers: ['wrong'],
            }
          }
          this.persistMistakeBook()
        }
      },

      markCorrectInMistake(key: string) {
        const entry = this.mistakeBook[key]
        if (!entry) return
        entry.rightCount += 1
        entry.recentAnswers.push('correct')
        if (entry.recentAnswers.length > 5) entry.recentAnswers.shift()
        entry.errorLevel -= 1
        if (entry.errorLevel <= 0) {
          delete this.mistakeBook[key]
        }
        this.persistMistakeBook()
      },

      /** 单章完整练习结束后追加一条章节统计历史 */
      recordChapterRun(chapterId: string, total: number, correct: number) {
        const list = this.chapterStats[chapterId] ?? []
        list.push({ at: new Date().toISOString(), total, correct, accuracy: total ? (correct / total) * 100 : 0 })
        this.chapterStats[chapterId] = list.slice(-60)
        this.persistChapterStats()
      },

      async fetchAndCacheAudio(key: string, url: string): Promise<boolean> {
        try {
          const existing = await dbGet(AUDIO_DB_NAME, AUDIO_STORE_NAME, key)
          if (existing !== undefined) {
            this.cacheCount += 0
            return true
          }
          const blob = await (await fetch(url)).blob()
          await dbPut(AUDIO_DB_NAME, AUDIO_STORE_NAME, key, blob)
          this.cacheCount += 1
          return true
        } catch {
          return false
        }
      },

      async getCachedAudioBlob(key: string): Promise<Blob | undefined> {
        return (await dbGet(AUDIO_DB_NAME, AUDIO_STORE_NAME, key)) as Blob | undefined
      },

      async clearAudioCache() {
        await dbClear(AUDIO_DB_NAME, AUDIO_STORE_NAME)
        this.cacheCount = 0
      },

      /** 手动加入错词本：错误等级 +1（新条目 level=1） */
      addMistakeManual(chapterId: string, word: string, title: string) {
        const key = entryKey(chapterId, word)
        const now = new Date().toISOString()
        const entry = this.mistakeBook[key]
        if (entry) {
          entry.errorLevel = Math.min(10, entry.errorLevel + 1)
          entry.wrongCount += 1
          entry.lastErrorAt = now
        } else {
          this.mistakeBook[key] = {
            chapterId,
            word,
            title,
            errorLevel: 1,
            wrongCount: 1,
            rightCount: 0,
            lastErrorAt: now,
            recentAnswers: ['wrong'],
          }
        }
        this.persistMistakeBook()
      },

      removeMistake(key: string) {
        delete this.mistakeBook[key]
        this.persistMistakeBook()
      },

      clearMistakeBook() {
        this.mistakeBook = {}
        this.persistMistakeBook()
      },

      clearWordStats() {
        this.wordStats = {}
        this.persistWordStats()
      },

      clearChapterStats() {
        this.chapterStats = {}
        this.persistChapterStats()
      },
  },
})
