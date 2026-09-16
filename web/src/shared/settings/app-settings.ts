import { readLocalStorageValue, writeLocalStorageValue } from '@/shared/storage/chunked-local-storage'

export const APP_SETTINGS_KEY = 'ielts-dev-app-settings-v1'

export interface AppSettings {
  lastBackupAt: string
  lastImportAt: string
}

const DEFAULT_SETTINGS: AppSettings = {
  lastBackupAt: '',
  lastImportAt: '',
}

export function readAppSettings(): AppSettings {
  try {
    const raw = readLocalStorageValue(APP_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const value = JSON.parse(raw) as Partial<AppSettings>
    return {
      lastBackupAt: typeof value.lastBackupAt === 'string' ? value.lastBackupAt : '',
      lastImportAt: typeof value.lastImportAt === 'string' ? value.lastImportAt : '',
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeAppSettings(value: AppSettings): void {
  const result = writeLocalStorageValue(APP_SETTINGS_KEY, JSON.stringify(value))
  if (!result.ok) throw new Error('app_settings_write_failed')
}

export function updateAppSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...readAppSettings(), ...patch }
  writeAppSettings(next)
  return next
}
