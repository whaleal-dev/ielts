<script setup lang="ts">
/**
 * 雅思单词学习器（听写/只听双模式）—— 忠实还原 legacy dictionary/发音和听写.html。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { cancelSpeech, formatEnglishVoiceLabel, observeSpeechVoices } from '@/shared/speech/voices'
import {
  readLocalStorageValue,
  removeLocalStorageValue,
  writeLocalStorageValue,
} from '@/shared/storage/chunked-local-storage'

import './styles/legacy-full.css'
import '@/styles/editorial-modules.css'
import { firstPendingWord, isCorrectAnswer, parseUniqueWordList } from './domain/practice'
import { buildDictationCache, parseDictationCache } from './model/cache'
import type { DictationMode as Mode, DictationWordItem } from './model/cache'

const CACHE_KEY = 'ielts_dual_apple'

/* ---------- 全局数据 ---------- */
const currentMode = ref<Mode>('dictate')
const wordItems = ref<DictationWordItem[]>([])
const wrongDict = ref<Set<string>>(new Set())
const masteredSet = ref<Set<string>>(new Set())
const practiceActive = ref(false)
const currentWordObj = ref<{ text: string; removed: boolean } | null>(null)
const globalStatusMsg = ref('✅ 就绪，选择模式并加载单词')
const statusError = ref(false)

/* 语音 */
const voices = ref<SpeechSynthesisVoice[]>([])
const selectedVoiceURI = ref('')
const speechRate = ref(0.9)
const intervalSec = ref(2)

/* 输入 */
const wordRawInput = ref('')
const userSpelling = ref('')
const feedbackMsg = ref('')
const feedbackType = ref('')

let currentTimeout: ReturnType<typeof setTimeout> | null = null
let stopVoiceObserver: () => void = () => undefined

/* ---------- 派生 ---------- */
const activeWords = computed(() => wordItems.value.filter((w) => !w.removed))
const remainingCount = computed(() => activeWords.value.length)

const masteredWords = computed(() => wordItems.value.filter((w) => w.removed).map((w) => w.text))

function setStatus(msg: string, isError = false) {
  globalStatusMsg.value = msg
  statusError.value = isError
}

function cancelSpeechAndTimer() {
  if (currentTimeout) {
    clearTimeout(currentTimeout)
    currentTimeout = null
  }
  cancelSpeech()
}

function speakWord(word: string, onEndCallback: (() => void) | null = null) {
  cancelSpeechAndTimer()
  const utterance = new SpeechSynthesisUtterance(word)
  const voice = voices.value.find((v) => v.voiceURI === selectedVoiceURI.value)
  if (voice) utterance.voice = voice
  utterance.rate = speechRate.value
  utterance.pitch = 1.0
  utterance.onstart = () => {
    playIndicatorText.value = `🔊 朗读: ${word}`
  }
  utterance.onend = () => {
    if (currentMode.value === 'dictate') playIndicatorText.value = '✅ 发音完成，请拼写'
    else playIndicatorText.value = '✅ 发音完成'
    onEndCallback?.()
  }
  utterance.onerror = () => {
    if (currentMode.value === 'dictate') playIndicatorText.value = '⚠️ 发音失败'
    else playIndicatorText.value = '⚠️ 发音失败'
    onEndCallback?.()
  }
  window.speechSynthesis.speak(utterance)
}

const playIndicatorText = ref('⚪ 等待开始')

function getNextPending() {
  return firstPendingWord(wordItems.value)
}

function prepareDictateWord(wordObj: { text: string; removed: boolean }) {
  currentWordObj.value = wordObj
  userSpelling.value = ''
  feedbackMsg.value = ''
  feedbackType.value = ''
}

function prepareListenWord(wordObj: { text: string; removed: boolean }) {
  currentWordObj.value = wordObj
}

function jumpToWord(wordObj: { text: string; removed: boolean }) {
  if (wordObj.removed) return
  cancelSpeechAndTimer()
  currentWordObj.value = wordObj
  if (currentMode.value === 'dictate') {
    prepareDictateWord(wordObj)
    speakWord(wordObj.text, () => {
      if (practiceActive.value && currentMode.value === 'dictate') playIndicatorText.value = '🎧 等待拼写...'
    })
  } else {
    prepareListenWord(wordObj)
    speakWord(wordObj.text, () => {
      if (practiceActive.value && currentMode.value === 'listen') scheduleNextListen()
    })
  }
}

