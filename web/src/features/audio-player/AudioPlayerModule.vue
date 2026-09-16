<script setup lang="ts">
/**
 * 本地音频顺序播放器 —— 忠实还原 audio-playlist-player/音频顺序播放器.html（核心引擎）。
 * 说明：系统词库增强（system_library_enhancer.js + 词库音频数据）为外部注入面板，
 * 待 listening/语料数据层统一后单独接入，见 PARITY 备注。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import './styles/legacy-full.css'
import '@/styles/editorial-modules.css'
import {
  clampRate,
  clampRepeats,
  getNextPlaylistIndex as getNextPlaylistIndexByRule,
  pickRandomIndex as pickRandomIndexByRule,
} from './domain/playback'
import type { PlayMode } from './domain/playback'

const HISTORY_DB_NAME = 'audio_playlist_history_db'
const HISTORY_STORE_NAME = 'history_files'

interface PlaylistFile {
  id: string
  name: string
  file: File
  url: string
  duration: number | null
}

interface HistoryEntry {
  id: string
  name: string
  size: number
  type: string
  lastModified: number
  updatedAt: number
  blob: File
}

interface PlaylistItem {
  id: string
  fileId: string
  rate: number
  repeats: number
  useGlobalRate: boolean
  useGlobalRepeats: boolean
}

/* ---------- 状态 ---------- */
const files = ref<PlaylistFile[]>([])
const historyFiles = ref<HistoryEntry[]>([])
const playlist = ref<PlaylistItem[]>([])
const currentIndex = ref(-1)
const currentLoop = ref(0)
const isPlaying = ref(false)
const isPaused = ref(false)
const activeItemId = ref<string | null>(null)
const statusMessage = ref('准备就绪')
const statusWarning = ref(false)

const autoPauseRemainingMs = ref<number | null>(null)
const autoPauseDeadline = ref<number | null>(null)
const autoPauseTriggered = ref(false)

const currentTimeLabel = ref('00:00')
const durationLabel = ref('00:00')
const progressPercent = ref('0%')
const volume = ref(1)
const playModeValue = ref<PlayMode>('sequence')

const globalRate = ref(1)
const globalRepeats = ref(1)
const timerMinutes = ref(120)
const newItemSource = ref('')

const playlistMeta = computed(() => `${playlist.value.length} 个播放项`)
const libraryMeta = computed(() => `${files.value.length} 个音频文件`)

const audioRef = ref<HTMLAudioElement | null>(null)
let statusClearTimeout: ReturnType<typeof setTimeout> | null = null
let autoPauseTimeout: ReturnType<typeof setTimeout> | null = null

/* ---------- 基础工具 ---------- */
let idCounter = 0
function createId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDuration(seconds: number | null): string {
  return Number.isFinite(seconds) && seconds !== null && (seconds ?? 0) > 0
    ? formatTime(seconds as number)
    : '时长未知'
}

function formatFileSize(bytes: number | null): string {
  if (!Number.isFinite(bytes) || (bytes ?? 0) <= 0) return '大小未知'
  const value = bytes as number
  if (value < 1024) return `${value} B`
  const kb = value / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function getFileById(fileId: string): PlaylistFile | undefined {
  return files.value.find((f) => f.id === fileId)
}

function getEffectiveRate(item: PlaylistItem): number {
  return item.useGlobalRate ? globalRate.value : clampRate(item.rate)
}

function getEffectiveRepeats(item: PlaylistItem): number {
  return item.useGlobalRepeats ? globalRepeats.value : clampRepeats(item.repeats)
}

function updateStatus(message: string, isWarning = false) {
  const text = String(message).trim()
  statusMessage.value = text
  statusWarning.value = Boolean(isWarning)
  if (statusClearTimeout) clearTimeout(statusClearTimeout)
  statusClearTimeout = setTimeout(() => {
    if (!isPlaying.value && !isPaused.value) {
      statusMessage.value = '准备就绪'
      statusWarning.value = false
    }
  }, 5500)
}

/* ---------- 定时自动暂停 ---------- */
function clearTimerArtifacts() {
  if (autoPauseTimeout) {
    clearTimeout(autoPauseTimeout)
    autoPauseTimeout = null
  }
  autoPauseDeadline.value = null
}

function armAutoPause(remainingMs: number) {
  clearTimerArtifacts()
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    autoPauseRemainingMs.value = null
    return
  }
  autoPauseRemainingMs.value = remainingMs
  autoPauseDeadline.value = Date.now() + remainingMs
  autoPauseTimeout = setTimeout(() => {
    autoPauseRemainingMs.value = 0
    autoPauseTriggered.value = true
    pausePlayback('定时器到点，已自动暂停。')
  }, remainingMs)
}

