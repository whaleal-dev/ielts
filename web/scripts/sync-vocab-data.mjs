#!/usr/bin/env node
/**
 * sync-vocab-data.mjs
 *
 * 将仓库数据源（single source of truth）确定性重建为 web 前端词汇模块的数据产物：
 *   words/data/generated/manifests/word_groups_manifest.json + word_groups/*.json
 *     → web/src/data/vocabulary/library.json   （与 legacy study_words.html 的 EMBEDDED_DATA 完全一致：
 *       每个词仅投影 id/word/eng_phonetic/meaning/eng_sound 五个字段）
 *   words/data/source/synonyms/同义词*.json（按 legacy normalize_group 规则清洗）
 *     → web/src/data/vocabulary/synonyms.json
 *   words/data/source/vocabulary/{阅读538,听力179,核心词汇*}.json
 *     → web/src/data/vocabulary/presets.json   { reading, listening, core }
 *
 * 当 legacy 页面仍存在时，会对产物与页面内联数据做深度相等断言：
 * 任一不一致即非零退出，防止重建规则偏离用户实际使用过的数据。
 *
 * 用法：node scripts/sync-vocab-data.mjs   （或 npm run data:vocab）
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = join(SCRIPT_DIR, '..')
const REPO_ROOT = join(WEB_ROOT, '..')
const WORDS_DIR = join(REPO_ROOT, 'legacy', 'words')
const OUT_DIR = join(WEB_ROOT, 'src', 'data', 'vocabulary')
const LEGACY_HTML = join(WORDS_DIR, 'study_words.html')

// 同义词源文件排除：legacy 内联构建（study_words.html 生成时）未包含的合并产物。
// 保留常量以便 legacy 删除后行为仍可预期、可复现。
const SYNONYM_SOURCE_EXCLUDES = new Set(['同义词-179+dp.json'])

// 词库内联投影字段（与 legacy 内联流程一致）
const WORD_FIELDS = ['id', 'word', 'eng_phonetic', 'meaning', 'eng_sound']

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** legacy load_json_array：读纯字符串数组并 strip */
function loadJsonArray(path) {
  const payload = readJson(path)
  if (!Array.isArray(payload)) throw new Error(`${path} 顶层必须是数组`)
  return payload.map((item) => String(item).trim()).filter(Boolean)
}

/** legacy merge_unique_arrays：按出现顺序去重合并 */
function mergeUniqueArrays(paths) {
  const merged = []
  const seen = new Set()
  for (const path of paths) {
    for (const item of loadJsonArray(path)) {
      if (seen.has(item)) continue
      seen.add(item)
      merged.push(item)
    }
  }
  return merged
}

/** legacy normalize_group：清洗单个同义词组（strip / 去重 / 忽略短组） */
function normalizeGroup(rawGroup) {
  const items = Array.isArray(rawGroup)
    ? rawGroup
    : rawGroup?.terms || rawGroup?.items || rawGroup?.words || []
  const seen = new Set()
  const cleaned = []
  for (const item of items) {
    const value = String(item).trim()
    if (!value) continue
    const normalized = value.toLowerCase().split(/\s+/).join(' ')
    if (seen.has(normalized)) continue
    seen.add(normalized)
    cleaned.push(value)
  }
  return cleaned
}

/** 词库：manifest + 分组文件 → EMBEDDED_DATA 同构（词仅投影 5 字段；group 含 id/wordCount） */
function buildLibrary() {
  const manifest = readJson(join(WORDS_DIR, 'data/generated/manifests/word_groups_manifest.json'))
  const chapters = manifest.chapters.map((chapter) => ({
    chapter: chapter.chapter,
    chapterNumber: chapter.chapterNumber,
    groups: chapter.groups.map((meta) => {
      const group = readJson(join(WORDS_DIR, 'data/generated/word_groups', meta.file.split('/').pop()))
      return {
        group: meta.group,
        groupNumber: meta.groupNumber,
        wordCount: meta.wordCount,
        id: meta.file,
        words: group.words.map((w) => {
          const out = {}
          for (const field of WORD_FIELDS) out[field] = w[field]
          return out
        }),
      }
    }),
  }))
  const groups = chapters.flatMap((c) => c.groups)
  const words = groups.flatMap((g) => g.words)
  return {
    chapters,
    totalChapters: manifest.totalChapters,
    totalGroups: manifest.totalGroups,
    totalWords: words.length,
  }
}

/** 同义词：所有源文件按 legacy normalize_group 清洗（排除合并产物） */
function buildSynonyms() {
  const dir = join(WORDS_DIR, 'data/source/synonyms')
  const names = readdirSync(dir)
    .filter((name) => name.startsWith('同义词') && name.endsWith('.json'))
    .filter((name) => !SYNONYM_SOURCE_EXCLUDES.has(name))
    .sort()
  const sources = []
  for (const name of names) {
    const payload = readJson(join(dir, name))
    if (!Array.isArray(payload)) throw new Error(`同义词源 ${name} 顶层必须是数组`)
    const groups = payload.map(normalizeGroup).filter((g) => g.length >= 2)
    sources.push({ source: name, groups, groupCount: groups.length })
  }
  return sources
}

