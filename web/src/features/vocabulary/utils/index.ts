/**
 * 通用工具 —— 与 legacy 实现逐字对应（行号见 web/docs 词汇报告）。
 */

/** 词形规范：trim + 小写 + 空白折叠为单空格（lookup / key 规范） */
export function normalizeLexeme(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** JSON 深拷贝 */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** HTML 五实体转义 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 真模（结果 ∈ [0, length)） */
export function mod(value: number, length: number): number {
  return ((value % length) + length) % length
}

/** 索引夹取：非有限/空 → 0；否则 round 后夹 [0, length-1] */
export function clampIndex(index: number, length: number): number {
  if (!length || !Number.isFinite(index)) return 0
  const rounded = Math.round(index)
  return Math.min(Math.max(rounded, 0), length - 1)
}

/** 数值夹取：非有限 → fallback；按 digits 四舍五入后夹 [min, max] */
export function clampNumber(value: number, min: number, max: number, fallback: number, digits = 0): number {
  if (!Number.isFinite(value)) return fallback
  const factor = 10 ** digits
  const scaled = Math.round(value * factor) / factor
  return Math.min(Math.max(scaled, min), max)
}

/** 全库 ISO 一致性总开关：可解析 → toISOString，否则 fallback */
export function normalizeDateString(value: unknown, fallback = ''): string {
  const time = new Date(String(value)).getTime()
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback
}

/** YYYY-MM-DD（本地时区分桶键）；无效 → "" */
export function formatDayKey(value: string | number | Date): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** zh-CN 年月日时分秒 */
export function formatDateTime(value: string | number | Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

/** MM/DD HH:mm；无效 → "待安排" */
export function formatReviewDate(value: unknown): string {
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) return '待安排'
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
}

/** 到期文案：今日到期 / 1 小时内 / N 小时后 / N 天后 */
export function formatReviewDueText(value: unknown): string {
  const dueAt = new Date(String(value)).getTime()
  const now = Date.now()
  if (!Number.isFinite(dueAt)) return ''
  if (dueAt <= now) return '今日到期'
  const diff = dueAt - now
  if (diff <= 60 * 60 * 1000) return '1 小时内'
  if (diff < 24 * 60 * 60 * 1000) return `${Math.ceil(diff / (60 * 60 * 1000))} 小时后`
  return `${Math.ceil(diff / (24 * 60 * 60 * 1000))} 天后`
}

/** Fisher-Yates 洗牌（原数组不变） */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const array = [...items]
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[array[index], array[swapIndex]] = [array[swapIndex], array[index]]
  }
  return array
}

/** 等待 ms；token 过期时立即 resolve(false)（播放引擎竞态防护用） */
export function waitFor(ms: number, token: number, isAlive: (token: number) => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(isAlive(token)), ms)
    void timer
  })
}

/** 大小写不敏感逐段高亮（内容 escapeHtml，无 regex 转义） */
export function highlightText(text: string, query: string): string {
  if (!query) return escapeHtml(text)
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  const out: string[] = []
  let cursor = 0
  while (cursor < text.length) {
    const at = haystack.indexOf(needle, cursor)
    if (at < 0) {
      out.push(escapeHtml(text.slice(cursor)))
      break
    }
    out.push(escapeHtml(text.slice(cursor, at)))
    out.push(`<mark>${escapeHtml(text.slice(at, at + needle.length))}</mark>`)
    cursor = at + needle.length
  }
  return out.join('')
}

/** 复制到剪贴板（navigator.clipboard → textarea + execCommand 兜底） */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