function initializeRunTimer() {
  const minutes = clampMinutes(timerMinutes.value)
  autoPauseTriggered.value = false
  if (minutes <= 0) {
    clearTimerArtifacts()
    autoPauseRemainingMs.value = null
    return
  }
  armAutoPause(minutes * 60 * 1000)
}

function pauseRunTimer() {
  if (autoPauseDeadline.value) {
    autoPauseRemainingMs.value = Math.max(0, autoPauseDeadline.value - Date.now())
  }
  clearTimerArtifacts()
}

function resumeRunTimer() {
  if (autoPauseTriggered.value || autoPauseRemainingMs.value === 0) {
    initializeRunTimer()
    return
  }
  if (autoPauseRemainingMs.value !== null) {
    armAutoPause(autoPauseRemainingMs.value)
  }
}

function clampMinutes(value: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(999, Math.max(0, parsed)) : 0
}

function setTimerPreset(minutes: number) {
  timerMinutes.value = clampMinutes(minutes)
}

/* ---------- 历史缓存 ---------- */
function openHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('当前浏览器不支持 IndexedDB。'))
      return
    }
    const request = indexedDB.open(HISTORY_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        db.createObjectStore(HISTORY_STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开历史缓存数据库。'))
  })
}

function createHistoryId(file: File): string {
  return [file.name, file.size, file.lastModified, file.type || ''].join('::')
}

async function loadHistoryFilesFromCache(): Promise<HistoryEntry[]> {
  const db = await openHistoryDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, 'readonly')
    const request = transaction.objectStore(HISTORY_STORE_NAME).getAll()
    request.onsuccess = () => {
      const entries = ((request.result as HistoryEntry[]) || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      resolve(entries)
    }
    request.onerror = () => reject(request.error || new Error('读取历史缓存失败。'))
  })
}

async function saveFilesToHistoryCache(fileList: File[]) {
  const db = await openHistoryDb()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(HISTORY_STORE_NAME)
    for (const file of fileList) {
      store.put({
        id: createHistoryId(file),
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        updatedAt: Date.now(),
        blob: file,
      })
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('写入历史缓存失败。'))
  })
}

async function deleteHistoryFileById(historyId: string) {
  const db = await openHistoryDb()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, 'readwrite')
    transaction.objectStore(HISTORY_STORE_NAME).delete(historyId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('删除历史文件失败。'))
  })
}

async function clearHistoryCache() {
  const db = await openHistoryDb()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE_NAME, 'readwrite')
    transaction.objectStore(HISTORY_STORE_NAME).clear()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('清空历史缓存失败。'))
  })
}

function historyEntryToFile(entry: HistoryEntry): File {
  return new File([entry.blob], entry.name, {
    type: entry.type || 'audio/mpeg',
    lastModified: entry.lastModified || Date.now(),
  })
}

async function refreshHistoryLibrary() {
  try {
    historyFiles.value = await loadHistoryFilesFromCache()
  } catch (error) {
    historyFiles.value = []
    updateStatus(`历史缓存不可用：${(error as Error).message || '未知错误。'}`, true)
  }
}

async function addHistoryEntry(entry: HistoryEntry) {
  addFiles([historyEntryToFile(entry)], { persistHistory: false })
}

async function removeHistoryEntry(entry: HistoryEntry) {
  try {
    await deleteHistoryFileById(entry.id)
    await refreshHistoryLibrary()
    updateStatus(`已从历史缓存删除：${entry.name}`)
  } catch {
    updateStatus('删除历史缓存失败。', true)
  }
}

async function addAllHistory() {
  if (!historyFiles.value.length) {
    updateStatus('当前没有可导入的历史音频。', true)
    return
  }
  addFiles(historyFiles.value.map(historyEntryToFile), { persistHistory: false })
}

