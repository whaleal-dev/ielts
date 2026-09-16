<script setup lang="ts">
/**
 * 学习热力图 —— legacy .footprint-grid/.footprint-cell level-N 网格。
 */
import { computed } from 'vue'

import { useVocabularyStore } from '../stores/vocabulary'
import { computeDailySeries, resolveHeatmapLevel } from '../domain/stats'

const props = withDefaults(defineProps<{ days?: number }>(), { days: 30 })

const store = useVocabularyStore()

const cells = computed(() => {
  const series = computeDailySeries(store.data.studyLog, props.days)
  const totals = series.map((row) => row.learned + row.mastered + row.reviewed)
  const max = Math.max(...totals, 0)
  return series.map((row, index) => {
    const value = totals[index]
    const recent = series.length - index <= 7
    return {
      key: row.key,
      title: `${row.label} · 学习 ${row.learned} · 掌握 ${row.mastered} · 复习 ${row.reviewed}`,
      level: resolveHeatmapLevel(value, max),
      active: value > 0,
      recent,
    }
  })
})
</script>

<template>
  <div class="footprint-grid" :class="{ 'compact-month': days <= 30 }">
    <span
      v-for="cell in cells"
      :key="cell.key"
      class="footprint-cell"
      :class="[`level-${cell.level}`, { 'in-range': cell.active || cell.recent, 'recent-window': cell.recent }]"
      :title="cell.title"
    />
  </div>
  <div v-if="!cells.some((c) => c.active)" class="daily-chart-empty" style="margin-top: 8px;">
    最近 {{ days }} 天还没有学习记录，从今天开始打卡吧！
  </div>
</template>
