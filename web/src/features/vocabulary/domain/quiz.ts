/**
 * quiz 选项构造 —— 对应 legacy ensureQuizRound(3526–3552)。
 * 干扰项 = 全词库 key≠当前且 meaning 不同的词释义去重后随机取 3 + 正确释义 = 4。
 */
import { library } from '../data/library'
import { shuffleArray } from '../utils'

export function buildQuizOptions(currentKey: string, currentMeaning: string): string[] {
  const meanings = new Set<string>()
  for (const word of library.allWords) {
    if (word.key === currentKey) continue
    const meaning = String(word.meaning || '').trim()
    if (!meaning || meaning === currentMeaning) continue
    meanings.add(meaning)
  }
  const distractors = shuffleArray([...meanings]).slice(0, 3)
  return shuffleArray([currentMeaning, ...distractors])
}
