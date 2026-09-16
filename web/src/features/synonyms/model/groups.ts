export function parseSynonymGroups(fileName: string, content: string): string[][] {
  let groups: string[][]
  if (fileName.toLowerCase().endsWith('.json')) {
    const value: unknown = JSON.parse(content)
    if (!Array.isArray(value) || value.some((group) => !Array.isArray(group))) {
      throw new Error('invalid_synonym_json')
    }
    groups = (value as unknown[][]).map((group) =>
      group.map((word: unknown) => String(word).trim()).filter(Boolean),
    )
  } else {
    groups = content
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.split(/[,，]/).map((word) => word.trim()).filter(Boolean))
  }
  const result = groups.filter((group) => group.length)
  if (!result.length) throw new Error('empty_synonym_groups')
  return result
}
