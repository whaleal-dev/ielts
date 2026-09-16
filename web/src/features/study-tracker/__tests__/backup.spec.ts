import { describe, expect, it } from 'vitest'

import studyTrackerV4 from '../../../../test-fixtures/legacy/study-tracker-v4.json'
import { unwrapStudyTrackerBackup } from '../persist/backup'

describe('study-tracker backup', () => {
  it('解包 v4 备份信封中的 state', () => {
    expect(unwrapStudyTrackerBackup(studyTrackerV4)).toEqual(studyTrackerV4.state)
  })

  it('保留 legacy 裸状态', () => {
    const state = { activeTab: 'table', tableData: [] }
    expect(unwrapStudyTrackerBackup(state)).toBe(state)
  })

  it('state 非对象时不误解包', () => {
    const value = { version: 4, state: null }
    expect(unwrapStudyTrackerBackup(value)).toBe(value)
  })
})
