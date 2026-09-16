import { describe, expect, it } from 'vitest'

import { nextSequentialIndex, nextWrappedIndex, parseListenWordList, previousWrappedIndex } from '../model/words'

describe('listen-dictation word rules', () => {
  it('过滤中文并按大小写去重', () => {
    expect(parseListenWordList('Apple, apple\n中文 word，banana')).toEqual({
      words: [{ text: 'Apple' }, { text: 'banana' }],
      skippedChinese: 1,
    })
  })

  it('自动播放到列表末尾后结束', () => {
    expect(nextSequentialIndex(3, 0)).toBe(1)
    expect(nextSequentialIndex(3, 2)).toBeNull()
    expect(nextSequentialIndex(0, 0)).toBeNull()
  })

  it('手动前后切词首尾循环', () => {
    expect(nextWrappedIndex(3, 2)).toBe(0)
    expect(previousWrappedIndex(3, 0)).toBe(2)
    expect(nextWrappedIndex(0, 0)).toBe(-1)
  })
})
