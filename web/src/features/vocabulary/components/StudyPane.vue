<script setup lang="ts">
/**
 * 学习页 —— 结构复刻 legacy #studyPage：
 * chapters-panel → hero-search → settings-card → practice-workspace(主卡+侧栏)。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useVocabularyStore } from '../stores/vocabulary'
import { library } from '../data/library'
import { resolveSynonymGroups } from '../data/synonyms'
import { getWordSourceFlags, buildWordSourceLabels } from '../data/sources'
import { getSearchResults, hasSearchFilters } from '../domain/search'
import { resolveCorpusMatches, getCorpusWordLookup } from '../data/corpus'
import { formatReviewDueText, normalizeLexeme } from '../utils'
import type { SessionWord, VocabWord, CorpusItem } from '../types'

const store = useVocabularyStore()

/* ---------- 章节分组导航 ---------- */
const chapter = computed({
  get: () => store.data.selectedLibraryChapter,
  set: (v: string) => {
    store.data.selectedLibraryChapter = v
    const first = library.chapters.find((c) => c.chapter === v)?.groups[0]
    if (first) store.data.selectedGroupId = first.id
  },
})

const chapterGroups = computed(() => {
  const found = library.chapters.find((c) => c.chapter === chapter.value)
  return found?.groups ?? []
})

function selectGroup(groupId: string) {
  store.setGroupSession(groupId, true)
}

function groupProgress(groupId: string) {
  const group = library.groupsById[groupId]
  const stats = store.data.wordStats
  const studied = group ? group.words.filter((w) => (stats[w.key]?.count || 0) > 0).length : 0
  const total = group?.words.length ?? 0
  return { studied, total }
}

/* ---------- 搜索 ---------- */
const searchQuery = computed({
  get: () => store.data.searchQuery,
  set: (v: string) => {
    store.data.searchQuery = v
  },
})
const searchAssist = computed({
  get: () => store.data.searchAssistQuery,
  set: (v: string) => {
    store.data.searchAssistQuery = v
  },
})
const searchChapterFilter = computed({
  get: () => store.data.searchChapterFilter,
  set: (v: string) => {
    store.data.searchChapterFilter = v
  },
})
const hasFilters = computed(() => hasSearchFilters(searchQuery.value, searchChapterFilter.value, searchAssist.value))
const searchResults = computed(() => (hasFilters.value ? getSearchResults(searchQuery.value, searchChapterFilter.value, searchAssist.value) : []))
const searchMeta = computed(() => {
  if (!hasFilters.value) return '输入关键词开始搜索'
  return `匹配 ${searchResults.value.length} 条，可点击「练习搜索结果」开始`
})

function clearSearch() {
  store.data.searchQuery = ''
  store.data.searchAssistQuery = ''
  store.data.searchChapterFilter = 'all'
}

/* ---------- 预设词源 ---------- */
const presetCounts = computed(() => ({
  reading538: store.presetSourceWords('reading538').length,
  listening179: store.presetSourceWords('listening179').length,
  core: store.presetSourceWords('core').length,
}))
const corpusPresetCount = ref<number | null>(null)
async function refreshCorpusPresetCount() {
  await store.ensureCorpus()
  const lookup = await getCorpusWordLookup()
  corpusPresetCount.value = library.allWords.filter((w) => lookup.has(normalizeLexeme(w.word))).length
}

/* ---------- 播放设置 ---------- */
function setRate(v: number) {
  store.updateSetting('playbackRate', v)
}
function setInterval(v: number) {
  store.updateSetting('intervalSeconds', v)
}
function setRepeat(v: number) {
  store.updateSetting('repeatCount', v)
}

/* ---------- 当前词 ---------- */
const word = computed(() => store.currentWord)
const flags = computed(() => getWordSourceFlags(word.value ?? {}))
const sourceLabels = computed(() => buildWordSourceLabels(flags.value))
const difficultEntry = computed(() => (word.value ? store.data.difficultWords[word.value.key] : undefined))
const isMastered = computed(() => (word.value ? Boolean(store.data.wordStats[word.value.key]?.mastered) : false))
const stat = computed(() => (word.value ? store.data.wordStats[word.value.key] : undefined))
const mode = computed(() => store.data.practice.mode)
const sessionTotal = computed(() => store.session?.items.length ?? 0)
const revealWord = computed(() => mode.value !== 'spell' && store.data.practice.showWord)
const revealMeaning = computed(() => mode.value === 'standard' || (mode.value === 'quiz' && store.data.practice.quiz.answered))
const meaningVisible = computed(() => mode.value === 'quiz' || store.data.practice.showMeaning)

