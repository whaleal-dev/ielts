<script setup lang="ts">
/**
 * 语料库雅思单词听写（corpus-dictation）—— 忠实还原 王璐语料库_源码.html 核心。
 * 本轮：练习 Tab（听写/听音引擎 + 待练/已掌握/本轮错词）+ 精简错词本/章节统计。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'

import { downloadText } from '@/shared/files/download'
import {
  appendLearningEvent,
  createLearningEventId,
  type LearningEvent,
} from '@/shared/learning-events/events'

import './styles/legacy-full.css'
import '@/styles/editorial-modules.css'
import { chapterEntries, resolveWordMeta, matchAnyChapter, buildAudioUrl } from './data/corpus'
import {
  useCorpusStore,
  entryKey,
} from './stores/corpus'

type TabKey = 'practice' | 'mistakes' | 'stats'
type PracticeMode = 'dictation' | 'listen'

interface PracticeEntry {
  id: string
  word: string
  meta: { chapterId: string; chapterTitle: string; audioUrl: string }
}

const store = useCorpusStore()

/* ---------- 配置 ---------- */
const activeTab = ref<TabKey>('practice')
const chapterSelect = ref('')
const wordInput = ref('')
const settings = computed(() => store.settings)
const chapterOptions = computed(() => chapterEntries.map((c) => ({ id: c.id, title: c.title })))

const mode = computed<PracticeMode>(() => settings.value.mode)
const isListen = computed(() => mode.value === 'listen')
const intervalMs = computed(() => settings.value.intervalSeconds * 1000)
const autoAdvance = computed(() => settings.value.intervalSeconds > 0)

/* ---------- 会话状态 ---------- */
const entries = ref<PracticeEntry[]>([])
const pending = ref<string[]>([])
const mastered = ref<string[]>([])
const roundMistakes = ref<PracticeEntry[]>([])
const currentWord = ref('')
const currentMeta = ref<PracticeEntry['meta'] | null>(null)
const sessionStarted = ref(false)
const isFinished = ref(false)
const isPaused = ref(false)
const waitingForAnswer = ref(false)
const currentResolved = ref(false)
const fullChapterPractice = ref(false)
const bigLoopIndex = ref(0)
const bigLoopCount = ref(1)
const repeatIndex = ref(0)
const showWords = ref(true)

const promptText = ref('点击“开始练习”后开始播放。')
const promptHint = ref('为了避免直接看到答案，右侧单词列表默认模糊显示，可手动切换。')
const feedbackText = ref('')
const feedbackType = ref<'success' | 'error' | 'warning' | ''>('')
const progressChip = ref('未开始')
const summaryStatus = ref('当前没有练习记录。')
const cacheStatus = ref('等待载入单词。')
const answerInput = ref('')

const pendingEntries = computed<PracticeEntry[]>(() =>
  pending.value
    .map((id) => entries.value.find((e) => e.id === id))
    .filter((e): e is PracticeEntry => Boolean(e)),
)

const currentWordIndex = computed(() =>
  entries.value.length ? entries.value.length - pending.value.length + 1 : 0,
)

let timerHandle: ReturnType<typeof setTimeout> | null = null
let learningSessionId = ''
let learningSessionStartedAt = 0

/* ---------- 解析与建条目 ---------- */
function parseWords(raw: string): string[] {
  const words: string[] = []
  for (const part of raw.split(/\r?\n|[,，]/)) {
    const trimmed = part.trim()
    if (trimmed) words.push(trimmed)
  }
  return words
}

function buildEntries(selectedChapter: string): { entries: PracticeEntry[]; removed: string[] } {
  const words = parseWords(wordInput.value || '')
  const resolved: PracticeEntry[] = []
  const removed: string[] = []
  const seen = new Set<string>()
  const list: string[] = []
  for (const w of words) {
    const key = w.trim().toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      list.push(w)
    }
  }
  for (const w of list) {
    let meta = selectedChapter ? resolveWordMeta(w, selectedChapter) : null
    if (!meta && !selectedChapter) {
      const matched = matchAnyChapter(w)
      if (matched) {
        meta = { ...matched, word: w, audioUrl: buildAudioUrl(matched.chapterId, w) }
      }
    }
    if (!meta) {
      removed.push(w)
      continue
    }
    resolved.push({
      id: `${meta.chapterId}::${w}::${entries.value.length + resolved.length}`,
      word: w,
      meta,
    })
  }
  return { entries: resolved, removed }
}

function fillChapter() {
  const chapter = chapterOptions.value.find((c) => c.id === chapterSelect.value)
  if (!chapter) return
  wordInput.value = chapterEntries.find((c) => c.id === chapter.id)?.words.join('\n') ?? ''
  fullChapterPractice.value = true
}

