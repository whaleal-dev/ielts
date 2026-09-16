<script setup lang="ts">
/**
 * IELST 同义替换学习 —— 忠实还原 legacy 同义词学习/同义词学习.html。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FolderOpened,
  Search,
  Upload,
} from '@element-plus/icons-vue'

import { cancelSpeech, isEnglishVoice, observeSpeechVoices } from '@/shared/speech/voices'
import { readLocalStorageValue, writeLocalStorageValue } from '@/shared/storage/chunked-local-storage'

import './styles/legacy-full.css'
import '@/styles/editorial-modules.css'
import { parseSynonymGroups } from './model/groups'

const NOTES_KEY = 'ielts_notes_v4'
const fileInput = ref<HTMLInputElement | null>(null)

function onDrop(event: DragEvent) {
  const files = Array.from(event.dataTransfer?.files ?? [])
  for (const file of files) {
    const name = file.name.toLowerCase()
    if (!name.endsWith('.txt') && !name.endsWith('.json')) continue
    uploadFiles.value.push({ name: file.name, raw: file })
  }
}

/* ---------- 状态 ---------- */
const groups = ref<string[][]>([])
const notes = ref<Record<string, string>>({})
const voices = ref<SpeechSynthesisVoice[]>([])
const selectedVoice = ref('')
const searchQuery = ref('')
const showUploadDialog = ref(false)
const showNoteDialog = ref(false)
const uploadFiles = ref<{ name: string; raw: File }[]>([])
const noteForm = ref({ word: '', text: '' })
const currentNoteGroup = ref<string[]>([])

/* 自动播放 */
const autoPlayWordLoop = ref(2)
const autoPlayGroupLoop = ref(1)
const autoPlayRate = ref(1)
const autoPlayInterval = ref(0)
const isAutoPlaying = ref(false)
const isPaused = ref(false)
let autoPlayTimer: ReturnType<typeof setTimeout> | null = null
let stopVoiceObserver: () => void = () => undefined
let currentGroupLoopCount = 0
let currentWordLoopCount = 0

/* 高亮 */
const activeHighlight = ref<{ groupIdx: number | null; word: string | null; wordIdx: number | null }>({
  groupIdx: null,
  word: null,
  wordIdx: null,
})

/* ---------- 计算属性 ---------- */
const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return groups.value
  return groups.value.filter((g) => g.some((w) => w.toLowerCase().includes(q)))
})

const noteCount = computed(() => Object.values(notes.value).filter((t) => t && t.trim()).length)

function hasChinese(text: string | null | undefined): boolean {
  return /[一-鿿]/.test(String(text || ''))
}

/* ---------- 发音 ---------- */
function playWord(word: string, onEndCallback: (() => void) | null = null) {
  if (!window.speechSynthesis) {
    onEndCallback?.()
    return
  }
  if (hasChinese(word)) {
    onEndCallback?.()
    return
  }
  cancelSpeech()
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  const finalRate = 0.85 * autoPlayRate.value
  utterance.rate = Math.min(2.5, Math.max(0.5, finalRate))
  const voice = voices.value.find((v) => v.name === selectedVoice.value)
  if (voice) utterance.voice = voice
  if (onEndCallback) {
    utterance.onend = () => onEndCallback()
    utterance.onerror = () => onEndCallback()
  }
  window.speechSynthesis.speak(utterance)
}

/* ---------- 自动播放控制 ---------- */
function stopAutoPlay() {
  if (autoPlayTimer) {
    clearTimeout(autoPlayTimer)
    autoPlayTimer = null
  }
  cancelSpeech()
  isAutoPlaying.value = false
  isPaused.value = false
}

function pauseAutoPlay() {
  if (!isAutoPlaying.value) return
  isAutoPlaying.value = false
  isPaused.value = true
  if (autoPlayTimer) {
    clearTimeout(autoPlayTimer)
    autoPlayTimer = null
  }
  cancelSpeech()
}

/* ---------- 高亮 / 导航 ---------- */
function isWordHighlighted(groupIdx: number, word: string): boolean {
  return activeHighlight.value.groupIdx === groupIdx && activeHighlight.value.word === word
}

