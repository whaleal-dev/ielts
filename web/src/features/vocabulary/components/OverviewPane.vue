<script setup lang="ts">
/**
 * 总览页 —— 复刻 legacy #overviewPage 结构：
 * overview-card > metrics-grid + learning-footprint(热力图) + insight-card(7天折线)。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { init, type EChartsType } from '@/shared/charts/echarts'

import { useVocabularyStore } from '../stores/vocabulary'
import { library } from '../data/library'
import { computeDailySeries, computeCurrentStudyStreak } from '../domain/stats'
import { isDifficultyDue } from '../domain/review'
import HeatmapGrid from './HeatmapGrid.vue'

const store = useVocabularyStore()
const chartEl = ref<HTMLDivElement | null>(null)
let chart: EChartsType | null = null

const wordStats = computed(() => store.data.wordStats)
const masteredCount = computed(() => Object.values(wordStats.value).filter((s) => s.mastered).length)
const coveredWords = computed(() => Object.values(wordStats.value).filter((s) => s.count > 0).length)
const totalWords = computed(() => library.allWords.length)
const streak = computed(() => computeCurrentStudyStreak(store.data.studyLog))
const dailySeries = computed(() => computeDailySeries(store.data.studyLog, 7))
const today = computed(() => dailySeries.value[dailySeries.value.length - 1])
const dueCount = computed(() => {
  let due = 0
  for (const key of Object.keys(store.data.difficultWords)) {
    if (isDifficultyDue(store.data.difficultWords[key])) due += 1
  }
  return due
})

const metrics = computed(() => [
  { label: '已学词汇', value: `${coveredWords.value} / ${totalWords.value}` },
  { label: '已掌握', value: String(masteredCount.value) },
  { label: '连续学习', value: `${streak.value} 天` },
  { label: '难词（到期）', value: `${Object.keys(store.data.difficultWords).length}（${dueCount.value}）` },
])

const dailyCards = computed(() => [
  { label: '今日学习', value: today.value?.learned ?? 0 },
  { label: '今日掌握', value: today.value?.mastered ?? 0 },
  { label: '今日复习', value: today.value?.reviewed ?? 0 },
])

function renderChart() {
  if (!chartEl.value) return
  if (!chart) {
    try {
      chart = init(chartEl.value, undefined, { renderer: 'canvas' })
    } catch {
      return
    }
  }
  chart.setOption({
    grid: { left: 40, right: 20, top: 34, bottom: 26 },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, data: ['学习', '掌握', '复习'], textStyle: { color: '#556171' } },
    xAxis: { type: 'category', data: dailySeries.value.map((d) => d.label), axisLine: { lineStyle: { color: 'rgba(15,23,42,0.14)' } } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: 'rgba(15,23,42,0.06)' } } },
    series: [
      { name: '学习', type: 'line', smooth: true, data: dailySeries.value.map((d) => d.learned), itemStyle: { color: '#1473ff' }, lineStyle: { color: '#1473ff', width: 2 }, areaStyle: { opacity: 0.06 } },
      { name: '掌握', type: 'line', smooth: true, data: dailySeries.value.map((d) => d.mastered), itemStyle: { color: '#17b26a' }, lineStyle: { color: '#17b26a', width: 2 }, areaStyle: { opacity: 0.06 } },
      { name: '复习', type: 'line', smooth: true, data: dailySeries.value.map((d) => d.reviewed), itemStyle: { color: '#f1b53d' }, lineStyle: { color: '#f1b53d', width: 2 }, areaStyle: { opacity: 0.06 } },
    ],
  })
}

function onResize() {
  chart?.resize()
}

onMounted(() => {
  renderChart()
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
  chart = null
})

watch(dailySeries, () => renderChart(), { deep: true })
</script>

<template>
  <section class="page-section glass overview-card">
    <div class="chapter-header">
      <div>
        <div class="section-label">Overview</div>
        <h2 class="chapter-title" style="margin-top: 8px;">学习总览</h2>
      </div>
      <div class="meta-stack">
        <div class="small-text">查看最近 1 个月的学习足迹和总体进度。</div>
      </div>
    </div>

    <div class="metrics-grid">
      <div v-for="m in metrics" :key="m.label" class="metric-card">
        <div class="metric-label">{{ m.label }}</div>
        <div class="metric-value mono">{{ m.value }}</div>
      </div>
    </div>

    <section class="secondary-panel learning-footprint">
      <div class="queue-toolbar">
        <div>
          <div class="section-label">Learning Footprint</div>
          <div class="small-text">最近 1 个月每天的学习次数热力图。</div>
        </div>
        <span class="pill">最近 1 个月</span>
      </div>
      <div class="footprint-card">
        <div class="footprint-grid-wrap">
          <HeatmapGrid :days="30" />
        </div>
        <div class="footprint-legend" style="margin-top: 10px;">
          <span>少</span>
          <span class="footprint-legend-scale" aria-hidden="true">
            <span class="footprint-cell level-0"></span>
            <span class="footprint-cell level-1"></span>
            <span class="footprint-cell level-2"></span>
            <span class="footprint-cell level-3"></span>
            <span class="footprint-cell level-4"></span>
          </span>
          <span>多</span>
        </div>
      </div>
    </section>

    <section class="secondary-panel insight-card">
      <div class="queue-toolbar">
        <div>
          <div class="section-label">Learning Pulse</div>
          <div class="small-text">最近 7 天：学习过的词、手动标记为已学会的词、以及难词复习量。</div>
        </div>
        <span class="pill">最近 7 天</span>
      </div>
      <div class="daily-stats-grid" style="margin-top: 12px;">
        <div v-for="card in dailyCards" :key="card.label" class="daily-mini-card">
          <div class="metric-label">{{ card.label }}</div>
          <div class="daily-mini-value mono">{{ card.value }}</div>
        </div>
      </div>
      <div ref="chartEl" class="daily-chart" style="margin-top: 12px;"></div>
    </section>
  </section>
</template>