/* ---------- 音频 ---------- */
const audio = new Audio()
audio.preload = 'auto'
audio.addEventListener('ended', onAudioEnded)

async function playCurrentWord() {
  const entry = entries.value.find((e) => e.id === currentWord.value)
  if (!entry) return
  try {
    audio.src = entry.meta.audioUrl
    audio.playbackRate = entry.word.includes(' ') ? settings.value.phraseSpeed : settings.value.speed
    audio.currentTime = 0
    await audio.play()
  } catch {
    setFeedback(`音频播放失败：${entry.word}`, 'error')
  }
}

function onAudioEnded() {
  if (isPaused.value || isFinished.value) return
  if (isListen.value) {
    const repeat = Math.max(1, settings.value.listenRepeat)
    if (repeatIndex.value < repeat - 1) {
      repeatIndex.value += 1
      void playCurrentWord()
      return
    }
    repeatIndex.value = 0
  }
  if (!autoAdvance.value) {
    cacheStatus.value = currentResolved.value ? '当前题已完成，等待手动进入下一题。' : '音频已结束。当前间隔为 0，不会自动跳转下一题。'
    return
  }
  scheduleNext()
}

function scheduleNext() {
  clearTimer()
  if (isPaused.value || isFinished.value || !currentWord.value) return
  const scheduled = currentWord.value
  timerHandle = setTimeout(() => {
    if (isPaused.value || isFinished.value || currentWord.value !== scheduled) return
    if (isListen.value) {
      pending.value.shift()
      void moveToNextWord()
      return
    }
    if (!currentResolved.value) {
      finishAsMistake(answerInput.value.trim().toLowerCase() || '未作答', `超时，正确答案是 ${getCurrentWordText()}`)
    }
    void moveToNextWord()
  }, intervalMs.value)
}

function getCurrentWordText(): string {
  return entries.value.find((e) => e.id === currentWord.value)?.word ?? ''
}

/* ---------- 推进 ---------- */
async function moveToNextWord() {
  clearTimer()
  if (!pending.value.length) {
    // 听音大循环
    if (isListen.value && bigLoopIndex.value < bigLoopCount.value - 1 && entries.value.length) {
      bigLoopIndex.value += 1
      if (settings.value.order === 'random') {
        entries.value = shuffle(entries.value)
      }
      pending.value = entries.value.map((e) => e.id)
      cacheStatus.value = `已完成第 ${bigLoopIndex.value} / ${bigLoopCount.value} 轮大循环，开始下一轮。`
      await moveToNextWord()
      return
    }
    finishSession()
    return
  }
  currentWord.value = pending.value[0]
  currentMeta.value = entries.value.find((e) => e.id === currentWord.value)?.meta ?? null
  waitingForAnswer.value = !isListen.value
  sessionStarted.value = true
  isFinished.value = false
  isPaused.value = false
  currentResolved.value = isListen.value
  repeatIndex.value = 0
  answerInput.value = ''
  progressChip.value = `第 ${currentWordIndex.value} / ${entries.value.length} 词`
  promptText.value = ''
  await nextTick()
  void playCurrentWord()
}

function finishSession() {
  const completedAt = new Date().toISOString()
  const total = isListen.value ? entries.value.length : mastered.value.length + roundMistakes.value.length + pending.value.length
  const correct = isListen.value ? 0 : mastered.value.length
  const chapterId = currentMeta.value?.chapterId ?? chapterSelect.value
  if (!isListen.value && fullChapterPractice.value) {
    store.recordChapterRun(chapterId, total, correct)
  }
  if (learningSessionId) {
    appendLearningEventSafely({
      moduleId: 'corpus-dictation',
      type: 'session_completed',
      occurredAt: completedAt,
      sessionId: learningSessionId,
      title: chapterOptions.value.find((chapter) => chapter.id === chapterId)?.title ?? '语料库听写',
      durationSeconds: Math.max(1, Math.round((Date.now() - learningSessionStartedAt) / 1000)),
      metrics: {
        total,
        correct,
        mistakes: roundMistakes.value.length,
        accuracy: total && !isListen.value ? (correct / total) * 100 : 0,
      },
      references: { chapterId, mode: isListen.value ? 'listen' : 'dictation' },
    })
  }
  learningSessionId = ''
  learningSessionStartedAt = 0
  sessionStarted.value = false
  isFinished.value = true
  isPaused.value = false
  currentResolved.value = false
  currentWord.value = ''
  currentMeta.value = null
  bigLoopIndex.value = 0
  progressChip.value = '本轮结束'
  promptText.value = isListen.value
    ? '听音完成，本轮已播放结束。'
    : roundMistakes.value.length
      ? '练习结束，可以查看错误单词列表。'
      : '练习结束，本轮全部答对。'
  promptHint.value = isListen.value
    ? '听音模式不会记录正确率、错词或章节统计。'
    : roundMistakes.value.length
      ? `错误单词：${roundMistakes.value.map((e) => e.word).join(', ')}`
      : '没有错误单词。'
  summaryStatus.value = isListen.value ? '听音模式不写入统计数据。' : `本轮完成 · 答对 ${mastered.value.length} · 错词 ${roundMistakes.value.length}`
}