function updateHighlight(groupIdx: number | null, word: string | null, wordIdx?: number) {
  if (groupIdx === null || word === null) {
    activeHighlight.value = { groupIdx: null, word: null, wordIdx: null }
    return
  }
  const index = wordIdx ?? filteredGroups.value[groupIdx]?.indexOf(word) ?? -1
  activeHighlight.value = { groupIdx, word, wordIdx: index }
}

function clearHighlight() {
  activeHighlight.value = { groupIdx: null, word: null, wordIdx: null }
}

function setDefaultHighlightFromFirstValid() {
  const list = filteredGroups.value
  for (let g = 0; g < list.length; g += 1) {
    const group = list[g]
    for (let w = 0; w < group.length; w += 1) {
      if (!hasChinese(group[w])) {
        updateHighlight(g, group[w], w)
        return
      }
    }
  }
  if (list.length && list[0].length) updateHighlight(0, list[0][0], 0)
  else clearHighlight()
}

function getCurrentActivePosition(): { groupIdx: number | null; wordIdx: number | null; word: string | null } {
  const { groupIdx, wordIdx, word } = activeHighlight.value
  if (groupIdx === null || word === null) return { groupIdx: null, wordIdx: null, word: null }
  const group = filteredGroups.value[groupIdx]
  if (!group) return { groupIdx: null, wordIdx: null, word: null }
  let idx = wordIdx
  if (idx === null || idx === -1 || group[idx] !== word) {
    idx = group.indexOf(word)
    if (idx === -1) return { groupIdx: null, wordIdx: null, word: null }
  }
  return { groupIdx, wordIdx: idx, word: group[idx] }
}

function speakCurrentHighlight() {
  const { word } = activeHighlight.value
  if (word && !hasChinese(word)) playWord(word)
}

function handleWordClick(word: string, groupIdx: number, wordIdx: number) {
  if (isAutoPlaying.value || isPaused.value) stopAutoPlay()
  if (!filteredGroups.value[groupIdx]?.includes(word)) return
  updateHighlight(groupIdx, word, wordIdx)
  playWord(word)
}

function findNextValidWord(startGroupIdx: number, startWordIdx: number | null) {
  const list = filteredGroups.value
  let g = startGroupIdx
  let w = (startWordIdx ?? -1) + 1
  while (g < list.length) {
    const group = list[g]
    while (w < group.length) {
      const candidate = group[w]
      if (!hasChinese(candidate)) return { groupIdx: g, wordIdx: w, word: candidate }
      w += 1
    }
    g += 1
    w = 0
  }
  return null
}

function findPrevValidWord(startGroupIdx: number, startWordIdx: number | null) {
  const list = filteredGroups.value
  let g = startGroupIdx
  let w = (startWordIdx ?? 0) - 1
  while (g >= 0) {
    const group = list[g]
    while (w >= 0) {
      const candidate = group[w]
      if (!hasChinese(candidate)) return { groupIdx: g, wordIdx: w, word: candidate }
      w -= 1
    }
    g -= 1
    if (g >= 0) w = list[g].length - 1
  }
  return null
}

function goNextWord() {
  if (!filteredGroups.value.length) {
    ElMessage.warning('暂无词库')
    return
  }
  if (isAutoPlaying.value || isPaused.value) stopAutoPlay()
  const { groupIdx, wordIdx } = getCurrentActivePosition()
  if (groupIdx === null) {
    setDefaultHighlightFromFirstValid()
    speakCurrentHighlight()
    return
  }
  const next = findNextValidWord(groupIdx, wordIdx)
  if (next) {
    updateHighlight(next.groupIdx, next.word, next.wordIdx)
    speakCurrentHighlight()
  } else {
    ElMessage.info('已到达末尾，无下一个可播报单词')
  }
}

function goPrevWord() {
  if (!filteredGroups.value.length) return
  if (isAutoPlaying.value || isPaused.value) stopAutoPlay()
  const { groupIdx, wordIdx } = getCurrentActivePosition()
  if (groupIdx === null) {
    setDefaultHighlightFromFirstValid()
    speakCurrentHighlight()
    return
  }
  const prev = findPrevValidWord(groupIdx, wordIdx)
  if (prev) {
    updateHighlight(prev.groupIdx, prev.word, prev.wordIdx)
    speakCurrentHighlight()
  } else {
    ElMessage.info('已是第一个单词')
  }
}