async function clearAllHistory() {
  if (!historyFiles.value.length) return
  if (!window.confirm('确认清空全部历史音频缓存吗？')) return
  try {
    await clearHistoryCache()
    await refreshHistoryLibrary()
    updateStatus('历史音频缓存已清空。')
  } catch {
    updateStatus('清空历史缓存失败。', true)
  }
}

/* ---------- 音频库 / 播放清单 ---------- */
function loadDurationForFile(fileItem: PlaylistFile) {
  const probe = document.createElement('audio')
  probe.preload = 'metadata'
  probe.src = fileItem.url
  probe.addEventListener('loadedmetadata', () => {
    fileItem.duration = Number.isFinite(probe.duration) ? probe.duration : null
  }, { once: true })
  probe.addEventListener('error', () => {
    fileItem.duration = null
  }, { once: true })
}

function makePlaylistItem(fileId: string): PlaylistItem {
  return {
    id: createId('item'),
    fileId: fileId || (files.value[0]?.id ?? ''),
    rate: globalRate.value,
    repeats: globalRepeats.value,
    useGlobalRate: false,
    useGlobalRepeats: false,
  }
}

function addFiles(fileList: Iterable<File>, options: { persistHistory?: boolean } = {}) {
  const { persistHistory = true } = options
  const incoming = Array.from(fileList).filter(
    (file) => file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name),
  )
  if (!incoming.length) {
    updateStatus('没有检测到可用的音频文件，请上传 mp3 或其他常见音频格式。', true)
    return
  }
  incoming.forEach((file) => {
    const fileItem: PlaylistFile = {
      id: createId('file'),
      name: file.name,
      file,
      url: URL.createObjectURL(file),
      duration: null,
    }
    files.value.push(fileItem)
    playlist.value.push(makePlaylistItem(fileItem.id))
    loadDurationForFile(fileItem)
  })
  updateStatus(`已加入 ${incoming.length} 个音频文件，并自动生成对应播放项。`)
  if (persistHistory) {
    saveFilesToHistoryCache(incoming)
      .then(refreshHistoryLibrary)
      .catch(() => updateStatus('音频已加入，但历史缓存写入失败。', true))
  }
}

function removeFile(fileId: string) {
  const index = files.value.findIndex((f) => f.id === fileId)
  if (index === -1) return
  const [removed] = files.value.splice(index, 1)
  URL.revokeObjectURL(removed.url)
  const removedBeforeCurrent = playlist.value.reduce((count, item, playlistIndex) => {
    if (item.fileId !== fileId) return count
    return playlistIndex < currentIndex.value ? count + 1 : count
  }, 0)
  playlist.value = playlist.value.filter((item) => item.fileId !== fileId)
  if (currentIndex.value >= 0 && removedBeforeCurrent > 0) {
    currentIndex.value = Math.max(0, currentIndex.value - removedBeforeCurrent)
  }
  if (activeItemId.value && !playlist.value.some((item) => item.id === activeItemId.value)) {
    stopPlayback('当前播放项对应的文件已移除，已停止播放。')
  } else {
    updateStatus(`已移除音频：${removed.name}`)
  }
}

function addPlaylistItem(fileId: string) {
  playlist.value.push(makePlaylistItem(fileId))
}

function moveItem(itemId: string, direction: number) {
  const from = playlist.value.findIndex((item) => item.id === itemId)
  if (from === -1) return
  const to = from + direction
  if (to < 0 || to >= playlist.value.length) return
  const [item] = playlist.value.splice(from, 1)
  playlist.value.splice(to, 0, item)
  if (currentIndex.value === from) {
    currentIndex.value = to
  } else if (currentIndex.value > from && currentIndex.value <= to) {
    currentIndex.value -= 1
  } else if (currentIndex.value < from && currentIndex.value >= to) {
    currentIndex.value += 1
  }
}

function duplicateItem(itemId: string) {
  const from = playlist.value.findIndex((item) => item.id === itemId)
  if (from === -1) return
  const source = playlist.value[from]
  playlist.value.splice(from + 1, 0, { ...source, id: createId('item') })
  if (currentIndex.value > from) currentIndex.value += 1
}

