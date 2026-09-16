/**
 * corpus-dictation store 规则单元测试 —— 对齐 legacy ENGINE spec：
 * 判错 +3、手动 +1、答对 -1（归 0 删除）、recentAnswers ≤5、章统计 accuracy。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import legacyV1Backup from '../../../../test-fixtures/legacy/corpus-dictation-v1.json'
import {
  useCorpusStore,
  sanitizeSettings,
  sanitizeMistakeBook,
  sanitizeWordStats,
  sanitizeChapterStats,
} from '../stores/corpus'

function makeStore() {
  setActivePinia(createPinia())
  return useCorpusStore()
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('settings sanitize', () => {
  it('越界值被夹取、非法枚举回落', () => {
    const s = sanitizeSettings({ intervalSeconds: 99, speed: 9, listenRepeat: 0, mode: 'nope', order: 'weird' } as any)
    expect(s.intervalSeconds).toBe(30)
    expect(s.speed).toBe(2)
    expect(s.listenRepeat).toBe(1)
    expect(s.mode).toBe('dictation')
    expect(s.order).toBe('sequence')
  })

  it('默认值与边界保留', () => {
    const s = sanitizeSettings({ intervalSeconds: 0, speed: 0.4, listenBigLoop: 10 })
    expect(s.intervalSeconds).toBe(0)
    expect(s.speed).toBe(0.4)
    expect(s.listenBigLoop).toBe(10)
  })
})

describe('mistake book rules', () => {
  it('判错：新建条目 errorLevel=3，wrongCount+1', () => {
    const store = makeStore()
    store.recordAttempt('31', 'ability', 'Chapter 31', false)
    const key = '31::ability'
    const entry = store.mistakeBook[key]
    expect(entry).toBeTruthy()
    expect(entry.errorLevel).toBe(3)
    expect(entry.wrongCount).toBe(1)
    expect(entry.recentAnswers).toEqual(['wrong'])
  })

  it('连续判错 errorLevel 累加并封顶 10', () => {
    const store = makeStore()
    for (let i = 0; i < 6; i += 1) store.recordAttempt('31', 'ability', 't', false)
    expect(store.mistakeBook['31::ability'].errorLevel).toBe(10) // 3*4=12 -> clamp 10
  })

  it('recentAnswers 上限 5 条', () => {
    const store = makeStore()
    for (let i = 0; i < 7; i += 1) store.recordAttempt('31', 'ability', 't', i % 2 === 0)
    expect(store.mistakeBook['31::ability'].recentAnswers.length).toBeLessThanOrEqual(5)
  })

  it('手动加入：新条目 level=1，已有 +1', () => {
    const store = makeStore()
    store.addMistakeManual('32', 'word', 't')
    expect(store.mistakeBook['32::word'].errorLevel).toBe(1)
    store.addMistakeManual('32', 'word', 't')
    expect(store.mistakeBook['32::word'].errorLevel).toBe(2)
  })

  it('答对递减，归 0 删除', () => {
    const store = makeStore()
    store.addMistakeManual('33', 'x', 't')
    store.markCorrectInMistake('33::x')
    expect(store.mistakeBook['33::x']).toBeUndefined()
  })

  it('sanitizeMistakeBook 夹取 errorLevel 并保留合法条目', () => {
    const raw = {
      '1::a': { chapterId: '1', word: 'a', title: '', errorLevel: 99, wrongCount: -3, rightCount: 2, lastErrorAt: '', recentAnswers: ['wrong', 'bad', 'correct'] },
      '2::b': 'junk',
    }
    const book = sanitizeMistakeBook(raw)
    expect(Object.keys(book)).toEqual(['1::a'])
    expect(book['1::a'].errorLevel).toBe(10)
    expect(book['1::a'].wrongCount).toBe(0)
    expect(book['1::a'].recentAnswers).toEqual(['wrong', 'correct'])
  })
})

describe('word stats & chapter stats', () => {
  it('recordAttempt 写入词统计', () => {
    const store = makeStore()
    store.recordAttempt('35', 'test', 't', true)
    store.recordAttempt('35', 'test', 't', false)
    const stat = store.wordStats['35::test']
    expect(stat.practiceCount).toBe(2)
    expect(stat.correctCount).toBe(1)
  })

  it('recordChapterRun 追加历史并算 accuracy', () => {
    const store = makeStore()
    store.recordChapterRun('31', 10, 7)
    store.recordChapterRun('31', 5, 5)
    const runs = store.chapterStats['31']
    expect(runs.length).toBe(2)
    expect(runs[0].accuracy).toBe(70)
    expect(runs[1].accuracy).toBe(100)
  })

  it('导入词统计时过滤非法条目并收敛计数', () => {
    expect(sanitizeWordStats({
      '31::ability': { practiceCount: 2.6, correctCount: 9, lastAt: 1, chapterId: null },
      junk: 'bad',
    })).toEqual({
      '31::ability': { practiceCount: 3, correctCount: 3, lastAt: '', chapterId: '31' },
    })
  })

  it('导入章节统计时重算 accuracy 并过滤非法历史', () => {
    expect(sanitizeChapterStats({
      '31': [{ at: '2026-09-12', total: 10, correct: 7, accuracy: 999 }, 'bad'],
      '32': 'bad',
    })).toEqual({
      '31': [{ at: '2026-09-12', total: 10, correct: 7, accuracy: 70 }],
    })
  })

  it('v1 脱敏备份样本可通过全部归一化入口', () => {
    expect(sanitizeSettings(legacyV1Backup.settings).lastChapter).toBe('31')
    expect(sanitizeMistakeBook(legacyV1Backup.mistakeBook)['31::ability'].errorLevel).toBe(3)
    expect(sanitizeWordStats(legacyV1Backup.wordStats)['31::ability'].correctCount).toBe(1)
    expect(sanitizeChapterStats(legacyV1Backup.chapterStats)['31'][0].accuracy).toBe(70)
  })
})
