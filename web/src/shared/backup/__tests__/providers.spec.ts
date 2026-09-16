import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  idbDelete: vi.fn(async () => undefined),
  idbGet: vi.fn(async () => undefined),
  idbSet: vi.fn(async () => undefined),
  readLocalStorageState: vi.fn(() => null),
  removeLocalStorageValue: vi.fn(() => true),
  saveStateToLocalStorage: vi.fn(() => true),
}))

vi.mock('@/features/vocabulary/persist/idb', () => ({
  idbDelete: mocks.idbDelete,
  idbGet: mocks.idbGet,
  idbSet: mocks.idbSet,
}))

vi.mock('@/features/vocabulary/persist/state-io', () => ({
  hydrateState: (value: unknown) => value,
  mergeLoadedState: (value: unknown) => value,
  readLocalStorageState: mocks.readLocalStorageState,
  saveStateToLocalStorage: mocks.saveStateToLocalStorage,
}))

vi.mock('@/shared/storage/chunked-local-storage', () => ({
  readLocalStorageValue: vi.fn(() => null),
  removeLocalStorageValue: mocks.removeLocalStorageValue,
  writeLocalStorageValue: vi.fn(() => ({ ok: true, chunkCount: 1 })),
}))

import { backupProviders } from '../providers'

const vocabularyProvider = backupProviders.find((provider) => provider.id === 'vocabulary')!
const snapshot = {
  version: 4,
  app: 'apple-word-trainer-v4',
  state: { wordStats: {}, difficultWords: {} },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.removeLocalStorageValue.mockReturnValue(true)
  mocks.saveStateToLocalStorage.mockReturnValue(true)
})

describe('vocabulary backup provider', () => {
  it('IndexedDB 写入成功后清理旧 localStorage 降级副本', async () => {
    await vocabularyProvider.write(snapshot)

    expect(mocks.idbSet).toHaveBeenCalledOnce()
    expect(mocks.removeLocalStorageValue).toHaveBeenCalledWith('apple-word-trainer-v4')
    expect(mocks.saveStateToLocalStorage).not.toHaveBeenCalled()
  })

  it('无法清理旧副本时用相同导入状态覆盖 localStorage', async () => {
    mocks.removeLocalStorageValue.mockReturnValue(false)

    await vocabularyProvider.write(snapshot)

    expect(mocks.idbSet).toHaveBeenCalledOnce()
    expect(mocks.saveStateToLocalStorage).toHaveBeenCalledWith(snapshot.state)
  })

  it('恢复为空快照时同时清理 IndexedDB 与 localStorage', async () => {
    await vocabularyProvider.write(null)

    expect(mocks.idbDelete).toHaveBeenCalledWith('apple-word-trainer-v4')
    expect(mocks.removeLocalStorageValue).toHaveBeenCalledWith('apple-word-trainer-v4')
  })
})
