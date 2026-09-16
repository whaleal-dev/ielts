export type PlayMode = 'sequence' | 'loop' | 'shuffle'

export function clampRate(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 1
  const min = 0.6
  const max = 2
  const step = 0.2
  const rounded = Math.round((numeric - min) / step) * step + min
  return Math.min(max, Math.max(min, Number(rounded.toFixed(1))))
}

export function clampRepeats(value: unknown): number {
  const numeric = Math.round(Number(value))
  if (!Number.isFinite(numeric)) return 1
  return Math.min(10, Math.max(1, numeric))
}

export function pickRandomIndex(total: number, excludeIndex: number, random: () => number = Math.random): number {
  if (total <= 0) return -1
  if (total === 1) return 0
  if (excludeIndex < 0 || excludeIndex >= total) return Math.floor(random() * total)
  const candidate = Math.floor(random() * (total - 1))
  return candidate >= excludeIndex ? candidate + 1 : candidate
}

export function getNextPlaylistIndex(
  total: number,
  current: number,
  mode: PlayMode,
  random: () => number = Math.random,
): number {
  if (total <= 0) return -1
  if (mode === 'loop') return (current + 1 + total) % total
  if (mode === 'shuffle') return pickRandomIndex(total, current, random)
  const next = current + 1
  return next >= total ? -1 : next
}