const sessionFocusText = computed(() => store.session?.label ?? '等待开始本轮练习')
const sessionProgress = computed(() => {
  if (!store.session?.items.length) return { text: '0 / 0', ratio: 0 }
  const index = store.session.currentIndex
  const total = store.session.items.length
  return { text: `${Math.min(index + 1, total)} / ${total}`, ratio: total ? (index + 1) / total : 0 }
})
const groupMasteredProgress = computed(() => {
  const items = (store.session?.items ?? []) as SessionWord[]
  const mastered = items.filter((w) => Boolean(store.data.wordStats[w.key]?.mastered)).length
  const total = items.length
  return { text: `${mastered} / ${total} 已掌握`, ratio: total ? mastered / total : 0 }
})

const currentStats = computed(() => {
  const entry = difficultEntry.value
  return [
    { label: '学习次数', value: String(stat.value?.count ?? 0) },
    { label: entry ? '复习阶段' : '状态', value: entry ? `第 ${entry.reviewStage + 1} 轮` : isMastered.value ? '已学会' : '学习中' },
    { label: '下次复习', value: entry ? formatReviewDueText(entry.nextReviewAt) : '—' },
    { label: '加入状态', value: entry ? `难词 Lv${entry.difficultyLevel}` : '普通词' },
  ]
})

/* ---------- 显示开关 ---------- */
function toggleShowWord() {
  store.data.practice.showWord = !store.data.practice.showWord
  void store.save(true)
}
function toggleShowMeaning() {
  if (mode.value !== 'standard') return
  store.data.practice.showMeaning = !store.data.practice.showMeaning
  void store.save(true)
}

/* ---------- quiz ---------- */
const quizPrompt = computed(() => {
  const quiz = store.data.practice.quiz
  if (quiz.answered) return quiz.correct ? '回答正确 ✓' : `正确答案：${word.value?.meaning ?? ''}`
  return '从 4 个中文释义里选出当前单词对应的答案。'
})
const quizResultBadge = computed(() => {
  const quiz = store.data.practice.quiz
  if (!quiz.answered) return '待作答'
  return quiz.correct ? '回答正确' : '回答错误'
})

/* ---------- spell ---------- */
const spellInput = ref('')
const spellInputEl = ref<HTMLInputElement | null>(null)
function submitSpell() {
  store.submitSpellAnswer(spellInput.value)
  spellInput.value = ''
  void nextTick(() => spellInputEl.value?.focus())
}
watch(
  () => [mode.value === 'spell', word.value?.key] as const,
  ([inSpell]) => {
    if (inSpell) void nextTick(() => spellInputEl.value?.focus())
  },
  { flush: 'post' },
)

/* ---------- 相关词（同义词 + 语料） ---------- */
const synonymGroups = computed(() => {
  if (!word.value || !store.data.settings.showSynonym) return []
  const enabled = store.data.settings.enabledSynonymSources
  return resolveSynonymGroups(word.value.word, enabled).map((group) => ({
    id: group.id,
    source: group.source,
    terms: group.terms.map((term) => {
      const matched =
        library.allWords.find((w) => w.key !== word.value!.key && w.word.toLowerCase() === term.displayWord.toLowerCase()) ?? null
      return { ...term, matched }
    }),
  }))
})

const corpusMatches = ref<CorpusItem[]>([])
let corpusWatchActive = true
async function refreshCorpusMatches() {
  const currentWord = word.value
  if (!currentWord || !store.data.settings.showListeningCorpus || !corpusWatchActive) {
    corpusMatches.value = []
    return
  }
  await store.ensureCorpus()
  if (!corpusWatchActive || word.value?.key !== currentWord.key) return
  corpusMatches.value = await resolveCorpusMatches(currentWord.word, 24)
}

function speakWord(wordArg: SessionWord | VocabWord) {
  void store.speakWord(wordArg, false, undefined, true)
}

