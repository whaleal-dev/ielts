const MANIFEST_MARKER = 'ielts-chunked-local-storage'
const MANIFEST_VERSION = 1
export const DEFAULT_LOCAL_STORAGE_CHUNK_SIZE = 200_000

export interface StorageLike {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

interface ChunkManifest {
  marker: typeof MANIFEST_MARKER
  version: typeof MANIFEST_VERSION
  generation: string
  count: number
  length: number
}

export interface LocalStorageWriteResult {
  ok: boolean
  chunkCount: number
  error?: unknown
}

let generationCounter = 0

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function parseManifest(raw: string | null): ChunkManifest | null {
  if (!raw || raw[0] !== '{') return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return null
    const manifest = value as Partial<ChunkManifest>
    if (
      manifest.marker !== MANIFEST_MARKER ||
      manifest.version !== MANIFEST_VERSION ||
      typeof manifest.generation !== 'string' ||
      !Number.isInteger(manifest.count) ||
      Number(manifest.count) < 1 ||
      !Number.isInteger(manifest.length) ||
      Number(manifest.length) < 0
    ) {
      return null
    }
    return manifest as ChunkManifest
  } catch {
    return null
  }
}

function chunkKey(key: string, generation: string, index: number): string {
  return `${key}.__chunk__.${generation}.${index}`
}

function removeManifestChunks(storage: StorageLike, key: string, manifest: ChunkManifest | null): void {
  if (!manifest) return
  for (let index = 0; index < manifest.count; index += 1) {
    try {
      storage.removeItem(chunkKey(key, manifest.generation, index))
    } catch {
      // 清理失败不影响当前主记录可读性，下次覆盖时可继续清理。
    }
  }
}

export function readLocalStorageValue(key: string, storage?: StorageLike): string | null {
  const target = resolveStorage(storage)
  if (!target) return null
  try {
    const raw = target.getItem(key)
    const manifest = parseManifest(raw)
    if (!manifest) return raw
    const chunks: string[] = []
    for (let index = 0; index < manifest.count; index += 1) {
      const chunk = target.getItem(chunkKey(key, manifest.generation, index))
      if (chunk === null) return null
      chunks.push(chunk)
    }
    const value = chunks.join('')
    return value.length === manifest.length ? value : null
  } catch {
    return null
  }
}

export function writeLocalStorageValue(
  key: string,
  value: string,
  options: { chunkSize?: number; storage?: StorageLike } = {},
): LocalStorageWriteResult {
  const target = resolveStorage(options.storage)
  if (!target) return { ok: false, chunkCount: 0, error: new Error('local_storage_unavailable') }

  let previousRaw: string | null = null
  try {
    previousRaw = target.getItem(key)
  } catch (error) {
    return { ok: false, chunkCount: 0, error }
  }
  const previousManifest = parseManifest(previousRaw)
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_LOCAL_STORAGE_CHUNK_SIZE))

  if (value.length <= chunkSize) {
    try {
      target.setItem(key, value)
      removeManifestChunks(target, key, previousManifest)
      return { ok: true, chunkCount: 1 }
    } catch (error) {
      return { ok: false, chunkCount: 0, error }
    }
  }

  generationCounter += 1
  const generation = `${Date.now().toString(36)}-${generationCounter.toString(36)}`
  const chunks: string[] = []
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(value.slice(offset, offset + chunkSize))
  }

  let writtenChunks = 0
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      target.setItem(chunkKey(key, generation, index), chunks[index])
      writtenChunks += 1
    }
    const manifest: ChunkManifest = {
      marker: MANIFEST_MARKER,
      version: MANIFEST_VERSION,
      generation,
      count: chunks.length,
      length: value.length,
    }
    target.setItem(key, JSON.stringify(manifest))
    removeManifestChunks(target, key, previousManifest)
    return { ok: true, chunkCount: chunks.length }
  } catch (error) {
    for (let index = 0; index < writtenChunks; index += 1) {
      try {
        target.removeItem(chunkKey(key, generation, index))
      } catch {
        // 保留原主记录；无法清理的临时分块不会被读取。
      }
    }
    return { ok: false, chunkCount: writtenChunks, error }
  }
}

export function removeLocalStorageValue(key: string, storage?: StorageLike): boolean {
  const target = resolveStorage(storage)
  if (!target) return false
  try {
    const manifest = parseManifest(target.getItem(key))
    removeManifestChunks(target, key, manifest)
    target.removeItem(key)
    return true
  } catch {
    return false
  }
}
