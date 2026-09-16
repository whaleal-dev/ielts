export interface BackupModuleSnapshot {
  version: number
  [key: string]: unknown
}

export interface AppBackupV1 {
  app: 'ielts-dev'
  schemaVersion: 1
  exportedAt: string
  appSettings: Record<string, unknown>
  modules: Record<string, BackupModuleSnapshot>
}

export interface BackupProvider {
  id: string
  label: string
  read(): Promise<BackupModuleSnapshot | null>
  normalize(value: unknown): BackupModuleSnapshot
  write(value: BackupModuleSnapshot | null): Promise<void>
  summarize(value: BackupModuleSnapshot): string
  matchesLegacy?(value: unknown): boolean
}

export interface ImportPlanItem {
  id: string
  label: string
  summary: string
  snapshot: BackupModuleSnapshot
}

export interface AppImportPlan {
  source: 'app' | 'legacy-module'
  exportedAt: string
  items: ImportPlanItem[]
}
