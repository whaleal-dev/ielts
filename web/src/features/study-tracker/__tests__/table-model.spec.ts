import { describe, expect, it } from 'vitest'

import { deserializeRow, normalizeRows, rowAverage, rowIncompleteCount, serializeRow } from '../model/tableModel'
import type { StudyColumn, StudyRow } from '../model/tableModel'

const columns: StudyColumn[] = [
  { id: 'listening', name: '听力', groupId: 'study' },
  { id: 'reading', name: '阅读', groupId: 'study' },
]

describe('study-tracker table model', () => {
  it('内存指标按分组和项目名序列化并可恢复', () => {
    const row: StudyRow = {
      id: 'row-1',
      date: '2026-09-12',
      durationMinutes: 90,
      metrics: { listening: '7.5', reading: '/' },
      notes: { review: 'ok' },
    }
    const stored = serializeRow(row, columns)
    expect(stored.metrics).toEqual({ study: { 听力: '7.5', 阅读: '/' } })
    expect(deserializeRow(stored, columns)).toEqual(row)
  })

  it('兼容按 column id 保存的旧扁平指标', () => {
    const row = deserializeRow({ id: 'old', metrics: { listening: '8', reading: 'bad' } }, columns)
    expect(row.metrics).toEqual({ listening: '8', reading: '' })
  })

  it('重复日期只保留第一条日期并限制空日期行', () => {
    const makeRow = (id: string, date: string): StudyRow => ({
      id,
      date,
      durationMinutes: null,
      metrics: { listening: '', reading: '' },
      notes: {},
    })
    const rows = normalizeRows([
      makeRow('a', '2026-09-12'),
      makeRow('b', '2026-09-12'),
      makeRow('c', ''),
      makeRow('d', ''),
    ], 2)
    expect(rows.filter((row) => row.date === '2026-09-12')).toHaveLength(1)
    expect(rows.filter((row) => !row.date)).toHaveLength(2)
  })

  it('统计只计合法数值并报告空字段数', () => {
    const row: StudyRow = {
      id: 'row',
      date: '',
      durationMinutes: null,
      metrics: { listening: '8', reading: '' },
      notes: {},
    }
    expect(rowAverage(row, columns)).toBe(8)
    expect(rowIncompleteCount(row, columns)).toBe(1)
  })
})