/* ---------- 自动播放核心 ---------- */
function toggleAutoPlay() {
  if (isAutoPlaying.value) pauseAutoPlay()
  else if (isPaused.value) resumeAutoPlay()
  else startAutoPlayFromHighlight()
}

function startAutoPlayFromHighlight() {
  if (!filteredGroups.value.length) {
    ElMessage.warning('请先导入词库')
    return
  }
  if (autoPlayTimer) clearTimeout(autoPlayTimer)
  cancelSpeech()
  isAutoPlaying.value = true
  isPaused.value = false
  let { groupIdx, wordIdx } = activeHighlight.value
  if (groupIdx === null || !filteredGroups.value[groupIdx] || filteredGroups.value[groupIdx][wordIdx ?? -1] !== activeHighlight.value.word) {
    setDefaultHighlightFromFirstValid()
    const pos = getCurrentActivePosition()
    groupIdx = pos.groupIdx
    wordIdx = pos.wordIdx
    if (groupIdx === null) {
      isAutoPlaying.value = false
      return
    }
  }
  currentGroupLoopCount = 0
  currentWordLoopCount = 0
  doAutoPlayStepFromPosition(groupIdx, wordIdx ?? 0, 0)
}

function doAutoPlayStepFromPosition(groupIdx: number, wordIdx: number, loopCountForWord = 0) {
  if (!isAutoPlaying.value) return
  const list = filteredGroups.value
  if (groupIdx >= list.length) {
    stopAutoPlay()
    return
  }
  const group = list[groupIdx]
  if (!group || wordIdx >= group.length) {
    stopAutoPlay()
    return
  }
  const word = group[wordIdx]
  if (hasChinese(word)) {
    if (!moveToNextPositionAuto(groupIdx, wordIdx)) {
      stopAutoPlay()
      return
    }
    const pos = getCurrentActivePosition()
    if (pos.groupIdx !== null) doAutoPlayStepFromPosition(pos.groupIdx, pos.wordIdx ?? 0, 0)
    else stopAutoPlay()
    return
  }
  updateHighlight(groupIdx, word, wordIdx)
  playWord(word, () => {
    if (!isAutoPlaying.value) return
    const nextLoop = loopCountForWord + 1
    if (nextLoop < autoPlayWordLoop.value) {
      scheduleNextAutoPlayStep(groupIdx, wordIdx, nextLoop)
    } else {
      const moved = moveToNextPositionAuto(groupIdx, wordIdx)
      if (!moved) {
        stopAutoPlay()
        return
      }
      const pos = getCurrentActivePosition()
      if (pos.groupIdx !== null) scheduleNextAutoPlayStep(pos.groupIdx, pos.wordIdx ?? 0, 0)
      else stopAutoPlay()
    }
  })
}

function scheduleNextAutoPlayStep(groupIdx: number, wordIdx: number, nextLoopWordCount: number) {
  if (!isAutoPlaying.value) return
  const intervalMs = autoPlayInterval.value * 1000
  autoPlayTimer = setTimeout(() => doAutoPlayStepFromPosition(groupIdx, wordIdx, nextLoopWordCount), intervalMs)
}

function moveToNextPositionAuto(currentGroupIdx: number, currentWordIdx: number): boolean {
  const list = filteredGroups.value
  let newGroupIdx = currentGroupIdx
  let newWordIdx = currentWordIdx + 1
  if (!list[newGroupIdx]) return false
  if (newWordIdx >= list[newGroupIdx].length) {
    currentGroupLoopCount += 1
    if (currentGroupLoopCount < autoPlayGroupLoop.value) {
      newWordIdx = 0
    } else {
      currentGroupLoopCount = 0
      newGroupIdx += 1
      newWordIdx = 0
      if (newGroupIdx >= list.length) return false
    }
  }
  const targetWord = list[newGroupIdx]?.[newWordIdx]
  if (!targetWord) return false
  updateHighlight(newGroupIdx, targetWord, newWordIdx)
  return true
}