function startPractice() {
  if (sessionStarted.value && !isFinished.value) return
  resetSessionFromInput()
  if (!pending.value.length) {
    setFeedback('当前没有待练单词。', 'error')
    return
  }
  const startedAt = new Date().toISOString()
  learningSessionStartedAt = Date.now()
  learningSessionId = createLearningEventId('corpus-dictation-session', startedAt)
  appendLearningEventSafely({
    moduleId: 'corpus-dictation',
    type: 'session_started',
    occurredAt: startedAt,
    sessionId: learningSessionId,
    title: chapterOptions.value.find((chapter) => chapter.id === chapterSelect.value)?.title ?? '自定义语料听写',
    metrics: { plannedWords: pending.value.length },
    references: { chapterId: chapterSelect.value, mode: isListen.value ? 'listen' : 'dictation' },
  })
  cacheStatus.value = '开始练习。'
  void moveToNextWord()
}

function resetSessionFromInput() {
  const { entries: built, removed } = buildEntries(chapterSelect.value)
  if (chapterSelect.value) {
    const parsed = parseWords(wordInput.value)
    const chapterWords = chapterEntries.find((c) => c.id === chapterSelect.value)?.words ?? []
    fullChapterPractice.value =
      parsed.length === chapterWords.length && parsed.every((w) => chapterWords.includes(w))
  } else {
    fullChapterPractice.value = false
  }
  bigLoopCount.value = isListen.value ? Math.max(1, settings.value.listenBigLoop) : 1
  entries.value = built
  pending.value = built.map((e) => e.id)
  mastered.value = []
  roundMistakes.value = []
  sessionStarted.value = false
  isFinished.value = false
  currentWord.value = ''
  currentMeta.value = null
  if (removed.length) {
    cacheStatus.value = `已移除 ${removed.length} 个无法匹配的单词：${removed.slice(0, 5).join('、')}${removed.length > 5 ? '…' : ''}`
  }
}

function submitAnswer() {
  if (!waitingForAnswer.value || !currentWord.value) return
  const userAnswer = answerInput.value.trim().toLowerCase()
  const correct = getCurrentWordText()
  if (userAnswer === correct) {
    store.recordAttempt(currentMeta.value?.chapterId ?? '', correct, currentMeta.value?.chapterTitle ?? '', true)
    pending.value = pending.value.filter((w) => w !== currentWord.value)
    if (!mastered.value.includes(currentWord.value)) mastered.value.push(currentWord.value)
    setFeedback(`正确：${correct}`, 'success')
    waitingForAnswer.value = false
    currentResolved.value = true
    clearTimer()
    void moveToNextWord()
  } else {
    finishAsMistake(userAnswer, `错误，正确答案是 ${correct}`)
  }
}

function finishAsMistake(_answer: string, message: string) {
  if ((!waitingForAnswer.value && !currentResolved.value) || !currentWord.value) return
  const entry = entries.value.find((e) => e.id === currentWord.value)
  if (!entry) return
  store.recordAttempt(entry.meta.chapterId, entry.word, entry.meta.chapterTitle, false)
  appendLearningEventSafely({
    moduleId: 'corpus-dictation',
    type: 'mistake_added',
    sessionId: learningSessionId || undefined,
    title: entry.word,
    references: {
      word: entry.word,
      chapterId: entry.meta.chapterId,
      chapterTitle: entry.meta.chapterTitle,
    },
  })
  if (!roundMistakes.value.some((e) => e.id === currentWord.value)) {
    roundMistakes.value.push(entry)
  }
  promptText.value = entry.word
  promptHint.value = '已显示当前单词，本题记为错误。'
  setFeedback(message || `错误，正确答案是 ${entry.word}`, 'error')
  pending.value = pending.value.filter((w) => w !== currentWord.value)
  waitingForAnswer.value = false
  currentResolved.value = true
}