function handleSubmit() {
  if (!practiceActive.value || currentMode.value !== 'dictate') return
  const current = currentWordObj.value
  if (!current || current.removed) {
    setStatus('没有当前单词', true)
    return
  }
  if (isCorrectAnswer(current.text, userSpelling.value)) {
    current.removed = true
    wrongDict.value.delete(current.text)
    persistData()
    feedbackMsg.value = '✅ 正确！单词已移除'
    feedbackType.value = 'correct'
    setStatus(`✓ 正确: ${current.text}`)
    cancelSpeechAndTimer()
    const next = getNextPending()
    if (!next) {
      finishPractice('🎉 完美！所有单词拼写正确！')
      return
    }
    const delay = intervalSec.value * 1000
    currentTimeout = setTimeout(() => {
      currentTimeout = null
      if (practiceActive.value && currentMode.value === 'dictate' && next) {
        currentWordObj.value = next
        prepareDictateWord(next)
        speakWord(next.text, () => {
          if (practiceActive.value) playIndicatorText.value = '🎧 等待拼写...'
        })
      }
    }, delay)
  } else {
    wrongDict.value.add(current.text)
    persistData()
    feedbackMsg.value = `❌ 错误！正确答案: ${current.text}，重新听写`
    feedbackType.value = 'wrong'
    setStatus('✗ 拼写错误', true)
    cancelSpeechAndTimer()
    currentTimeout = setTimeout(() => {
      currentTimeout = null
      if (practiceActive.value && currentWordObj.value && !currentWordObj.value.removed) {
        speakWord(current.text, () => {
          if (practiceActive.value) playIndicatorText.value = '🎧 再次输入...'
        })
        userSpelling.value = ''
      }
    }, 800)
  }
}

function scheduleNextListen() {
  if (!practiceActive.value || currentMode.value !== 'listen') return
  const next = getNextPending()
  if (!next) {
    finishPractice('🏁 所有单词播放完毕！')
    return
  }
  const delay = intervalSec.value * 1000
  currentTimeout = setTimeout(() => {
    currentTimeout = null
    if (practiceActive.value && currentMode.value === 'listen' && next) {
      currentWordObj.value = next
      prepareListenWord(next)
      speakWord(next.text, () => scheduleNextListen())
    }
  }, delay)
}

function markCurrentMastered() {
  if (!practiceActive.value || currentMode.value !== 'listen') {
    setStatus('仅在只听模式进行中可用', true)
    return
  }
  const current = currentWordObj.value
  if (!current || current.removed) {
    setStatus('当前单词已移除', true)
    return
  }
  current.removed = true
  masteredSet.value.add(current.text)
  persistData()
  setStatus(`✅ 已掌握：“${current.text}” 已从列表移除`)
  cancelSpeechAndTimer()
  const next = getNextPending()
  if (!next) {
    finishPractice('🎉 所有单词已掌握！')
    return
  }
  currentWordObj.value = next
  prepareListenWord(next)
  speakWord(next.text, () => scheduleNextListen())
}

function startPractice() {
  if (!activeWords.value.length) {
    setStatus('没有待学习单词，请加载单词表', true)
    return
  }
  practiceActive.value = true
  cancelSpeechAndTimer()
  const first = getNextPending()
  if (!first) return
  currentWordObj.value = first
  if (currentMode.value === 'dictate') {
    prepareDictateWord(first)
    playIndicatorText.value = `🔊 朗读: ${first.text}`
    speakWord(first.text, () => {
      if (practiceActive.value) playIndicatorText.value = '🎧 等待拼写...'
    })
  } else {
    prepareListenWord(first)
    playIndicatorText.value = `🔊 朗读: ${first.text}`
    speakWord(first.text, () => scheduleNextListen())
  }
  setStatus(`🎧 开始${currentMode.value === 'dictate' ? '听写' : '只听'}模式`)
}

function pausePractice() {
  if (!practiceActive.value) {
    setStatus('没有进行中的练习')
    return
  }
  practiceActive.value = false
  cancelSpeechAndTimer()
  playIndicatorText.value = '⏸️ 暂停'
  setStatus('⏸️ 已暂停')
}

function stopPractice() {
  if (practiceActive.value) practiceActive.value = false
  cancelSpeechAndTimer()
  currentWordObj.value = null
  playIndicatorText.value = '⚪ 已结束'
  setStatus('⏹️ 练习结束')
}

function finishPractice(msg: string) {
  practiceActive.value = false
  cancelSpeechAndTimer()
  setStatus(msg)
  currentWordObj.value = null
  playIndicatorText.value = '✅ 完成'
}

