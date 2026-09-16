<script setup lang="ts">
/**
 * 只听循环听写 —— 忠实还原 legacy 发音/发音和听写.html（只听循环+中文过滤+一键乱序）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  cancelSpeech,
  formatEnglishVoiceLabel,
  isEnglishVoice,
  observeSpeechVoices,
} from '@/shared/speech/voices'
import {
  readLocalStorageValue,
  removeLocalStorageValue,
  writeLocalStorageValue,
} from '@/shared/storage/chunked-local-storage'

import './styles/legacy-full.css'
import '@/styles/editorial-modules.css'
import { buildListenDictationCache, parseListenDictationCache } from './model/cache'
import type { ListenTtsSource, ListenWordItem as WordItem } from './model/cache'
import { nextSequentialIndex, nextWrappedIndex, parseListenWordList, previousWrappedIndex } from './model/words'

const CACHE_KEY = 'ielts_listen_repeat'

const wordRawInput = ref('')
const wordItems = ref<WordItem[]>([])
const activeIndex = ref(-1)
const currentWordObj = ref<WordItem | null>(null)
const practiceActive = ref(false)
const isPaused = ref(false)
const statusText = ref('准备就绪。')
const statusError = ref(false)
const dictationMode = ref(false)
const dictationInput = ref('')
const dictationFeedback = ref('当前处于听写模式，先听一次再输入。')

const voices = ref<SpeechSynthesisVoice[]>([])
const selectedVoiceURI = ref('')
const speechRate = ref(1)
const repeatCount = ref(1)
const intervalSec = ref(1.5)
const ttsSource = ref<ListenTtsSource>('web')

let timer: ReturnType<typeof setTimeout> | null = null
let stopVoiceObserver: () => void = () => undefined

const activeList = computed(() => wordItems.value)
const totalWordsText = computed(() => String(wordItems.value.length))
const progressText = computed(() =>
  activeIndex.value >= 0 ? `${activeIndex.value + 1} / ${activeList.value.length}` : `0 / ${activeList.value.length}`,
)
const remainingText = computed(() => `(${Math.max(0, activeList.value.length - (activeIndex.value + 1))})`)
const currentWordText = computed(() => currentWordObj.value?.text ?? 'Ready')
const phonetic = ref('/ -- /')
const meaningText = ref('加载单词后，这里会显示当前单词释义。')

function setStatus(text: string, isError = false) {
  statusText.value = text
  statusError.value = isError
}

function cancelSpeechAndTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  cancelSpeech()
}

function persistData() {
  const result = writeLocalStorageValue(
    CACHE_KEY,
    JSON.stringify(buildListenDictationCache({
      wordItems: wordItems.value,
      selectedVoiceURI: selectedVoiceURI.value,
      speechRate: speechRate.value,
      repeatCount: repeatCount.value,
      intervalSec: intervalSec.value,
      ttsSource: ttsSource.value,
      dictationMode: dictationMode.value,
    })),
  )
  if (!result.ok) setStatus('本地保存失败，请清理浏览器空间后重试', true)
}

function loadCache(): boolean {
  const data = parseListenDictationCache(readLocalStorageValue(CACHE_KEY))
  if (!data) return false
  wordItems.value = data.wordItems
  selectedVoiceURI.value = data.selectedVoiceURI
  speechRate.value = data.speechRate
  repeatCount.value = data.repeatCount
  intervalSec.value = data.intervalSec
  ttsSource.value = data.ttsSource
  dictationMode.value = data.dictationMode
  activeIndex.value = -1
  currentWordObj.value = null
  return true
}

/* ---------- 发音 ---------- */
function getSelectedVoice(): SpeechSynthesisVoice | null {
  return voices.value.find((v) => v.voiceURI === selectedVoiceURI.value) ?? null
}

function speakWeb(word: string, onEndCallback: (() => void) | null = null) {
  if (!window.speechSynthesis) {
    onEndCallback?.()
    return
  }
  cancelSpeechAndTimer()
  const utterance = new SpeechSynthesisUtterance(word)
  const voice = getSelectedVoice()
  if (voice) utterance.voice = voice
  utterance.rate = speechRate.value
  utterance.pitch = 1
  utterance.onend = () => {
    setStatus('✅ 发音完成')
    onEndCallback?.()
  }
  utterance.onerror = () => {
    setStatus('⚠️ 发音失败', true)
    onEndCallback?.()
  }
  window.speechSynthesis.speak(utterance)
}

