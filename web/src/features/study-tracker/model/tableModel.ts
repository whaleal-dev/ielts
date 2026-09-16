/**
 * study-tracker 表格数据模型 —— 与 legacy metrics 嵌套存储兼容。
 * 内存行：{id,date,durationMinutes,metrics:{colId:value},notes:{fieldId:text}}
 * 存储行：metrics 序列化为 {groupId:{项目名:value}} 嵌套。
 */
export interface StudyColumn {
  id: string
  name: string
  groupId: string
  width?: number
  targetValue?: number | null
}

export interface StudyGroup {
  id: string
  name: string
}

export interface NoteField {
  id: string
  name: string
}

export interface StudyRow {
  id: string
  date: string
  durationMinutes: number | null
  metrics: Record<string, string>
  notes: Record<string, string>
}

export function sanitizeMetric(value: unknown): string {
  const text = String(value == null ? '' : value).trim()
  if (!text) return ''
  if (text === '/') return '/'
  if (/^\d+\.$/.test(text)) return text // 草稿值（如 "1."）
  if (/^\d+(?:\.\d)?$/.test(text)) {
    const num = Number(text)
    return Number.isInteger(num) ? String(num) : num.toFixed(1)
  }
  return ''
}

export function isNumericMetric(value: unknown): boolean {
  return /^\d+(?:\.\d)?$/.test(String(value || ''))
}

export function normalizeProjectName(name: string): string {
  return String(name || '').trim()
}

export function groupKeyOf(column: StudyColumn): string {
  return column?.groupId || 'group-ungrouped'
}

export function projectKeyOf(column: StudyColumn): string {
  return normalizeProjectName(column?.name || column?.id || '')
}

export function createEmptyMetrics(columns: StudyColumn[]): Record<string, string> {
  const metrics: Record<string, string> = {}
  for (const column of columns) metrics[column.id] = ''
  return metrics
}

export function createEmptyNotes(fields: NoteField[]): Record<string, string> {
  const notes: Record<string, string> = {}
  for (const field of fields) notes[field.id] = ''
  return notes
}

export function createEmptyRow(columns: StudyColumn[], fields: NoteField[], existingIds: string[]): StudyRow {
  let sequence = existingIds.length + 1
  let id = `row-${Date.now()}-${sequence}`
  while (existingIds.includes(id)) {
    sequence += 1
    id = `row-${Date.now()}-${sequence}`
  }
  return {
    id,
    date: '',
    durationMinutes: null,
    metrics: createEmptyMetrics(columns),
    notes: createEmptyNotes(fields),
  }
}

function findGroupedValue(metrics: Record<string, unknown>, column: StudyColumn): unknown {
  const groupKey = groupKeyOf(column)
  const projectKey = projectKeyOf(column)
  const group = metrics?.[groupKey]
  if (group && typeof group === 'object' && !Array.isArray(group) && Object.prototype.hasOwnProperty.call(group, projectKey)) {
    return (group as Record<string, unknown>)[projectKey]
  }
  return undefined
}

/** 把存储行（兼容三套旧格式）解码为扁平 metrics */
export function deserializeRow(raw: any, columns: StudyColumn[]): StudyRow {
  const metrics = raw && raw.metrics ? raw.metrics : {}
  const nextMetrics: Record<string, string> = {}
  for (const column of columns) {
    const grouped = findGroupedValue(metrics, column)
    let candidate = ''
    if (grouped !== undefined) {
      candidate = String(grouped)
    } else if (Object.prototype.hasOwnProperty.call(metrics, `${groupKeyOf(column)}::${projectKeyOf(column)}`)) {
      candidate = metrics[`${groupKeyOf(column)}::${projectKeyOf(column)}`]
    } else if (Object.prototype.hasOwnProperty.call(metrics, `${groupKeyOf(column)}::${column.id}`)) {
      candidate = metrics[`${groupKeyOf(column)}::${column.id}`]
    } else if (Object.prototype.hasOwnProperty.call(metrics, column.id)) {
      candidate = metrics[column.id]
    }
    nextMetrics[column.id] = sanitizeMetric(candidate)
  }
  const notes: Record<string, string> = {}
  const rawNotes = raw && raw.notes ? raw.notes : {}
  for (const key of Object.keys(rawNotes)) notes[key] = String(rawNotes[key] ?? '')
  const duration = raw?.durationMinutes
  return {
    id: String(raw?.id ?? ''),
    date: String(raw?.date ?? ''),
    durationMinutes: duration === '' || duration === null || duration === undefined ? null : Number(duration) || null,
    metrics: nextMetrics,
    notes,
  }
}

/** 内存行 → 存储行（metrics 嵌套到 group→projectName） */
export function serializeRow(row: StudyRow, columns: StudyColumn[]): any {
  const serialized: Record<string, Record<string, string>> = {}
  for (const column of columns) {
    const groupKey = groupKeyOf(column)
    const projectKey = projectKeyOf(column)
    if (!serialized[groupKey]) serialized[groupKey] = {}
    serialized[groupKey][projectKey] = sanitizeMetric(row.metrics[column.id])
  }
  return {
    id: row.id,
    date: row.date,
    durationMinutes: row.durationMinutes,
    metrics: serialized,
    notes: { ...row.notes },
  }
}

export function serializeRows(rows: StudyRow[], columns: StudyColumn[]): any[] {
  return rows.map((row) => serializeRow(row, columns))
}

/** 同一日期唯一：重复者置空日期；无日期行最多 MAX_EMPTY_DATE_ROWS 条；升序 */
export function normalizeRows(rows: StudyRow[], maxEmptyDateRows = 3): StudyRow[] {
  const seen = new Set<string>()
  const normalized: StudyRow[] = []
  for (const row of rows) {
    if (row.date && seen.has(row.date)) {
      normalized.push({ ...row, date: '' })
    } else {
      if (row.date) seen.add(row.date)
      normalized.push({ ...row })
    }
  }
  normalized.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0))
  const dated = normalized.filter((r) => r.date)
  const undated = normalized.filter((r) => !r.date).slice(0, maxEmptyDateRows)
  return [...dated, ...undated]
}

export function getTodayText(offsetDays = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isPastDate(dateText: string): boolean {
  if (!dateText) return false
  return dateText < getTodayText()
}

/** 行均分：全部数值项目分的算术平均（无数值 → null） */
export function rowAverage(row: StudyRow, columns: StudyColumn[]): number | null {
  const numbers: number[] = []
  for (const column of columns) {
    const value = row.metrics[column.id]
    if (isNumericMetric(value)) numbers.push(Number(value))
  }
  if (!numbers.length) return null
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}

export function rowIncompleteCount(row: StudyRow, columns: StudyColumn[]): number {
  return columns.filter((column) => row.metrics[column.id] === '').length
}