function replayCurrent() {
  const current = currentWordObj.value
  if (!current || current.removed) {
    setStatus('无当前单词可重播', true)
    return
  }
  cancelSpeechAndTimer()
  speakWord(current.text, () => {
    if (practiceActive.value && currentMode.value === 'dictate') playIndicatorText.value = '🎧 等待拼写...'
    else if (practiceActive.value && currentMode.value === 'listen') scheduleNextListen()
  })
}

function loadAndReset() {
  const parsed = parseUniqueWordList(wordRawInput.value)
  if (!parsed.length) {
    setStatus('未检测到有效单词', true)
    return
  }
  if (practiceActive.value) {
    cancelSpeechAndTimer()
    practiceActive.value = false
  }
  wordItems.value = parsed.map((text) => ({ text, removed: false }))
  wrongDict.value = new Set()
  masteredSet.value = new Set()
  currentWordObj.value = null
  userSpelling.value = ''
  playIndicatorText.value = '⚪ 就绪'
  persistData()
  setStatus(`✅ 加载 ${wordItems.value.length} 个单词`)
}

function fullClearCache() {
  removeLocalStorageValue(CACHE_KEY)
  wordItems.value = []
  wrongDict.value = new Set()
  masteredSet.value = new Set()
  practiceActive.value = false
  cancelSpeechAndTimer()
  currentWordObj.value = null
  userSpelling.value = ''
  playIndicatorText.value = '⚪ 等待开始'
  setStatus('🗑 缓存已清除')
}

const recordTitle = computed(() =>
  currentMode.value === 'dictate' ? '❌ 听写错词本' : '✅ 已掌握单词 (只听模式)',
)
const recordWords = computed(() =>
  currentMode.value === 'dictate' ? Array.from(wrongDict.value) : masteredWords.value,
)
const showRecordPanel = computed(() => recordWords.value.length > 0)

function persistData() {
  const store = buildDictationCache({
    mode: currentMode.value,
    wordItems: wordItems.value,
    wrongDict: Array.from(wrongDict.value),
    masteredSet: Array.from(masteredSet.value),
    selectedVoiceURI: selectedVoiceURI.value,
    speechRate: speechRate.value,
    intervalSec: intervalSec.value,
  })
  const result = writeLocalStorageValue(CACHE_KEY, JSON.stringify(store))
  if (!result.ok) setStatus('本地保存失败，请清理浏览器空间后重试', true)
}

function loadCache(): boolean {
  const data = parseDictationCache(readLocalStorageValue(CACHE_KEY))
  if (!data) return false
  currentMode.value = data.mode
  wordItems.value = data.wordItems
  wrongDict.value = new Set(data.wrongDict)
  masteredSet.value = new Set(data.masteredSet)
  selectedVoiceURI.value = data.selectedVoiceURI
  speechRate.value = data.speechRate
  intervalSec.value = data.intervalSec
  return true
}

function initVoices() {
  stopVoiceObserver = observeSpeechVoices((list) => {
    voices.value = list
    let preferred = voices.value.find((v) => v.lang.toLowerCase() === 'en-gb')?.voiceURI
    if (!preferred) preferred = voices.value[0]?.voiceURI ?? ''
    if (preferred && !voices.value.some((v) => v.voiceURI === selectedVoiceURI.value)) {
      selectedVoiceURI.value = preferred
    }
  })
}

function voiceLabel(voice: SpeechSynthesisVoice): string {
  return formatEnglishVoiceLabel(voice)
}

function setMode(mode: Mode) {
  if (practiceActive.value) stopPractice()
  currentMode.value = mode
  playIndicatorText.value = mode === 'dictate' ? '⚪ 就绪' : '⚪ 待开始'
  setStatus(`切换到${mode === 'dictate' ? '听写模式' : '只听模式'}`)
}

function submitOnEnter() {
  if (practiceActive.value && currentMode.value === 'dictate') handleSubmit()
}

onMounted(() => {
  const cached = loadCache()
  initVoices()
  if (cached && wordItems.value.length) {
    setStatus('💾 恢复缓存进度')
  }
})

onBeforeUnmount(() => {
  stopVoiceObserver()
  cancelSpeechAndTimer()
})
</script>

