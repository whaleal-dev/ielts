<script setup lang="ts">
/**
 * 难词页 —— 复刻 legacy #difficultPage 结构。
 */
import { computed, ref } from 'vue'

import { useVocabularyStore } from '../stores/vocabulary'
import { library } from '../data/library'
import { getFilteredDifficultWords, countMatchingDifficultWords } from '../domain/search'
import { isDifficultyDue } from '../domain/review'
import { formatReviewDueText, formatReviewDate } from '../utils'
import type { DifficultWordEntry } from '../types'

const store = useVocabularyStore()

const chapterNames = computed(() => library.chapters.map((c) => c.chapter))
const chapterFilter = ref<string>('all')

const difficultyQuery = computed({
  get: () => store.data.difficultyQuery,
  set: (v: string) => {
    store.data.difficultyQuery = v
    store.data.difficultyVisibleCount = 24
  },
})

const sortMode = computed({
  get: () => store.data.difficultySortMode,
  set: (v: 'default' | 'levelDesc' | 'levelAsc') => {
    store.data.difficultySortMode = v
    store.data.difficultyVisibleCount = 24
  },
})

const filterOptions = computed(() => ({
  chapter: chapterFilter.value === 'all' ? null : chapterFilter.value,
  query: difficultyQuery.value,
  sortMode: sortMode.value,
}))

const totalMatches = computed(() => countMatchingDifficultWords(store.data.difficultWords, filterOptions.value))
const visibleItems = computed(() => getFilteredDifficultWords(store.data.difficultWords, filterOptions.value).slice(0, store.data.difficultyVisibleCount))
const totalItems = computed(() => Object.keys(store.data.difficultWords).length)

const dueOnlyCount = computed(() => {
  let due = 0
  for (const key of Object.keys(store.data.difficultWords)) {
    if (isDifficultyDue(store.data.difficultWords[key])) due += 1
  }
  return due
})

const selectedCount = computed(() => store.data.selectedDifficultKeys.length)

function toggleSelect(key: string) {
  store.toggleSelectedDifficultKey(key)
}

function removeWord(key: string) {
  if (window.confirm('确定移出难词表吗？此操作不可撤销。')) {
    store.removeDifficultWord(key)
  }
}

function loadMore() {
  store.data.difficultyVisibleCount += 24
}

function practiceSelected() {
  if (!selectedCount.value) {
    store.setStatus('请先勾选难词', true)
    return
  }
  store.startSelectedDifficultPractice()
}

function practiceDue() {
  store.startDifficultPractice(chapterFilter.value === 'all' ? null : chapterFilter.value, { onlyDue: true })
}

function practiceFiltered() {
  store.startDifficultPractice(chapterFilter.value === 'all' ? null : chapterFilter.value)
}

function practiceAll() {
  store.startDifficultPractice(null)
}

function entryStage(entry: DifficultWordEntry): string {
  return `第 ${entry.reviewStage + 1} 轮`
}
</script>

<template>
  <section class="page-section">
    <section class="difficulty-card glass">
      <div class="difficulty-toolbar">
        <div>
          <div class="section-label">Difficult Words</div>
          <h2 class="chapter-title" style="margin: 8px 0 0;">难词列表</h2>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <select v-model="chapterFilter" class="difficulty-select-box" aria-label="章节筛选">
            <option value="all">全部章节</option>
            <option v-for="c in chapterNames" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model="sortMode" aria-label="排序方式">
            <option value="default">默认（到期优先）</option>
            <option value="levelDesc">难度等级 高→低</option>
            <option value="levelAsc">难度等级 低→高</option>
          </select>
        </div>
      </div>

      <div class="difficulty-search-row" style="margin-top: 14px;">
        <input v-model="difficultyQuery" class="search-input" type="search" placeholder="搜索难词：英文 / 中文 / 章节 / 分组" aria-label="搜索难词" />
        <button class="segment-btn" type="button" @click="difficultyQuery = ''">清空搜索</button>
      </div>

      <div class="difficulty-actions" style="margin-top: 12px;">
        <button class="control-btn primary" type="button" :disabled="!selectedCount" @click="practiceSelected">练习选中难词（{{ selectedCount }}）</button>
        <button class="control-btn primary" type="button" :disabled="!dueOnlyCount" @click="practiceDue">复习今日到期难词（{{ dueOnlyCount }}）</button>
        <button class="control-btn soft" type="button" :disabled="!totalMatches" @click="practiceFiltered">练习当前筛选难词（{{ totalMatches }}）</button>
        <button class="control-btn soft" type="button" :disabled="!totalItems" @click="practiceAll">练习全部难词（{{ totalItems }}）</button>
      </div>

      <div class="status-line" style="margin-top: 10px;" aria-live="polite">
        共 {{ totalItems }} 个难词，当前显示 {{ Math.min(visibleItems.length, store.data.difficultyVisibleCount) }} 个。
      </div>

      <div class="difficulty-list" style="margin-top: 12px;">
        <div v-for="entry in visibleItems" :key="entry.key" class="difficulty-item" :class="{ due: isDifficultyDue(entry) }">
          <label class="difficulty-item-select">
            <input type="checkbox" :checked="store.data.selectedDifficultKeys.includes(entry.key)" @change="toggleSelect(entry.key)" />
          </label>
          <div class="difficulty-word-row">
            <div class="difficulty-top">
              <div class="difficulty-word">{{ entry.word }}</div>
              <span v-if="isDifficultyDue(entry)" class="pill" style="background: rgba(236, 91, 91, 0.14); color: var(--red);">今日到期</span>
              <span class="pill">Lv{{ entry.difficultyLevel }}</span>
              <span class="pill">{{ entryStage(entry) }}</span>
              <span class="pill">已学 {{ entry.count }}</span>
              <span v-if="entry.reviewFailures" class="pill">失败 {{ entry.reviewFailures }}</span>
            </div>
            <div class="difficulty-meaning">{{ entry.meaning }}</div>
            <div class="difficulty-meta-line">
              {{ entry.chapter }} · {{ entry.group }} · 下次：{{ formatReviewDueText(entry.nextReviewAt) }}（{{ formatReviewDate(entry.nextReviewAt) }}）
            </div>
            <div class="difficulty-note" v-if="entry.note">📝 {{ entry.note }}</div>
          </div>
          <div class="difficulty-word-inline-action">
            <button class="segment-btn" type="button" @click="store.toggleWordMastered(entry.key)">{{ entry.mastered ? '取消学会' : '已学会' }}</button>
            <button class="segment-btn" type="button" @click="removeWord(entry.key)">移出</button>
          </div>
        </div>
        <div v-if="!visibleItems.length" class="small-text" style="padding: 18px 4px;">暂无难词，学习时点击「加入难词」开始积累。</div>
      </div>

      <div class="difficulty-list-footer">
        <span class="small-text">{{ Math.min(visibleItems.length, store.data.difficultyVisibleCount) }} / {{ totalMatches }}</span>
        <button v-if="visibleItems.length < totalMatches" class="segment-btn" type="button" @click="loadMore">加载更多</button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.difficulty-card {
  padding: 16px 18px;
}

.difficulty-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(246, 250, 255, 0.82));
}

.difficulty-item.due {
  border-color: rgba(236, 91, 91, 0.4);
  box-shadow: 0 0 0 1px rgba(236, 91, 91, 0.12);
}

.difficulty-item-select {
  padding-top: 2px;
}

.difficulty-word-inline-action {
  display: flex;
  gap: 4px;
}

.difficulty-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
</style>
