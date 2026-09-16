/**
 * 数据层与领域层单元测试 —— 验证与 legacy 语义的一致性。
 */
import { describe, expect, it } from 'vitest'

import legacyV4State from '../../../../test-fixtures/legacy/vocabulary-v4-state.json'
import { library, READING_538_LOOKUP, LISTENING_179_LOOKUP, CORE_VOCAB_LOOKUP } from '../data/library'
import { resolveSynonymGroups, canonicalizeSynonymSourceName } from '../data/synonyms'
import { getWordSourceFlags } from '../data/sources'
import { loadCorpus, normalizeCorpusEntry, resolveCorpusMatches, splitTokens } from '../data/corpus'
import { scheduleReview, isDifficultyDue, levelAfterAdjust } from '../domain/review'
import { computeDailySeries, computeCurrentStudyStreak, resolveHeatmapLevel } from '../domain/stats'
import { getSearchResults, hasSearchFilters, getFilteredDifficultWords } from '../domain/search'
import { normalizeStoredDifficultWord, normalizeWordStatEntry, createStoredWordSnapshot } from '../model/snapshot'
import { mergeLoadedState, hydrateState } from '../persist/state-io'

describe('词库数据（library.json）', () => {
  it('章节/分组/词数符合 manifest（22 章 67 组 3632 词）', () => {
    expect(library.totalChapters).toBe(22)
    expect(library.totalGroups).toBe(67)
    expect(library.totalWords).toBe(3632)
    expect(Object.keys(library.groupsById).length).toBe(67)
    expect(library.allWords.length).toBe(3632)
  })

  it('词 key 唯一且形如 groupId::id::word', () => {
    const keys = new Set(library.allWords.map((w) => w.key))
    expect(keys.size).toBe(library.allWords.length)
    const first = library.allWords[0]
    expect(first.key).toContain(first.groupId)
    expect(first.key).toContain(first.word)
  })

  it('每组内 wordIndex 连续且 wordCount 正确', () => {
    const group = library.chapters[0].groups[0]
    expect(group.words.length).toBe(group.wordCount)
    group.words.forEach((w, index) => {
      expect(w.wordIndex).toBe(index)
      expect(w.chapter).toBe(group.chapter)
    })
  })

  it('预设词源集合与 legacy 计数一致', () => {
    expect(READING_538_LOOKUP.size).toBe(538)
    expect(LISTENING_179_LOOKUP.size).toBe(151)
    expect(CORE_VOCAB_LOOKUP.size).toBe(1246)
  })
})

describe('同义词数据', () => {
  it('索引存在且可解析出某词的同义组（garbage）', () => {
    const groups = resolveSynonymGroups('garbage', null)
    expect(groups.length).toBeGreaterThan(0)
    const terms = groups.flatMap((g) => g.terms.map((t) => t.normalized))
    expect(terms).toContain('rubbish')
  })

  it('enabledSources 过滤生效', () => {
    const all = resolveSynonymGroups('garbage', null)
    const names = all.map((g) => g.source)
    const onlyFirst = resolveSynonymGroups('garbage', [names[0]])
    expect(onlyFirst.length).toBe(1)
  })

  it('源名规范化：同义词x.json → 同义词-x.json', () => {
    expect(canonicalizeSynonymSourceName('同义词1.json')).toBe('同义词-1.json')
    expect(canonicalizeSynonymSourceName('同义词-dp1.json')).toBe('同义词-dp1.json')
  })
})

describe('词来源标记', () => {
  it('词库外词无来源标记', () => {
    const flags = getWordSourceFlags({ word: 'unavailablewordxyz' })
    expect(flags.isCore).toBe(false)
    expect(flags.isReading538).toBe(false)
    expect(flags.isListening179).toBe(false)
  })
  it('abandon 命中阅读 538', () => {
    const flags = getWordSourceFlags({ word: 'abandon' })
    expect(flags.isReading538).toBe(true)
  })
})

