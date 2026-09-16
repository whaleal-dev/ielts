/**
 * 词快照与持久化条目归一化 —— 对应 legacy：
 * createStoredWordSnapshot(4045–4074)、normalizeWordStatEntry(5040–5052)、
 * normalizeStoredDifficultWord(4076–4089)、normalizeDateString(6383)。
 */
import type { VocabWord, StoredWordSnapshot, WordStatEntry, DifficultWordEntry } from '../types'
import { clampNumber, normalizeDateString } from '../utils'

export type WordLike = Partial<VocabWord> & Partial<DifficultWordEntry> & { word?: string }

/** 从任意词对象构造持久化快照（key 缺失时按 groupId::id::word 派生） */
export function createStoredWordSnapshot(source: WordLike | null | undefined): StoredWordSnapshot {
  const word = source && typeof source === 'object' ? source : {}
  const groupId = String(word.groupId || '')
  const id = String(word.id ?? word.wordIndex ?? '')
  const lexeme = String(word.word ?? '')
  const key =
    String(word.key ?? '').trim() || (groupId && lexeme ? `${groupId}::${id}::${lexeme}` : lexeme)
  return {
    key,
    id,
    word: lexeme,
    eng_phonetic: word.eng_phonetic,
    meaning: word.meaning ?? '',
    eng_sound: word.eng_sound,
    chapter: String(word.chapter ?? ''),
    chapterNumber: Number(word.chapterNumber) || 0,
    group: String(word.group ?? ''),
    groupId,
    wordIndex: Number.isFinite(Number(word.wordIndex)) ? Number(word.wordIndex) : -1,
  }
}

/** wordStats 条目归一化（读路径/水合统一入口） */
export function normalizeWordStatEntry(item: Partial<WordStatEntry> | null | undefined, fallbackKey = ''): WordStatEntry {
  const entry = { ...(item || {}) } as Partial<WordStatEntry>
  const snapshot = createStoredWordSnapshot(entry)
  const mastered = Boolean(entry.mastered)
  const lastStudiedAt = normalizeDateString(entry.lastStudiedAt, '')
  return {
    ...snapshot,
    key: snapshot.key || fallbackKey,
    count: Math.max(0, Math.round(Number(entry.count) || 0)),
    lastStudiedAt,
    note: typeof entry.note === 'string' ? entry.note : undefined,
    mastered,
    masteredAt: mastered ? normalizeDateString(entry.masteredAt, lastStudiedAt || '') : '',
  }
}

/** difficultWords 条目归一化（缺省补全 + 值域夹取） */
export function normalizeStoredDifficultWord(
  item: Partial<DifficultWordEntry> | null | undefined,
): DifficultWordEntry | null {
  if (!item || typeof item !== 'object') return null
  const snapshot = createStoredWordSnapshot(item as WordLike)
  const lastStudiedAt = normalizeDateString(item.lastStudiedAt, '')
  const now = new Date().toISOString()
  const addedAt = normalizeDateString(item.addedAt, lastStudiedAt || now)
  const reviewStage = Math.round(clampNumber(Number(item.reviewStage) || 0, 0, 5, 0))
  const difficultyLevel = Math.round(clampNumber(Number(item.difficultyLevel), 0, 10, 1))
  const mastered = Boolean(item.mastered)
  return {
    ...snapshot,
    count: Math.max(0, Math.round(Number(item.count) || 0)),
    lastStudiedAt,
    mastered,
    masteredAt: mastered ? normalizeDateString(item.masteredAt, lastStudiedAt || '') : '',
    note: typeof item.note === 'string' ? item.note : '',
    addedAt,
    lastReviewAt: normalizeDateString(item.lastReviewAt, ''),
    nextReviewAt: normalizeDateString(item.nextReviewAt, addedAt),
    reviewStage,
    reviewFailures: Math.max(0, Math.round(Number(item.reviewFailures) || 0)),
    difficultyLevel,
  }
}
