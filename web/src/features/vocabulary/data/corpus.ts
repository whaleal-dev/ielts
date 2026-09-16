/**
 * 听力语料数据（懒加载）—— 对应 legacy 6070–6151、6091–6165：
 * normalizeListeningCorpusEntry / getListeningCorpusEntries /
 * getListeningCorpusWordLookup / isListeningCorpusMatch / splitListeningCorpusTerms。
 *
 * corpus.json 由 sync-vocab-data.mjs 从 legacy 快照而来；模块懒加载避免拖累首屏 chunk。
 */
import type { CorpusEntry, CorpusItem } from '../types'
import { normalizeLexeme } from '../utils'

let cache: CorpusEntry[] | null = null
let loading: Promise<CorpusEntry[]> | null = null

/** 懒加载语料索引（幂等） */
export async function loadCorpus(): Promise<CorpusEntry[]> {
  if (cache) return cache
  if (!loading) {
    loading = import('@/data/vocabulary/corpus.json').then((module) => {
      const value = ((module as { default?: unknown }).default ?? module) as unknown
      cache = Array.isArray(value) ? (value as CorpusEntry[]) : []
      return cache
    })
  }
  return loading
}

/** 仅取 a-z0-9 词元（legacy normalizeLooseLexeme + 按 -/空白切分） */
export function splitTokens(value: string): Set<string> {
  const tokens = String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return new Set(tokens)
}

export function normalizeCorpusEntry(entry: CorpusEntry): CorpusItem {
  const content = String(entry.word || entry['单词名'] || '').trim()
  const mp3Path = String(entry.mp3Path || entry['mp3路径'] || '').trim().replace(/ /g, '%20')
  return {
    content,
    mp3Path,
    chapterId: String(entry.chapterId ?? ''),
    chapterTitle: String(entry.chapterTitle ?? ''),
  }
}

export function isCorpusMatch(wordText: string, entry: CorpusItem): boolean {
  const wordTokens = splitTokens(wordText)
  if (!wordTokens.size) return false
  const entryTokens = splitTokens(entry.content)
  for (const token of entryTokens) {
    if (wordTokens.has(token)) return true
  }
  return false
}

/** 与当前词任一 token 相同的语料条目，取前 limit 条 */
export async function resolveCorpusMatches(wordText: string, limit = 24): Promise<CorpusItem[]> {
  const entries = await loadCorpus()
  const matches: CorpusItem[] = []
  for (const entry of entries) {
    const item = normalizeCorpusEntry(entry)
    if (isCorpusMatch(wordText, item)) {
      matches.push(item)
      if (matches.length >= limit) break
    }
  }
  return matches
}

/** 语料词形集合（供 listeningCorpus 预设词源） */
export async function getCorpusWordLookup(): Promise<Set<string>> {
  const entries = await loadCorpus()
  return new Set(entries.map((entry) => normalizeLexeme(entry.word || entry['单词名'])))
}
