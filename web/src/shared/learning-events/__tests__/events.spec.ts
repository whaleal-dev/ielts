import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  LEARNING_EVENTS_KEY,
  appendLearningEvent,
  parseLearningEvents,
  readLearningEvents,
  summarizeLearningEvents,
} from '../events'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
})

beforeEach(() => {
  localStorage.clear()
})

describe('learning events', () => {
  it('过滤损坏事件并按时间排序', () => {
    const events = parseLearningEvents({
      version: 1,
      events: [
        { id: 'b', moduleId: 'corpus', type: 'mistake_added', occurredAt: '2026-09-12T10:00:00.000Z' },
        { bad: true },
        { id: 'a', moduleId: 'corpus', type: 'session_started', occurredAt: '2026-09-12T09:00:00.000Z' },
      ],
    })
    expect(events.map((event) => event.id)).toEqual(['a', 'b'])
  })

  it('追加事件并保存版本化信封', () => {
    appendLearningEvent({
      id: 'event-1',
      moduleId: 'corpus-dictation',
      type: 'session_completed',
      occurredAt: '2026-09-12T10:00:00.000Z',
      durationSeconds: 120,
    })
    expect(readLearningEvents()).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(LEARNING_EVENTS_KEY) ?? '{}').version).toBe(1)
  })

  it('汇总今日训练与最近错词并去重', () => {
    const events = parseLearningEvents([
      { id: '1', moduleId: 'corpus', type: 'session_completed', occurredAt: '2026-09-12T02:00:00.000Z', durationSeconds: 120 },
      { id: '2', moduleId: 'corpus', type: 'session_completed', occurredAt: '2026-09-12T03:00:00.000Z', durationSeconds: 60 },
      { id: '3', moduleId: 'corpus', type: 'mistake_added', occurredAt: '2026-09-11T03:00:00.000Z', references: { word: 'apple' } },
      { id: '4', moduleId: 'corpus', type: 'mistake_added', occurredAt: '2026-09-11T04:00:00.000Z', references: { word: 'apple' } },
    ])
    const summary = summarizeLearningEvents(events, new Date('2026-09-12T12:00:00+08:00'))
    expect(summary.todayDurationSeconds).toBe(180)
    expect(summary.todayCompletedSessions).toBe(2)
    expect(summary.recentMistakeCount).toBe(1)
  })
})
