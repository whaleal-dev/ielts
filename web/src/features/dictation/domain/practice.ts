import type { DictationWordItem } from '../model/cache'

export function parseUniqueWordList(raw: string): string[] {
  const words = raw
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,，]+/))
    .map((word) => word.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  return words.filter((word) => {
    const normalized = word.toLowerCase()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function isCorrectAnswer(expected: string, answer: string): boolean {
  return answer.trim().toLowerCase() === expected.trim().toLowerCase()
}

export function firstPendingWord(items: DictationWordItem[]): DictationWordItem | null {
  return items.find((item) => !item.removed) ?? null
}