function resumeAutoPlay() {
  if (!isPaused.value) return
  isAutoPlaying.value = true
  isPaused.value = false
  const pos = getCurrentActivePosition()
  if (pos.groupIdx !== null && pos.word !== null) {
    doAutoPlayStepFromPosition(pos.groupIdx, pos.wordIdx ?? 0, currentWordLoopCount)
  } else {
    startAutoPlayFromHighlight()
  }
}

/* ---------- 笔记 ---------- */
function loadNotes() {
  try {
    const stored = readLocalStorageValue(NOTES_KEY)
    notes.value = stored ? (JSON.parse(stored) as Record<string, string>) : {}
  } catch {
    notes.value = {}
  }
}

function saveNotes(): boolean {
  return writeLocalStorageValue(NOTES_KEY, JSON.stringify(notes.value)).ok
}

function getGroupNotes(group: string[]) {
  const result: { word: string; text: string }[] = []
  const seen = new Set<string>()
  for (const word of group) {
    if (notes.value[word] && !seen.has(word)) {
      result.push({ word, text: notes.value[word] })
      seen.add(word)
    }
  }
  return result
}

async function deleteNote(word: string) {
  try {
    await ElMessageBox.confirm(`删除「${word}」的笔记？`, '提示', { confirmButtonText: '确定', type: 'warning' })
  } catch {
    return
  }
  delete notes.value[word]
  if (!saveNotes()) {
    ElMessage.error('本地保存失败，请清理浏览器空间后重试')
    return
  }
  ElMessage.success('已删除')
}

function openNoteDialog(group: string[]) {
  currentNoteGroup.value = [...group]
  noteForm.value = { word: group[0], text: '' }
  showNoteDialog.value = true
}

function resetNoteDialog() {
  noteForm.value = { word: '', text: '' }
  currentNoteGroup.value = []
}

function saveNote() {
  const { word, text } = noteForm.value
  if (!word || !currentNoteGroup.value.includes(word)) {
    ElMessage.warning('请选择词组内的单词')
    return
  }
  if (!text.trim()) {
    if (notes.value[word]) delete notes.value[word]
  } else {
    notes.value[word] = text.trim()
  }
  if (!saveNotes()) {
    ElMessage.error('本地保存失败，请清理浏览器空间后重试')
    return
  }
  ElMessage.success('笔记已保存')
  showNoteDialog.value = false
}

/* ---------- 导入 ---------- */
function initVoices() {
  stopVoiceObserver = observeSpeechVoices((list) => {
    voices.value = list
    const def = voices.value.find((v) => v.name.includes('Google') || v.name.includes('Samantha')) || voices.value[0]
    if (def) selectedVoice.value = def.name
  }, {
    filter: isEnglishVoice,
  })
}

function handleFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  for (const file of files) {
    const name = file.name.toLowerCase()
    if (!name.endsWith('.txt') && !name.endsWith('.json')) continue
    uploadFiles.value.push({ name: file.name, raw: file })
  }
  input.value = ''
}

function removeUploadFile(idx: number) {
  uploadFiles.value.splice(idx, 1)
}

function clearUploadFiles() {
  uploadFiles.value = []
}

function readFileAsGroups(file: { name: string; raw: File }): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        resolve(parseSynonymGroups(file.name, String(e.target?.result ?? '')))
      } catch {
        reject(file.name)
      }
    }
    reader.onerror = () => reject(file.name)
    reader.readAsText(file.raw)
  })
}

async function processUploadedFile() {
  if (!uploadFiles.value.length) {
    ElMessage.warning('请选择文件')
    return
  }
  const allGroups: string[][] = []
  for (const f of uploadFiles.value) {
    try {
      allGroups.push(...(await readFileAsGroups(f)))
    } catch (name) {
      ElMessage.error(`${name} 格式错误`)
    }
  }
  if (allGroups.length) {
    groups.value = allGroups
    setDefaultHighlightFromFirstValid()
    ElMessage.success(`导入 ${allGroups.length} 组`)
  }
  showUploadDialog.value = false
  uploadFiles.value = []
}

function loadSampleData() {
  groups.value = [
    ['reserve', 'book', 'prebook'],
    ['in advance', 'ahead', 'beforehand'],
    ['have to', 'must', 'should', 'need', 'require'],
    ['adjust', 'change', 'alter', 'modify'],
    ['diversity', 'various', 'different', 'variety'],
    ['fee', 'cost', 'price', 'expense', 'charge'],
    ['computer', 'laptop', 'desktop', 'mac'],
  ]
  setDefaultHighlightFromFirstValid()
  ElMessage.success('示例词库已加载，支持上一首/下一首')
}