function speakBaidu(word: string, onEndCallback: (() => void) | null = null) {
  cancelSpeechAndTimer()
  setStatus(`🔊 百度朗读: ${word}`)
  const url = `https://fanyi.baidu.com/gettts?lan=uk&text=${encodeURIComponent(word)}&spd=3&source=web`
  const audio = new Audio(url)
  audio.onended = () => {
    setStatus('✅ 发音完成')
    onEndCallback?.()
  }
  audio.onerror = () => {
    setStatus('⚠️ 发音失败', true)
    onEndCallback?.()
  }
  void audio.play()
}

function speakWord(word: string, onEndCallback: (() => void) | null = null) {
  if (ttsSource.value === 'baidu') {
    speakBaidu(word, onEndCallback)
  } else {
    speakWeb(word, onEndCallback)
  }
}

function speakWordWithRepeat(word: string, times: number, onComplete: (() => void) | null = null) {
  const speak = (left: number) => {
    if (left <= 0) {
      onComplete?.()
      return
    }
    speakWord(word, () => {
      if (left > 1) {
        timer = setTimeout(() => speak(left - 1), 120)
      } else {
        onComplete?.()
      }
    })
  }
  speak(times)
}

/* ---------- 加载/列表 ---------- */
function loadAndReset() {
  const { words, skippedChinese } = parseListenWordList(wordRawInput.value)
  if (!words.length && !skippedChinese) {
    setStatus('未检测到有效单词', true)
    return
  }
  if (!words.length) {
    setStatus('⚠️ 所有单词都包含中文，已全部过滤', true)
    return
  }
  if (practiceActive.value) {
    cancelSpeechAndTimer()
    practiceActive.value = false
    isPaused.value = false
  }
  wordItems.value = words
  currentWordObj.value = null
  activeIndex.value = -1
  dictationInput.value = ''
  persistData()
  renderWordList()
  updatePlayPauseButton()
  setStatus(`✅ 加载 ${wordItems.value.length} 个单词${skippedChinese ? `，已过滤 ${skippedChinese} 个含中文词` : ''}`)
}

function fullClearCache() {
  removeLocalStorageValue(CACHE_KEY)
  if (practiceActive.value) cancelSpeechAndTimer()
  wordItems.value = []
  activeIndex.value = -1
  currentWordObj.value = null
  practiceActive.value = false
  isPaused.value = false
  dictationInput.value = ''
  setStatus('🗑 缓存已清除')
}

function shuffleWordList() {
  const list = activeList.value
  if (list.length <= 1) {
    setStatus(list.length === 0 ? '没有单词可乱序' : '只有一个单词，无需乱序')
    return
  }
  if (practiceActive.value) {
    cancelSpeechAndTimer()
    practiceActive.value = false
    isPaused.value = false
  }
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  wordItems.value = [...list]
  activeIndex.value = -1
  currentWordObj.value = null
  dictationInput.value = ''
  persistData()
  setStatus('🔀 单词列表已随机乱序，进度已重置')
}

/* ---------- 播放引擎 ---------- */
function finishPractice(message: string) {
  practiceActive.value = false
  isPaused.value = false
  cancelSpeechAndTimer()
  setStatus(message)
}

function scheduleNextListen() {
  if (!practiceActive.value) return
  const active = activeList.value
  const nextIndex = nextSequentialIndex(active.length, activeIndex.value)
  if (nextIndex === null) {
    finishPractice('🏁 所有单词播放完毕！')
    return
  }
  activeIndex.value = nextIndex
  currentWordObj.value = active[activeIndex.value]
  updateCurrentWordDisplay()
  timer = setTimeout(() => {
    timer = null
    if (practiceActive.value) {
      speakWordWithRepeat(currentWordObj.value?.text ?? '', repeatCount.value, () => {
        if (practiceActive.value) scheduleNextListen()
      })
    }
  }, intervalSec.value * 1000)
}

