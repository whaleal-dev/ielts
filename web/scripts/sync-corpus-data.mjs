#!/usr/bin/env node
/**
 * sync-corpus-data.mjs —— 语料库听写模块数据同步。
 *
 * 从 legacy listening-word/王璐语料库_源码.html 中抽取：
 *   const CHAPTER_WORD_SETS = { "31": {title, words:[...]}, ... }
 * 并写入 web/src/data/corpus/chapters.json（章节 → 词形表）。
 * 说明：legacy 移除后，应由 listening 模块数据层（word.json 等）重建该产物。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SCRIPT_DIR, '..', '..')
const LEGACY_HTML = join(REPO_ROOT, 'legacy', 'listening-word', '王璐语料库_源码.html')
const OUT_DIR = join(REPO_ROOT, 'web', 'src', 'data', 'corpus')
const OUT_FILE = join(OUT_DIR, 'chapters.json')

function extractSets() {
  const lines = readFileSync(LEGACY_HTML, 'utf8').split('\n')
  const startIndex = lines.findIndex((l) => l.startsWith('const CHAPTER_WORD_SETS'))
  if (startIndex === -1) throw new Error('未找到 CHAPTER_WORD_SETS')
  const buf = lines.slice(startIndex).join('\n')
  const brace = buf.indexOf('{')
  let depth = 0
  let cursor = brace
  for (; cursor < buf.length; cursor += 1) {
    if (buf[cursor] === '{') depth += 1
    else if (buf[cursor] === '}') {
      depth -= 1
      if (depth === 0) {
        cursor += 1
        break
      }
    }
  }
  return JSON.parse(buf.slice(brace, cursor))
}

function main() {
  const sets = extractSets()
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_FILE, JSON.stringify(sets))
  const chapterKeys = Object.keys(sets)
  const totalWords = chapterKeys.reduce((sum, id) => sum + (sets[id]?.words?.length ?? 0), 0)
  console.log(`wrote ${OUT_FILE}`)
  console.log(`chapters=${chapterKeys.length} words=${totalWords}`)
}

main()