<template>
  <div class="dictation-app">
    <div class="container">
      <div class="card">
        <div class="header">
          <div class="header-top">
            <h1>📖 雅思单词舱</h1>
            <div class="mode-switch">
              <button class="mode-btn" :class="{ active: currentMode === 'dictate' }" type="button" @click="setMode('dictate')">✍️ 听写模式</button>
              <button class="mode-btn" :class="{ active: currentMode === 'listen' }" type="button" @click="setMode('listen')">🎧 只听模式</button>
            </div>
          </div>
          <div class="subhead">听写模式：自动校对拼写，正确移除单词 · 只听模式：顺序播放，自由标记掌握</div>
        </div>

        <div class="content">
          <!-- 导入 -->
          <div class="input-card">
            <div class="label-icon">📋 粘贴单词表 (支持换行 / 英文逗号)</div>
            <textarea v-model="wordRawInput" rows="3" placeholder="e.g.&#10;analyze, consequence, environment&#10;significant&#10;therefore, beneficial"></textarea>
            <div class="btn-group">
              <button class="btn btn-primary" type="button" @click="loadAndReset">📖 加载并重置进度</button>
              <button class="btn btn-danger" type="button" @click="fullClearCache">🗑 清除缓存</button>
            </div>
          </div>

          <!-- 控制栏 -->
          <div class="control-bar">
            <div class="voice-settings">
              <div class="select-voice">
                <span>🎙️ 发音人</span>
                <select v-model="selectedVoiceURI" aria-label="发音人选择" @change="persistData">
                  <option v-for="v in voices" :key="v.voiceURI" :value="v.voiceURI">{{ voiceLabel(v) }}</option>
                </select>
              </div>
              <div class="rate-control">
                <span>⚡ 语速</span>
                <input v-model.number="speechRate" type="range" min="0.5" max="1.5" step="0.05" @input="persistData" />
                <span>{{ speechRate.toFixed(2) }}</span>
              </div>
            </div>
            <div class="playback-buttons">
              <button class="btn btn-primary" type="button" @click="startPractice">▶ 开始</button>
              <button class="btn" type="button" @click="pausePractice">⏸️ 暂停</button>
              <button class="btn" type="button" @click="stopPractice">⏹️ 结束</button>
              <button class="btn" type="button" @click="replayCurrent">🔊 重播</button>
            </div>
            <div class="interval-box">
              <span>⏱️ 间隔</span>
              <input v-model.number="intervalSec" type="number" min="0.5" max="5" step="0.5" @input="persistData" />
              <span>秒</span>
            </div>
          </div>

          <!-- 听写模式 -->
          <div v-if="currentMode === 'dictate'" class="dynamic-panel">
            <div class="indicator">{{ playIndicatorText }}</div>
            <div>
              <input
                v-model="userSpelling"
                type="text"
                class="spelling-input"
                placeholder="输入单词拼写..."
                autocomplete="off"
                :disabled="!practiceActive"
                @keydown.enter="submitOnEnter"
              />
            </div>
            <div style="margin-top: 16px;">
              <button class="btn btn-primary" type="button" :disabled="!practiceActive" @click="handleSubmit">✏️ 提交答案</button>
            </div>
            <div v-if="feedbackMsg" class="feedback" :class="feedbackType">{{ feedbackMsg }}</div>
          </div>

          <!-- 只听模式 -->
          <div v-else class="dynamic-panel">
            <div class="indicator">{{ playIndicatorText }}</div>
            <div style="margin-top: 8px; color: #5a6e7c;">🎵 只听模式：自动顺序播放，点击单词可跳转，可手动标记“掌握”移除</div>
            <div style="margin-top: 12px;">
              <button class="btn" style="background: #d9f0e3; color: #1f6e43;" type="button" @click="markCurrentMastered">✅ 标记当前单词为已掌握</button>
            </div>
          </div>

          <!-- 单词库 -->
          <div class="word-list-area">
            <div class="section-title">📖 单词库 <span>({{ remainingCount }})</span></div>
            <div class="word-grid">
              <template v-if="activeWords.length">
                <div
                  v-for="w in activeWords"
                  :key="w.text"
                  class="word-chip"
                  :class="{ 'current-highlight': currentWordObj?.text === w.text }"
                  @click="jumpToWord(w)"
                >
                  {{ w.text }}
                </div>
              </template>
              <div v-else class="word-chip" style="background: transparent;">🎉 所有单词已完成！</div>
            </div>
          </div>

          <!-- 记录面板 -->
          <div v-if="showRecordPanel" class="record-panel" style="display: block;">
            <div class="record-title">{{ recordTitle }}</div>
            <div class="record-list">
              <span v-for="w in recordWords" :key="w" class="record-badge" :style="currentMode === 'listen' ? 'background:#e0f2e9;' : ''">{{ w }}</span>
            </div>
          </div>

          <div class="status-msg" :class="{ error: statusError }">{{ globalStatusMsg }}</div>
        </div>
        <footer>支持英音优先 · 苹果设计 · 自动缓存进度</footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.status-msg.error {
  background: #ffe6e5 !important;
  color: #bc1c2e !important;
}

.spelling-input:disabled {
  opacity: 0.6;
}
</style>
