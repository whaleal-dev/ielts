import { describe, expect, it } from 'vitest'

import { parseWordList } from '../model/words'

describe('pronunciation word list', () => {
  it('解析换行和中英文逗号', () => {
    expect(parseWordList('adequate, beneficial\nenvironment，significant')).toEqual([
      'adequate',
      'beneficial',
      'environment',
      'significant',
    ])
  })

  it('忽略空白并保留输入顺序', () => {
    expect(parseWordList('  first ,, second\n\n third  ')).toEqual(['first', 'second', 'third'])
  })

  it('空输入返回空数组', () => {
    expect(parseWordList(' \n ')).toEqual([])
  })
})