/* ---------- 快捷键 ---------- */
function handleGlobalKeydown(e: KeyboardEvent) {
  try {
    const target = e.target as HTMLElement | null
    const inEditable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
    if (inEditable) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goNextWord()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const pos = getCurrentActivePosition()
      if (pos.groupIdx !== null && pos.word) {
        if (isAutoPlaying.value || isPaused.value) stopAutoPlay()
        playWord(pos.word)
      }
    }
  } catch {
    /* ignore */
  }
}

/* watch filteredGroups 校验高亮 */
watch(filteredGroups, (list) => {
  if (!list.length) {
    clearHighlight()
    return
  }
  const { groupIdx, word } = activeHighlight.value
  if (groupIdx !== null && word !== null && list[groupIdx]?.includes(word)) {
    const idx = list[groupIdx].indexOf(word)
    if (idx !== -1) activeHighlight.value.wordIdx = idx
  } else {
    setDefaultHighlightFromFirstValid()
  }
}, { immediate: true })

onMounted(() => {
  loadNotes()
  initVoices()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  stopVoiceObserver()
  stopAutoPlay()
})

const playStatusText = computed(() => (isAutoPlaying.value ? '⏵ 自动中' : isPaused.value ? '⏸ 已暂停' : ''))
</script>

<template>
  <div class="synonyms-app">
    <div class="app-container">
      <!-- 头部 -->
      <div class="header">
        <div class="header-title">
          <div class="icon">📖</div>
          <span>IELTS 同义替换</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <el-select v-model="selectedVoice" placeholder="选择发音语音" size="small" style="width: 190px">
            <el-option v-for="v in voices" :key="v.name" :label="v.name" :value="v.name" />
          </el-select>
          <el-button size="small" :icon="Upload" @click="showUploadDialog = true">导入词库</el-button>
          <el-button size="small" :icon="Download" @click="loadSampleData">示例词库</el-button>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="search-input">
          <el-input v-model="searchQuery" placeholder="搜索单词或同义词…" clearable size="small" :prefix-icon="Search" />
        </div>
        <span class="stats-text">📚 {{ filteredGroups.length }} 组 · 📝 {{ noteCount }} 笔记</span>
      </div>

      <!-- 自动播放面板 -->
      <div class="auto-play-panel">
        <span class="label">单词循环</span>
        <el-select v-model="autoPlayWordLoop" size="small" style="width: 70px">
          <el-option v-for="n in [1, 2, 3, 5, 10]" :key="n" :label="String(n)" :value="n" />
        </el-select>
        <span class="label">组循环</span>
        <el-select v-model="autoPlayGroupLoop" size="small" style="width: 70px">
          <el-option v-for="n in [1, 2, 3, 5, 10]" :key="n" :label="String(n)" :value="n" />
        </el-select>
        <span class="label">倍速</span>
        <el-slider v-model="autoPlayRate" :min="0.5" :max="2" :step="0.1" size="small" style="width: 80px" />
        <span style="font-size: 0.7rem; color: var(--text-secondary); min-width: 32px;">{{ autoPlayRate.toFixed(1) }}x</span>
        <span class="label">间隔</span>
        <el-select v-model="autoPlayInterval" size="small" style="width: 70px">
          <el-option v-for="n in [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]" :key="n" :label="`${n}s`" :value="n" />
        </el-select>

        <div class="nav-buttons">
          <div class="nav-btn" title="上一个单词 (可播报)" @click="goPrevWord">
            <el-icon><ArrowLeft /></el-icon>
          </div>
          <div class="nav-btn" title="下一个单词 (可播报)" @click="goNextWord">
            <el-icon><ArrowRight /></el-icon>
          </div>
        </div>
        <div class="play-btn" :class="{ playing: isAutoPlaying }" @click="toggleAutoPlay" title="自动播放 / 暂停">
          {{ isAutoPlaying ? '⏸' : '▶' }}
        </div>
        <span v-if="playStatusText" class="play-status">{{ playStatusText }}</span>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredGroups.length === 0" class="empty-state">
        <el-icon :size="40"><FolderOpened /></el-icon>
        <p>暂无词库，请导入 .txt / .json 或点击“示例词库”</p>
      </div>

      <!-- 同义词列表 -->
      <div v-else class="synonym-list">
        <div v-for="(group, groupIdx) in filteredGroups" :key="groupIdx" class="synonym-card">
          <div class="card-content">
            <div class="main-word">
              <span :class="{ 'current-word-highlight': isWordHighlighted(groupIdx, group[0]) }">
                {{ group[0] }}
              </span>
              <div class="speak-btn" title="发音" @click="handleWordClick(group[0], groupIdx, 0)">🔊</div>
            </div>
            <div class="synonyms-tags">
              <el-tag
                v-for="(syn, idx) in group.slice(1)"
                :key="`${syn}-${idx}`"
                size="small"
                class="synonym-tag"
                :class="{ 'current-word-highlight': isWordHighlighted(groupIdx, syn) }"
                effect="plain"
                @click="handleWordClick(syn, groupIdx, idx + 1)"
              >
                {{ syn }} 🔊
              </el-tag>
            </div>
            <div class="notes-area">
              <el-tag
                v-for="(note, nidx) in getGroupNotes(group)"
                :key="nidx"
                closable
                size="small"
                class="note-tag"
                type="warning"
                effect="light"
                @close="deleteNote(note.word)"
              >
                <strong>{{ note.word }}</strong>: {{ note.text }}
              </el-tag>
              <el-button text size="small" class="add-note-btn" @click="openNoteDialog(group)">+ 添加笔记</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 上传弹窗 -->
    <el-dialog v-model="showUploadDialog" title="导入同义替换词库" width="420px" center>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">
        支持 .txt（每行一组，逗号分隔）或 .json（二维数组）<br />
        空行会被忽略，含中文的词只展示不播报<br />
        支持上传多个文件，按顺序排列
      </p>
      <div
        class="upload-zone"
        @click="fileInput?.click()"
        @dragover.prevent
        @drop.prevent="onDrop"
      >
        <el-icon :size="36"><Upload /></el-icon>
        <p style="margin: 8px 0 0;">将文件拖到此处，或点击上传</p>
        <input ref="fileInput" type="file" accept=".txt,.json" multiple hidden @change="handleFilesSelected" />
      </div>
      <div v-if="uploadFiles.length" style="margin-top: 20px;">
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">待导入文件：</p>
        <ul style="list-style: none; padding: 0;">
          <li v-for="(f, fidx) in uploadFiles" :key="fidx" style="display: flex; justify-content: space-between; padding: 6px 10px; background: var(--bg); border-radius: 8px; margin-bottom: 4px;">
            <span>{{ fidx + 1 }}. {{ f.name }}</span>
            <span style="cursor: pointer;" @click="removeUploadFile(fidx)">✕</span>
          </li>
        </ul>
        <div style="text-align: center; margin-top: 12px;">
          <el-button type="success" size="small" @click="processUploadedFile">导入这些文件</el-button>
          <el-button size="small" @click="clearUploadFiles">清空</el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 笔记弹窗 -->
    <el-dialog v-model="showNoteDialog" title="添加笔记" width="380px" @closed="resetNoteDialog">
      <el-form label-width="70px" size="small">
        <el-form-item label="关联单词">
          <el-select v-model="noteForm.word" placeholder="选择单词" style="width: 100%">
            <el-option v-for="w in currentNoteGroup" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
        <el-form-item label="笔记内容">
          <el-input v-model="noteForm.text" type="textarea" :rows="3" placeholder="输入笔记…" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNoteDialog = false">取消</el-button>
        <el-button type="primary" @click="saveNote">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.upload-zone {
  border: 1.5px dashed #c0c4cc;
  border-radius: 10px;
  background: #fafcff;
  text-align: center;
  padding: 26px 10px;
  cursor: pointer;
  color: var(--text-secondary, #556171);
  font-size: 0.8rem;
}

.upload-zone:hover {
  border-color: var(--blue, #1473ff);
  color: var(--blue, #1473ff);
}
</style>