onMounted(() => {
  void store.ensureCorpus()
  if (store.data.settings.showListeningCorpus) void refreshCorpusPresetCount()
})

onBeforeUnmount(() => {
  corpusWatchActive = false
})

watch(
  () => [word.value?.key, store.data.settings.showListeningCorpus] as const,
  ([, showCorpus]) => {
    corpusMatches.value = []
    if (showCorpus && corpusPresetCount.value === null) void refreshCorpusPresetCount()
    void refreshCorpusMatches()
  },
  { flush: 'post' },
)

/* ---------- 传输 ---------- */
const startIndex = ref('')
function jumpToStartIndex() {
  const value = Number(startIndex.value.trim())
  if (!Number.isFinite(value) || value < 1) {
    store.setStatus('请输入 ≥1 的起始序号', true)
    return
  }
  store.jumpToIndex(value)
}
function resetPosition() {
  if (store.session?.mode === 'group') store.resetGroupPosition()
  else store.setStatus('当前不是分组会话，无法重置', true)
}
function toggleMute() {
  store.updateSetting('muted', !store.data.settings.muted)
}

/* ---------- 队列预览（已学优先，循环 offset 升序） ---------- */
const queuePreview = computed(() => {
  const session = store.session
  if (!session?.items.length) return [] as { word: string; sub: string; active: boolean; learned: boolean }[]
  const items = session.items as SessionWord[]
  const offset = (i: number) => (i - session.currentIndex + items.length) % items.length
  const sorted = items
    .map((item, i) => ({ item, offset: offset(i), learned: (store.data.wordStats[item.key]?.count || 0) > 0 }))
    .sort((a, b) => Number(a.offset === 0) - Number(b.offset === 0) || Number(b.learned) - Number(a.learned) || a.offset - b.offset)
  return sorted.slice(0, 60).map(({ item, offset: off, learned }) => ({
    word: item.word,
    sub: off === 0 ? '当前激活' : learned ? `已学 · 循环后第 ${off} 位` : `未学 · 循环后第 ${off} 位`,
    active: off === 0,
    learned,
  }))
})

function queuePositionText(entry: { active: boolean; learned: boolean }) {
  return entry.active ? '当前激活' : entry.learned ? '已学' : '未学'
}
</script>

