import { describe, expect, it } from 'vitest'

import { clampRate, clampRepeats, getNextPlaylistIndex, pickRandomIndex } from '../domain/playback'

describe('audio-player playback rules', () => {
  it('倍速按 0.2 步长收敛到 0.6～2', () => {
    expect(clampRate(0)).toBe(0.6)
    expect(clampRate(1.31)).toBe(1.4)
    expect(clampRate(9)).toBe(2)
    expect(clampRate('bad')).toBe(1)
  })

  it('重复次数收敛到 1～10 的整数', () => {
    expect(clampRepeats(0)).toBe(1)
    expect(clampRepeats(2.6)).toBe(3)
    expect(clampRepeats(99)).toBe(10)
  })

  it('顺序模式结束后返回 -1，循环模式回到开头', () => {
    expect(getNextPlaylistIndex(3, 1, 'sequence')).toBe(2)
    expect(getNextPlaylistIndex(3, 2, 'sequence')).toBe(-1)
    expect(getNextPlaylistIndex(3, 2, 'loop')).toBe(0)
  })

  it('随机模式排除当前项且不会因随机源固定而死循环', () => {
    expect(pickRandomIndex(3, 0, () => 0)).toBe(1)
    expect(pickRandomIndex(3, 1, () => 0.99)).toBe(2)
    expect(getNextPlaylistIndex(3, 2, 'shuffle', () => 0.5)).not.toBe(2)
  })

  it('空列表和单项列表边界明确', () => {
    expect(getNextPlaylistIndex(0, 0, 'sequence')).toBe(-1)
    expect(pickRandomIndex(1, 0)).toBe(0)
  })
})