function startPractice() {
  const active = activeList.value
  if (!active.length) {
    setStatus('没有单词，请加载单词表', true)
    return
  }
  if (practiceActive.value) {
    cancelSpeechAndTimer()
    practiceActive.value = false
    isPaused.value = false
  }
  practiceActive.value = true
  isPaused.value = false
  if (activeIndex.value < 0 || activeIndex.value >= active.length) activeIndex.value = 0
  currentWordObj.value = active[activeIndex.value]
  dictationInput.value = ''
  updateCurrentWordDisplay()
  speakWordWithRepeat(currentWordObj.value.text, repeatCount.value, () => {
    if (practiceActive.value && !isPaused.value) scheduleNextListen()
  })
  setStatus('🎧 开始只听模式')
}

function togglePlayPause() {
  if (!wordItems.value.length) {
    setStatus('请先加载单词', true)
    return
  }
  if (practiceActive.value) {
    practiceActive.value = false
    isPaused.value = true
    cancelSpeechAndTimer()
    setStatus('⏸️ 已暂停')
  } else {
    isPaused.value = false
    practiceActive.value = true
    if (currentWordObj.value) {
      speakWordWithRepeat(currentWordObj.value.text, repeatCount.value, () => {
        if (practiceActive.value && !isPaused.value) scheduleNextListen()
      })
    } else {
      startPractice()
    }
    setStatus('▶ 继续播放')
  }
  updatePlayPauseButton()
}

function replayCurrent() {
  if (!currentWordObj.value) return
  speakWordWithRepeat(currentWordObj.value.text, repeatCount.value)
}

function goToNextWord() {
  const active = activeList.value
  if (!active.length) return
  cancelSpeechAndTimer()
  if (practiceActive.value) practiceActive.value = false
  activeIndex.value = nextWrappedIndex(active.length, activeIndex.value)
  currentWordObj.value = active[activeIndex.value]
  updateCurrentWordDisplay()
  speakWordWithRepeat(currentWordObj.value.text, repeatCount.value)
}

function goToPreviousWord() {
  const active = activeList.value
  if (!active.length) return
  cancelSpeechAndTimer()
  if (practiceActive.value) practiceActive.value = false
  activeIndex.value = previousWrappedIndex(active.length, activeIndex.value)
  currentWordObj.value = active[activeIndex.value]
  updateCurrentWordDisplay()
  speakWordWithRepeat(currentWordObj.value.text, repeatCount.value)
}

function jumpToWord(index: number) {
  cancelSpeechAndTimer()
  if (practiceActive.value) practiceActive.value = false
  activeIndex.value = index
  currentWordObj.value = wordItems.value[index]
  updateCurrentWordDisplay()
  speakWordWithRepeat(currentWordObj.value.text, repeatCount.value)
}

/* ---------- 听写面板 ---------- */
function toggleDictationMode() {
  dictationMode.value = !dictationMode.value
  if (!dictationMode.value) {
    dictationInput.value = ''
    dictationFeedback.value = '当前处于听写模式，先听一次再输入。'
  }
  persistData()
  setStatus(dictationMode.value ? '✍ 已进入听写模式' : '🎧 已切换回只听模式')
}

function checkDictationAnswer() {
  const correct = currentWordObj.value?.text?.trim().toLowerCase() ?? ''
  const guess = dictationInput.value.trim().toLowerCase()
  if (!correct) return
  dictationFeedback.value = guess === correct ? '✅ 回答正确！' : `❌ 错误，正确答案：${currentWordObj.value?.text}`
}

function showDictationAnswer() {
  if (!currentWordObj.value) return
  dictationInput.value = currentWordObj.value.text
  dictationFeedback.value = `👁 已显示答案：${currentWordObj.value.text}`
}

/* ---------- 渲染 ---------- */
function renderWordList() {
  updatePlayPauseButton()
}

function updateCurrentWordDisplay() {
  // 无词库音标/释义，这里统一显示占位（与 legacy 一致）
  phonetic.value = currentWordObj.value ? '/ -- /' : '/ -- /'
  meaningText.value = currentWordObj.value ? '（当前单词释义未内置，可在朗读中跟读。）' : '加载单词后，这里会显示当前单词释义。'
}

function updatePlayPauseButton() {}

