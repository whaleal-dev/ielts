/**
 * 词汇学习 Store —— 将 legacy study_words.html 全局单例逻辑迁移为 Pinia。
 *
 * - data: VocabState（persist 树，见 DEFAULT_STATE）；深度 watch 静默落盘。
 * - session / ui：运行期状态，不持久化。
 * - 重要动作按 legacy 的 flash 语义显式 save(true)。
 */
import { defineStore } from 'pinia'
import { watch } from 'vue'

import { appendLearningEvent } from '@/shared/learning-events/events'

import { CORE_VOCAB_LOOKUP, LISTENING_179_LOOKUP, READING_538_LOOKUP, library } from '../data/library'
import { getCorpusWordLookup, loadCorpus } from '../data/corpus'
import { getSearchResults, getFilteredDifficultWords, getDueDifficultWords, hasSearchFilters } from '../domain/search'
import { buildQuizOptions } from '../domain/quiz'
import { scheduleReview, levelAfterAdjust } from '../domain/review'
import { createStoredWordSnapshot } from '../model/snapshot'
import { appendStudyLog, syncMasteryStudyLog } from '../model/studyLog'
import { loadStateAsync, saveStateToBackend } from '../persist/state-io'
import { createDefaultState } from '../persist/defaults'
import { SESSION_MODE_LABELS, PRESET_SOURCE_LABELS, MODE_LABELS } from '../constants'
import type { PresetSourceType } from '../constants'
import { clampIndex, mod, normalizeLexeme } from '../utils'
import { getPlaybackToken, invalidatePlayback, playAudio } from '../lib/audio'

import type {
  VocabState,
  SessionWord,
  StudySession,
  ActiveTab,
  PracticeMode,
  DifficultWordEntry,
  StoredWordSnapshot,
} from '../types'

export interface VocabularyUiState {
  statusText: string
  statusError: boolean
  queueCollapsed: boolean
  modalSettings: boolean
  savedFlash: boolean
}

function createUi(): VocabularyUiState {
  return {
    statusText: '',
    statusError: false,
    queueCollapsed: false,
    modalSettings: false,
    savedFlash: false,
  }
}

