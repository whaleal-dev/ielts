import { describe, expect, it } from 'vitest'

import { firstPendingWord, isCorrectAnswer, parseUniqueWordList } from '../domain/practice'

describe('dictation practice rules', () => {
  it('解析混合分隔符并按大小写去重', () => {
    expect(parseUniqueWordList('Apple, banana\napple，Cat')).toEqual(['Apple', 'banana', 'Cat'])
  })

  it('判分忽略首尾空格和大小写', () => {
    expect(isCorrectAnswer('Accommodation', ' accommodation ')).toBe(true)
    expect(isCorrectAnswer('quiet', 'quite')).toBe(false)
  })

  it('返回第一个未移除单词', () => {
    const items = [
      { text: 'first', removed: true },
      { text: 'second', removed: false },
      { text: 'third', removed: false },
    ]
    expect(firstPendingWord(items)?.text).toBe('second')
    expect(firstPendingWord(items.map((item) => ({ ...item, removed: true })))).toBeNull()
  })
})