describe('听力语料（corpus.json 快照）', () => {
  it('懒加载成功且条目结构完整', async () => {
    const entries = await loadCorpus()
    expect(entries.length).toBeGreaterThan(500)
    const item = normalizeCorpusEntry(entries[0])
    expect(item.content).toBeTruthy()
    expect(item.mp3Path.startsWith('http')).toBe(true)
    expect(item.chapterId).toBeTruthy()
  })

  it('词 token 与语料句子 token 相交即命中', async () => {
    const matches = await resolveCorpusMatches('accommodation type', 24)
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.some((m) => m.content.toLowerCase().includes('accommodation'))).toBe(true)
  })

  it('splitTokens 忽略非字母数字', () => {
    const tokens = splitTokens('Tour 2 Test 1（雅思）')
    expect(tokens.has('tour')).toBe(true)
    expect(tokens.has('test')).toBe(true)
    expect(tokens.has('1')).toBe(true)
  })
})

describe('难词复习调度（review）', () => {
  const base = {
    key: 'g::1::word',
    id: '1',
    word: 'word',
    eng_phonetic: '',
    meaning: '',
    eng_sound: '',
    chapter: 'c',
    chapterNumber: 1,
    group: 'g',
    groupId: 'g',
    wordIndex: 0,
    count: 1,
    lastStudiedAt: '',
    mastered: false,
    masteredAt: '',
    note: '',
    addedAt: new Date().toISOString(),
    lastReviewAt: '',
    nextReviewAt: new Date(Date.now() - 1000).toISOString(),
    reviewStage: 0,
    reviewFailures: 0,
    difficultyLevel: 1,
  }

  it('到期判定：nextReviewAt <= now', () => {
    expect(isDifficultyDue(base)).toBe(true)
    expect(isDifficultyDue({ ...base, nextReviewAt: new Date(Date.now() + 100000).toISOString() })).toBe(false)
  })

  it('复习成功推进阶段并使用对应间隔', () => {
    const before = Date.now()
    const result = scheduleReview(base, true, before)
    expect(result.reviewStage).toBe(1)
    // stage 1 → 12h
    const gap = new Date(result.nextReviewAt).getTime() - before
    expect(gap).toBe(12 * 3600 * 1000)
  })

  it('复习失败归零阶段并累计失败次数（立即到期）', () => {
    const result = scheduleReview({ ...base, reviewStage: 3 }, false, Date.now())
    expect(result.reviewStage).toBe(0)
    expect(result.reviewFailures).toBe(1)
    expect(new Date(result.nextReviewAt).getTime() - Date.now()).toBeLessThanOrEqual(1000)
  })

  it('难度上调重置复习，下调不重置', () => {
    expect(levelAfterAdjust(base, 1)).toEqual({ level: 2, remove: false, resetReview: true })
    expect(levelAfterAdjust(base, -1)).toEqual({ level: 0, remove: true, resetReview: false })
  })
})

describe('统计（stats）', () => {
  const now = Date.now()
  const log = [
    { kind: 'study' as const, wordKey: 'a', at: new Date(now).toISOString() },
    { kind: 'study' as const, wordKey: 'b', at: new Date(now - 86400 * 1000).toISOString() },
    { kind: 'mastered' as const, wordKey: 'a', at: new Date(now).toISOString() },
  ]

  it('7 天序列以今天收尾且按 wordKey 去重', () => {
    const series = computeDailySeries(log, 7)
    expect(series.length).toBe(7)
    expect(series[6].learned).toBe(1)
    expect(series[6].mastered).toBe(1)
    expect(series[5].learned).toBe(1)
  })

  it('连击：今天+昨天 = 2（昨天的昨天缺则止于昨天）', () => {
    expect(computeCurrentStudyStreak(log)).toBe(2)
  })

  it('热力图分档', () => {
    expect(resolveHeatmapLevel(0, 10)).toBe(0)
    expect(resolveHeatmapLevel(2, 10)).toBe(1)
    expect(resolveHeatmapLevel(5, 10)).toBe(2)
    expect(resolveHeatmapLevel(7, 10)).toBe(3)
    expect(resolveHeatmapLevel(8, 10)).toBe(4)
    expect(resolveHeatmapLevel(10, 10)).toBe(4)
  })
})

