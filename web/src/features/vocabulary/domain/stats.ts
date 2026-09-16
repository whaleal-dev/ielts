/**
 * 统计纯函数 —— 对应 legacy computeDailySeries(6005–6050)、computeCurrentStudyStreak(4432)、
 * resolveHeatmapLevel(4415)、computeGroupStats(5114)。
 */
import type { StudyLogEntry, VocabGroup } from '../types'
import { formatDayKey } from '../utils'

export interface DailyStat {
  key: string
  label: string
  learned: number
  mastered: number
  reviewed: number
}

/** 从今天向前 days 天（补零到今天），learned/mastered/reviewed 按 wordKey 去重计数 */
export function computeDailySeries(log: StudyLogEntry[], days = 7): DailyStat[] {
  const result: DailyStat[] = []
  const now = new Date()
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    result.push({
      key: formatDayKey(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      learned: 0,
      mastered: 0,
      reviewed: 0,
    })
  }
  const indexByKey = new Map(result.map((row, index) => [row.key, index]))
  const learnedKeys = new Map<string, Set<string>>()
  const masteredKeys = new Map<string, Set<string>>()
  const reviewedKeys = new Map<string, Set<string>>()
  for (const entry of log) {
    const day = formatDayKey(entry.at)
    const index = indexByKey.get(day)
    if (index === undefined) continue
    const bucket = entry.kind === 'mastered' ? masteredKeys : entry.kind === 'review' ? reviewedKeys : learnedKeys
    const set = bucket.get(day) ?? new Set<string>()
    set.add(entry.wordKey)
    bucket.set(day, set)
  }
  for (const [day, set] of learnedKeys) result[indexByKey.get(day)!].learned = set.size
  for (const [day, set] of masteredKeys) result[indexByKey.get(day)!].mastered = set.size
  for (const [day, set] of reviewedKeys) result[indexByKey.get(day)!].reviewed = set.size
  return result
}

/** 连续学习天数：study/review/mastered 出现过的日，从今天(0 点)向前连续计数 */
export function computeCurrentStudyStreak(log: StudyLogEntry[]): number {
  const days = new Set<string>()
  for (const entry of log) {
    const day = formatDayKey(entry.at)
    if (day) days.add(day)
  }
  if (!days.size) return 0
  let streak = 0
  const cursor = new Date()
  for (;;) {
    const key = formatDayKey(cursor)
    if (days.has(key)) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }
  return streak
}

/** 热力图等级：≤0→0；ratio≤0.25/0.5/0.75→1/2/3/4 */
export function resolveHeatmapLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0
  const ratio = value / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

export interface GroupStatSummary {
  studied: number
  mastered: number
  total: number
  progress: number
  masteredProgress: number
  last: string
  completedRuns: number
}

export interface WordStatLike {
  count?: number
  lastStudiedAt?: string
  mastered?: boolean
}

export function computeGroupStats(group: VocabGroup, wordStats: Record<string, WordStatLike>): GroupStatSummary {
  const studied = group.words.filter((word) => (wordStats[word.key]?.count || 0) > 0).length
  const mastered = group.words.filter((word) => Boolean(wordStats[word.key]?.mastered)).length
  const total = group.words.length
  const progress = total ? Math.round((studied / total) * 100) : 0
  const masteredProgress = total ? Math.round((mastered / total) * 100) : 0
  const lastValues = group.words
    .map((word) => wordStats[word.key]?.lastStudiedAt || '')
    .filter(Boolean)
    .sort()
    .reverse()
  return { studied, mastered, total, progress, masteredProgress, last: lastValues[0] || '尚未学习', completedRuns: 0 }
}
