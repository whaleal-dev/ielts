/**
 * 同义词数据装载与索引 —— 等价 legacy buildSynonymLookup(6184–6215)
 * 与 canonicalizeSynonymSourceName(6217–6239)。
 */
import rawSynonyms from '@/data/vocabulary/synonyms.json'

import type { SynonymSource, SynonymIndex, SynonymTerm } from '../types'
import { normalizeLexeme } from '../utils'

const SYNONYM_SOURCES = rawSynonyms as unknown as SynonymSource[]

/** 旧源名 → 新源名映射（legacy 同义词-* 文件命名演进用） */
const LEGACY_SOURCE_NAME_MAP: Record<string, string> = {
  同义词1: '同义词-听力179考点词',
  同义词2: '同义词-阅读538考点词',
}

/** 规范化同义词源名：旧名映射 + `同义词x.json` → `同义词-x.json` */
export function canonicalizeSynonymSourceName(rawName: string): string {
  const name = String(rawName || '').trim()
  if (!name) return name
  const mapped = LEGACY_SOURCE_NAME_MAP[name] ?? name
  return mapped.replace(/^同义词([^-])/, '同义词-$1')
}

export function normalizeSynonymTerms(rawTerms: readonly string[]): SynonymTerm[] {
  const seen = new Set<string>()
  const terms: SynonymTerm[] = []
  for (const raw of rawTerms) {
    const displayWord = String(raw || '').trim()
    const normalized = normalizeLexeme(displayWord)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    terms.push({ displayWord, normalized })
  }
  return terms
}

export function buildSynonymLookup(sources: SynonymSource[]): SynonymIndex {
  const lookup: Record<string, SynonymIndex['lookup'][string]> = {}
  const sourceMeta: SynonymIndex['sources'] = []
  sources.forEach((source, sourceIndex) => {
    const name = canonicalizeSynonymSourceName(source.source)
    sourceMeta.push({ id: `synonym-source-${sourceIndex}`, name, groupCount: source.groups.length })
    source.groups.forEach((group, groupIndex) => {
      const terms = normalizeSynonymTerms(group)
      const entry = {
        id: `${name}::${groupIndex}`,
        source: name,
        groupIndex,
        terms,
      }
      for (const term of terms) {
        ;(lookup[term.normalized] ||= []).push(entry)
      }
    })
  })
  return { lookup, sources: sourceMeta }
}

type GroupEntryList = SynonymIndex['lookup'][string]

export const synonymIndex: SynonymIndex = buildSynonymLookup(SYNONYM_SOURCES)

export const synonymSourceCatalog = synonymIndex.sources

/** 可用源名集合（用于设置面板） */
export const availableSynonymSourceNames = synonymSourceCatalog.map((s) => s.name)

/** 解析某词所在同义组（legacy resolveSynonymGroups 6315–6332 的数据部分） */
export function resolveSynonymGroups(word: string, enabledNames: string[] | null): GroupEntryList {
  const norm = normalizeLexeme(word)
  const groups = synonymIndex.lookup[norm] ?? []
  if (!enabledNames) return groups
  const enabled = new Set(enabledNames)
  return groups.filter((g) => enabled.has(g.source))
}