<template>
  <section class="page-section">
    <!-- 章节选择 -->
    <section class="chapters-panel glass">
      <div class="chapter-header">
        <div>
          <div class="section-label">Chapter Picker</div>
          <h2 class="chapter-title" style="margin-top: 8px;">章节下拉选择</h2>
        </div>
        <div class="chapter-picker-wrap">
          <select class="chapter-select" v-model="chapter" aria-label="章节选择">
            <option v-for="c in library.chapters" :key="c.chapter" :value="c.chapter">{{ c.chapter }}</option>
          </select>
          <div class="small-text">当前章节共 {{ chapterGroups.length }} 个分组，点击分组开始本轮练习。</div>
        </div>
        <div class="meta-stack">
          <div class="status-line" aria-live="polite">{{ store.ui.statusText || '请选择一个章节分组开始练习。' }}</div>
          <div class="small-text">完整备份统一在全局设置中管理</div>
        </div>
      </div>
      <div class="chapter-grid chapter-grid-top" style="margin-top: 14px;">
        <button
          v-for="group in chapterGroups"
          :key="group.id"
          class="group-btn"
          :class="{ active: store.data.selectedGroupId === group.id }"
          type="button"
          @click="selectGroup(group.id)"
        >
          <span class="group-name">{{ group.group }}</span>
          <span class="group-side mono">{{ groupProgress(group.id).studied }}/{{ group.words.length }} 已学</span>
        </button>
      </div>
    </section>

    <!-- 搜索 -->
    <section class="hero-search glass">
      <div>
        <div class="section-label">Instant Search</div>
        <h2 class="chapter-title" style="margin: 8px 0 0;">按英文或中文直接搜索词</h2>
      </div>
      <div class="search-bar" style="margin-top: 12px;">
        <input v-model="searchQuery" class="search-input" type="search" placeholder="输入英文或中文，例如 atmosphere / 氧气 / 交通" @keyup.enter="store.startSearchPractice()" />
        <input v-model="searchAssist" class="search-input" type="search" placeholder="拼音/音标辅助筛选" @keyup.enter="store.startSearchPractice()" />
        <select v-model="searchChapterFilter" aria-label="搜索章节筛选">
          <option value="all">全部章节</option>
          <option v-for="c in library.chapters" :key="c.chapter" :value="c.chapter">{{ c.chapter }}</option>
        </select>
        <button class="control-btn primary" type="button" :disabled="!searchResults.length" @click="store.startSearchPractice()">练习搜索结果</button>
        <button class="segment-btn" type="button" @click="clearSearch">清空</button>
      </div>
      <div class="search-meta-row" style="margin-top: 10px;">
        <span class="pill active">{{ searchMeta }}</span>
        <span class="pill">搜索 or 结果练习</span>
      </div>
      <div class="search-meta-row" style="margin-top: 8px;">
        <button class="segment-btn" type="button" :disabled="!presetCounts.reading538" @click="store.startPresetSourcePractice('reading538')">学习阅读538 ({{ presetCounts.reading538 }})</button>
        <button class="segment-btn" type="button" :disabled="!presetCounts.listening179" @click="store.startPresetSourcePractice('listening179')">学习听力179 ({{ presetCounts.listening179 }})</button>
        <button class="segment-btn" type="button" :disabled="!presetCounts.core" @click="store.startPresetSourcePractice('core')">学习核心词汇 ({{ presetCounts.core }})</button>
        <button
          class="segment-btn"
          type="button"
          :disabled="!store.data.settings.showListeningCorpus || !(corpusPresetCount ?? 0)"
          @click="store.startPresetSourcePractice('listeningCorpus')"
        >
          学习听力语料库词汇{{ corpusPresetCount === null ? '' : ` (${corpusPresetCount})` }}
        </button>
      </div>
      <div v-if="searchResults.length" class="search-results" style="margin-top: 10px;">
        <div v-for="r in searchResults.slice(0, 24)" :key="r.key" class="search-item">
          <div class="search-item-word">{{ r.word }}</div>
          <div class="search-item-meaning">{{ r.meaning }}</div>
          <div class="small-text mono" style="color: var(--subtle);">{{ r.eng_phonetic }} · {{ r.chapter }} · {{ r.group }}</div>
        </div>
      </div>
    </section>

    <!-- 播放设置 -->
    <section class="settings-card workspace-settings glass">
      <div>
        <div class="section-label">Playback Settings</div>
        <h2 class="chapter-title" style="margin: 8px 0 0;">播放和显示可配置</h2>
      </div>
      <div class="setting-grid">
        <div class="setting-box">
          <div class="setting-head">
            <span class="setting-caption">练习倍速</span>
            <strong class="setting-value mono">{{ store.data.settings.playbackRate.toFixed(1) }}x</strong>
          </div>
          <input type="range" min="0.6" max="2" step="0.2" :value="store.data.settings.playbackRate" @input="setRate(Number(($event.target as HTMLInputElement).value))" />
        </div>
        <div class="setting-box">
          <div class="setting-head">
            <span class="setting-caption">播放间隔</span>
            <strong class="setting-value mono">{{ store.data.settings.intervalSeconds }}s</strong>
          </div>
          <input type="range" min="0" max="5" step="1" :value="store.data.settings.intervalSeconds" @input="setInterval(Number(($event.target as HTMLInputElement).value))" />
        </div>
        <div class="setting-box">
          <div class="setting-head">
            <span class="setting-caption">播放次数</span>
            <strong class="setting-value mono">{{ store.data.settings.repeatCount }}</strong>
          </div>
          <input type="range" min="1" max="5" step="1" :value="store.data.settings.repeatCount" @input="setRepeat(Number(($event.target as HTMLInputElement).value))" />
        </div>
      </div>
      <div class="footer-toolbar">
        <div style="display: flex; gap: 8px; align-items: center;">
          <input v-model="startIndex" type="number" min="1" placeholder="起始序号" style="width: 110px; padding: 8px; border-radius: 10px; border: 1px solid var(--line); background: rgba(255,255,255,0.9);" @keyup.enter="jumpToStartIndex" />
          <button class="segment-btn" type="button" @click="jumpToStartIndex">从此序号开始</button>
          <button class="segment-btn" type="button" @click="resetPosition">重置当前位置</button>
          <button class="segment-btn" type="button" @click="toggleMute">{{ store.data.settings.muted ? '取消静音' : '静音' }}</button>
        </div>
        <span class="status-line" aria-live="polite">准备就绪。</span>
      </div>
    </section>

    <!-- 练习工作台 -->
    <section class="practice-workspace glass">
      <div class="practice-layout">
        <div class="practice-main word-card">
          <!-- 会话进度 -->
          <section class="secondary-panel session-panel">
            <div class="session-panel-top">
              <div>
                <div class="section-label">Session Focus</div>
                <div class="session-focus">{{ sessionFocusText }}</div>
              </div>
              <div class="shortcut-list" aria-label="快捷键提示">
                <span class="chip">Enter 下一词</span>
                <span class="chip">← → 切词</span>
                <span class="chip">空格 开始/暂停</span>
              </div>
            </div>
            <div class="progress-stack" style="margin-top: 10px;">
              <div class="progress-strip">
                <div class="progress-meta">
                  <span>当前序列进度</span>
                  <strong>{{ sessionProgress.text }}</strong>
                </div>
                <div class="progress-track" aria-hidden="true">
                  <span class="progress-fill" :style="{ width: `${sessionProgress.ratio * 100}%` }"></span>
                </div>
              </div>
              <div class="progress-strip">
                <div class="progress-meta">
                  <span>来源分组掌握度</span>
                  <strong>{{ groupMasteredProgress.text }}</strong>
                </div>
                <div class="progress-track" aria-hidden="true">
                  <span class="progress-fill gold" :style="{ width: `${groupMasteredProgress.ratio * 100}%` }"></span>
                </div>
              </div>
            </div>
          </section>

          <!-- 词头 + 模式 -->
          <div class="word-top" style="margin-top: 12px;">
            <div>
              <div class="section-label">Study Workspace</div>
              <div class="pill-row" style="margin-top: 8px; flex-wrap: wrap;">
                <span class="mode-pill active">{{ store.sessionModeLabel || '分组练习' }}</span>
                <button class="segment-btn primary" type="button" @click="store.setPracticeMode('standard')">单词模式</button>
                <button class="segment-btn" type="button" :class="{ primary: mode === 'quiz' }" @click="store.setPracticeMode('quiz')">选中文</button>
                <button class="segment-btn" type="button" :class="{ primary: mode === 'spell' }" @click="store.setPracticeMode('spell')">拼写模式</button>
                <span class="pill">{{ stat?.count || 0 }} 次学习</span>
                <span class="pill" :class="{ active: isMastered }">{{ isMastered ? '已学会' : '未学会' }}</span>
                <span class="pill" :class="{ active: !!difficultEntry }">{{ difficultEntry ? `难词 Lv${difficultEntry.difficultyLevel}` : '未加入难词' }}</span>
              </div>
            </div>
          </div>

          <!-- 当前词 -->
          <div class="word-heading" style="margin-top: 14px;">
            <p class="small-text">{{ word ? `${word.chapter} · ${word.group} · 第 ${word.wordIndex + 1} / ${sessionTotal} 词` : '请先从上方章节选择一个分组' }}</p>
            <div class="word-title-row">
              <h2 class="word-title">{{ word ? (revealWord ? word.word : '• • • • •') : 'Ready' }}</h2>
              <div v-if="word && mode !== 'spell'" class="phonetic">{{ word.eng_phonetic || '/ -- /' }}</div>
              <div class="pill-row" style="flex-wrap: wrap;">
                <span v-for="s in sourceLabels" :key="s" class="pill gold-badge">★ {{ s }}</span>
              </div>
            </div>
          </div>

          <div v-if="meaningVisible" class="meaning-box" style="margin-top: 12px;">
            <div class="section-label">Meaning</div>
            <p class="meaning-text">{{ word ? (revealMeaning ? word.meaning : '回答后显示释义。') : '选择分组后，这里会显示当前单词释义。' }}</p>
          </div>

          <!-- quiz -->
          <section v-if="mode === 'quiz'" class="secondary-panel" style="margin-top: 12px; padding: 12px 14px;">
            <div class="queue-toolbar">
              <div>
                <div class="section-label">Chinese Quiz</div>
                <div class="small-text">{{ quizPrompt }}</div>
              </div>
              <span class="pill" :class="{ active: store.data.practice.quiz.answered }">{{ quizResultBadge }}</span>
            </div>
            <div class="quiz-options" style="margin-top: 10px;">
              <button
                v-for="opt in store.data.practice.quiz.options"
                :key="opt"
                class="quiz-option"
                :class="{
                  correct: store.data.practice.quiz.answered && opt === word?.meaning,
                  wrong: store.data.practice.quiz.answered && opt === store.data.practice.quiz.selectedMeaning && !store.data.practice.quiz.correct,
                }"
                type="button"
                :disabled="store.data.practice.quiz.answered"
                @click="store.submitQuizAnswer(opt)"
              >
                {{ opt }}
              </button>
            </div>
          </section>

          <!-- spell -->
          <section v-if="mode === 'spell'" class="secondary-panel spell-panel" style="margin-top: 12px; padding: 12px 14px;">
            <div class="queue-toolbar">
              <div>
                <div class="section-label">Spelling Mode</div>
                <div class="small-text">听发音后输入完整单词，按 Enter 可直接提交。</div>
              </div>
            </div>
            <div class="spell-actions" style="margin-top: 10px;">
              <input ref="spellInputEl" v-model="spellInput" class="spell-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入你听到的单词……" @keyup.enter="submitSpell" />
              <button class="control-btn soft" type="button" :disabled="!word?.eng_sound" @click="word && store.speakWord(word, true)">再听一次</button>
              <button class="control-btn primary" type="button" @click="submitSpell">提交拼写</button>
            </div>
          </section>

          <!-- 动作行 -->
          <section class="secondary-panel action-panel" style="margin-top: 12px; padding: 12px 14px;">
            <div class="action-row" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              <button class="control-btn soft" type="button" :disabled="!word" @click="word && store.toggleWordDifficulty(word.key)">{{ difficultEntry ? '移出难词' : '加入难词' }}</button>
              <button class="control-btn soft" type="button" :disabled="!word" @click="word && store.toggleWordMastered(word.key)">{{ isMastered ? '取消已学会' : '标记已学会' }}</button>
              <button v-if="difficultEntry" class="control-btn soft" type="button" @click="store.adjustCurrentWordDifficultyLevel(-1)">难度-1</button>
              <button v-if="difficultEntry" class="control-btn soft" type="button" @click="store.adjustCurrentWordDifficultyLevel(1)">难度+1</button>
              <button class="toggle-btn" type="button" :disabled="!word" @click="toggleShowWord">{{ store.data.practice.showWord ? '隐藏单词' : '显示单词' }}</button>
              <button class="toggle-btn" type="button" :disabled="!word || mode !== 'standard'" @click="toggleShowMeaning">{{ store.data.practice.showMeaning ? '隐藏中文' : '显示中文' }}</button>
              <button class="play-btn" type="button" :disabled="!word?.eng_sound" @click="word && store.speakWord(word, false, undefined, true)">播放发音</button>
            </div>
          </section>

          <!-- 传输 -->
          <section class="secondary-panel transport-card" style="margin-top: 12px; padding: 12px 14px;">
            <div class="section-label">Transport</div>
            <div class="transport-grid" style="margin-top: 10px;">
              <button class="control-btn" type="button" :disabled="!word" @click="store.moveRelative(-1, true)">上一个</button>
              <button class="control-btn primary" type="button" :disabled="!word" @click="store.togglePlayback()">{{ store.data.practice.autoRunning ? '暂停' : '开始' }}</button>
              <button class="control-btn" type="button" :disabled="!word" @click="store.moveRelative(1, true)">下一个</button>
            </div>
          </section>

          <!-- 同义词 / 语料 -->
          <section class="secondary-panel related-panel" style="margin-top: 12px; padding: 12px 14px;">
            <div class="queue-toolbar">
              <div class="section-label">Synonym Hook</div>
            </div>
            <div class="related-list" style="margin-top: 8px;">
              <div v-for="group in synonymGroups" :key="group.id" class="related-group-card" style="margin-bottom: 8px;">
                <div class="related-item-top">
                  <span class="related-section-label">{{ group.source }}</span>
                </div>
                <div class="related-chip-grid" style="margin-top: 6px;">
                  <button
                    v-for="term in group.terms"
                    :key="term.normalized"
                    class="term-chip"
                    :class="{ active: term.displayWord.toLowerCase() === word?.word.toLowerCase() }"
                    type="button"
                    @click="term.matched ? speakWord(term.matched) : undefined"
                  >
                    {{ term.displayWord }}
                  </button>
                </div>
              </div>
              <div v-if="corpusMatches.length" style="margin-top: 10px;">
                <div class="related-section-label">听力语料库</div>
                <div v-for="(item, idx) in corpusMatches" :key="`${item.mp3Path}-${idx}`" class="related-item" style="margin-top: 6px;">
                  <div class="related-item-top">
                    <span class="related-word-name">{{ item.content }}</span>
                    <span class="related-actions">
                      <button class="mini-btn" type="button" @click="store.playCorpusAudio(item.mp3Path)">播放</button>
                    </span>
                  </div>
                  <div class="small-text" style="color: var(--subtle);">{{ item.chapterTitle }}</div>
                </div>
              </div>
              <div v-if="!synonymGroups.length && !corpusMatches.length" class="small-text" style="color: var(--subtle);">暂无关联内容。</div>
            </div>
          </section>

          <!-- 笔记 -->
          <section class="secondary-panel action-panel note-panel" style="margin-top: 12px; padding: 12px 14px;">
            <div class="note-editor">
              <div class="section-label">Note</div>
              <textarea
                class="note-input"
                :value="word ? (store.data.wordNotes[word.key] || '') : ''"
                placeholder="记录易错点、搭配、提醒..."
                spellcheck="false"
                @input="word && store.handleWordNoteInput(($event.target as HTMLTextAreaElement).value)"
              ></textarea>
              <div class="small-text">自动保存到浏览器。</div>
            </div>
          </section>

          <!-- 当前统计 -->
          <div class="current-stats" style="margin-top: 12px;">
            <div v-for="cs in currentStats" :key="cs.label" class="metric-card current-stat">
              <div class="metric-label">{{ cs.label }}</div>
              <div class="metric-value mono">{{ cs.value }}</div>
            </div>
          </div>
        </div>

        <!-- 侧栏 -->
        <aside class="practice-side">
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-label">当前会话词数</div>
              <div class="metric-value mono">{{ sessionTotal }}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">词库总词数</div>
              <div class="metric-value mono">{{ library.totalWords }}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">难词表</div>
              <div class="metric-value mono">{{ Object.keys(store.data.difficultWords).length }}</div>
            </div>
            <div class="metric-card">
              <div class="metric-label">已掌握</div>
              <div class="metric-value mono">{{ Object.values(store.data.wordStats).filter((s) => s.mastered).length }}</div>
            </div>
          </div>

          <section class="secondary-panel queue-card" id="groupOverviewPanel">
            <div class="queue-toolbar clickable">
              <div>
                <div class="section-label">队列预览</div>
                <div class="small-text" style="margin-top: 4px;">会显示当前词和后续词。</div>
              </div>
              <button class="segment-btn" type="button" @click="store.ui.queueCollapsed = !store.ui.queueCollapsed">{{ store.ui.queueCollapsed ? '展开' : '折叠' }}</button>
            </div>
            <div v-if="!store.ui.queueCollapsed" class="queue-list" style="margin-top: 8px;">
              <div v-for="(q, i) in queuePreview" :key="`${q.word}-${i}`" class="queue-item" :class="{ active: q.active }">
                <div class="queue-top">
                  <span class="queue-word">{{ q.word }}</span>
                  <span class="pill">{{ queuePositionText(q) }}</span>
                </div>
              </div>
              <div v-if="!queuePreview.length" class="small-text">请选择一个分组开始练习。</div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  </section>
</template>

<style scoped>
/* 组件内部少量补位布局（其余样式全部来自 legacy-full.css 同名类） */
.hero-search,
.chapters-panel,
.settings-card {
  padding: 16px 18px;
}

.practice-workspace {
  padding: 12px;
}

.session-panel,
.transport-card {
  padding: 12px 14px;
}

.current-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.current-stat {
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 250, 255, 0.84));
}

.meaning-box {
  min-height: 76px;
}

.term-chip {
  cursor: pointer;
}

.related-item {
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid var(--line);
}
</style>
