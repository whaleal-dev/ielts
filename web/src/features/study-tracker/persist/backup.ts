function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** 同时接受 v4 备份信封与 legacy 裸状态。 */
export function unwrapStudyTrackerBackup(value: unknown): unknown {
  if (!isRecord(value)) return value
  return isRecord(value.state) ? value.state : value
}