function removePlaylistItem(itemId: string) {
  const removedIndex = playlist.value.findIndex((item) => item.id === itemId)
  playlist.value = playlist.value.filter((item) => item.id !== itemId)
  if (removedIndex !== -1 && currentIndex.value > removedIndex) {
    currentIndex.value -= 1
  }
  if (activeItemId.value === itemId) {
    stopPlayback('当前播放项已删除，已停止播放。')
  } else {
    updateStatus('已删除一个播放项。')
  }
}

function updatePlaylistField(item: PlaylistItem, field: 'fileId' | 'rate' | 'repeats' | 'useGlobalRate' | 'useGlobalRepeats', rawValue: string | number | boolean) {
  if (field === 'fileId') item.fileId = String(rawValue)
  if (field === 'rate') item.rate = clampRate(Number(rawValue))
  if (field === 'repeats') item.repeats = clampRepeats(Number(rawValue))
  if (field === 'useGlobalRate') item.useGlobalRate = Boolean(rawValue)
  if (field === 'useGlobalRepeats') item.useGlobalRepeats = Boolean(rawValue)
  const audio = audioRef.value
  if (activeItemId.value === item.id && audio) {
    if (field === 'rate' || field === 'useGlobalRate') {
      audio.playbackRate = getEffectiveRate(item)
    }
    if (isPlaying.value && field === 'fileId') {
      audio.pause()
      currentLoop.value = Math.max(1, currentLoop.value || 1)
      void playCurrentItem()
    }
  }
}

/* ---------- 播放引擎 ---------- */
function pickRandomIndex(excludeIndex: number): number {
  return pickRandomIndexByRule(playlist.value.length, excludeIndex)
}

function getNextPlaylistIndex(current: number): number {
  return getNextPlaylistIndexByRule(playlist.value.length, current, playModeValue.value)
}

function validatePlaylist(): boolean {
  if (!playlist.value.length) {
    updateStatus('播放清单为空，请先上传音频或新增播放项。', true)
    return false
  }
  const invalidIndex = playlist.value.findIndex((item) => !getFileById(item.fileId))
  if (invalidIndex !== -1) {
    updateStatus(`第 ${invalidIndex + 1} 个播放项还没有绑定音频文件。`, true)
    return false
  }
  return true
}

function startPlayback() {
  if (!validatePlaylist()) return
  isPlaying.value = true
  isPaused.value = false
  currentIndex.value = playModeValue.value === 'shuffle' ? pickRandomIndex(-1) : 0
  currentLoop.value = 1
  initializeRunTimer()
  void playCurrentItem()
}

async function playCurrentItem(options: { restart?: boolean } = {}) {
  const { restart = true } = options
  const item = playlist.value[currentIndex.value]
  if (!item) {
    completePlayback()
    return
  }
  const fileItem = getFileById(item.fileId)
  if (!fileItem) {
    updateStatus('当前播放项没有可用音频，已跳过。', true)
    advanceToNextItem()
    return
  }
  activeItemId.value = item.id
  const audio = audioRef.value
  if (!audio) return
  const rate = getEffectiveRate(item)
  currentLoop.value = Math.max(1, currentLoop.value || 1)
  audio.playbackRate = rate
  if (restart || audio.src !== fileItem.url) {
    audio.src = fileItem.url
    audio.currentTime = 0
  }
  try {
    await audio.play()
  } catch (error) {
    console.warn('播放失败：', error)
    pausePlayback()
  }
}

function advanceToNextItem() {
  const nextIndex = getNextPlaylistIndex(currentIndex.value)
  if (nextIndex === -1) {
    completePlayback()
    return
  }
  currentIndex.value = nextIndex
  currentLoop.value = 1
  void playCurrentItem()
}

function completePlayback() {
  const completedItems = playlist.value.length
  resetPlaybackState(true)
  updateStatus(`播放完成，共处理 ${completedItems} 个播放项。`)
}

function pausePlayback(message?: string) {
  if (!isPlaying.value) return
  audioRef.value?.pause()
  isPlaying.value = false
  isPaused.value = true
  pauseRunTimer()
  if (message) updateStatus(message)
}

