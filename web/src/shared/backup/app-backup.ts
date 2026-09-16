import type {
  AppBackupV1,
  AppImportPlan,
  BackupModuleSnapshot,
  BackupProvider,
  ImportPlanItem,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export async function createAppBackup(
  providers: BackupProvider[],
  appSettings: Record<string, unknown> = {},
): Promise<AppBackupV1> {
  const modules: Record<string, BackupModuleSnapshot> = {}
  for (const provider of providers) {
    const snapshot = await provider.read()
    if (snapshot) modules[provider.id] = provider.normalize(snapshot)
  }
  return {
    app: 'ielts-dev',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appSettings,
    modules,
  }
}

function buildPlanItem(provider: BackupProvider, value: unknown): ImportPlanItem {
  const snapshot = provider.normalize(value)
  return {
    id: provider.id,
    label: provider.label,
    summary: provider.summarize(snapshot),
    snapshot,
  }
}

export function inspectAppBackup(value: unknown, providers: BackupProvider[]): AppImportPlan {
  if (!isRecord(value)) throw new Error('备份内容不是对象。')

  if (value.app === 'ielts-dev') {
    if (value.schemaVersion !== 1) throw new Error(`暂不支持备份版本 ${String(value.schemaVersion)}。`)
    if (!isRecord(value.modules)) throw new Error('备份缺少模块数据。')
    const items: ImportPlanItem[] = []
    for (const provider of providers) {
      if (!(provider.id in value.modules)) continue
      items.push(buildPlanItem(provider, value.modules[provider.id]))
    }
    if (!items.length) throw new Error('备份中没有可恢复的数据。')
    return {
      source: 'app',
      exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
      items,
    }
  }

  const matches = providers.filter((provider) => provider.matchesLegacy?.(value))
  if (matches.length !== 1) throw new Error('无法识别该文件对应的学习模块。')
  const provider = matches[0]
  return {
    source: 'legacy-module',
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    items: [buildPlanItem(provider, value)],
  }
}

export async function applyImportPlan(plan: AppImportPlan, providers: BackupProvider[]): Promise<void> {
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]))
  const previous = new Map<string, BackupModuleSnapshot | null>()
  const applied: string[] = []

  for (const item of plan.items) {
    const provider = providerMap.get(item.id)
    if (!provider) throw new Error(`缺少 ${item.label} 的恢复适配器。`)
    previous.set(item.id, await provider.read())
  }

  try {
    for (const item of plan.items) {
      const provider = providerMap.get(item.id)!
      applied.push(item.id)
      await provider.write(item.snapshot)
    }
  } catch (error) {
    for (const id of applied.reverse()) {
      try {
        await providerMap.get(id)?.write(previous.get(id) ?? null)
      } catch {
        // 回滚失败由上层提示用户保留当前页面并使用导入前备份恢复。
      }
    }
    throw error
  }
}