function initVoices() {
  stopVoiceObserver = observeSpeechVoices((list) => {
    voices.value = list
    const preferred =
      list.find((v) => v.lang.toLowerCase() === 'en-gb' && /Google UK|Microsoft George|Daniel/.test(v.name)) ??
      list.find((v) => v.lang.toLowerCase() === 'en-gb') ??
      list[0]
    if (preferred && !list.some((v) => v.voiceURI === selectedVoiceURI.value)) {
      selectedVoiceURI.value = preferred.voiceURI
    }
  }, {
    filter: isEnglishVoice,
  })
}

function voiceLabel(voice: SpeechSynthesisVoice): string {
  return formatEnglishVoiceLabel(voice)
}

onMounted(() => {
  const cached = loadCache()
  initVoices()
  if (cached) {
    setStatus('💾 恢复缓存进度')
  }
  updateCurrentWordDisplay()
})

onBeforeUnmount(() => {
  stopVoiceObserver()
  cancelSpeechAndTimer()
})
</script>

<template>
  <div class="listen-dictation-app">
    <div class="shell">
      <section class="hero glass">
        <div class="hero-top">
          <div class="hero-title-wrap">
            <span class="eyebrow">🎧 只听模式 · 循环强化</span>
            <h1>雅思单词学习器</h1>
            <p class="hero-copy">每个单词可设置播放次数(1-5)，顺序播放后自动切换下一个 | 自动过滤含中文单词 | 一键乱序</p>
          </div>
          <div class="hero-side">
            <div class="badge-card"><div class="badge-label">单词总数</div><div class="badge-value" id="totalWordsBadge">{{ totalWordsText }}</div></div>
            <div class="badge-card"><div class="badge-label">当前进度</div><div class="badge-value" id="progressBadge">{{ progressText }}</div></div>
          </div>
        </div>
        <div class="hero-search">
          <div>
            <div class="section-label">单词导入</div>
            <h2 class="chapter-title" style="margin: 8px 0 0;">粘贴单词表开始学习 (自动跳过含中文的单词)</h2>
          </div>
          <textarea v-model="wordRawInput" class="search-input" rows="3" placeholder="e.g.&#10;analyze, consequence, environment&#10;significant"></textarea>
          <div class="search-bar">
            <button class="control-btn primary" style="flex: 1; min-width: 140px;" type="button" @click="loadAndReset">📖 加载并重置进度</button>
            <button class="segment-btn danger-btn" style="flex: 1; min-width: 140px;" type="button" @click="fullClearCache">🗑 清除缓存</button>
          </div>
          <div class="search-meta-row">
            <span class="pill active" id="loadStatus">{{ statusError ? '⚠️ ' + statusText : statusText }}</span>
          </div>
        </div>
      </section>

      <section class="main-layout">
        <div class="left-column">
          <section class="word-card glass">
            <div class="word-top">
              <div>
                <div class="section-label">当前单词</div>
                <div class="pill-row" style="margin-top: 10px;">
                  <button type="button" class="mode-pill" :class="{ active: !dictationMode }" @click="toggleDictationMode">🎧 只听模式</button>
                  <button type="button" class="mode-pill" :class="{ active: dictationMode }" @click="toggleDictationMode">✍️ 听写模式</button>
                  <span class="pill" id="currentWordIndex">{{ progressText }}</span>
                </div>
              </div>
            </div>
            <div class="word-heading">
              <h2 class="word-title" id="currentWordText">{{ currentWordText }}</h2>
              <div class="phonetic" id="currentPhonetic">{{ phonetic }}</div>
            </div>
            <div class="meaning-box" id="currentMeaningBox">
              <div class="section-label">释义</div>
              <p class="meaning-text" id="currentMeaningText">{{ meaningText }}</p>
            </div>
            <div v-if="dictationMode" class="dictation-panel">
              <div class="section-label">听写练习</div>
              <div class="dictation-hint" id="dictationHint">{{ dictationMode ? '听完单词后，输入你听到的单词。' : '' }}</div>
              <input v-model="dictationInput" type="text" class="search-input dictation-input" placeholder="请输入你听到的单词" @keydown.enter.prevent="checkDictationAnswer" />
              <div class="dictation-actions">
                <button class="segment-btn primary" id="checkDictationBtn" type="button" @click="checkDictationAnswer">✅ 检查答案</button>
                <button class="segment-btn" id="showDictationAnswerBtn" type="button" @click="showDictationAnswer">👁 显示答案</button>
              </div>
              <div class="dictation-feedback" id="dictationFeedback">{{ dictationFeedback }}</div>
            </div>
          </section>

          <section class="settings-card workspace-settings glass">
            <div>
              <div class="section-label">播放设置</div>
              <h2 class="chapter-title" style="margin: 8px 0 0;">发音人、语速、间隔与循环次数</h2>
            </div>
            <div class="setting-grid">
              <div class="setting-box">
                <div class="setting-head"><span class="setting-caption">发音人</span></div>
                <select v-model="selectedVoiceURI" @change="persistData">
                  <option v-for="v in voices" :key="v.voiceURI" :value="v.voiceURI">{{ voiceLabel(v) }}</option>
                </select>
              </div>
              <div class="setting-box">
                <div class="setting-head"><span class="setting-caption">发音源</span></div>
                <select v-model="ttsSource" @change="persistData"><option value="web">Web语音</option><option value="baidu">百度翻译</option></select>
              </div>
              <div class="setting-box">
                <div class="setting-head"><span class="setting-caption">语速</span><strong class="setting-value mono">{{ speechRate.toFixed(2) }}</strong></div>
                <input type="range" min="0.5" max="1.5" step="0.05" :value="speechRate" @input="speechRate = Number(($event.target as HTMLInputElement).value); persistData()" />
              </div>
              <div class="setting-box">
                <div class="setting-head"><span class="setting-caption">间隔</span><strong class="setting-value mono">{{ intervalSec.toFixed(1) }}s</strong></div>
                <input type="range" min="0.5" max="5" step="0.5" :value="intervalSec" @input="intervalSec = Number(($event.target as HTMLInputElement).value); persistData()" />
              </div>
              <div class="setting-box">
                <div class="setting-head"><span class="setting-caption">循环次数</span><strong class="setting-value mono">{{ repeatCount }}</strong></div>
                <input type="range" min="1" max="5" step="1" :value="repeatCount" @input="repeatCount = Number(($event.target as HTMLInputElement).value); persistData()" />
              </div>
            </div>
            <div class="footer-toolbar">
              <button class="segment-btn play-btn" id="replayCurrentBtn" type="button" @click="replayCurrent">🔊 发音</button>
              <button class="segment-btn" id="prevWordBtn" type="button" @click="goToPreviousWord">◀ 上一个</button>
              <button class="segment-btn primary" id="togglePlayPauseBtn" type="button" @click="togglePlayPause">{{ practiceActive ? '⏸ 暂停' : '▶ 开始' }}</button>
              <button class="segment-btn" id="nextWordBtn" type="button" @click="goToNextWord">下一个 ▶</button>
            </div>
            <span class="status-line" :class="{ error: statusError }" id="globalStatus" aria-live="polite">{{ statusText }}</span>
          </section>
        </div>

        <div class="right-column">
          <section class="queue-card glass">
            <div class="queue-toolbar">
              <div>
                <div class="section-label">单词列表</div>
                <div class="small-text">点击单词可跳转</div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <span class="pill" id="remainingCount">{{ remainingText }}</span>
                <button id="shuffleBtn" class="segment-btn ghost-btn" style="padding: 6px 12px; font-size: 13px;" type="button" @click="shuffleWordList">🎲 乱序</button>
              </div>
            </div>
            <div id="wordListContainer" class="queue-list">
              <button
                v-for="(item, index) in wordItems"
                :key="`${item.text}-${index}`"
                class="queue-item"
                :class="{ active: index === activeIndex }"
                type="button"
                @click="jumpToWord(index)"
              >
                {{ item.text }}
              </button>
              <div v-if="!wordItems.length" class="empty">✨ 加载单词表后显示</div>
            </div>
          </section>
        </div>
      </section>

      <footer class="footer-card glass">
        <div class="footer-copy">支持英音优先 · 自动过滤含中文单词 · 自动缓存进度 · 一键乱序强化记忆</div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.status-line.error {
  color: #c53131;
}

.queue-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 9px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.queue-item.active {
  background: rgba(20, 115, 255, 0.12);
  color: #0a58ca;
}

.empty {
  color: var(--subtle, #748197);
  font-size: 0.85rem;
}
</style>
