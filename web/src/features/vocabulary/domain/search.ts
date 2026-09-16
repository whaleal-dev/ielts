/**
 * 搜索与难词筛选 —— 对应 legacy getSearchResults(5575–5605)、getFilteredDifficultWords(5536)、
 * 列表排序(5268–5290)、hasSearchFilters(4487)。
 */
import { library } from '../data/library'
import { normalizeStoredDifficultWord } from '../model/snapshot'
import { isDifficultyDue } from './review'
import type { VocabWord, DifficultWordEntry, DifficultySortMode } from '../types'

export function hasSearchFilters(query: string, chapterFilter: string, assistQuery: string): boolean {
  return Boolean(query.trim()) || Boolean(assistQuery.trim()) || chapterFilter !== 'all'
}

export function getSearchResults(
  query: string,
  chapterFilter = 'all',
  assistQuery = '',
): VocabWord[] {
  const q = query.trim().toLowerCase()
  const assist = assistQuery.trim().toLowerCase()
  if (!q && !assist && chapterFilter === 'all') return []
  const allWords = library.allWords
  if (!allWords.length) return []
  const matches: VocabWord[] = []
  const startsWithMatches: VocabWord[] = []
  for (const word of allWords) {
    if (chapterFilter !== 'all' && word.chapter !== chapterFilter) continue
    if (assist) {
      const phonetic = String(word.eng_phonetic || '').toLowerCase()
      if (!phonetic.includes(assist)) continue
    }
    if (!q) {
      startsWithMatches.push(word)
      continue
    }
    const haystack = `${word.word}\n${word.meaning}\n${word.chapter}\n${word.group}`.toLowerCase()
    if (!haystack.includes(q)) continue
    const head = word.word.toLowerCase()
    const meaningHead = String(word.meaning || '').toLowerCase()
    if (head.startsWith(q) || meaningHead.startsWith(q)) startsWithMatches.push(word)
    else matches.push(word)
  }
  return [...startsWithMatches, ...matches]
}

export interface DifficultFilterOptions {
  chapter: string | null
  query: string
  sortMode: DifficultySortMode
}

/** 过滤 + 排序；due 优先，然后 level 模式 → nextReviewAt 升 → count 降 → word 降 */
export function getFilteredDifficultWords(
  entries: Record<string, DifficultWordEntry>,
  options: DifficultFilterOptions,
): DifficultWordEntry[] {
  const chapter = options.chapter
  const query = options.query.trim().toLowerCase()
  const list: DifficultWordEntry[] = []
  for (const key of Object.keys(entries)) {
    const entry = normalizeStoredDifficultWord(entries[key])
    if (!entry) continue
    if (chapter && chapter !== 'all' && entry.chapter !== chapter) continue
    if (query) {
      const haystack = `${entry.word}\n${entry.meaning}\n${entry.chapter}\n${entry.group}`.toLowerCase()
      if (!haystack.includes(query)) continue
    }
    list.push(entry)
  }
  const now = Date.now()
  const levelDelta = (a: DifficultWordEntry, b: DifficultWordEntry) => b.difficultyLevel - a.difficultyLevel
  const dueDelta = (a: DifficultWordEntry, b: DifficultWordEntry) => Number(isDifficultyDue(a, now)) - Number(isDifficultyDue(b, now))
  const nextDelta = (a: DifficultWordEntry, b: DifficultWordEntry) => new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime()
  const countDelta = (a: DifficultWordEntry, b: DifficultWordEntry) => (b.count || 0) - (a.count || 0)
  const wordDelta = (a: DifficultWordEntry, b: DifficultWordEntry) => (a.word < b.word ? 1 : -1)

  list.sort((a, b) => {
    if (options.sortMode !== 'default') {
      const byLevel = levelDelta(a, b)
      if (byLevel !== 0) return byLevel
    }
    const byDue = dueDelta(a, b)
    if (byDue !== 0) return byDue
    const byNext = nextDelta(a, b)
    if (byNext !== 0) return byNext
    const byCount = countDelta(a, b)
    if (byCount !== 0) return byCount
    return wordDelta(a, b)
  })
  return list
}

export function getDueDifficultWords(
  entries: Record<string, DifficultWordEntry>,
  options: Omit<DifficultFilterOptions, 'sortMode'>,
): DifficultWordEntry[] {
  return getFilteredDifficultWords(entries, { ...options, sortMode: 'default' }).filter((entry) =>
    isDifficultyDue(entry),
  )
}

/** 难词搜索框关键词匹配（预览计数用） */
export function countMatchingDifficultWords(entries: Record<string, DifficultWordEntry>, options: DifficultFilterOptions): number {
  return getFilteredDifficultWords(entries, options).length
}
