import { containsChinese } from './cache'
import type { ListenWordItem } from './cache'

export function parseListenWordList(raw: string): { words: ListenWordItem[]; skippedChinese: number } {
  const parsed = raw
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,，]+/))
    .map((word) => word.trim())
    .filter(Boolean)
  const words: ListenWordItem[] = []
  const seen = new Set<string>()
  let skippedChinese = 0
  for (const word of parsed) {
    if (containsChinese(word)) {
      skippedChinese += 1
      continue
    }
    const normalized = word.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    words.push({ text: word })
  }
  return { words, skippedChinese }
}

export function nextSequentialIndex(total: number, current: number): number | null {
  if (total <= 0 || current >= total - 1) return null
  return Math.max(0, current + 1)
}

export function nextWrappedIndex(total: number, current: number): number {
  if (total <= 0) return -1
  return current >= total - 1 ? 0 : Math.max(0, current + 1)
}

export function previousWrappedIndex(total: number, current: number): number {
  if (total <= 0) return -1
  return current > 0 ? current - 1 : total - 1
}