function revealCurrentWord() {
  const typed = answerInput.value.trim().toLowerCase()
  finishAsMistake(typed || '已查看单词', `已显示单词：${getCurrentWordText()}`)
}

function goToNextManually() {
  if (!currentResolved.value || isFinished.value) return
  clearTimer()
  if (isListen.value) pending.value.shift()
  void moveToNextWord()
}

function goToPreviousManually() {
  if (!entries.value.length) return
  const currentIndex = entries.value.findIndex((e) => e.id === currentWord.value)
  const target = currentIndex > 0 ? entries.value[currentIndex - 1] : entries.value[entries.value.length - 1]
  if (target) {
    entries.value = [target, ...entries.value.filter((e) => e.id !== target.id)]
    pending.value = entries.value.map((e) => e.id)
    mastered.value = mastered.value.filter((m) => m !== target.id)
    void moveToNextWord()
  }
}

function restartWrongWords() {
  if (!isFinished.value || !roundMistakes.value.length) {
    setFeedback('本轮还没有错误单词。', 'warning')
    return
  }
  const wrong = roundMistakes.value
  entries.value = wrong.map((e, i) => ({ ...e, id: `${e.meta.chapterId}::${e.word}::wrong-${i}` }))
  pending.value = entries.value.map((e) => e.id)
  mastered.value = []
  roundMistakes.value = []
  sessionStarted.value = false
  isFinished.value = false
  const startedAt = new Date().toISOString()
  learningSessionStartedAt = Date.now()
  learningSessionId = createLearningEventId('corpus-dictation-session', startedAt)
  appendLearningEventSafely({
    moduleId: 'corpus-dictation',
    type: 'session_started',
    occurredAt: startedAt,
    sessionId: learningSessionId,
    title: '语料错词重练',
    metrics: { plannedWords: pending.value.length },
    references: { chapterId: wrong[0]?.meta.chapterId ?? '', mode: 'dictation' },
  })
  void moveToNextWord()
}

function pauseOrResume() {
  if (!sessionStarted.value || isFinished.value) return
  if (isPaused.value) {
    isPaused.value = false
    if (!currentResolved.value || isListen.value) void playCurrentWord()
  } else {
    isPaused.value = true
    clearTimer()
    audio.pause()
  }
}

function replayCurrent() {
  if (currentWord.value) void playCurrentWord()
}

function setFeedback(text: string, type: 'success' | 'error' | 'warning' | '') {
  feedbackText.value = text
  feedbackType.value = type
}

function appendLearningEventSafely(
  event: Omit<LearningEvent, 'id' | 'occurredAt'> & Partial<Pick<LearningEvent, 'id' | 'occurredAt'>>,
) {
  try {
    appendLearningEvent(event)
  } catch {
    cacheStatus.value = '练习数据已保存，但学习中心动态写入失败。'
  }
}

function clearTimer() {
  if (timerHandle) {
    clearTimeout(timerHandle)
    timerHandle = null
  }
}

