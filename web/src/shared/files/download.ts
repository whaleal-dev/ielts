export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(filename, new Blob([text], { type }))
}

export function downloadJson(filename: string, value: unknown): void {
  downloadText(filename, JSON.stringify(value, null, 2), 'application/json')
}
