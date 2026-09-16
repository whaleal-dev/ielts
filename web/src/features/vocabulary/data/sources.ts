/**
 * 词来源标记 —— 对应 legacy getWordSourceFlags(5916–5930)、buildWordSourceLabels(5932–5945)。
 */
import { CORE_VOCAB_LOOKUP, LISTENING_179_LOOKUP, READING_538_LOOKUP } from './library'
import type { WordSourceFlags } from '../types'
import { normalizeLexeme } from '../utils'

export function getWordSourceFlags(word: { word?: string }): WordSourceFlags {
  const lexeme = normalizeLexeme(word?.word)
  return {
    isCore: CORE_VOCAB_LOOKUP.has(lexeme),
    isReading538: READING_538_LOOKUP.has(lexeme),
    isListening179: LISTENING_179_LOOKUP.has(lexeme),
  }
}

export function buildWordSourceLabels(flags: WordSourceFlags): string[] {
  const labels: string[] = []
  if (flags.isCore) labels.push('核心词汇')
  if (flags.isReading538) labels.push('阅读538词汇')
  if (flags.isListening179) labels.push('听力179词汇')
  return labels
}
