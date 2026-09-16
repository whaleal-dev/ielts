/**
 * 状态装载/水合/保存 —— 对应 legacy loadStateAsync(3109)、mergeLoadedState(3065)、
 * hydrateState(3132)、saveStateToLocalStorage(5813)、readLocalStorageState(3092)。
 */
import { STORAGE_KEY } from '../constants'
import { readLocalStorageValue, writeLocalStorageValue } from '@/shared/storage/chunked-local-storage'
import { availableSynonymSourceNames, canonicalizeSynonymSourceName } from '../data/synonyms'
import { library } from '../data/library'
import { createDefaultState } from './defaults'
import { idbGet, idbSet } from './idb'
import { normalizeWordStatEntry, normalizeStoredDifficultWord } from '../model/snapshot'
import { rebuildMasteryStudyLog, buildStudyLogBootstrap } from '../model/studyLog'
import { clone, isPlainObject, clampNumber } from '../utils'
import type {
  VocabState,
  ActiveTab,
  PracticeMode,
  DifficultySortMode,
  StudyLogEntry,
} from '../types'
import { ACTIVE_TABS, PRACTICE_MODES, DIFFICULTY_SORT_MODES } from '../constants'

export type SaveTarget = 'idb' | 'local'

interface SaveCallbacks {
  onSaved?: () => void
  onError?: (error: unknown) => void
}

/** localStorage 直读（isPlainObject 校验） */
export function readLocalStorageState(): VocabState | null {
  try {
    const raw = readLocalStorageValue(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isPlainObject(parsed) ? (parsed as unknown as VocabState) : null
  } catch {
    return null
  }
}

/** 把 parsed（未知/旧结构）与 DEFAULT_STATE 深度缺省合并，只保类型 */
export function mergeLoadedState(parsed: unknown): VocabState {
  const base = createDefaultState()
  if (!isPlainObject(parsed)) return base
  const src = parsed as Partial<VocabState>
  const result: VocabState = { ...base, ...src }
  const plain = (value: unknown) => (isPlainObject(value) ? value : undefined)
  const stringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined
  result.wordNotes = plain(src.wordNotes) ? { ...(src.wordNotes as Record<string, string>) } : {}
  result.progressByGroup = plain(src.progressByGroup) ? { ...(src.progressByGroup as VocabState['progressByGroup']) } : {}
  result.wordStats = plain(src.wordStats) ? { ...(src.wordStats as VocabState['wordStats']) } : {}
  result.difficultWords = plain(src.difficultWords) ? { ...(src.difficultWords as VocabState['difficultWords']) } : {}
  result.studyLog = Array.isArray(src.studyLog) ? [...(src.studyLog as StudyLogEntry[])] : []
  result.backup = { ...base.backup, ...(plain(src.backup) ?? {}) }
  result.settings = { ...base.settings, ...(plain(src.settings) ?? {}) }
  result.practice = { ...base.practice, ...(plain(src.practice) ?? {}) }
  result.practice.quiz = { ...base.practice.quiz, ...(plain(src.practice?.quiz) ?? {}) }
  result.selectedDifficultKeys = stringArray(src.selectedDifficultKeys) ?? []
  return result
}

function normalizeEnabledSynonymSources(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const canonical = canonicalizeSynonymSourceName(raw)
    if (!availableSynonymSourceNames.includes(canonical) || seen.has(canonical)) continue
    seen.add(canonical)
    result.push(canonical)
  }
  return result
}

