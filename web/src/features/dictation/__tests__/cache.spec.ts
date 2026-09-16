import { describe, expect, it } from 'vitest'

import legacyCache from '../../../../test-fixtures/legacy/dictation-cache-v0.json'
import { buildDictationCache, parseDictationCache } from '../model/cache'

describe('dictation cache', () => {
  it('序列化时保留播放间隔', () => {
    const value = buildDictationCache({
      mode: 'listen',
      wordItems: [{ text: 'hello', removed: false }],
      wrongDict: [],
      masteredSet: [],
      selectedVoiceURI: 'voice',
      speechRate: 1,
      intervalSec: 3.5,
    })
    expect(value.intervalSec).toBe(3.5)
  })

  it('旧缓存没有间隔时使用默认值', () => {
    const value = parseDictationCache(JSON.stringify(legacyCache))
    expect(value?.intervalSec).toBe(2)
    expect(value?.wordItems).toEqual([{ text: 'fixture', removed: false }])
  })

  it('恢复时收敛数值和非法条目', () => {
    const value = parseDictationCache(JSON.stringify({
      mode: 'bad',
      wordItems: [{ text: 'valid', removed: 1 }, null, { text: '' }],
      speechRate: 9,
      intervalSec: 0,
      wrongDict: ['wrong', 1],
    }))
    expect(value).toMatchObject({
      mode: 'dictate',
      wordItems: [{ text: 'valid', removed: false }],
      speechRate: 1.5,
      intervalSec: 0.5,
      wrongDict: ['wrong'],
    })
  })

  it('非法 JSON 返回 null', () => {
    expect(parseDictationCache('{')).toBeNull()
  })
})