describe('搜索（search）', () => {
  it('空筛选返回空', () => {
    expect(getSearchResults('', 'all', '')).toEqual([])
    expect(hasSearchFilters('', 'all', '')).toBe(false)
  })

  it('关键词命中文义并优先 startsWith', () => {
    const results = getSearchResults('atmosphere', 'all', '')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].word.startsWith('atmosphere')).toBe(true)
  })

  it('音标辅助查询（assist）匹配 eng_phonetic 子串', () => {
    const results = getSearchResults('', 'all', 'ˈætm')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((w) => String(w.eng_phonetic || '').toLowerCase().includes('ˈætm'))).toBe(true)
  })
})

describe('难词筛选（difficult）', () => {
  it('章节过滤与关键词过滤', () => {
    const entries: Record<string, import('../types').DifficultWordEntry> = {}
    const one = normalizeStoredDifficultWord({
      key: 'k1', id: '1', word: 'atmosphere', meaning: '大气', chapter: 'Chapter 1 自然地理', groupId: 'g1', difficultyLevel: 3,
      nextReviewAt: new Date(Date.now() + 1000 * 3600).toISOString(),
    })!
    entries[one.key] = one
    const filtered = getFilteredDifficultWords(entries, { chapter: 'Chapter 1 自然地理', query: '大气', sortMode: 'default' })
    expect(filtered.length).toBe(1)
    const none = getFilteredDifficultWords(entries, { chapter: 'Chapter 9 娱乐运动', query: '', sortMode: 'default' })
    expect(none.length).toBe(0)
  })
})

describe('快照归一化（snapshot）', () => {
  it('从词对象构造词快照并推导 key', () => {
    const snapshot = createStoredWordSnapshot({ word: 'hello', groupId: 'g', id: '7' })
    expect(snapshot.key).toBe('g::7::hello')
  })

  it('normalizeWordStatEntry 保证字段类型', () => {
    const stat = normalizeWordStatEntry({ key: 'x', count: -3, mastered: true, lastStudiedAt: 'invalid' }, 'x')
    expect(stat.count).toBe(0)
    expect(stat.mastered).toBe(true)
    expect(stat.lastStudiedAt).toBe('')
  })

  it('normalizeStoredDifficultWord 补缺省（level 默认 1、立即到期）', () => {
    const entry = normalizeStoredDifficultWord({ key: 'x', word: 'x', groupId: 'g', id: '1' })
    expect(entry?.difficultyLevel).toBe(1)
    expect(entry?.reviewStage).toBe(0)
    expect(entry?.nextReviewAt).toBeTruthy()
  })
})

describe('状态合并与水合（state-io）', () => {
  it('空装载 → 默认状态，水合后落到第一章节第一组（首启兼容）', () => {
    const state = hydrateState(mergeLoadedState(undefined))
    expect(state.settings.playbackRate).toBe(1)
    expect(state.practice.mode).toBe('standard')
    expect(state.activeTab).toBe('study')
    expect(state.selectedGroupId).toBeTruthy()
    expect(state.selectedLibraryChapter).toBe(library.chapters[0].chapter)
    expect(library.groupsById[state.selectedGroupId]).toBeDefined()
  })

  it('旧状态合并：越界设置被夹取、非法枚举回落、autoRunning 归 false', () => {
    const state = hydrateState(mergeLoadedState(legacyV4State))
    expect(state.settings.playbackRate).toBe(2)
    expect(state.settings.intervalSeconds).toBe(0)
    expect(state.settings.repeatCount).toBe(1)
    expect(state.settings.muted).toBe(false)
    expect(state.practice.mode).toBe('standard')
    expect(state.practice.autoRunning).toBe(false)
    expect(state.practice.quiz.options).toEqual([])
    expect(state.activeTab).toBe('study')
    expect(state.difficultySortMode).toBe('default')
    expect(state.studyLog).toEqual([])
    expect(state.wordNotes.k1).toBe('note')
    expect(state.wordNotes.k2).toBeUndefined()
  })
})
