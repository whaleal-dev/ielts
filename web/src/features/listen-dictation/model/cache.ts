export type ListenTtsSource = 'web' | 'baidu'

export interface ListenWordItem {
  text: string
}

export interface ListenDictationCache {
  wordItems: ListenWordItem[]
  selectedVoiceURI: string
  speechRate: number
  repeatCount: number
  intervalSec: number
  ttsSource: ListenTtsSource
  dictationMode: boolean
}

export function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text)
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

export function buildListenDictationCache(value: ListenDictationCache): ListenDictationCache {
  return value
}

export function parseListenDictationCache(raw: string | null): ListenDictationCache | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const wordItems = Array.isArray(value.wordItems)
      ? value.wordItems
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
          .filter((item) => typeof item.text === 'string' && item.text.trim().length > 0 && !containsChinese(item.text))
          .map((item) => ({ text: String(item.text) }))
      : []
    return {
      wordItems,
      selectedVoiceURI: typeof value.selectedVoiceURI === 'string' ? value.selectedVoiceURI : '',
      speechRate: clampNumber(value.speechRate, 0.5, 1.5, 1),
      repeatCount: Math.round(clampNumber(value.repeatCount, 1, 5, 1)),
      intervalSec: clampNumber(value.intervalSec, 0.5, 5, 1.5),
      ttsSource: value.ttsSource === 'baidu' ? 'baidu' : 'web',
      dictationMode: value.dictationMode === true,
    }
  } catch {
    return null
  }
}
