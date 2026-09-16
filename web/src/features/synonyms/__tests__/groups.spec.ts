import { describe, expect, it } from 'vitest'

import { parseSynonymGroups } from '../model/groups'

describe('synonym groups', () => {
  it('解析 TXT 行分组和中英文逗号', () => {
    expect(parseSynonymGroups('words.txt', 'reserve, book\nahead，beforehand')).toEqual([
      ['reserve', 'book'],
      ['ahead', 'beforehand'],
    ])
  })

  it('解析 JSON 二维数组并清理空词', () => {
    expect(parseSynonymGroups('words.json', JSON.stringify([[' reserve ', ''], ['book']]))).toEqual([
      ['reserve'],
      ['book'],
    ])
  })

  it('拒绝非二维数组 JSON', () => {
    expect(() => parseSynonymGroups('words.json', JSON.stringify(['reserve']))).toThrow('invalid_synonym_json')
  })

  it('拒绝空词库', () => {
    expect(() => parseSynonymGroups('words.txt', ' \n ')).toThrow('empty_synonym_groups')
  })
})
