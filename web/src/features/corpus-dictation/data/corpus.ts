/**
 * corpus-dictation 数据访问 —— CHAPTER_WORD_SETS + 音频 URL 解析。
 * 词集：web/src/data/corpus/chapters.json（sync-corpus-data.mjs 生成，88 章/9366 词）。
 * 音频：优先使用 legacy 音频索引（web/src/data/vocabulary/corpus.json，王璐语料索引），
 * 缺省回退到 1kao 规则 URL。
 */
import chapterSetsJson from '@/data/corpus/chapters.json'
import legacyAudioJson from '@/data/vocabulary/corpus.json'

export interface CorpusChapter {
  id: string
  title: string
  words: string[]
}

export interface CorpusWord {
  chapterId: string
  chapterTitle: string
  word: string
  /** 已解析的远端音频地址 */
  audioUrl: string
}

const SETS = chapterSetsJson as unknown as Record<string, { title: string; words: string[] }>

export function getChapterEntries(): CorpusChapter[] {
  return Object.keys(SETS)
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => ({ id, title: SETS[id]?.title || '', words: SETS[id]?.words ?? [] }))
}

export const chapterEntries: CorpusChapter[] = getChapterEntries()

const legacyAudio = legacyAudioJson as unknown as { word?: string; mp3Path?: string; chapterId?: string }[]

/** chapterId:word -> 远端音频（来自 legacy 音频索引） */
const audioByChapterWord = new Map<string, string>()
for (const entry of legacyAudio) {
  if (entry?.mp3Path && entry.chapterId && entry.word) {
    audioByChapterWord.set(`${entry.chapterId}::${entry.word}`, entry.mp3Path)
  }
}

function encodePath(segment: string): string {
  return String(segment)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
    .replace(/%20/g, ' ')
}

/** 规则回退 URL（与 legacy ruby 输出一致：空格 %20） */
function fallbackAudioUrl(chapterId: string, word: string): string {
  return `http://www.1kao.com.cn/iSpell/Spell/audio/${encodePath(chapterId)}/${encodeURIComponent(word).replace(/%20/g, '%20')}.mp3`
}

export function buildAudioUrl(chapterId: string, word: string): string {
  const exact = audioByChapterWord.get(`${chapterId}::${word}`)
  if (exact) return exact
  const norm = `${chapterId}::${word.trim().toLowerCase()}`
  if (audioByChapterWord.has(norm)) return audioByChapterWord.get(norm)!
  return fallbackAudioUrl(chapterId, word)
}

/** 词→meta（在所选章节内匹配；不在则返回 null） */
export function resolveWordMeta(word: string, chapterId: string): { chapterId: string; chapterTitle: string; word: string; audioUrl: string } | null {
  const chapter = SETS[chapterId]
  if (!chapter) return null
  const trimmed = String(word || '').trim()
  if (!trimmed) return null
  const found = chapter.words.some((w) => w === trimmed)
  if (!found) return null
  return {
    chapterId,
    chapterTitle: chapter.title || '',
    word: trimmed,
    audioUrl: buildAudioUrl(chapterId, trimmed),
  }
}

/** 在全部语料库范围匹配（不限章节） */
export function matchAnyChapter(word: string): { chapterId: string; chapterTitle: string } | null {
  const trimmed = String(word || '').trim()
  if (!trimmed) return null
  for (const entry of chapterEntries) {
    if (entry.words.some((w) => w === trimmed)) {
      return { chapterId: entry.id, chapterTitle: entry.title }
    }
  }
  return null
}