/** 预设词表：reading / listening / core(去重合并 核心词汇*.json) */
function buildPresets() {
  const vocabDir = join(WORDS_DIR, 'data/source/vocabulary')
  const reading = loadJsonArray(join(vocabDir, '阅读538词汇.json'))
  const listening = loadJsonArray(join(vocabDir, '听力179词汇.json'))
  const corePaths = readdirSync(vocabDir)
    .filter((name) => name.startsWith('核心词汇') && name.endsWith('.json'))
    .sort()
    .map((name) => join(vocabDir, name))
  return { reading, listening, core: mergeUniqueArrays(corePaths) }
}

/** 从 legacy HTML 内联脚本中取出 `const NAME = <json>;`（容忍行首缩进） */
function extractLegacyInline(html, name) {
  const prefix = `const ${name} = `
  for (const line of html.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(prefix)) continue
    return JSON.parse(trimmed.slice(prefix.length).replace(/;\s*$/, ''))
  }
  return undefined
}

/** 从 legacy 中取出 `window.LISTENING_WORD_AUDIO_DATA = [...]`（独立 script 块注入） */
function extractLegacyAudioIndex(html) {
  const prefix = 'window.LISTENING_WORD_AUDIO_DATA = '
  for (const line of html.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(prefix)) continue
    return JSON.parse(trimmed.slice(prefix.length).replace(/;\s*$/, ''))
  }
  return undefined
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    )
  }
  if (typeof a === 'object') {
    if (Array.isArray(b) || typeof b !== 'object') return false
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    return (
      keysA.length === keysB.length &&
      keysA.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]))
    )
  }
  return false
}

function hashOf(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16)
}

async function main() {
  const library = buildLibrary()
  const synonyms = buildSynonyms()
  const presets = buildPresets()

  // —— legacy 一致性断言（存在 legacy 页面时强制执行）——
  let legacyParityOk = null
  let corpus = undefined
  if (await exists(LEGACY_HTML)) {
    const html = readFileSync(LEGACY_HTML, 'utf8')
    const checks = [
      ['library', library, 'EMBEDDED_DATA'],
      ['synonyms', synonyms, 'SYNONYM_SOURCE_DATA'],
      ['presets.reading', presets.reading, 'READING_538_DATA'],
      ['presets.listening', presets.listening, 'LISTENING_179_DATA'],
      ['presets.core', presets.core, 'CORE_VOCAB_DATA'],
    ]
    const failures = []
    for (const [label, generated, inlineName] of checks) {
      const inline = extractLegacyInline(html, inlineName)
      if (inline === undefined) {
        console.warn(`[skip] legacy 中未找到 ${inlineName}`)
        continue
      }
      if (!deepEqual(generated, inline)) {
        failures.push(label)
        console.error(`[mismatch] ${label}（重建 ≠ legacy ${inlineName}）`)
      }
    }
    if (failures.length) {
      throw new Error(`与 legacy 内联数据不一致：${failures.join(', ')}`)
    }
    // 听力语料音频索引：直接快照 legacy（其来源为 listening-word 语料 HTML 的
    // CHAPTER_WORD_SETS；待 listening 模块数据层统一后改由其重建）
    corpus = extractLegacyAudioIndex(html)
    legacyParityOk = true
    console.log('[parity] 全部数据产物与 legacy study_words.html 内联一致 ✓')
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const write = (name, value) => {
    const payload = JSON.stringify(value)
    const target = join(OUT_DIR, name)
    writeFileSync(target, payload)
    console.log(`  wrote ${target} (${(payload.length / 1024).toFixed(0)} KB, sha=${hashOf(value)})`)
  }
  write('library.json', library)
  write('synonyms.json', synonyms)
  write('presets.json', presets)
  if (corpus !== undefined) {
    write('corpus.json', corpus)
    console.log('[note] corpus.json 为 legacy 快照，待 listening 数据层接入后改由其重建')
  }
  write('manifest.json', {
    generatedAt: new Date().toISOString(),
    generatedBy: 'web/scripts/sync-vocab-data.mjs',
    legacyParityOk: legacyParityOk,
    counts: {
      chapters: library.totalChapters,
      groups: library.totalGroups,
      words: library.totalWords,
      synonymSources: synonyms.length,
      synonymGroups: synonyms.reduce((n, s) => n + s.groupCount, 0),
      reading: presets.reading.length,
      listening: presets.listening.length,
      core: presets.core.length,
      corpusEntries: corpus?.length ?? 0,
    },
  })
  console.log('done.')
}

await main()
