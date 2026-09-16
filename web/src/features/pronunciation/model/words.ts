/** 兼容换行、英文逗号和中文逗号的 legacy 词表格式。 */
export function parseWordList(rawText: string): string[] {
  if (!rawText.trim()) return []
  return rawText
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[,，]+/))
    .map((word) => word.trim())
    .filter(Boolean)
}
