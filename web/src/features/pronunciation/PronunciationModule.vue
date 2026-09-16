<script setup lang="ts">
/**
 * 单词精听器 —— 忠实还原 legacy dictionary/发音.html（IELTS 单词精听舱）。
 * 批量粘贴词表 → 本地 TTS（优先英音）逐个精听。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { cancelSpeech, formatEnglishVoiceLabel, observeSpeechVoices } from '@/shared/speech/voices'

import './styles/legacy-full.css'
import '@/styles/editorial-modules.css'
import { parseWordList } from './model/words'

const wordListInput = ref(
  'adequate, beneficial, consequence\nenvironment\nsignificant\ntherefore\nanalyse',
)
const words = ref<string[]>([])
const currentIndex = ref(0)
const rate = ref(0.9)
const selectedVoiceURI = ref('')
const status = ref('✅ 就绪，粘贴单词并点击「生成单词表」')
const statusError = ref(false)

let availableVoices: SpeechSynthesisVoice[] = []
let currentUtterance: SpeechSynthesisUtterance | null = null
let stopVoiceObserver: () => void = () => undefined

const indexCounter = computed(() =>
  words.value.length ? `第${currentIndex.value + 1} / ${words.value.length}个单词` : '第0 / 0个单词',
)
const currentWord = computed(() => words.value[currentIndex.value] ?? '——')
const wordCountText = computed(() => `${words.value.length}个单词`)

function setStatus(text: string, isError = false) {
  status.value = text
  statusError.value = isError
  if (isError) {
    setTimeout(() => {
      if (status.value === text) {
        statusError.value = false
        status.value = '✅ 就绪'
      }
    }, 2500)
  }
}

function stopSpeaking() {
  cancelSpeech()
  if (currentUtterance) {
    currentUtterance.onend = null
    currentUtterance.onerror = null
    currentUtterance = null
  }
}

function speakWord(word: string): boolean {
  if (!word || word.trim() === '') {
    setStatus('⚠️ 当前单词为空，无法发音', true)
    return false
  }
  if (!window.speechSynthesis) {
    setStatus('⚠️ 当前浏览器不支持语音合成', true)
    return false
  }
  stopSpeaking()
  let voiceObj: SpeechSynthesisVoice | null = null
  if (selectedVoiceURI.value && availableVoices.length) {
    voiceObj = availableVoices.find((v) => v.voiceURI === selectedVoiceURI.value) ?? null
  }
  if (!voiceObj && availableVoices.length) {
    voiceObj =
      availableVoices.find((v) => v.lang.toLowerCase().startsWith('en-gb')) ??
      availableVoices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
      null
  }
  const utterance = new SpeechSynthesisUtterance(word)
  if (voiceObj) utterance.voice = voiceObj
  utterance.rate = rate.value
  utterance.pitch = 1.0
  utterance.volume = 1
  utterance.onstart = () => setStatus(`🎧 正在朗读: ${word}`)
  utterance.onend = () => {
    setStatus(`✅ 完成: ${word}`)
    currentUtterance = null
  }
  utterance.onerror = (err) => {
    console.warn('TTS error', err)
    setStatus(`⚠️ 发音失败: ${word}，可尝试换一种语音或检查浏览器权限`, true)
    currentUtterance = null
  }
  currentUtterance = utterance
  try {
    window.speechSynthesis.speak(utterance)
    return true
  } catch (error) {
    setStatus(`语音引擎出错: ${(error as Error).message}`, true)
    return false
  }
}

function playCurrentWord() {
  if (!words.value.length) {
    setStatus('📭 单词列表为空，请先粘贴并生成单词表', true)
    return
  }
  const word = words.value[currentIndex.value]
  if (!word) return
  speakWord(word)
}

function loadWordList() {
  const parsed = parseWordList(wordListInput.value)
  if (!parsed.length) {
    setStatus('⚠️ 未检测到有效单词，请用逗号或换行分隔填写', true)
    return
  }
  words.value = parsed
  currentIndex.value = 0
  setStatus(`✅ 成功加载 ${words.value.length} 个单词，开始雅思精听之旅`)
  if (words.value.length) setTimeout(playCurrentWord, 100)
}

function fullClear() {
  stopSpeaking()
  words.value = []
  currentIndex.value = 0
  wordListInput.value = ''
  setStatus('🗑 已清空所有单词表，可粘贴新内容')
}

function resetList() {
  if (!words.value.length) {
    setStatus('没有单词表，请先生成', true)
    return
  }
  stopSpeaking()
  currentIndex.value = 0
  setStatus(`⟳ 已重置到第一个单词: ${words.value[0]}`)
  playCurrentWord()
}

function moveWord(step: number) {
  if (!words.value.length) {
    setStatus('单词表为空', true)
    return
  }
  const next = currentIndex.value + step
  if (next < 0) {
    setStatus('📌 已经是第一个单词')
  } else if (next >= words.value.length) {
    setStatus('🏁 已是最后一个单词，可继续复习')
  } else {
    stopSpeaking()
    currentIndex.value = next
  }
  playCurrentWord()
}

function jumpToWord(index: number) {
  stopSpeaking()
  currentIndex.value = index
  playCurrentWord()
}

function pauseSpeaking() {
  if (!words.value.length) {
    setStatus('无单词播放任务')
    return
  }
  if (window.speechSynthesis && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    stopSpeaking()
    setStatus(`⏸️ 暂停发音: ${words.value[currentIndex.value]}`)
  } else {
    setStatus('⏸️ 当前没有正在朗读的单词')
  }
}

function voiceLabel(voice: SpeechSynthesisVoice): string {
  return formatEnglishVoiceLabel(voice)
}

const voiceOptions = ref<SpeechSynthesisVoice[]>([])

function updateVoiceDropdown(voices: SpeechSynthesisVoice[]) {
  voiceOptions.value = voices
  if (!voices.length) {
    selectedVoiceURI.value = ''
    return
  }
  let ukVoice =
    voices.find((v) => v.lang === 'en-GB' && /Google UK|Microsoft George|Daniel/.test(v.name)) ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    null
  for (const voice of voices) {
    if (voice.default && !ukVoice) ukVoice = voice
  }
  if (ukVoice) selectedVoiceURI.value = ukVoice.voiceURI
  else if (voices.length) selectedVoiceURI.value = voices[0].voiceURI
}

onMounted(() => {
  stopVoiceObserver = observeSpeechVoices((voices) => {
    availableVoices = voices
    updateVoiceDropdown(voices)
  })
  setStatus('🔊 雅思模式就绪，英音引擎已优先启用')
})

onBeforeUnmount(() => {
  stopVoiceObserver()
  cancelSpeech()
})
</script>

<template>
  <div class="pronunciation-app">
    <div class="container">
      <div class="main-card">
        <div class="header">
          <h1>IELTS 单词精听舱</h1>
          <div class="sub">🇬🇧 纯正英式发音优先 · 支持批量粘贴单词表 · 逐个精听</div>
        </div>

        <div class="content">
          <!-- 批量粘贴 -->
          <div class="batch-area">
            <div class="batch-title">📋 批量粘贴单词表</div>
            <textarea
              v-model="wordListInput"
              rows="3"
              class="word-textarea"
              placeholder="每行一个单词，或用逗号分隔，例如：&#10;consequence, environment, significant&#10;analyze"
            ></textarea>
            <div class="batch-buttons">
              <button class="btn btn-primary" type="button" @click="loadWordList">✨ 生成单词表</button>
              <button class="btn btn-outline" type="button" @click="fullClear">🗑 清空全部</button>
              <button class="btn btn-outline" type="button" @click="resetList">⟳ 重置列表</button>
            </div>
          </div>

          <!-- 当前单词控制台 -->
          <div class="current-section">
            <div class="word-badge">{{ indexCounter }}</div>
            <div class="current-word">{{ currentWord }}</div>
            <div class="control-group">
              <button class="ctrl-btn ctrl-btn-secondary" type="button" @click="moveWord(-1)">◀ 上一个</button>
              <button class="ctrl-btn ctrl-btn-primary" type="button" @click="playCurrentWord">🔊 播放当前</button>
              <button class="ctrl-btn ctrl-btn-secondary" type="button" @click="pauseSpeaking">⏸️ 暂停</button>
              <button class="ctrl-btn ctrl-btn-secondary" type="button" @click="moveWord(1)">下一个 ▶</button>
            </div>
            <div class="voice-row">
              <div class="select-voice">
                <label style="font-size: 0.75rem; font-weight: 500;">🎙️ 发音人 (首选英式雅思口音)</label>
                <select v-model="selectedVoiceURI" aria-label="发音人选择">
                  <option v-if="!voiceOptions.length" value="" disabled>⚠️ 未检测到语音</option>
                  <option v-for="voice in voiceOptions" :key="voice.voiceURI" :value="voice.voiceURI">
                    {{ voiceLabel(voice) }}
                  </option>
                </select>
              </div>
              <div class="rate-slider">
                <label style="font-size: 0.75rem; font-weight: 500;">⚡ 语速 <span>{{ rate.toFixed(2) }}</span></label>
                <input v-model.number="rate" type="range" min="0.5" max="1.8" step="0.05" />
              </div>
            </div>
            <div class="status" :class="{ error: statusError }">{{ status }}</div>
          </div>

          <!-- 单词列表预览 -->
          <div class="list-container">
            <div class="list-header">
              <span class="list-title">📖 单词清单 · 点击任意单词快速跳转</span>
              <span class="word-count-badge">{{ wordCountText }}</span>
            </div>
            <div class="word-grid">
              <template v-if="words.length">
                <button
                  v-for="(w, i) in words"
                  :key="`${w}-${i}`"
                  class="word-chip"
                  :class="{ active: i === currentIndex }"
                  type="button"
                  @click="jumpToWord(i)"
                >
                  {{ w }}
                </button>
              </template>
              <div v-else class="empty-state">✨ 上方粘贴雅思词汇，点击「生成单词表」即可开始学习</div>
            </div>
          </div>
        </div>

        <footer>💡 提示：基于本地浏览器语音合成，推荐使用 Chrome / Edge / Safari，并确保系统安装英式语音包（如 Microsoft George, Google UK English）以获得最纯正发音。</footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.word-count-badge {
  font-size: 0.75rem;
  background: #eef2f6;
  padding: 2px 10px;
  border-radius: 40px;
}

.status.error {
  background: #fee2e2 !important;
  color: #b91c1c !important;
}
</style>
