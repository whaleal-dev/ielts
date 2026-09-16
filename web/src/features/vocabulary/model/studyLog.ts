/**
 * studyLog 维护 —— 对应 legacy appendStudyLog(5976)、syncMasteryStudyLog(5054)、
 * rebuildMasteryStudyLog(5062)、buildStudyLogBootstrap(5983)。
 */
import { STUDY_LOG_LIMIT } from '../constants'
import type { StudyLogEntry, WordStatEntry, DifficultWordEntry } from '../types'

export function concatWithLimit(list: StudyLogEntry[], entries: StudyLogEntry[]): StudyLogEntry[] {
  const next = [...list, ...entries]
  return next.length > STUDY_LOG_LIMIT ? next.slice(-STUDY_LOG_LIMIT) : next
}

export function appendStudyLog(list: StudyLogEntry[], entry: StudyLogEntry): StudyLogEntry[] {
  return concatWithLimit(list, [entry])
}

/** mastered 事件单条化（先删同 wordKey 的旧 mastered 事件；masteredAt 为空不追加） */
export function syncMasteryStudyLog(list: StudyLogEntry[], key: string, masteredAt: string): StudyLogEntry[] {
  const withoutOld = list.filter((e) => !(e.kind === 'mastered' && e.wordKey === key))
  if (!masteredAt) return withoutOld
  return appendStudyLog(withoutOld, { kind: 'mastered', wordKey: key, at: masteredAt })
}

/** 从 wordStats 全量重建 mastered 事件（先清空全部 mastered，再按 masteredAt 排序） */
export function rebuildMasteryStudyLog(list: StudyLogEntry[], wordStats: Record<string, WordStatEntry>): StudyLogEntry[] {
  const withoutMastered = list.filter((e) => e.kind !== 'mastered')
  const events: StudyLogEntry[] = []
  for (const key of Object.keys(wordStats)) {
    const stat = wordStats[key]
    if (stat?.mastered && stat.masteredAt) events.push({ kind: 'mastered', wordKey: key, at: stat.masteredAt })
  }
  events.sort((a, b) => a.at.localeCompare(b.at))
  return concatWithLimit(withoutMastered, events)
}

/** 载入后 studyLog 为空但 wordStats 非空时，用词统计重建基础日志 */
export function buildStudyLogBootstrap(
  wordStats: Record<string, WordStatEntry>,
  difficultWords: Record<string, DifficultWordEntry>,
): StudyLogEntry[] {
  const events: StudyLogEntry[] = []
  for (const key of Object.keys(wordStats)) {
    const stat = wordStats[key]
    if (stat?.lastStudiedAt) events.push({ kind: 'study', wordKey: key, at: stat.lastStudiedAt })
  }
  for (const key of Object.keys(difficultWords)) {
    const entry = difficultWords[key]
    if (entry?.lastReviewAt && entry.reviewStage > 0) {
      events.push({ kind: 'review', wordKey: key, at: entry.lastReviewAt, success: true })
    }
  }
  events.sort((a, b) => a.at.localeCompare(b.at))
  return concatWithLimit(events, [])
}
