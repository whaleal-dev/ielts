<script setup lang="ts">
/**
 * 词汇学习模块外壳 —— 结构复刻 legacy study_words.html：
 * .vocab-app（渐变底）> .shell > [.page-tabs | page-section* | footer-card]
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'

import { useVocabularyStore } from './stores/vocabulary'
import { library } from './data/library'
import { SESSION_MODE_LABELS } from './constants'
import './styles/legacy-full.css'
import '@/styles/editorial-modules.css'
import OverviewPane from './components/OverviewPane.vue'
import StudyPane from './components/StudyPane.vue'
import DifficultPane from './components/DifficultPane.vue'
import SettingsDialog from './components/SettingsDialog.vue'

const store = useVocabularyStore()

const heroModeStat = computed(() => {
  if (!store.session) return '待选择'
  return SESSION_MODE_LABELS[store.session.mode] ?? '待选择'
})

const heroSelection = computed(() => store.session?.label ?? '请选择一个组开始')

const heroDatasetStat = computed(() => (store.session?.items.length ? String(store.session.items.length) : String(library.totalWords)))

const savedBadgeVisible = computed(() => store.ui.savedFlash)

const editableTag = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

function onKeydown(event: KeyboardEvent) {
  if (!store.ready) return
  if ((event.ctrlKey || event.metaKey) && event.code === 'Space' && store.data.practice.mode === 'spell') {
    event.preventDefault()
    const word = store.currentWord
    if (word?.eng_sound) void store.speakWord(word, true)
    return
  }
  if (event.isComposing || editableTag(event.target)) return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    store.moveRelative(-1, true)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    store.moveRelative(1, true)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    const word = store.currentWord
    if (word) void store.speakWord(word, false, undefined, true)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    store.moveRelative(1, true)
  } else if (event.key === ' ') {
    event.preventDefault()
    store.togglePlayback()
  }
}

onMounted(() => {
  if (!store.ready) void store.init()
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  store.stopPlayback(false)
})

function selectTab(tab: 'overview' | 'study' | 'difficult') {
  store.setActiveTab(tab)
}
</script>

<template>
  <div class="vocab-app" v-loading="!store.ready">
    <div class="shell">
      <!-- 顶栏：页签 + 状态 pills + 局部设置 -->
      <section class="page-tabs glass">
        <div class="tab-row">
          <button class="tab-btn" :class="{ active: store.data.activeTab === 'overview' }" type="button" @click="selectTab('overview')">总览</button>
          <button class="tab-btn" :class="{ active: store.data.activeTab === 'study' }" type="button" @click="selectTab('study')">学习页</button>
          <button class="tab-btn" :class="{ active: store.data.activeTab === 'difficult' }" type="button" @click="selectTab('difficult')">难词页</button>
        </div>
        <div class="page-tabs-right">
          <div class="pill-row">
            <span class="pill" :title="store.session ? '当前会话词数' : '词库总词数'">{{ heroDatasetStat }}</span>
            <span class="pill">{{ heroModeStat }}</span>
            <span class="pill active">{{ heroSelection }}</span>
            <span v-if="store.ui.statusText" class="chip" :class="{ error: store.ui.statusError }">{{ store.ui.statusText }}</span>
          </div>
          <div class="top-actions">
            <button class="top-settings-btn" type="button" aria-label="打开设置" @click="store.ui.modalSettings = true">⚙</button>
            <RouterLink class="segment-btn" to="/settings">全局备份</RouterLink>
          </div>
        </div>
      </section>

      <!-- 三个页签 -->
      <OverviewPane v-if="store.data.activeTab === 'overview'" />
      <StudyPane v-else-if="store.data.activeTab === 'study'" />
      <DifficultPane v-else-if="store.data.activeTab === 'difficult'" />

      <!-- 页脚 -->
      <section class="footer-card glass">
        <p class="footer-copy">
          学习计数、当前组位置、显示状态、播放设置和难词列表会自动保存在浏览器；完整备份统一在全局设置中管理。
        </p>
        <div class="pill-row">
          <span v-if="savedBadgeVisible" class="chip active">✓ 已保存到浏览器</span>
          <span v-else class="chip">已自动保存</span>
          <RouterLink class="chip" to="/settings">打开全局设置</RouterLink>
        </div>
      </section>
    </div>

    <SettingsDialog />
  </div>
</template>