export const useVocabularyStore = defineStore('vocabulary', {
  state: () => ({
    data: createDefaultState() as VocabState,
    session: null as StudySession | null,
    ui: createUi() as VocabularyUiState,
    idbAvailable: true,
    ready: false,
    corpusReady: false,
  }),

  getters: {
    currentWord(state): SessionWord | null {
      const session = state.session
      if (!session) return null
      return session.items[session.currentIndex] ?? null
    },
    currentDifficultEntry(state): DifficultWordEntry | undefined {
      const word = state.session?.items?.[state.session.currentIndex]
      return word ? state.data.difficultWords[word.key] : undefined
    },
    sessionModeLabel(state): string {
      return SESSION_MODE_LABELS[state.session?.mode ?? ''] ?? ''
    },
    hasWord(): boolean {
      return Boolean(this.currentWord)
    },
  },

  actions: {
    /* ========== 初始化 / 持久化 ========== */
    async init() {
      const { state, idbAvailable } = await loadStateAsync()
      this.data = state
      this.idbAvailable = idbAvailable
      this.setStatus('已载入本地学习数据')
      watch(
        () => this.data,
        () => {
          void this.save(false)
        },
        { deep: true },
      )
      this.ready = true
      this.setInitialSession()
    },

    setStatus(message: string, isError = false) {
      this.ui.statusText = message
      this.ui.statusError = isError
      if (isError) {
        setTimeout(() => {
          this.ui.statusError = false
        }, 2400)
      }
    },

    async save(flash = false) {
      await saveStateToBackend(this.data, this.idbAvailable, flash, {
        onSaved: () => {
          if (flash) {
            this.ui.savedFlash = true
            setTimeout(() => {
              this.ui.savedFlash = false
            }, 1600)
          }
        },
        onError: (error) => {
          console.error('save failed', error)
          this.setStatus('保存失败，请检查浏览器存储权限', true)
        },
      })
    },

    /* ========== 会话 ========== */
    setInitialSession() {
      const preserveActiveTab = this.data.activeTab !== 'study'
      const known = this.data.selectedGroupId ? library.groupsById[this.data.selectedGroupId] : undefined
      const firstGroup = library.chapters[0]?.groups[0]
      if (known) this.setGroupSession(known.id, false, null, preserveActiveTab)
      else if (firstGroup) this.setGroupSession(firstGroup.id, false, null, preserveActiveTab)
    },

    setGroupSession(groupId: string, announce = true, overrideIndex: number | null = null, preserveActiveTab = false) {
      const group = library.groupsById[groupId]
      if (!group) return
      const progress = this.data.progressByGroup[groupId] ?? {
        currentIndex: 0,
        lastStudiedAt: '',
        completedRuns: 0,
        runStarted: false,
        nextExpectedIndex: 0,
      }
      this.data.progressByGroup[groupId] = progress
      const index =
        overrideIndex == null ? clampIndex(progress.currentIndex, group.words.length) : clampIndex(overrideIndex, group.words.length)
      this.session = {
        mode: 'group',
        label: `${group.chapter} ${group.group}`,
        chapter: group.chapter,
        groupId: group.id,
        items: group.words,
        currentIndex: index,
      }
      progress.currentIndex = index
      if (index !== 0) {
        progress.runStarted = false
        progress.nextExpectedIndex = 0
      }
      this.data.selectedGroupId = group.id
      this.data.selectedLibraryChapter = group.chapter
      if (!preserveActiveTab) this.data.activeTab = 'study'
      this.stopPlayback(false)
      this.resetQuizState()
      if (this.data.practice.mode === 'quiz') this.ensureQuizRound(this.currentWord)
      void this.save(false)
      if (announce) this.setStatus(`已切换到 ${group.chapter} ${group.group}`)
    },

    finishStartSession(message: string) {
      this.resetQuizState()
      if (this.data.practice.mode === 'quiz') this.ensureQuizRound(this.currentWord)
      this.data.activeTab = 'study'
      this.stopPlayback(false)
      this.setStatus(message)
    },

    startSelectedDifficultPractice() {
      const selected = this.data.selectedDifficultKeys
        .map((key) => this.data.difficultWords[key])
        .filter((entry): entry is DifficultWordEntry => Boolean(entry))
      if (!selected.length) {
        this.setStatus('请先在难词列表勾选单词', true)
        return
      }
      this.session = { mode: 'difficulty', label: `选中难词 · ${selected.length} 个`, chapter: '自定义难词', items: selected as unknown as SessionWord[], currentIndex: 0 }
      this.finishStartSession(`选中难词练习已开始（${selected.length} 词）`)
    },

    startDifficultPractice(chapterFilter: string | null = null, options: { onlyDue?: boolean } = {}) {
      const filter = chapterFilter && chapterFilter !== 'all' ? chapterFilter : null
      const baseOptions = { chapter: filter, query: this.data.difficultyQuery }
      const items = options.onlyDue
        ? getDueDifficultWords(this.data.difficultWords, baseOptions)
        : getFilteredDifficultWords(this.data.difficultWords, { ...baseOptions, sortMode: this.data.difficultySortMode })
      if (!items.length) {
        this.setStatus(options.onlyDue ? '当前没有到期的难词' : '当前没有符合条件的难词', true)
        return
      }
      const prefix = filter ? `${filter}·` : ''
      const label = options.onlyDue ? `${prefix}到期复习` : `${prefix}难词`
      this.session = { mode: 'difficulty', label, chapter: filter || '全部章节', items: items as unknown as SessionWord[], currentIndex: 0 }
      this.finishStartSession(`${label} 已开始（${items.length} 词）`)
    },

    startSearchPractice() {
      if (!hasSearchFilters(this.data.searchQuery, this.data.searchChapterFilter, this.data.searchAssistQuery)) {
        this.setStatus('请输入搜索词或选择章节', true)
        return
      }
      const items = getSearchResults(this.data.searchQuery, this.data.searchChapterFilter, this.data.searchAssistQuery)
      if (!items.length) {
        this.setStatus('没有匹配的结果', true)
        return
      }
      const label = [
        `搜索：关键词：${this.data.searchQuery || '无'}`,
        `章节：${this.data.searchChapterFilter === 'all' ? '全部' : this.data.searchChapterFilter}`,
        `音标：${this.data.searchAssistQuery || '无'}`,
      ].join(' · ')
      this.session = {
        mode: 'search',
        label,
        chapter: this.data.searchChapterFilter === 'all' ? '搜索结果' : this.data.searchChapterFilter,
        items,
        currentIndex: 0,
      }
      this.finishStartSession(`搜索练习已开始（${items.length} 词）`)
    },

    async ensureCorpus() {
      if (this.corpusReady) return
      await loadCorpus()
      this.corpusReady = true
    },

    async startPresetSourcePractice(sourceType: PresetSourceType) {
      if (sourceType === 'listeningCorpus' && !this.data.settings.showListeningCorpus) {
        this.setStatus('请先在设置中开启听力语料', true)
        return
      }
      const label = PRESET_SOURCE_LABELS[sourceType]
      let items: SessionWord[]
      if (sourceType === 'listeningCorpus') {
        await this.ensureCorpus()
        const lookup = await getCorpusWordLookup()
        items = library.allWords.filter((w) => lookup.has(normalizeLexeme(w.word)))
      } else {
        items = this.presetSourceWords(sourceType)
      }
      if (!items.length) {
        this.setStatus(`「${label}」词源为空`, true)
        return
      }
      this.session = { mode: 'search', label: `来源：${label}`, chapter: label, items, currentIndex: 0 }
      this.finishStartSession(`来源：${label} 已开始（${items.length} 词）`)
    },

    presetSourceWords(sourceType: PresetSourceType): SessionWord[] {
      let lookup: Set<string>
      switch (sourceType) {
        case 'reading538':
          lookup = READING_538_LOOKUP
          break
        case 'listening179':
          lookup = LISTENING_179_LOOKUP
          break
        case 'core':
          lookup = CORE_VOCAB_LOOKUP
          break
        case 'listeningCorpus':
          return []
      }
      return library.allWords.filter((w) => lookup.has(normalizeLexeme(w.word)))
    },

    moveRelative(step: number, countExposure: boolean) {
      const session = this.session
      if (!session?.items?.length) return
      const prev = session.currentIndex
      const total = session.items.length
      const next = mod(prev + step, total)
      if (step !== 0 && countExposure && session.mode === 'difficulty' && this.data.practice.mode === 'standard') {
        const oldWord = session.items[prev]
        if (oldWord && this.data.difficultWords[oldWord.key]) this.markDifficultyReview(oldWord, true)
      }
      this.updateRunProgress(prev, next, step)
      session.currentIndex = next
      this.resetQuizState()
      if (this.data.practice.mode === 'quiz') this.ensureQuizRound(this.currentWord)
      if (countExposure) this.recordExposure(session.items[next])
      else void this.save(false)
      if (this.data.practice.autoRunning) this.restartPlaybackLoop()
    },

    updateRunProgress(prev: number, next: number, step: number) {
      const session = this.session
      if (session?.mode !== 'group' || !session.groupId) return
      const progress = this.data.progressByGroup[session.groupId]
      if (!progress) return
      const total = session.items.length
      if (step < 0) {
        progress.runStarted = false
        progress.nextExpectedIndex = 0
        return
      }
      if (prev === 0 && next === 1) {
        progress.runStarted = true
        progress.nextExpectedIndex = 2
        return
      }
      if (progress.runStarted && prev === total - 1 && next === 0 && progress.nextExpectedIndex === total) {
        progress.completedRuns = (progress.completedRuns || 0) + 1
        progress.runStarted = false
        progress.nextExpectedIndex = 0
        return
      }
      if (progress.runStarted && next === progress.nextExpectedIndex) {
        progress.nextExpectedIndex += 1
        return
      }
      if (!(prev === 0 && next === 0)) {
        progress.runStarted = false
        progress.nextExpectedIndex = 0
      }
    },

    resetGroupPosition() {
      const session = this.session
      if (session?.mode !== 'group' || !session.groupId) {
        this.setStatus('当前不是分组会话', true)
        return
      }
      const progress = this.data.progressByGroup[session.groupId]
      if (progress) {
        progress.currentIndex = 0
        progress.runStarted = false
        progress.nextExpectedIndex = 0
      }
      session.currentIndex = 0
      this.stopPlayback(false)
      this.setStatus('已回到本组第一个词')
    },

    /* ========== 播放引擎 ========== */
    togglePlayback() {
      const running = !this.data.practice.autoRunning
      this.data.practice.autoRunning = running
      void this.save(false)
      if (!running) {
        this.stopPlayback(false)
        this.setStatus('已暂停自动播放')
      } else {
        const word = this.currentWord
        if (word) this.recordExposure(word)
        this.restartPlaybackLoop()
        this.setStatus(
          this.data.settings.intervalSeconds === 0 ? '已开始手动节奏模式。切换单词时会自动播放发音。' : '已开始自动练习。',
        )
      }
    },

    stopPlayback(saveState = true) {
      invalidatePlayback()
      this.data.practice.autoRunning = false
      if (saveState) void this.save(false)
    },

    restartPlaybackLoop() {
      invalidatePlayback()
      const token = getPlaybackToken()
      if (!this.data.practice.autoRunning) return
      void this.runPlaybackLoop(token)
    },

    async runPlaybackLoop(token: number) {
      while (this.data.practice.autoRunning && token === getPlaybackToken()) {
        const word = this.currentWord
        if (!word) break
        await this.speakWord(word, true, token)
        const interval = this.data.settings.intervalSeconds
        if (interval <= 0) return
        await waitMs(interval * 1000)
        if (token !== getPlaybackToken()) break
        const session = this.session
        if (!session?.items?.length) break
        const prev = session.currentIndex
        const next = mod(prev + 1, session.items.length)
        if (session.mode === 'difficulty' && this.data.practice.mode === 'standard') {
          const oldWord = session.items[prev]
          if (oldWord && this.data.difficultWords[oldWord.key]) this.markDifficultyReview(oldWord, true)
        }
        session.currentIndex = next
        this.updateRunProgress(prev, next, 1)
        this.recordExposure(session.items[next])
      }
    },

    async speakWord(word: SessionWord, quietStatus = false, token = getPlaybackToken(), ignoreMute = false) {
      if (this.data.settings.muted && !ignoreMute) {
        if (!quietStatus) this.setStatus('已静音', true)
        return
      }
      if (!word.eng_sound) {
        if (!quietStatus) this.setStatus('该词暂无音频', true)
        return
      }
      const repeat = Math.max(1, Math.round(Number(this.data.settings.repeatCount) || 1))
      for (let turn = 0; turn < repeat; turn += 1) {
        if (token !== getPlaybackToken()) return
        try {
          await playAudio(word.eng_sound, this.data.settings.playbackRate, token)
        } catch {
          if (!quietStatus) this.setStatus('音频播放失败', true)
          return
        }
      }
    },

    /** 语料音频直接播放（legacy 中不经 speakWord，不受 muted 门控） */
    async playCorpusAudio(mp3Path: string) {
      if (!mp3Path) return
      invalidatePlayback()
      const token = getPlaybackToken()
      try {
        await playAudio(mp3Path, this.data.settings.playbackRate, token)
      } catch {
        this.setStatus('语料音频播放失败', true)
      }
    },

    /** 跳到会话中第 index1Based 个词（legacy 起始序号，1-based） */
    jumpToIndex(index1Based: number) {
      const session = this.session
      if (!session?.items?.length) {
        this.setStatus('当前没有可跳转的会话', true)
        return
      }
      const index = clampIndex(Math.floor(Number(index1Based) || 0) - 1, session.items.length)
      session.currentIndex = index
      this.resetQuizState()
      if (this.data.practice.mode === 'quiz') this.ensureQuizRound(this.currentWord)
      this.setStatus(`已跳到第 ${index + 1} 个词`)
    },

    /* ========== 状态推进 ========== */
    recordExposure(word: SessionWord | null | undefined) {
      if (!word) return
      const now = new Date().toISOString()
      const key = word.key
      const snapshot = createStoredWordSnapshot(word)
      const prev = this.data.wordStats[key]
      this.data.wordStats[key] = {
        ...snapshot,
        count: (prev?.count || 0) + 1,
        lastStudiedAt: now,
        note: this.data.wordNotes[key],
        mastered: prev?.mastered ?? false,
        masteredAt: prev?.masteredAt ?? '',
      }
      this.data.studyLog = appendStudyLog(this.data.studyLog, { kind: 'study', wordKey: key, at: now })
      const difficult = this.data.difficultWords[key]
      if (difficult) {
        difficult.count = (difficult.count || 0) + 1
        difficult.lastStudiedAt = now
        if (prev?.mastered) {
          difficult.mastered = true
          difficult.masteredAt = prev.masteredAt || now
        }
      }
      if (word.groupId) {
        const group = library.groupsById[word.groupId]
        if (group) {
          const progress = (this.data.progressByGroup[group.id] ??= {
            currentIndex: 0,
            lastStudiedAt: '',
            completedRuns: 0,
            runStarted: false,
            nextExpectedIndex: 0,
          })
          progress.lastStudiedAt = now
          const session = this.session
          if (session?.mode === 'group' && session.groupId === group.id) {
            progress.currentIndex = session.currentIndex
          }
        }
      }
      void this.save(false)
    },

    toggleWordMastered(key: string) {
      const stat = this.data.wordStats[key]
      const word = library.allWords.find((item) => item.key === key)
      const now = new Date().toISOString()
      const next = !(stat?.mastered ?? false)
      if (stat) {
        stat.mastered = next
        stat.masteredAt = next ? now : ''
      } else {
        if (!word) return
        this.data.wordStats[key] = { ...createStoredWordSnapshot(word), count: 0, lastStudiedAt: '', mastered: next, masteredAt: next ? now : '' }
      }
      const difficult = this.data.difficultWords[key]
      if (difficult) {
        difficult.mastered = next
        difficult.masteredAt = next ? now : ''
      }
      this.data.studyLog = syncMasteryStudyLog(this.data.studyLog, key, next ? now : '')
      if (next) {
        try {
          appendLearningEvent({
            moduleId: 'vocabulary',
            type: 'word_mastered',
            occurredAt: now,
            title: stat?.word ?? word?.word ?? key,
            references: {
              wordKey: key,
              word: stat?.word ?? word?.word ?? '',
              chapter: stat?.chapter ?? word?.chapter ?? '',
            },
          })
        } catch {
          this.setStatus('单词状态已保存，但学习中心动态写入失败', true)
        }
      }
      void this.save(true)
      this.setStatus(next ? '已标记为已学会' : '已取消已学会')
    },

    toggleCurrentWordMastered() {
      const word = this.currentWord
      if (!word) return
      this.toggleWordMastered(word.key)
    },

    toggleWordDifficulty(key: string) {
      const existing = this.data.difficultWords[key]
      if (existing) {
        delete this.data.difficultWords[key]
        this.data.selectedDifficultKeys = this.data.selectedDifficultKeys.filter((k) => k !== key)
        void this.save(true)
        this.setStatus('已移出难词表')
        return
      }
      const word = library.allWords.find((w) => w.key === key)
      if (!word) return
      const now = new Date().toISOString()
      const stat = this.data.wordStats[key]
      this.data.difficultWords[key] = {
        ...createStoredWordSnapshot(word),
        count: stat?.count || 0,
        lastStudiedAt: stat?.lastStudiedAt || '',
        mastered: stat?.mastered ?? false,
        masteredAt: stat?.masteredAt || '',
        note: this.data.wordNotes[key] || '',
        addedAt: now,
        lastReviewAt: '',
        nextReviewAt: now,
        reviewStage: 0,
        reviewFailures: 0,
        difficultyLevel: 1,
      }
      void this.save(true)
      this.setStatus('已加入难词表')
    },

    toggleCurrentWordDifficulty() {
      const word = this.currentWord
      if (!word) return
      this.toggleWordDifficulty(word.key)
    },

    adjustCurrentWordDifficultyLevel(delta: number) {
      const word = this.currentWord
      if (!word) return
      const entry = this.data.difficultWords[word.key]
      if (!entry) return
      const { level, remove, resetReview } = levelAfterAdjust(entry, delta)
      if (remove) {
        delete this.data.difficultWords[word.key]
        this.data.selectedDifficultKeys = this.data.selectedDifficultKeys.filter((k) => k !== word.key)
        void this.save(true)
        this.setStatus('难度已降为 0，已移出难词表')
        return
      }
      entry.difficultyLevel = level
      if (resetReview) {
        entry.reviewStage = 0
        entry.nextReviewAt = new Date().toISOString()
      }
      void this.save(true)
      this.setStatus(`难度调整为 ${level}${resetReview ? '，复习时间已重置' : ''}`)
    },

    markDifficultyReview(word: SessionWord | StoredWordSnapshot | null | undefined, success: boolean) {
      if (!word) return
      const entry = this.data.difficultWords[word.key]
      if (!entry) return
      const scheduled = scheduleReview(entry, success)
      entry.reviewStage = scheduled.reviewStage
      entry.nextReviewAt = scheduled.nextReviewAt
      entry.reviewFailures = scheduled.reviewFailures
      entry.lastReviewAt = scheduled.lastReviewAt
      this.data.studyLog = appendStudyLog(this.data.studyLog, {
        kind: 'review',
        wordKey: word.key,
        at: scheduled.lastReviewAt,
        success,
      })
      void this.save(false)
    },

    removeDifficultWord(key: string) {
      delete this.data.difficultWords[key]
      this.data.selectedDifficultKeys = this.data.selectedDifficultKeys.filter((k) => k !== key)
      void this.save(true)
      this.setStatus('难词已删除')
    },

    toggleSelectedDifficultKey(key: string) {
      const list = this.data.selectedDifficultKeys
      const index = list.indexOf(key)
      if (index >= 0) list.splice(index, 1)
      else list.push(key)
      void this.save(false)
    },

    /* ========== quiz / spell ========== */
    resetQuizState() {
      this.data.practice.quiz = { options: [], selectedMeaning: '', answered: false, correct: false }
    },

    ensureQuizRound(word: SessionWord | null | undefined) {
      if (!word || this.data.practice.mode !== 'quiz') return
      const quiz = this.data.practice.quiz
      const currentMeaning = word.meaning || '暂无释义'
      if (quiz.options.length === 4 && quiz.options.includes(currentMeaning)) return
      quiz.options = buildQuizOptions(word.key, currentMeaning)
    },

    setPracticeMode(mode: PracticeMode) {
      const next: PracticeMode = mode === 'quiz' || mode === 'spell' ? mode : 'standard'
      this.data.practice.mode = next
      this.resetQuizState()
      if (next === 'quiz') this.ensureQuizRound(this.currentWord)
      void this.save(false)
      this.setStatus(MODE_LABELS[next])
    },

    submitQuizAnswer(selectedMeaning: string) {
      const word = this.currentWord
      if (!word || !selectedMeaning) return
      const correctMeaning = word.meaning || '暂无释义'
      const isCorrect = selectedMeaning === correctMeaning
      const quiz = this.data.practice.quiz
      quiz.selectedMeaning = selectedMeaning
      quiz.answered = true
      quiz.correct = isCorrect
      if (!isCorrect) {
        this.markDifficultyReview(word, false)
        this.setStatus(`正确答案：${correctMeaning}`, true)
      } else {
        if (this.session?.mode === 'difficulty' && this.data.difficultWords[word.key]) this.markDifficultyReview(word, true)
        this.setStatus('回答正确')
      }
      void this.save(true)
    },

    submitSpellAnswer(guessRaw: string) {
      const word = this.currentWord
      if (!word) return
      if (!word.eng_sound) {
        this.setStatus('该词暂无音频，无法拼写', true)
        return
      }
      const guess = guessRaw.trim().toLowerCase()
      const answer = String(word.word || '').trim().toLowerCase()
      if (!guess) {
        this.setStatus('请输入拼写', true)
        return
      }
      if (guess === answer) {
        this.moveRelative(1, true)
        this.setStatus('拼写正确 ✓')
        const next = this.currentWord
        if (next?.eng_sound) void this.speakWord(next, true)
      } else {
        this.markDifficultyReview(word, false)
        void this.save(true)
        this.setStatus(`拼写错误，正确答案：${word.word}`, true)
      }
    },

    /* ========== 笔记 / 设置 ========== */
    handleWordNoteInput(note: string) {
      const word = this.currentWord
      if (!word) return
      const key = word.key
      if (note) {
        this.data.wordNotes[key] = note
        const stat = this.data.wordStats[key]
        if (stat) stat.note = note
        const difficult = this.data.difficultWords[key]
        if (difficult) difficult.note = note
      } else {
        delete this.data.wordNotes[key]
        const stat = this.data.wordStats[key]
        if (stat) delete stat.note
        const difficult = this.data.difficultWords[key]
        if (difficult) difficult.note = ''
      }
      void this.save(false)
    },

    updateSetting<K extends keyof VocabState['settings']>(key: K, value: VocabState['settings'][K]) {
      this.data.settings[key] = value
      void this.save(true)
      if (this.data.practice.autoRunning) this.restartPlaybackLoop()
    },

    setActiveTab(tab: ActiveTab, saveTab = true) {
      this.data.activeTab = tab
      if (saveTab) void this.save(false)
    },

  },
})

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
