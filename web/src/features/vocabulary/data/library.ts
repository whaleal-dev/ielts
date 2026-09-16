/**
 * 词库装载与归一化 —— 等价 legacy normalizeLibrary(3014–3063)。
 * 输入 JSON 由 web/scripts/sync-vocab-data.mjs 从 words/data 生成，
 * 并在 legacy study_words.html 存在时做过一致性断言。
 */
import rawLibrary from '@/data/vocabulary/library.json'
import rawPresets from '@/data/vocabulary/presets.json'

import type { VocabWord, VocabGroup, VocabChapter, VocabLibrary, RawLibrary, PresetLists, RawWord } from '../types'
import { normalizeLexeme } from '../utils'

const RAW = rawLibrary as unknown as RawLibrary
const PRESETS = rawPresets as unknown as PresetLists

export function normalizeLibrary(raw: RawLibrary): VocabLibrary {
  const groupsById: Record<string, VocabGroup> = {}
  const allWords: VocabWord[] = []

  const chapters: VocabChapter[] = raw.chapters.map((chapter) => {
    const groups: VocabGroup[] = chapter.groups.map((group) => {
      const words: VocabWord[] = group.words.map((word: RawWord, index: number) => {
        const item: VocabWord = {
          ...word,
          key: `${group.id}::${word.id || index}::${word.word}`,
          chapter: chapter.chapter,
          chapterNumber: chapter.chapterNumber,
          group: group.group,
          groupNumber: group.groupNumber,
          groupId: group.id,
          wordIndex: index,
        }
        allWords.push(item)
        return item
      })
      const entry: VocabGroup = {
        chapter: chapter.chapter,
        chapterNumber: chapter.chapterNumber,
        group: group.group,
        groupNumber: group.groupNumber,
        wordCount: group.words.length,
        id: group.id,
        words,
      }
      groupsById[entry.id] = entry
      return entry
    })
    return { chapter: chapter.chapter, chapterNumber: chapter.chapterNumber, groups }
  })

  const allGroups = chapters.flatMap((c) => c.groups)

  return {
    totalChapters: raw.totalChapters ?? chapters.length,
    totalGroups: raw.totalGroups ?? allGroups.length,
    totalWords: raw.totalWords ?? allWords.length,
    chapters,
    groupsById,
    allWords,
  }
}

/** 全局词库运行时索引（模块加载即建一次） */
export const library: VocabLibrary = normalizeLibrary(RAW)

/** 预设词源集合（normalizeLexeme 规范化后判定成员） */
export const READING_538_LOOKUP: Set<string> = new Set(PRESETS.reading.map(normalizeLexeme))
export const LISTENING_179_LOOKUP: Set<string> = new Set(PRESETS.listening.map(normalizeLexeme))
export const CORE_VOCAB_LOOKUP: Set<string> = new Set(PRESETS.core.map(normalizeLexeme))

/** 按规范词形查词库词（同义词 matchedWord、外部词判定等） */
export function findLibraryWord(word: string): VocabWord | null {
  const norm = normalizeLexeme(word)
  return library.allWords.find((w) => normalizeLexeme(w.word) === norm) ?? null
}
