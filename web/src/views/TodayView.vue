<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  readLearningEvents,
  summarizeLearningEvents,
  type LearningEvent,
} from '@/shared/learning-events/events'
import { readLocalStorageValue, writeLocalStorageValue } from '@/shared/storage/chunked-local-storage'

const TRACKER_KEY = 'daily-learning-tracker-state-v4'
const WEEKLY_TARGET_SECONDS = 240 * 60

interface TodayTodo {
  id: string
  text: string
  priority: '高' | '中' | '低' | '长期'
  done: boolean
  createdAt: string
  completedAt: string
}

const events = ref<LearningEvent[]>([])
const todos = ref<TodayTodo[]>([])
const newTodoText = ref('')
const storageError = ref('')

const todayText = computed(() => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date()))
const eventSummary = computed(() => summarizeLearningEvents(events.value))
const pendingTodos = computed(() => todos.value.filter((todo) => !todo.done))
const completedTodos = computed(() => todos.value.filter((todo) => todo.done))
const weeklyDurationSeconds = computed(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  return events.value
    .filter((event) => event.type === 'session_completed' && new Date(event.occurredAt).getTime() >= cutoff)
    .reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0)
})
const weeklyProgress = computed(() => Math.min(100, Math.round((weeklyDurationSeconds.value / WEEKLY_TARGET_SECONDS) * 100)))
const latestSession = computed(() =>
  [...events.value]
    .reverse()
    .find((event) => event.type === 'session_completed' || event.type === 'session_started'),
)
const continueRoute = computed(() => latestSession.value ? `/${latestSession.value.moduleId}` : '/corpus-dictation')
const continueTitle = computed(() => latestSession.value?.title || '语料库章节听写')

const recentActivity = computed(() => eventSummary.value.latest.map((event) => ({
  id: event.id,
  title: eventTitle(event),
  meta: `${moduleLabel(event.moduleId)} · ${formatRelativeTime(event.occurredAt)}`,
})))

function moduleLabel(moduleId: string): string {
  const labels: Record<string, string> = {
    'corpus-dictation': '语料库听写',
    vocabulary: '词汇学习',
    dictation: '单词听写',
    'listen-dictation': '只听循环',
  }
  return labels[moduleId] ?? '学习训练'
}

function eventTitle(event: LearningEvent): string {
  if (event.type === 'session_completed') {
    const total = event.metrics?.total
    const correct = event.metrics?.correct
    return total ? `完成 ${event.title || '一轮训练'} · ${correct ?? 0}/${total}` : `完成 ${event.title || '一轮训练'}`
  }
  if (event.type === 'session_started') return `开始 ${event.title || '一轮训练'}`
  if (event.type === 'mistake_added') return `新增错词 ${event.references?.word || event.title || ''}`
  return `掌握单词 ${event.references?.word || event.title || ''}`
}

function formatRelativeTime(value: string): string {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return '时间未知'
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}

function formatDuration(seconds: number): string {
  if (seconds > 0 && seconds < 60) return '<1 分钟'
  const minutes = Math.round(seconds / 60)
  return minutes ? `${minutes} 分钟` : '0 分钟'
}