/** 值域归一 + 结构规整（含首启修正选中组） */
export function hydrateState(state: VocabState): VocabState {
  const settings = state.settings
  settings.playbackRate = clampNumber(Number(settings.playbackRate), 0.6, 2, 1, 1)
  settings.intervalSeconds = clampNumber(Number(settings.intervalSeconds), 0, 5, 1, 0)
  settings.repeatCount = clampNumber(Number(settings.repeatCount), 1, 5, 1, 0)
  settings.showSynonym = settings.showSynonym !== false
  settings.showListeningCorpus = settings.showListeningCorpus !== false
  settings.muted = settings.muted === true
  settings.enabledSynonymSources = normalizeEnabledSynonymSources(settings.enabledSynonymSources)

  const practice = state.practice
  practice.showWord = practice.showWord !== false
  practice.showMeaning = practice.showMeaning !== false
  practice.autoRunning = false
  if (!PRACTICE_MODES.includes(practice.mode as PracticeMode)) practice.mode = 'standard'
  practice.quiz = {
    options: Array.isArray(practice.quiz?.options) ? practice.quiz.options.filter((o) => typeof o === 'string') : [],
    selectedMeaning: typeof practice.quiz?.selectedMeaning === 'string' ? practice.quiz.selectedMeaning : '',
    answered: practice.quiz?.answered === true,
    correct: practice.quiz?.correct === true,
  }

  if (!ACTIVE_TABS.includes(state.activeTab as ActiveTab)) state.activeTab = 'study'
  if (!DIFFICULTY_SORT_MODES.includes(state.difficultySortMode as DifficultySortMode)) state.difficultySortMode = 'default'
  state.difficultyVisibleCount = Math.max(24, Math.round(Number(state.difficultyVisibleCount) || 24))

  // wordNotes
  const wordNotes: Record<string, string> = {}
  for (const key of Object.keys(state.wordNotes)) {
    if (typeof state.wordNotes[key] === 'string' && state.wordNotes[key].trim()) wordNotes[key] = state.wordNotes[key]
  }
  state.wordNotes = wordNotes

  // wordStats
  const wordStats: VocabState['wordStats'] = {}
  for (const key of Object.keys(state.wordStats)) {
    const stat = normalizeWordStatEntry(state.wordStats[key], key)
    if (stat.key) wordStats[stat.key] = stat
  }
  state.wordStats = wordStats

  // difficultWords
  const difficultWords: VocabState['difficultWords'] = {}
  for (const key of Object.keys(state.difficultWords)) {
    const entry = normalizeStoredDifficultWord(state.difficultWords[key])
    if (entry?.key) difficultWords[entry.key] = entry
  }
  state.difficultWords = difficultWords

  // studyLog：剔除非法项与 mastered 事件，再从 wordStats 重建 mastered
  let studyLog: StudyLogEntry[] = []
  for (const entry of state.studyLog) {
    if (!entry || typeof entry !== 'object') continue
    if (typeof entry.kind !== 'string' || typeof entry.at !== 'string') continue
    if (entry.kind === 'mastered') continue
    if (entry.kind !== 'study' && entry.kind !== 'review') continue
    studyLog.push({ kind: entry.kind, wordKey: entry.wordKey, at: entry.at, success: entry.success })
  }
  studyLog = rebuildMasteryStudyLog(studyLog, wordStats)
  if (!studyLog.length && Object.keys(wordStats).length) {
    studyLog = buildStudyLogBootstrap(wordStats, difficultWords)
  }
  state.studyLog = studyLog

  // selectedDifficultKeys 只保留存在于 difficultWords 的键
  state.selectedDifficultKeys = state.selectedDifficultKeys.filter(
    (key) => typeof key === 'string' && Boolean(difficultWords[key]),
  )

  // 首启/失效修正：selectedLibraryChapter 与 selectedGroupId 必须合法
  const groups = library.chapters.flatMap((c) => c.groups)
  const firstGroup = groups[0]
  const knownGroup = state.selectedGroupId ? library.groupsById[state.selectedGroupId] : undefined
  if (knownGroup) {
    state.selectedLibraryChapter = knownGroup.chapter
  } else if (firstGroup) {
    state.selectedGroupId = firstGroup.id
    state.selectedLibraryChapter = firstGroup.chapter
  } else {
    state.selectedGroupId = ''
    state.selectedLibraryChapter = ''
  }
  return state
}

/** 异步装载：IDB → localStorage 迁移 → mergeLoadedState → hydrateState */
export async function loadStateAsync(): Promise<{ state: VocabState; idbAvailable: boolean }> {
  let idbAvailable = true
  try {
    const stored = await idbGet<unknown>(STORAGE_KEY)
    if (stored === undefined) {
      const legacy = readLocalStorageState()
      if (legacy) {
        await idbSet(STORAGE_KEY, legacy)
      }
      return { state: hydrateState(mergeLoadedState(legacy ?? undefined)), idbAvailable }
    }
    return { state: hydrateState(mergeLoadedState(stored)), idbAvailable }
  } catch (error) {
    console.warn('idb_unavailable_fallback_localstorage', error)
    idbAvailable = false
    const legacy = readLocalStorageState()
    return { state: hydrateState(mergeLoadedState(legacy ?? undefined)), idbAvailable }
  }
}

/** 保存：优先 IDB；idb 不可用降级 localStorage */
export async function saveStateToBackend(
  state: VocabState,
  idbAvailable: boolean,
  flash: boolean,
  callbacks: SaveCallbacks = {},
): Promise<void> {
  if (idbAvailable) {
    try {
      await idbSet(STORAGE_KEY, clone(state))
      if (flash) callbacks.onSaved?.()
    } catch (error) {
      console.error('save_state_idb_failed', error)
      callbacks.onError?.(error)
    }
    return
  }
  if (saveStateToLocalStorage(state)) {
    if (flash) callbacks.onSaved?.()
  } else {
    callbacks.onError?.(new Error('local_storage_write_failed'))
  }
}

export function saveStateToLocalStorage(state: VocabState): boolean {
  return writeLocalStorageValue(STORAGE_KEY, JSON.stringify(state)).ok
}