function shuffle<T>(list: T[]): T[] {
  const array = [...list]
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

/* ---------- 错词本面板（精简） ---------- */
const mistakeList = computed(() => Object.entries(store.mistakeBook))

const visibleMistakes = computed(() => {
  const query = mistakeChapterFilter.value
  const list = mistakeList.value.filter(([key, entry]) => {
    if (query && !query.includes(entry.chapterId)) return false
    void key
    return true
  })
  return [...list].sort((a, b) => b[1].lastErrorAt.localeCompare(a[1].lastErrorAt))
})

const mistakeChapterFilter = ref<string[]>([])

async function removeMistake(key: string) {
  try {
    await ElMessageBox.confirm('确定从错词本移除该词吗？', '提示', { confirmButtonText: '确定', type: 'warning' })
  } catch {
    return
  }
  store.removeMistake(key)
}

async function clearMistakeBook() {
  try {
    await ElMessageBox.confirm('确定清空整个错词本吗？', '提示', { confirmButtonText: '确定', type: 'warning' })
  } catch {
    return
  }
  store.clearMistakeBook()
}

/* ---------- 章节统计（SVG 折线精简版） ---------- */
const statsChapter = ref('')
const statsRuns = computed(() => store.chapterStats[statsChapter.value] ?? [])
const statsSvgPoints = computed(() => {
  const runs = statsRuns.value
  if (runs.length < 2) return ''
  const width = 640
  const height = 240
  const max = Math.max(...runs.map((r) => r.accuracy || 0), 100)
  const stepX = width / (runs.length - 1)
  return runs
    .map((run, i) => {
      const x = i * stepX
      const y = height - 20 - (height - 50) * ((run.accuracy || 0) / max)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

/* ---------- 快捷键 ---------- */
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
  if (event.key === 'F4') {
    event.preventDefault()
    if (sessionStarted.value && !isFinished.value && currentResolved.value) goToNextManually()
    return
  }
  if (event.key === 'Escape') return
  if (isListen.value && !inInput) {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      replayCurrent()
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (sessionStarted.value) goToNextManually()
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (sessionStarted.value) goToPreviousManually()
    }
  }
}

function toggleWordListVisibility() {
  showWords.value = !showWords.value
}

function removeWordFromPendingList(entry: PracticeEntry) {
  if (!entry || entry.id === currentWord.value) return
  const idx = entries.value.findIndex((e) => e.id === entry.id)
  if (idx !== -1) entries.value.splice(idx, 1)
  pending.value = pending.value.filter((w) => w !== entry.id)
}

function toggleMistakeErrorLevel(entryKeyValue: string) {
  const entry = store.mistakeBook[entryKeyValue]
  if (!entry) return
  entry.errorLevel = Math.min(10, entry.errorLevel + 1)
  store.persistMistakeBook()
}


/* ---------- 错词进阶：选择与批量 ---------- */
const selectedMistakeKeys = ref<string[]>([])

function toggleSelected(key: string) {
  const i = selectedMistakeKeys.value.indexOf(key)
  if (i >= 0) selectedMistakeKeys.value.splice(i, 1)
  else selectedMistakeKeys.value.push(key)
}

function clearSelections() {
  selectedMistakeKeys.value = []
}

function selectLowAccuracy() {
  selectedMistakeKeys.value = mistakeList.value
    .filter(([, e]) => {
      const practice = store.wordStats[entryKeyOfEntry(e)]
      const total = practice?.practiceCount ?? 0
      const rate = total ? ((practice.correctCount ?? 0) / total) * 100 : 0
      return e.wrongCount > 0 && rate < 50
    })
    .map(([k]) => k)
}

function selectHighWrong() {
  selectedMistakeKeys.value = mistakeList.value.filter(([, e]) => e.wrongCount >= 3).map(([k]) => k)
}

function selectRecent() {
  const daysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  selectedMistakeKeys.value = mistakeList.value
    .filter(([, e]) => new Date(e.lastErrorAt).getTime() >= daysAgo)
    .map(([k]) => k)
}

function invertSelection() {
  const base = mistakeList.value.map(([k]) => k)
  const current = new Set(selectedMistakeKeys.value)
  selectedMistakeKeys.value = base.filter((k) => !current.has(k))
}

function entryKeyOfEntry(e: { chapterId: string; word: string }): string {
  return entryKey(e.chapterId, e.word)
}

function startSelectedMistakePractice() {
  const pool = selectedMistakeKeys.value.length ? selectedMistakeKeys.value : visibleMistakes.value.map(([k]) => k)
  if (!pool.length) {
    setFeedback('没有可练习的错词。', 'warning')
    return
  }
  const practice: PracticeEntry[] = pool
    .map((key) => store.mistakeBook[key])
    .filter(Boolean)
    .map((entry, i) => ({
      id: `${entry.chapterId}::${entry.word}::w-${i}`,
      word: entry.word,
      meta: { chapterId: entry.chapterId, chapterTitle: entry.title || entry.chapterId, audioUrl: buildAudioUrl(entry.chapterId, entry.word) },
    }))
  entries.value = practice
  pending.value = practice.map((e) => e.id)
  mastered.value = []
  roundMistakes.value = []
  sessionStarted.value = false
  isFinished.value = false
  cacheStatus.value = `已载入 ${practice.length} 个错词，准备练习。`
  activeTab.value = 'practice'
}

function exportSelectedMistakeCsv() {
  const pool = visibleMistakes.value.map(([k, e]) => ({ key: k, entry: e }))
  const rows = [['单词', '章节', '错误等级', '错误次数', '最近错误'].join(',')]
  for (const { entry } of pool) {
    rows.push([entry.word, entry.chapterId, entry.errorLevel, entry.wrongCount, entry.lastErrorAt].join(','))
  }
  downloadText('错词本导出.csv', '\ufeff' + rows.join('\n'), 'text/csv;charset=utf-8')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (chapterOptions.value.length) {
    chapterSelect.value = store.settings.lastChapter || chapterOptions.value[0].id
    fillChapter()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  clearTimer()
  audio.pause()
  store.updateSettings({ lastChapter: chapterSelect.value })
})
</script>

<template>
  <div class="corpus-dictation-app">
    <div class="shell">
      <!-- hero -->
      <section class="hero">
        <div class="title">
          <div>
            <p>IELTS Dictation Lab</p>
            <h1>语料库雅思单词听写练习页</h1>
          </div>
          <p>选择章节或粘贴单词列表后，页面会自动按语料库匹配音频地址。练习记录、错词本、章节统计和音频缓存都会保存在本地浏览器。</p>
        </div>
        <div class="hero-note">
          <strong>使用说明</strong>
          <p>规则说明：选中章节后只匹配该章节音频；不在所选章节或不在语料库的单词会在开始前提示并自动移除；超时或显示答案会记入错词本。</p>
        </div>
        <div class="stats">
          <div class="stat"><span>当前匹配</span><strong>{{ pending.length }}</strong></div>
          <div class="stat"><span>总单词</span><strong>{{ entries.length }}</strong></div>
          <div class="stat"><span>剩余待练</span><strong>{{ pending.length }}</strong></div>
          <div class="stat"><span>答对数量</span><strong>{{ mastered.length }}</strong></div>
          <div class="stat"><span>错误数量</span><strong>{{ roundMistakes.length }}</strong></div>
          <div class="stat"><span>缓存/错词</span><strong>{{ Object.keys(store.mistakeBook).length }}</strong></div>
        </div>
      </section>

      <!-- tabs -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ 'is-active': activeTab === 'practice' }" type="button" @click="activeTab = 'practice'">练习</button>
        <button class="tab-btn" :class="{ 'is-active': activeTab === 'mistakes' }" type="button" @click="activeTab = 'mistakes'">错词本</button>
        <button class="tab-btn" :class="{ 'is-active': activeTab === 'stats' }" type="button" @click="activeTab = 'stats'">章节统计</button>
      </div>

      <!-- practice tab -->
      <div v-if="activeTab === 'practice'" class="tab-panel">
        <section class="grid">
          <div class="panel config-panel">
            <div class="section-title"><div><h2>练习配置</h2><p>选择章节自动填充单词列表，或手动粘贴。自动去重并匹配语料库音频。</p></div></div>
            <div class="form-grid">
              <div class="inline-grid">
                <label>章节选择<select v-model="chapterSelect" @change="fillChapter"><option v-for="c in chapterOptions" :key="c.id" :value="c.id">{{ c.title }}</option></select></label>
                <label>每词间隔（秒）<input v-model.number="settings.intervalSeconds" type="number" min="0" step="0.5" @change="store.persistSettings" /></label>
                <label>单词播放速度<select v-model.number="settings.speed" @change="store.persistSettings"><option v-for="s in [0.4,0.6,0.8,1.0,1.2,1.4,1.6,1.8,2.0]" :key="s" :value="s">{{ s.toFixed(1) }}x</option></select></label>
                <label>词组播放速度<select v-model.number="settings.phraseSpeed" @change="store.persistSettings"><option v-for="s in [0.4,0.6,0.8,1.0,1.2,1.4,1.6,1.8,2.0]" :key="s" :value="s">{{ s.toFixed(1) }}x</option></select></label>
                <label>练习模式<select v-model="settings.mode" @change="store.persistSettings"><option value="dictation">听写模式</option><option value="listen">听音模式</option></select></label>
                <label>听音顺序<select v-model="settings.order" @change="store.persistSettings"><option value="sequence">顺序播放</option><option value="random">随机播放</option></select></label>
                <label>单词循环次数<input v-model.number="settings.listenRepeat" type="number" min="1" step="1" @change="store.persistSettings" /></label>
                <label>大循环播放次数<input v-model.number="settings.listenBigLoop" type="number" min="1" step="1" @change="store.persistSettings" /></label>
              </div>
              <label>单词列表<textarea v-model="wordInput" placeholder="almost&#10;currently&#10;directly"></textarea></label>
              <div class="status-bar" :class="{ error: cacheStatus.includes('移除') }">{{ cacheStatus }}</div>
              <div v-if="store.storageError" class="status-bar error">{{ store.storageError }}</div>
              <div class="tool-grid">
                <div class="tool-card">
                  <div><h3>完整备份</h3><p>设置、错词和统计已纳入应用完整备份；音频缓存不进入备份文件。</p></div>
                  <div class="action-grid">
                    <RouterLink class="ghost" to="/settings">前往全局设置</RouterLink>
                  </div>
                </div>
              </div>
              <div class="guide-note">
                <strong>使用提示</strong>
                <p>1. 章节选择后只匹配该章节音频；2. 听写模式记录统计与错词；3. 听音模式仅顺序/随机播放不写统计（↑重播 ←→切词）；4. 超时或显示答案会记入错词本。</p>
              </div>
            </div>
          </div>

          <div class="panel practice">
            <div class="section-title"><div><h2>练习中心</h2><p>开始后先播放当前单词音频；间隔为 0 时改为手动下一题。</p></div></div>
            <div class="practice-card">
              <div class="current-index" id="progressChip">{{ progressChip }}</div>
              <div class="prompt" id="promptText">{{ promptText }}</div>
              <p class="subtle">{{ promptHint }}</p>
              <label>
                你听到的单词
                <span class="word-display">
                  <input v-model="answerInput" type="text" placeholder="输入拼写后按 Enter 或点提交" autocomplete="off" autocapitalize="off" spellcheck="false" :disabled="isListen || isFinished || !sessionStarted" @keydown.enter.prevent="submitAnswer" />
                </span>
              </label>
              <div class="mini-actions">
                <button class="primary" type="button" :disabled="sessionStarted && !isFinished" @click="startPractice">开始练习</button>
                <button class="ghost" type="button" :disabled="!sessionStarted || isFinished" @click="pauseOrResume">{{ isPaused ? '继续' : '暂停' }}</button>
                <button class="ghost" type="button" :disabled="!currentWord" @click="replayCurrent">重播当前音频</button>
                <button class="ghost" type="button" :disabled="!waitingForAnswer" @click="submitAnswer">提交答案</button>
                <button class="ghost" type="button" :disabled="!waitingForAnswer" @click="revealCurrentWord">显示单词</button>
                <button class="ghost" type="button" :disabled="!sessionStarted || isFinished" @click="goToPreviousManually">上一个</button>
                <button class="ghost" type="button" :disabled="!sessionStarted || isFinished || !currentResolved" @click="goToNextManually">下一题</button>
                <button class="ghost" type="button" :disabled="!isFinished || !roundMistakes.length" @click="restartWrongWords">只练错词</button>
              </div>
              <div class="feedback">
                <span class="feedback-text" :class="feedbackType ? `feedback-text--${feedbackType}` : ''">{{ feedbackText }}</span>
              </div>
              <div class="status-bar">{{ summaryStatus }}</div>
            </div>

            <div class="list-grid">
              <div class="list-card">
                <div class="section-title"><div><h3>待练习</h3><p>当前待答的单词显示在这里。</p></div>
                  <button class="ghost" type="button" @click="toggleWordListVisibility">{{ showWords ? '隐藏单词' : '显示单词' }}</button>
                </div>
                <ul id="pendingList" class="corpus-list">
                  <li v-for="entry in pendingEntries" :key="entry.id" :class="{ 'is-current': entry.id === currentWord }">
                    <button class="ghost ghost-mini" type="button" @click="removeWordFromPendingList(entry)">✕</button>
                    <span :class="{ blur: !showWords }">{{ showWords ? entry.word : '•••' }}</span>
                  </li>
                  <li v-if="!pending.length" class="empty-li">开始练习后，这里会显示待练习单词。</li>
                </ul>
              </div>
              <div class="list-card">
                <div class="section-title"><div><h3>已掌握</h3><p>本轮答对的单词会移动到这里。</p></div></div>
                <ul class="corpus-list">
                  <li v-for="id in mastered" :key="id"><span>{{ entries.find((e) => e.id === id)?.word }}</span></li>
                  <li v-if="!mastered.length" class="empty-li">答对后的单词会显示在这里。</li>
                </ul>
              </div>
              <div class="list-card">
                <div class="section-title"><div><h3>本轮错词</h3><p>答错或未作答的单词会记录在这里。</p></div></div>
                <ul class="corpus-list">
                  <li v-for="entry in roundMistakes" :key="entry.id">{{ entry.word }} <span class="subtle">{{ entry.meta.chapterTitle }}</span></li>
                  <li v-if="!roundMistakes.length" class="empty-li">出现错词后会显示在这里。</li>
                </ul>
              </div>
            </div>
            <p class="footer-note">Developer LHP · 信息来源：王璐语料库机考 2 版 · 仅供学习交流与内部使用</p>
          </div>
        </section>
      </div>

      <!-- mistakes tab -->
      <div v-else-if="activeTab === 'mistakes'" class="tab-panel">
        <section class="panel">
          <div class="section-title"><div><h2>错词本</h2><p>所有错词会累计保存到本地，答错 +3 等级，手动 +1，答对递减至 0 自动移除。</p></div>
            <button class="ghost" type="button" @click="clearMistakeBook">清空错词本</button></div>
          <div class="chip-grid">
            <label>筛选章节
              <select v-model="mistakeChapterFilter" class="chapter-multi-select" multiple>
                <option v-for="c in chapterOptions" :key="c.id" :value="c.id">{{ c.title }}</option>
              </select>
            </label>
            <button class="ghost" type="button" @click="mistakeChapterFilter = []">清空筛选</button>
            <div class="subtle">按住 Command 可多选章节。</div>
          </div>

          <div class="action-grid action-grid--compact" style="margin-top: 10px;">
            <button class="ghost" type="button" @click="selectLowAccuracy">选择正确率低于 50%</button>
            <button class="ghost" type="button" @click="selectHighWrong">选择错误次数 ≥ 3</button>
            <button class="ghost" type="button" @click="selectRecent">选择最近 7 天错词</button>
            <button class="ghost" type="button" @click="invertSelection">反选当前筛选</button>
            <button class="ghost" type="button" @click="clearSelections">清空选择</button>
            <button class="ghost" type="button" @click="exportSelectedMistakeCsv">导出 CSV</button>
            <button class="primary" type="button" @click="startSelectedMistakePractice">开始错词练习</button>
          </div>
          <div class="status-bar">{{ visibleMistakes.length ? `共 ${visibleMistakes.length} 条错词` : '暂无错词记录。' }}</div>
          <ul class="record-list">
            <li v-for="[key, entry] in visibleMistakes" :key="key" class="mistake-row">
              <input type="checkbox" :checked="selectedMistakeKeys.includes(key)" @change="toggleSelected(key)" />
              <div>
                <strong>{{ entry.word }}</strong>
                <span class="subtle">{{ entry.title }} · 等级 {{ entry.errorLevel }} · 错 {{ entry.wrongCount }} · 对 {{ entry.rightCount }}</span>
              </div>
              <div class="mistake-actions">
                <button class="ghost" type="button" @click="toggleMistakeErrorLevel(key)">+1</button>
                <button class="ghost danger" type="button" @click="removeMistake(key)">移除</button>
              </div>
            </li>
            <li v-if="!visibleMistakes.length" class="empty-li">暂无错词记录。</li>
          </ul>
        </section>
      </div>

      <!-- stats tab -->
      <div v-else class="tab-panel">
        <section class="panel">
          <div class="section-title"><div><h2>章节统计</h2><p>仅“按章节 + 完整单词列表”的听写练习完成后写入历史。</p></div></div>
          <label>查看章节
            <select v-model="statsChapter"><option v-for="c in chapterOptions" :key="c.id" :value="c.id">{{ c.title }}</option></select>
          </label>
          <div class="status-bar">{{ statsRuns.length ? `共 ${statsRuns.length} 次练习` : '暂无章节练习记录。' }}</div>
          <div class="chart-shell">
            <svg v-if="statsRuns.length > 1" class="chart-svg" viewBox="0 0 640 240" style="width: 100%; height: 240px;">
              <polyline :points="statsSvgPoints" fill="none" stroke="#1473ff" stroke-width="2" />
            </svg>
            <div v-else class="chart-empty">暂无可展示的统计曲线。</div>
          </div>
          <ul class="stats-history">
            <li v-for="(run, i) in [...statsRuns].reverse()" :key="i" class="subtle">
              {{ new Date(run.at).toLocaleString() }} · 正确 {{ run.correct }}/{{ run.total }} · {{ Math.round((run.accuracy || 0)) }}%
            </li>
            <li v-if="!statsRuns.length" class="empty-li">暂无历史记录。</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 补充原 CSS 未覆盖的列表/按钮细节 */
.corpus-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.corpus-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.55);
  font-size: 0.92rem;
}

.corpus-list li.is-current {
  background: rgba(20, 115, 255, 0.1);
}

.empty-li {
  color: var(--subtle, #748197);
  font-size: 0.82rem;
  background: transparent !important;
}

.blur {
  filter: blur(4px);
  user-select: none;
}

.ghost-mini {
  padding: 0 6px;
  font-size: 0.8rem;
}

.feedback-text {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 8px;
}

.feedback-text--success {
  background: rgba(23, 178, 106, 0.12);
  color: #12894f;
}

.feedback-text--error {
  background: rgba(236, 91, 91, 0.12);
  color: #c53131;
}

.feedback-text--warning {
  background: rgba(241, 181, 61, 0.16);
  color: #a06f14;
}

.mistake-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.mistake-actions {
  display: flex;
  gap: 6px;
}

.record-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.record-list li {
  border: 1px solid rgba(15, 23, 42, 0.07);
  background: rgba(255, 255, 255, 0.85);
  border-radius: 12px;
  padding: 10px 12px;
}

.stats-history {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: 0.85rem;
}

.status-bar.error {
  color: #c53131;
}
</style>
