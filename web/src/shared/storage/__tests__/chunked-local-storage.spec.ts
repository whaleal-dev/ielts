import { describe, expect, it } from 'vitest'

import {
  readLocalStorageValue,
  removeLocalStorageValue,
  type StorageLike,
  writeLocalStorageValue,
} from '../chunked-local-storage'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  failWhen: ((key: string) => boolean) | null = null

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    if (this.failWhen?.(key)) throw new Error('quota')
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

describe('chunked localStorage', () => {
  it('兼容读取旧版未分块值', () => {
    const storage = new MemoryStorage()
    storage.setItem('state', '{"version":4}')
    expect(readLocalStorageValue('state', storage)).toBe('{"version":4}')
  })

  it('大记录分块写入后可无损重组', () => {
    const storage = new MemoryStorage()
    const value = 'abcdef'.repeat(10)
    const result = writeLocalStorageValue('state', value, { storage, chunkSize: 11 })

    expect(result).toMatchObject({ ok: true, chunkCount: 6 })
    expect(storage.getItem('state')).toContain('ielts-chunked-local-storage')
    expect(readLocalStorageValue('state', storage)).toBe(value)
  })

  it('覆盖为短记录时清理旧分块', () => {
    const storage = new MemoryStorage()
    writeLocalStorageValue('state', 'x'.repeat(30), { storage, chunkSize: 10 })
    expect([...storage.values.keys()].filter((key) => key.includes('.__chunk__.'))).toHaveLength(3)

    expect(writeLocalStorageValue('state', 'short', { storage, chunkSize: 10 }).ok).toBe(true)
    expect(readLocalStorageValue('state', storage)).toBe('short')
    expect([...storage.values.keys()].filter((key) => key.includes('.__chunk__.'))).toHaveLength(0)
  })

  it('新分块写入失败时保留原记录并回收临时块', () => {
    const storage = new MemoryStorage()
    storage.setItem('state', 'previous')
    let chunkWrites = 0
    storage.failWhen = (key) => {
      if (!key.includes('.__chunk__.')) return false
      chunkWrites += 1
      return chunkWrites === 2
    }

    const result = writeLocalStorageValue('state', 'x'.repeat(30), { storage, chunkSize: 10 })

    expect(result.ok).toBe(false)
    expect(readLocalStorageValue('state', storage)).toBe('previous')
    expect([...storage.values.keys()].filter((key) => key.includes('.__chunk__.'))).toHaveLength(0)
  })

  it('分块缺失时安全返回 null', () => {
    const storage = new MemoryStorage()
    writeLocalStorageValue('state', 'x'.repeat(30), { storage, chunkSize: 10 })
    const chunkKey = [...storage.values.keys()].find((key) => key.includes('.__chunk__.'))
    expect(chunkKey).toBeTruthy()
    storage.removeItem(chunkKey!)
    expect(readLocalStorageValue('state', storage)).toBeNull()
  })

  it('删除主记录时同时删除全部分块', () => {
    const storage = new MemoryStorage()
    writeLocalStorageValue('state', 'x'.repeat(30), { storage, chunkSize: 10 })
    expect(removeLocalStorageValue('state', storage)).toBe(true)
    expect(storage.values.size).toBe(0)
  })
})