function resumePlayback() {
  if (!isPaused.value) return
  isPlaying.value = true
  isPaused.value = false
  resumeRunTimer()
  void playCurrentItem({ restart: false })
}

function stopPlayback(message?: string) {
  resetPlaybackState(true)
  if (message) updateStatus(message)
}

function resetPlaybackState(_keepStatusMessage: boolean) {
  currentIndex.value = -1
  currentLoop.value = 0
  isPlaying.value = false
  isPaused.value = false
  activeItemId.value = null
  autoPauseTriggered.value = false
  autoPauseRemainingMs.value = null
  clearTimerArtifacts()
  const audio = audioRef.value
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
  progressPercent.value = '0%'
  currentTimeLabel.value = '00:00'
  durationLabel.value = '00:00'
}

function onTogglePlayPause() {
  if (!isPlaying.value && !isPaused.value) startPlayback()
  else if (isPlaying.value) pausePlayback()
  else resumePlayback()
}

function onAudioEnded() {
  if (!isPlaying.value) return
  const item = playlist.value[currentIndex.value]
  if (!item) {
    completePlayback()
    return
  }
  const repeats = getEffectiveRepeats(item)
  if (currentLoop.value < repeats) {
    currentLoop.value += 1
    void playCurrentItem()
    return
  }
  advanceToNextItem()
}

function onAudioTimeUpdate() {
  const audio = audioRef.value
  if (!audio) return
  const dur = audio.duration
  const cur = audio.currentTime
  currentTimeLabel.value = formatTime(cur)
  if (!Number.isFinite(dur) || dur <= 0) {
    progressPercent.value = '0%'
    durationLabel.value = '00:00'
    return
  }
  progressPercent.value = `${((cur / dur) * 100).toFixed(2)}%`
  durationLabel.value = formatTime(dur)
}

function onAudioLoadedMetadata() {
  const audio = audioRef.value
  if (!audio) return
  const dur = audio.duration
  durationLabel.value = Number.isFinite(dur) ? formatTime(dur) : '00:00'
}

/* ---------- 文件输入/拖拽 ---------- */
const dragActive = ref(false)

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragActive.value = false
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  dragActive.value = true
}

function onDragLeave() {
  dragActive.value = false
}

function clearFilesLibrary() {
  files.value.forEach((f) => URL.revokeObjectURL(f.url))
  files.value = []
  playlist.value = []
  stopPlayback('已清空音频库和播放清单。')
}

function applyGlobalSettings(mode: 'rate' | 'repeats' | 'all') {
  const gRate = globalRate.value
  const gRepeats = globalRepeats.value
  playlist.value.forEach((item) => {
    if (mode === 'rate' || mode === 'all') {
      item.rate = gRate
      item.useGlobalRate = false
    }
    if (mode === 'repeats' || mode === 'all') {
      item.repeats = gRepeats
      item.useGlobalRepeats = false
    }
  })
  updateStatus('已将全局配置同步到全部播放项。')
}

function sourceExtension(name: string | undefined): string {
  if (!name) return '--'
  const ext = name.split('.').pop() || ''
  return ext.toUpperCase() || '--'
}

/* 快捷键：空格播放/暂停 */
function onGlobalKeydown(event: KeyboardEvent) {
  if (event.code !== 'Space') return
  const tagName = (event.target as HTMLElement | null)?.tagName?.toLowerCase() ?? ''
  if (['input', 'textarea', 'select', 'button'].includes(tagName)) return
  event.preventDefault()
  if (!isPlaying.value && !isPaused.value) startPlayback()
  else if (isPlaying.value) pausePlayback()
  else resumePlayback()
}

onMounted(async () => {
  await refreshHistoryLibrary()
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  clearTimerArtifacts()
  files.value.forEach((f) => URL.revokeObjectURL(f.url))
})
</script>

