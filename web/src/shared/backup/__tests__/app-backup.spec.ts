import { describe, expect, it, vi } from 'vitest'

import { applyImportPlan, createAppBackup, inspectAppBackup } from '../app-backup'
import type { BackupModuleSnapshot, BackupProvider } from '../types'

function provider(id: string, value: BackupModuleSnapshot | null): BackupProvider {
  let current = value
  return {
    id,
    label: id,
    read: vi.fn(async () => current),
    normalize(input) {
      if (!input || typeof input !== 'object') throw new Error('invalid')
      return input as BackupModuleSnapshot
    },
    async write(input) {
      current = input
    },
    summarize(input) {
      return `v${input.version}`
    },
    matchesLegacy(input) {
      return Boolean(input && typeof input === 'object' && (input as Record<string, unknown>).legacy === id)
    },
  }
}

describe('app backup', () => {
  it('只导出有持久化数据的注册模块', async () => {
    const backup = await createAppBackup([
      provider('study', { version: 4, rows: 3 }),
      provider('empty', null),
    ])
    expect(backup.app).toBe('ielts-dev')
    expect(backup.schemaVersion).toBe(1)
    expect(Object.keys(backup.modules)).toEqual(['study'])
  })

  it('导入前生成模块级预览', () => {
    const plan = inspectAppBackup({
      app: 'ielts-dev',
      schemaVersion: 1,
      exportedAt: '2026-09-12T00:00:00.000Z',
      modules: { study: { version: 4 } },
    }, [provider('study', null)])
    expect(plan.source).toBe('app')
    expect(plan.items).toEqual([
      expect.objectContaining({ id: 'study', summary: 'v4' }),
    ])
  })

  it('只在恰好一个适配器匹配时接受旧模块备份', () => {
    const plan = inspectAppBackup({ legacy: 'study', version: 4 }, [
      provider('study', null),
      provider('vocab', null),
    ])
    expect(plan.source).toBe('legacy-module')
    expect(plan.items[0].id).toBe('study')
  })

  it('应用失败时回滚已经写入的模块', async () => {
    const writes: string[] = []
    const first = provider('first', { version: 1, value: 'old' })
    first.write = vi.fn(async (value) => {
      writes.push(`first:${String(value?.value)}`)
    })
    const second = provider('second', { version: 1, value: 'old' })
    second.write = vi.fn(async () => {
      throw new Error('failed')
    })

    await expect(applyImportPlan({
      source: 'app',
      exportedAt: '',
      items: [
        { id: 'first', label: 'first', summary: '', snapshot: { version: 1, value: 'new' } },
        { id: 'second', label: 'second', summary: '', snapshot: { version: 1, value: 'new' } },
      ],
    }, [first, second])).rejects.toThrow('failed')
    expect(writes).toEqual(['first:new', 'first:old'])
  })

  it('单个适配器写入中途失败时也恢复该适配器的旧快照', async () => {
    const writes: string[] = []
    const partial = provider('partial', { version: 1, value: 'old' })
    partial.write = vi.fn(async (value) => {
      writes.push(String(value?.value))
      if (value?.value === 'new') throw new Error('partial_write_failed')
    })

    await expect(applyImportPlan({
      source: 'app',
      exportedAt: '',
      items: [
        { id: 'partial', label: 'partial', summary: '', snapshot: { version: 1, value: 'new' } },
      ],
    }, [partial])).rejects.toThrow('partial_write_failed')
    expect(writes).toEqual(['new', 'old'])
  })
})
