import { readLocalStorageValue, writeLocalStorageValue } from '@/shared/storage/chunked-local-storage'

export const LEARNING_EVENTS_KEY = 'ielts-dev-learning-events-v1'
export const LEARNING_EVENT_LIMIT = 2_000

export type LearningEventType =
  | 'session_started'
  | 'session_completed'
  | 'mistake_added'
  | 'word_mastered'

export interface LearningEvent {
  id: string
  moduleId: string
  type: LearningEventType
  occurredAt: string
  durationSeconds?: number
  sessionId?: string
  title?: string
  metrics?: Record<string, number>
  references?: Record<string, string>
}

interface LearningEventEnvelope {
  version: 1
  events: LearningEvent[]
}

export interface LearningEventSummary {
  todayDurationSeconds: number
  todayCompletedSessions: number
  recentMistakeCount: number
  latest: LearningEvent[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeEvent(value: unknown): LearningEvent | null {
  if (!isRecord(value)) return null
  const types: LearningEventType[] = ['session_started', 'session_completed', 'mistake_added', 'word_mastered']
  if (
    typeof value.id !== 'string' ||
    typeof value.moduleId !== 'string' ||
    typeof value.occurredAt !== 'string' ||
    !types.includes(value.type as LearningEventType)
  ) return null
  const duration = Number(value.durationSeconds)
  const metrics: Record<string, number> = {}
  if (isRecord(value.metrics)) {
    for (const [key, metric] of Object.entries(value.metrics)) {
      const number = Number(metric)
      if (Number.isFinite(number)) metrics[key] = number
    }
  }
  const references: Record<string, string> = {}
  if (isRecord(value.references)) {
    for (const [key, reference] of Object.entries(value.references)) {
      if (typeof reference === 'string') references[key] = reference
    }
  }
  return {
    id: value.id,
    moduleId: value.moduleId,
    type: value.type as LearningEventType,
    occurredAt: value.occurredAt,
    ...(Number.isFinite(duration) && duration >= 0 ? { durationSeconds: duration } : {}),
    ...(typeof value.sessionId === 'string' ? { sessionId: value.sessionId } : {}),
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(Object.keys(metrics).length ? { metrics } : {}),
    ...(Object.keys(references).length ? { references } : {}),
  }
}

export function parseLearningEvents(value: unknown): LearningEvent[] {
  const source = isRecord(value) && Array.isArray(value.events) ? value.events : Array.isArray(value) ? value : []
  return source
    .map(normalizeEvent)
    .filter((event): event is LearningEvent => event !== null)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .slice(-LEARNING_EVENT_LIMIT)
}

export function readLearningEvents(): LearningEvent[] {
  try {
    const raw = readLocalStorageValue(LEARNING_EVENTS_KEY)
    return raw ? parseLearningEvents(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function writeLearningEvents(events: LearningEvent[]): void {
  const envelope: LearningEventEnvelope = {
    version: 1,
    events: parseLearningEvents(events),
  }
  const result = writeLocalStorageValue(LEARNING_EVENTS_KEY, JSON.stringify(envelope))
  if (!result.ok) throw new Error('learning_events_write_failed')
}

export function createLearningEventId(moduleId: string, occurredAt = new Date().toISOString()): string {
  return `${moduleId}-${occurredAt.replace(/\D/g, '').slice(0, 17)}-${Math.random().toString(36).slice(2, 8)}`
}

export function appendLearningEvent(
  input: Omit<LearningEvent, 'id' | 'occurredAt'> & Partial<Pick<LearningEvent, 'id' | 'occurredAt'>>,
): LearningEvent {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const event = normalizeEvent({
    ...input,
    id: input.id ?? createLearningEventId(input.moduleId, occurredAt),
    occurredAt,
  })
  if (!event) throw new Error('learning_event_invalid')
  writeLearningEvents([...readLearningEvents(), event])
  return event
}

function localDay(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function summarizeLearningEvents(events: LearningEvent[], now = new Date()): LearningEventSummary {
  const today = localDay(now)
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
  const todayCompleted = events.filter((event) =>
    event.type === 'session_completed' && localDay(new Date(event.occurredAt)) === today,
  )
  const recentMistakes = new Set(
    events
      .filter((event) => event.type === 'mistake_added' && new Date(event.occurredAt).getTime() >= sevenDaysAgo)
      .map((event) => `${event.moduleId}:${event.references?.word ?? event.id}`),
  )
  return {
    todayDurationSeconds: todayCompleted.reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0),
    todayCompletedSessions: todayCompleted.length,
    recentMistakeCount: recentMistakes.size,
    latest: [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 6),
  }
}
