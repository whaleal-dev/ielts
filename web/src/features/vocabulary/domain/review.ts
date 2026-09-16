/**
 * 难词复习调度（纯函数）——对应 legacy REVIEW_INTERVALS_MS、markDifficultyReview(4150)、
 * isDifficultyDue(6391)、adjustCurrentWordDifficultyLevel(4005) 的计算部分。
 */
import { REVIEW_INTERVALS_MS } from '../constants'
import type { DifficultWordEntry } from '../types'
import { normalizeStoredDifficultWord } from '../model/snapshot'

export function isDifficultyDue(item: Partial<DifficultWordEntry> | undefined | null, now = Date.now()): boolean {
  if (!item) return false
  const dueAt = new Date(item.nextReviewAt || '').getTime()
  return Number.isFinite(dueAt) && dueAt <= now
}

/** 复习结果 → {stage, nextReviewAt, reviewFailures, lastReviewAt} */
export function scheduleReview(
  item: Partial<DifficultWordEntry> | null | undefined,
  success: boolean,
  now = Date.now(),
): { reviewStage: number; nextReviewAt: string; reviewFailures: number; lastReviewAt: string } {
  const entry = normalizeStoredDifficultWord(item)
  if (!entry) {
    return {
      reviewStage: success ? 1 : 0,
      nextReviewAt: new Date(now + REVIEW_INTERVALS_MS[success ? 1 : 0]).toISOString(),
      reviewFailures: success ? 0 : 1,
      lastReviewAt: new Date(now).toISOString(),
    }
  }
  const reviewStage = success ? Math.min(entry.reviewStage + 1, REVIEW_INTERVALS_MS.length - 1) : 0
  const reviewFailures = success ? entry.reviewFailures : entry.reviewFailures + 1
  return {
    reviewStage,
    nextReviewAt: new Date(now + REVIEW_INTERVALS_MS[reviewStage]).toISOString(),
    reviewFailures,
    lastReviewAt: new Date(now).toISOString(),
  }
}

/** 难度等级调整结果（level 0 = 移出难词表） */
export function levelAfterAdjust(entry: Partial<DifficultWordEntry>, delta: number): {
  level: number
  remove: boolean
  resetReview: boolean
} {
  const base = Number.isFinite(Number(entry.difficultyLevel)) ? Number(entry.difficultyLevel) : 1
  const level = Math.min(Math.max(base + delta, 0), 10)
  return { level, remove: level === 0, resetReview: delta > 0 }
}
