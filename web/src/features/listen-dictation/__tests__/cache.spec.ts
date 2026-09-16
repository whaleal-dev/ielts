import { describe, expect, it } from 'vitest'

import legacyCache from '../../../../test-fixtures/legacy/listen-dictation-cache-v0.json'
import { buildListenDictationCache, parseListenDictationCache } from '../model/cache'

describe('listen-dictation cache', () => {
  it('序列化时保留播放间隔', () => {
    const value = buildListenDictationCache({
      wordItems: [{ text: 'hello' }],
      selectedVoiceURI: '',
      speechRate: 1,
      repeatCount: 2,
      intervalSec: 4,
      ttsSource: 'web',
      dictationMode: false,
    })
    expect(value.intervalSec).toBe(4)
  })

  it('旧缓存没有间隔时使用默认值', () => {
    const value = parseListenDictationCache(JSON.stringify(legacyCache))
    expect(value?.intervalSec).toBe(1.5)
    expect(value?.wordItems).toEqual([{ text: 'fixture' }])
  })

  it('恢复时过滤中文并收敛设置', () => {
    const value = parseListenDictationCache(JSON.stringify({
      wordItems: [{ text: 'hello' }, { text: '中文 word' }, null],
      speechRate: 9,
      repeatCount: 0,
      intervalSec: 20,
      ttsSource: 'bad',
      dictationMode: 'yes',
    }))
    expect(value).toMatchObject({
      wordItems: [{ text: 'hello' }],
      speechRate: 1.5,
      repeatCount: 1,
      intervalSec: 5,
      ttsSource: 'web',
      dictationMode: false,
    })
  })

  it('非法 JSON 返回 null', () => {
    expect(parseListenDictationCache('{')).toBeNull()
  })
})