function readTrackerState(): Record<string, unknown> {
  try {
    const raw = readLocalStorageValue(TRACKER_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function loadTodos() {
  const state = readTrackerState()
  todos.value = Array.isArray(state.todoItems)
    ? state.todoItems.filter((item): item is TodayTodo => Boolean(item) && typeof item === 'object' && typeof item.text === 'string')
    : []
}

function saveTodos() {
  const state = readTrackerState()
  state.todoItems = todos.value
  const result = writeLocalStorageValue(TRACKER_KEY, JSON.stringify(state))
  storageError.value = result.ok ? '' : 'Todo 保存失败，请先在全局设置导出备份并清理浏览器空间。'
}

function addTodo() {
  const text = newTodoText.value.trim()
  if (!text) return
  todos.value.push({
    id: `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    priority: '中',
    done: false,
    createdAt: new Date().toISOString(),
    completedAt: '',
  })
  newTodoText.value = ''
  saveTodos()
}

function toggleTodo(todo: TodayTodo) {
  todo.done = !todo.done
  todo.completedAt = todo.done ? new Date().toISOString() : ''
  saveTodos()
}

function refreshData() {
  events.value = readLearningEvents()
  loadTodos()
}

function onStorage(event: StorageEvent) {
  if (event.key === TRACKER_KEY || event.key?.startsWith('ielts-dev-learning-events-v1')) refreshData()
}

onMounted(() => {
  refreshData()
  window.addEventListener('storage', onStorage)
})

onBeforeUnmount(() => window.removeEventListener('storage', onStorage))
</script>

<template>
  <div class="today-page">
    <header class="today-heading">
      <div>
        <p class="today-kicker">{{ todayText }}</p>
        <h1>先完成今天，再回看长期趋势</h1>
        <p>计划、训练、记录和复盘在同一条学习链路里流转。</p>
      </div>
      <div class="today-heading-actions">
        <RouterLink class="today-secondary-action" to="/study-tracker">快速记录</RouterLink>
        <RouterLink class="today-primary-action" :to="continueRoute">继续上次训练</RouterLink>
      </div>
    </header>

    <div class="today-layout">
      <div class="today-main-column">
        <section class="today-focus">
          <div>
            <p class="today-kicker">当前建议 · 听力训练闭环</p>
            <h2>{{ continueTitle }}</h2>
            <p>完成训练后，时长、正确率和错词会自动回到今日工作台。</p>
            <div class="today-focus-actions">
              <RouterLink class="today-primary-action" :to="continueRoute">开始训练</RouterLink>
              <RouterLink class="today-text-link" to="/plans">查看学习路径 →</RouterLink>
            </div>
          </div>
          <div class="today-progress" :style="{ '--progress': `${weeklyProgress}%` }" :aria-label="`本周目标完成 ${weeklyProgress}%`">
            <span><strong>{{ weeklyProgress }}%</strong><small>本周目标</small></span>
          </div>
        </section>

        <section class="today-section today-tasks">
          <div class="today-section-head">
            <div><p class="today-kicker">TODAY</p><h2>今日计划</h2></div>
            <span>{{ pendingTodos.length }} 项待完成</span>
          </div>
          <div class="today-add-row">
            <input v-model="newTodoText" type="text" placeholder="添加今天要完成的动作" @keyup.enter="addTodo" />
            <button type="button" @click="addTodo">添加</button>
          </div>
          <p v-if="storageError" class="today-error" role="alert">{{ storageError }}</p>
          <div class="today-task-list">
            <label v-for="todo in pendingTodos" :key="todo.id" class="today-task">
              <input type="checkbox" :checked="todo.done" @change="toggleTodo(todo)" />
              <span><strong>{{ todo.text }}</strong><small>{{ todo.priority }}优先级 · 来自今日计划</small></span>
            </label>
            <div v-if="!pendingTodos.length" class="today-empty">
              <strong>今天还没有手动计划</strong>
              <span>可以添加一个动作，或直接开始推荐训练。</span>
            </div>
          </div>
          <details v-if="completedTodos.length" class="today-completed">
            <summary>已完成 {{ completedTodos.length }} 项</summary>
            <label v-for="todo in completedTodos" :key="todo.id" class="today-task is-completed">
              <input type="checkbox" :checked="todo.done" @change="toggleTodo(todo)" />
              <span><strong>{{ todo.text }}</strong></span>
            </label>
          </details>
        </section>
      </div>

      <aside class="today-section today-activity">
        <div class="today-section-head">
          <div><p class="today-kicker">ACTIVITY</p><h2>学习动态</h2></div>
        </div>
        <div class="today-metrics">
          <div><strong>{{ formatDuration(eventSummary.todayDurationSeconds) }}</strong><span>今日训练</span></div>
          <div><strong>{{ eventSummary.recentMistakeCount }}</strong><span>近 7 天错词</span></div>
        </div>
        <div v-if="recentActivity.length" class="today-activity-list">
          <div v-for="item in recentActivity" :key="item.id" class="today-activity-item">
            <i></i>
            <div><strong>{{ item.title }}</strong><span>{{ item.meta }}</span></div>
          </div>
        </div>
        <div v-else class="today-empty compact">
          <strong>暂无跨模块动态</strong>
          <span>完成一次语料库听写后，这里会出现真实训练结果。</span>
        </div>
      </aside>
    </div>

    <section class="today-capabilities">
      <RouterLink to="/corpus-dictation">
        <span class="today-capability-index">01</span>
        <div><h3>听力训练</h3><p>语料听写、单词听写、只听循环与音频复播。</p></div>
        <span>进入训练 →</span>
      </RouterLink>
      <RouterLink to="/vocabulary">
        <span class="today-capability-index">02</span>
        <div><h3>词汇复习</h3><p>集中处理训练中产生的错词和个人难词。</p></div>
        <span>{{ eventSummary.recentMistakeCount }} 个近期错词 →</span>
      </RouterLink>
      <RouterLink to="/study-tracker">
        <span class="today-capability-index">03</span>
        <div><h3>记录与复盘</h3><p>查看自动采集结果，补充主观评分与晚间复盘。</p></div>
        <span>查看记录 →</span>
      </RouterLink>
    </section>
  </div>
</template>

<style scoped>
.today-page {
  width: min(calc(100% - 48px), var(--site-width));
  margin: 0 auto;
  padding: 40px 0 96px;
}

.today-heading {
  position: relative;
  min-height: 420px;
  margin-bottom: 22px;
  padding: clamp(38px, 6vw, 72px);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background:
    radial-gradient(circle at 88% 8%, rgba(104, 112, 235, 0.48), transparent 34%),
    radial-gradient(circle at 68% 110%, rgba(80, 89, 214, 0.18), transparent 38%),
    var(--color-night);
  color: #fff;
}

.today-heading::before {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.13) 0.7px, transparent 0.7px);
  background-size: 22px 22px;
  content: '';
  opacity: 0.22;
  pointer-events: none;
}

.today-heading > * {
  position: relative;
}

.today-heading h1 {
  max-width: 760px;
  margin: 0;
  font-size: clamp(48px, 6.7vw, 84px);
  letter-spacing: -0.065em;
  line-height: 0.94;
}

.today-heading > div > p:last-child {
  margin: 20px 0 0;
  color: rgba(255, 255, 255, 0.58);
  line-height: 1.7;
}

.today-kicker {
  margin: 0 0 10px;
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.today-heading-actions,
.today-focus-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.today-primary-action,
.today-secondary-action {
  min-height: 42px;
  padding: 0 17px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.today-primary-action {
  background: var(--color-accent);
  color: #fff;
}

.today-secondary-action {
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.today-text-link {
  color: var(--color-muted);
  font-size: 13px;
  font-weight: 650;
}

.today-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.72fr);
  gap: 18px;
}

.today-main-column {
  display: grid;
  gap: 18px;
}

.today-focus,
.today-section,
.today-capabilities > a {
  border: 1px solid var(--color-line);
  border-radius: 14px;
  background: var(--color-surface);
}

.today-focus {
  min-height: 235px;
  padding: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
}

.today-focus h2 {
  margin: 0;
  font-size: clamp(26px, 4vw, 38px);
  letter-spacing: -0.045em;
}

.today-focus > div > p:not(.today-kicker) {
  max-width: 600px;
  margin: 13px 0 22px;
  color: var(--color-muted);
  line-height: 1.7;
}

.today-progress {
  --progress: 0%;
  width: 124px;
  aspect-ratio: 1;
  flex: none;
  padding: 12px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(var(--color-accent) var(--progress), var(--color-soft-accent) 0);
}

.today-progress > span {
  width: 100%;
  height: 100%;
  display: grid;
  place-content: center;
  gap: 2px;
  border-radius: 50%;
  background: var(--color-surface);
  text-align: center;
}

.today-progress strong {
  font-size: 24px;
}

.today-progress small {
  color: var(--color-muted);
  font-size: 10px;
}

.today-section {
  padding: 28px;
}

.today-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.today-section-head h2 {
  margin: 0;
  font-size: 22px;
}

.today-section-head > span {
  color: var(--color-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.today-add-row {
  margin: 20px 0 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.today-add-row input {
  min-width: 0;
  height: 42px;
  padding: 0 13px;
  border: 1px solid var(--color-line);
  border-radius: 9px;
  background: #f7f5f0;
  color: var(--color-ink);
  outline: 0;
}

.today-add-row input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(104, 112, 235, 0.12);
}

.today-add-row button {
  padding: 0 16px;
  border: 0;
  border-radius: 9px;
  background: var(--color-ink);
  color: #fff;
  cursor: pointer;
  font-weight: 650;
}

.today-task-list {
  margin-top: 10px;
}

.today-task {
  min-height: 64px;
  padding: 12px 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 13px;
  align-items: center;
  border-top: 1px solid var(--color-line);
  cursor: pointer;
}

.today-task input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-accent);
}

.today-task span {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.today-task strong {
  font-size: 14px;
}

.today-task small,
.today-empty span,
.today-activity-item span {
  color: var(--color-muted);
  font-size: 12px;
}

.today-task.is-completed strong {
  color: var(--color-muted);
  text-decoration: line-through;
}

.today-completed {
  padding-top: 12px;
  border-top: 1px solid var(--color-line);
}

.today-completed summary {
  color: var(--color-muted);
  cursor: pointer;
  font-size: 12px;
}

.today-empty {
  min-height: 96px;
  display: grid;
  place-content: center;
  gap: 6px;
  text-align: center;
}

.today-empty.compact {
  min-height: 160px;
}

.today-error {
  margin: 8px 0;
  color: #a63333;
  font-size: 12px;
}

.today-activity {
  align-self: stretch;
}

.today-metrics {
  margin: 20px 0 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--color-line);
}

.today-metrics > div {
  padding: 15px;
  display: grid;
  gap: 5px;
  background: #f6f4ef;
}

.today-metrics strong {
  font-size: 18px;
}

.today-metrics span {
  color: var(--color-muted);
  font-size: 11px;
}

.today-activity-list {
  display: grid;
}

.today-activity-item {
  padding: 13px 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 11px;
  border-top: 1px solid var(--color-line);
}

.today-activity-item i {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--color-accent);
}

.today-activity-item > div {
  display: grid;
  gap: 5px;
}

.today-activity-item strong {
  font-size: 13px;
  line-height: 1.45;
}

.today-capabilities {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: 14px;
  background: var(--color-line);
}

.today-capabilities > a {
  min-width: 0;
  padding: 24px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  border: 0;
  border-radius: 0;
  transition: background-color 160ms ease;
}

.today-capabilities > a:hover {
  background: #f0efe9;
}

.today-capabilities > a > span:last-child {
  grid-column: 2;
  color: var(--color-accent);
  font-size: 12px;
  font-weight: 650;
}

.today-capability-index {
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 10px;
}

.today-capabilities h3 {
  margin: 0;
  font-size: 16px;
}

.today-capabilities p {
  margin: 7px 0 0;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 900px) {
  .today-layout {
    grid-template-columns: 1fr;
  }

  .today-capabilities {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .today-page {
    width: min(calc(100% - 28px), 1180px);
    padding-top: 18px;
  }

  .today-heading {
    min-height: 460px;
    padding: 30px 24px;
    align-items: flex-start;
    justify-content: flex-end;
    flex-direction: column;
  }

  .today-heading h1 {
    font-size: clamp(44px, 13vw, 62px);
  }

  .today-heading-actions {
    width: 100%;
  }

  .today-heading-actions a {
    flex: 1;
  }

  .today-focus {
    min-height: 0;
    padding: 22px;
  }

  .today-progress {
    display: none;
  }
}
</style>