<template>
  <div class="audio-player-app">
    <div class="shell">
      <section class="hero">
        <div class="hero-top">
          <div>
            <h1>本地音频顺序播放器</h1>
            <p>上传本地 mp3 或其他音频文件后，按清单顺序播放。每一项都可以单独设置倍速和播放次数，也可以跟随全局默认值；支持复制条目做出“同一首音频多种配置”的播放队列。</p>
          </div>
          <div class="hero-note">
            <strong>适合场景</strong>
            <span>例如：1.mp3 播 1 遍，再以 1.2 倍速播 2 遍，然后切到 2.mp3 连播 3 遍。定时器到点后会自动暂停。</span>
          </div>
        </div>
      </section>

      <div class="layout">
        <div class="row-two">
          <section class="panel">
            <h2>上传音频库</h2>
            <p class="panel-subtext">支持多选和拖拽。上传后会自动生成播放条目，你也可以手动新增条目或复制已有条目。</p>
            <div class="upload-zone" :class="{ dragging: dragActive }" @dragover.prevent="onDragOver" @dragenter.prevent="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
              <input id="fileInput" type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg" multiple hidden @change="onFileChange" />
              <p>把音频拖到这里，或者点击下面按钮选择文件。</p>
              <div class="toolbar">
                <label class="button-like primary-btn" for="fileInput">选择音频文件</label>
                <button class="ghost-btn" type="button" :disabled="!files.length" @click="clearFilesLibrary">清空音频库</button>
              </div>
            </div>
            <div class="pill-list">
              <div v-if="!files.length" class="empty-state">当前还没有上传音频。</div>
              <div v-for="file in files" :key="file.id" class="file-pill">
                <div>
                  <strong>{{ file.name }}</strong>
                  <span>{{ formatDuration(file.duration) }}</span>
                </div>
                <button class="danger-btn" type="button" @click="removeFile(file.id)">移除</button>
              </div>
            </div>
          </section>

          <section class="panel">
            <h2>历史音频</h2>
            <p class="panel-subtext">上传过的音频会缓存到浏览器，本地可重复导入。</p>
            <div class="toolbar" style="margin-top: 0;">
              <button class="secondary-btn" type="button" :disabled="!historyFiles.length" @click="addAllHistory">全部加入音频库</button>
              <button class="ghost-btn" type="button" @click="refreshHistoryLibrary">刷新历史</button>
              <button class="danger-btn" type="button" :disabled="!historyFiles.length" @click="clearAllHistory">清空缓存</button>
            </div>
            <div class="pill-list">
              <div v-if="!historyFiles.length" class="empty-state">暂无历史缓存音频。</div>
              <div v-for="entry in historyFiles" :key="entry.id" class="file-pill">
                <div>
                  <strong>{{ entry.name }}</strong>
                  <span>{{ formatFileSize(entry.size) }}</span>
                </div>
                <div class="item-actions">
                  <button class="secondary-btn" type="button" @click="addHistoryEntry(entry)">加入</button>
                  <button class="danger-btn" type="button" @click="removeHistoryEntry(entry)">删除</button>
                </div>
              </div>
            </div>
            <p class="history-panel-note">缓存仅保存在当前浏览器内；清空缓存不会影响当前播放清单。</p>
          </section>
        </div>

        <section class="panel">
          <h2>全局配置</h2>
          <div class="field-grid">
            <div class="field">
              <label for="globalRate">默认倍速</label>
              <input v-model.number="globalRate" id="globalRate" type="number" min="0.6" max="2" step="0.2" />
            </div>
            <div class="field">
              <label for="globalRepeats">默认次数</label>
              <input v-model.number="globalRepeats" id="globalRepeats" type="number" min="1" max="10" step="1" />
            </div>
            <div class="field">
              <label for="timerMinutes">自动暂停分钟数</label>
              <input v-model.number="timerMinutes" id="timerMinutes" type="number" min="0" max="999" step="0.1" placeholder="0 表示不启用" />
              <div class="timer-preset-row">
                <button class="timer-preset-btn" type="button" @click="setTimerPreset(0)">关闭</button>
                <button class="timer-preset-btn" type="button" @click="setTimerPreset(30)">30 分钟</button>
                <button class="timer-preset-btn" type="button" @click="setTimerPreset(60)">60 分钟</button>
                <button class="timer-preset-btn" type="button" @click="setTimerPreset(90)">90 分钟</button>
              </div>
            </div>
            <div class="field">
              <label for="newItemSource">快速新增条目</label>
              <select id="newItemSource" v-model="newItemSource">
                <option value="">选择音频文件</option>
                <option v-for="f in files" :key="f.id" :value="f.id">{{ f.name }}</option>
              </select>
            </div>
          </div>
          <div class="toolbar">
            <button class="secondary-btn" type="button" :disabled="!files.length" @click="addPlaylistItem(newItemSource)">新增播放项</button>
            <button class="ghost-btn" type="button" :disabled="!playlist.length" @click="applyGlobalSettings('rate')">同步倍速到全部</button>
            <button class="ghost-btn" type="button" :disabled="!playlist.length" @click="applyGlobalSettings('repeats')">同步次数到全部</button>
            <button class="ghost-btn" type="button" :disabled="!playlist.length" @click="applyGlobalSettings('all')">同步全部配置</button>
          </div>
          <p class="panel-subtext" style="margin-top: 14px; margin-bottom: 0;">条目勾选“跟随全局”时，播放时会自动取这里的默认值。同步按钮会直接写入每个条目的自定义值。</p>
        </section>

        <section class="panel">
          <div class="queue-header">
            <div>
              <h2>播放清单</h2>
              <p class="panel-subtext" style="margin-bottom: 0;">每个播放项都可单独设置文件、倍速、次数。倍速和次数支持独立切换为“跟随全局”。</p>
            </div>
            <div class="queue-meta">
              <span>{{ playlistMeta }}</span>
              <span>{{ libraryMeta }}</span>
            </div>
          </div>
          <div class="queue-list">
            <div v-if="!playlist.length" class="empty-state">播放清单为空。先上传音频，或者从左侧“快速新增条目”手动添加。</div>
            <article v-for="(item, index) in playlist" :key="item.id" class="queue-item" :class="{ active: item.id === activeItemId }">
              <div class="item-head">
                <div style="display: flex; gap: 14px; align-items: center; flex: 1 1 420px; min-width: 0;">
                  <div class="item-index">{{ index + 1 }}</div>
                  <div style="min-width: 0;">
                    <strong style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ getFileById(item.fileId)?.name ?? '未选择音频' }}</strong>
                    <span class="muted">{{ getFileById(item.fileId) ? formatDuration(getFileById(item.fileId)?.duration ?? null) : '请为这个条目选择一个已上传的音频' }}</span>
                  </div>
                </div>
                <div class="item-actions">
                  <button class="ghost-btn" type="button" @click="moveItem(item.id, -1)">上移</button>
                  <button class="ghost-btn" type="button" @click="moveItem(item.id, 1)">下移</button>
                  <button class="secondary-btn" type="button" @click="duplicateItem(item.id)">复制</button>
                  <button class="danger-btn" type="button" @click="removePlaylistItem(item.id)">删除</button>
                </div>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label>音频文件</label>
                  <select :value="item.fileId" @change="updatePlaylistField(item, 'fileId', ($event.target as HTMLSelectElement).value)">
                    <option value="">请先上传音频</option>
                    <option v-for="f in files" :key="f.id" :value="f.id">{{ f.name }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>自定义倍速</label>
                  <input type="number" min="0.6" max="2" step="0.2" :value="clampRate(item.rate).toFixed(2)" :disabled="item.useGlobalRate" @change="updatePlaylistField(item, 'rate', Number(($event.target as HTMLInputElement).value))" />
                  <label class="checkbox-line">
                    <input type="checkbox" :checked="item.useGlobalRate" @change="updatePlaylistField(item, 'useGlobalRate', ($event.target as HTMLInputElement).checked)" />
                    跟随全局倍速（当前 {{ getEffectiveRate(item).toFixed(2) }}x）
                  </label>
                </div>
                <div class="field">
                  <label>自定义次数</label>
                  <input type="number" min="1" max="10" step="1" :value="String(clampRepeats(item.repeats))" :disabled="item.useGlobalRepeats" @change="updatePlaylistField(item, 'repeats', Number(($event.target as HTMLInputElement).value))" />
                  <label class="checkbox-line">
                    <input type="checkbox" :checked="item.useGlobalRepeats" @change="updatePlaylistField(item, 'useGlobalRepeats', ($event.target as HTMLInputElement).checked)" />
                    跟随全局次数（当前 {{ getEffectiveRepeats(item) }} 遍）
                  </label>
                </div>
                <div class="item-meta">
                  <div class="meta-chip"><span>实际倍速</span><strong>{{ getEffectiveRate(item).toFixed(2) }}x</strong></div>
                  <div class="meta-chip"><span>实际次数</span><strong>{{ getEffectiveRepeats(item) }} 遍</strong></div>
                  <div class="meta-chip">
                    <span>累计播放</span>
                    <strong>{{ getFileById(item.fileId) ? formatDuration((getFileById(item.fileId)?.duration || 0) * getEffectiveRepeats(item)) : '--' }}</strong>
                  </div>
                  <div class="meta-chip"><span>音频来源</span><strong>{{ sourceExtension(getFileById(item.fileId)?.name) }}</strong></div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>

      <!-- 悬浮播放状态条 -->
      <section class="floating-status">
        <button
          id="startBtn"
          title="播放 / 暂停 / 继续"
          style="background: none; border: none; padding: 0 10px; font-size: 1.6em; vertical-align: middle; cursor: pointer; outline: none;"
          type="button"
          @click="onTogglePlayPause"
        >
          {{ isPlaying && !isPaused ? '⏸️' : '▶️' }}
        </button>
        <div class="progress-track mini-progress" style="flex: 1 1 auto; max-width: 420px; margin: 0 10px;">
          <div class="progress-fill" :style="{ width: progressPercent }"></div>
        </div>
        <span style="min-width: 48px; text-align: right; font-variant-numeric: tabular-nums; font-size: 1em; color: #0a84ff; margin: 0 8px;">{{ currentTimeLabel }}</span>
        <span style="color: #888;">/</span>
        <span style="min-width: 48px; text-align: left; font-variant-numeric: tabular-nums; font-size: 1em; color: #888; margin: 0 8px;">{{ durationLabel }}</span>
        <input v-model.number="volume" type="range" min="0" max="1" step="0.01" title="音量" style="width: 60px; vertical-align: middle; margin: 0 10px;" @input="audioRef && (audioRef.volume = volume)" />
        <button id="stopBtn" title="停止" style="background: none; border: none; padding: 0 10px; font-size: 1.3em; vertical-align: middle; cursor: pointer; outline: none; color: #d70015;" type="button" @click="stopPlayback()">⏹️</button>
        <span class="status-chip" :class="{ warning: statusWarning }" aria-live="polite">{{ statusMessage }}</span>
        <select v-model="playModeValue" title="播放模式" style="font-size: 0.82em; border: 1px solid rgba(17, 24, 39, 0.15); border-radius: 8px; padding: 3px 6px; background: #fff;">
          <option value="sequence">顺序</option>
          <option value="loop">循环</option>
          <option value="shuffle">随机</option>
        </select>
        <audio ref="audioRef" id="audioPlayer" preload="metadata" style="display: none;" @ended="onAudioEnded" @timeupdate="onAudioTimeUpdate" @loadedmetadata="onAudioLoadedMetadata" />
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 原 CSS 未覆盖的清单行补充样式（行为对齐 legacy renderPlaylist 结构） */
.queue-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.queue-meta {
  display: flex;
  gap: 10px;
  font-size: 0.8rem;
  color: var(--text-secondary, #556171);
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.queue-item {
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 251, 255, 0.9));
  padding: 14px;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.05);
}

.queue-item.active {
  border-color: rgba(10, 132, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(10, 132, 255, 0.12);
}

.item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.item-index {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(10, 132, 255, 0.1);
  color: #0a84ff;
  font-weight: 700;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.item-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.item-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.meta-chip {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(17, 24, 39, 0.07);
  padding: 8px 10px;
  display: grid;
  gap: 2px;
}

.meta-chip span {
  font-size: 0.72rem;
  color: var(--text-secondary, #556171);
}

.meta-chip strong {
  font-size: 0.9rem;
}

.checkbox-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 0.75rem;
  color: var(--text-secondary, #556171);
}

.empty-state {
  color: var(--text-secondary, #556171);
  font-size: 0.9rem;
  padding: 8px 0;
}

.pill-list .empty-state {
  font-size: 0.85rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2e90ff, #0a84ff);
  border-radius: 999px;
  min-width: 0;
}
</style>
