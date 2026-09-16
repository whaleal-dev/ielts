export type DictationMode = 'dictate' | 'listen'

export interface DictationWordItem {
  text: string
  removed: boolean
}

export interface DictationCache {
  mode: DictationMode
  wordItems: DictationWordItem[]
  wrongDict: string[]
  masteredSet: string[]
  selectedVoiceURI: string
  speechRate: number
  intervalSec: number
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function buildDictationCache(value: DictationCache): DictationCache {
  return value
}

export function parseDictationCache(raw: string | null): DictationCache | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const wordItems = Array.isArray(value.wordItems)
      ? value.wordItems
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
          .filter((item) => typeof item.text === 'string' && item.text.trim().length > 0)
          .map((item) => ({ text: String(item.text), removed: item.removed === true }))
      : []
    return {
      mode: value.mode === 'listen' ? 'listen' : 'dictate',
      wordItems,
      wrongDict: stringArray(value.wrongDict),
      masteredSet: stringArray(value.masteredSet),
      selectedVoiceURI: typeof value.selectedVoiceURI === 'string' ? value.selectedVoiceURI : '',
      speechRate: clampNumber(value.speechRate, 0.5, 1.5, 0.9),
      intervalSec: clampNumber(value.intervalSec, 0.5, 5, 2),
    }
  } catch {
    return null
  }
}
