<script setup lang="ts">
/**
 * 学习统计（tab=charts）—— 忠实还原 legacy charts pane 核心：
 * 分组/单列模式趋势图 + 月度综合强度热力图 + 时长趋势。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { init, type EChartsCoreOption, type EChartsType } from '@/shared/charts/echarts'

import { getTodayText, isNumericMetric, type StudyRow, type StudyColumn } from '../model/tableModel'

const props = defineProps<{ state: any }>()
const st = computed(() => props.state)

const columns = computed<StudyColumn[]>(() => st.value.projectColumns ?? [])
const groups = computed<{ id: string; name: string }[]>(() => st.value.groups ?? [])
const rows = computed<StudyRow[]>(() => st.value.tableData ?? [])

const chartDisplayMode = computed({
  get: () => st.value.chartDisplayMode ?? 'grouped',
  set: (v: string) => {
    st.value.chartDisplayMode = v
  },
})
const heatmapMonth = computed({
  get: () => st.value.heatmapMonth ?? currentMonth(),
  set: (v: string) => {
    st.value.heatmapMonth = v
  },
})

function currentMonth(): string {
  return getTodayText().slice(0, 7)
}

const chartRows = computed(() =>
  rows.value.filter((r) => r.date && r.date <= getTodayText()).sort((a, b) => a.date.localeCompare(b.date)),
)

const containerRefs = ref<Record<string, HTMLDivElement | null>>({})
const heatmapEl = ref<HTMLDivElement | null>(null)
const durationEl = ref<HTMLDivElement | null>(null)

const charts = new Map<string, EChartsType>()

function groupNameOf(groupId: string): string {
  return groups.value.find((g) => g.id === groupId)?.name || '未分组'
}

function orderedColumnGroups() {
  const seen: string[] = []
  for (const column of columns.value) {
    if (!seen.includes(column.groupId)) seen.push(column.groupId)
  }
  return seen
}

function containerKey(groupId: string): string {
  return `group-${groupId}`
}

function columnKey(columnId: string): string {
  return `project-${columnId}`
}

function baseOption(title: string): EChartsCoreOption {
  return {
    title: { text: title, left: 6, textStyle: { fontSize: 13, fontWeight: 600 } },
    grid: { left: 44, right: 18, top: 46, bottom: 34 },
    tooltip: { trigger: 'axis' },
    legend: { top: 4, left: 120, type: 'scroll', textStyle: { fontSize: 10 } },
    xAxis: { type: 'category', data: chartRows.value.map((r) => r.date.slice(5)) },
    yAxis: { type: 'value', min: 0, max: 100, interval: 20 },
    series: [],
  }
}

function renderLineSeries(title: string, columnsForSeries: StudyColumn[], isGrouped: boolean) {
  const option = baseOption(title)
  const palette = ['#1473ff', '#17b26a', '#f1b53d', '#615fff', '#ec5b5b', '#00b7c3', '#b7791f']
  const legendData: string[] = []
  const series: any[] = []
  columnsForSeries.forEach((column, index) => {
    const values = chartRows.value.map((row) => {
      const v = row.metrics[column.id]
      return isNumericMetric(v) ? Number(v) : null
    })
    if (values.every((v) => v === null)) return
    const color = palette[index % palette.length]
    legendData.push(column.name)
    const s: any = {
      name: column.name,
      type: 'line',
      smooth: true,
      connectNulls: false,
      data: values,
      itemStyle: { color },
      lineStyle: { color, width: 2 },
      markLine: undefined,
      markPoint: undefined,
    }
    const target = column.targetValue
    if (target !== null && target !== undefined && target > 0) {
      s.markLine = { symbol: 'none', silent: true, data: [{ yAxis: Number(target) }], lineStyle: { type: 'dashed', color: 'rgba(15,23,42,0.35)' } }
      const below: number[] = []
      values.forEach((v, idx) => {
        if (v !== null && Number(v) < Number(target)) below.push(idx)
      })
      if (below.length) {
        s.markPoint = {
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: { color: '#ec5b5b' },
          data: below.map((idx) => ({ coord: [idx, values[idx]] })),
        }
      }
    }
    series.push(s)
    void isGrouped
  })
  ;(option as any).series = series
  ;(option as any).legend.data = legendData
  return option
}

function renderHeatmap() {
  const el = heatmapEl.value
  if (!el) return
  const [year, month] = heatmapMonth.value.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const data: [string, number][] = []
  let max = 0
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${heatmapMonth.value}-${String(day).padStart(2, '0')}`
    const row = rows.value.find((r) => r.date === dateKey)
    let intensity = 0
    if (row) {
      let sum = 0
      for (const column of columns.value) {
        const v = row.metrics[column.id]
        if (isNumericMetric(v)) sum += Number(v)
      }
      intensity = sum + (row.durationMinutes || 0)
    }
    max = Math.max(max, intensity)
    data.push([dateKey, intensity])
  }
  const option: EChartsCoreOption = {
    title: { text: `${heatmapMonth.value} 学习强度热力图（得分和+时长）`, left: 6, textStyle: { fontSize: 13 } },
    tooltip: { formatter: (p: any) => `${p.value[0]}<br/>综合强度 ${p.value[1]}` },
    visualMap: {
      min: 0,
      max: max || 1,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 2,
      inRange: { color: ['#eef4ff', '#9cc4ff', '#4f9bff', '#1473ff'] },
    },
    calendar: {
      top: 60,
      left: 30,
      right: 20,
      cellSize: ['auto', 22],
      range: heatmapMonth.value,
      itemStyle: { borderWidth: 3, borderColor: '#fff' },
      dayLabel: { firstDay: 1, nameMap: 'cn' },
      monthLabel: { nameMap: 'cn' },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data,
      } as any,
    ],
  }
  setChart('heatmap', el, option)
}

function renderDuration() {
  const el = durationEl.value
  if (!el) return
  const list = chartRows.value.slice(-60)
  const option: EChartsCoreOption = {
    title: { text: '每日学习时长（分钟）', left: 6, textStyle: { fontSize: 13 } },
    grid: { left: 44, right: 18, top: 36, bottom: 30 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: list.map((r) => r.date.slice(5)) },
    yAxis: { type: 'value' },
    series: [
      {
        name: '时长',
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.1 },
        itemStyle: { color: '#1473ff' },
        lineStyle: { color: '#1473ff' },
        data: list.map((r) => r.durationMinutes ?? 0),
      } as any,
    ],
  }
  setChart('duration', el, option)
}

function setChart(key: string, el: HTMLDivElement, option: EChartsCoreOption) {
  let chart = charts.get(key)
  if (!chart) {
    chart = init(el, undefined, { renderer: 'canvas' })
    charts.set(key, chart)
  }
  chart.setOption(option, { notMerge: true })
}

function renderModeCharts() {
  // 清理非当前模式容器
  const wantedKeys = new Set<string>()
  if (chartDisplayMode.value === 'grouped') {
    for (const groupId of orderedColumnGroups()) {
      const key = containerKey(groupId)
      wantedKeys.add(key)
      const cols = columns.value.filter((c) => c.groupId === groupId)
      const el = containerRefs.value[key]
      if (!el || !cols.length) continue
      setChart(key, el, renderLineSeries(`${groupNameOf(groupId)} 分组趋势`, cols, true))
    }
  } else {
    for (const column of columns.value) {
      const key = columnKey(column.id)
      wantedKeys.add(key)
      const el = containerRefs.value[key]
      if (!el) continue
      setChart(key, el, renderLineSeries(`${column.name}（${groupNameOf(column.groupId)}）`, [column], false))
    }
  }
  for (const [key, chart] of charts.entries()) {
    if (key === 'heatmap' || key === 'duration') continue
    if (!wantedKeys.has(key)) {
      chart.dispose()
      charts.delete(key)
    }
  }
}

function renderAll() {
  renderModeCharts()
  renderHeatmap()
  renderDuration()
}

function setRef(key: string) {
  return (el: unknown) => {
    containerRefs.value[key] = (el as HTMLDivElement | null) ?? null
  }
}

function onResize() {
  for (const chart of charts.values()) chart.resize()
}

watch([chartRows, columns, groups], () => nextTick(renderAll), { deep: true })
watch([heatmapMonth, chartDisplayMode], () => nextTick(renderAll))

onMounted(() => {
  window.addEventListener('resize', onResize)
  nextTick(renderAll)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  for (const chart of charts.values()) chart.dispose()
  charts.clear()
})
</script>

<template>
  <div class="tab-pane-block chart-tab">
    <div class="section-card chart-toolbar-card">
      <div class="table-toolbar-head">
        <div>
          <div class="toolbar-title">学习统计</div>
          <div class="toolbar-note">分组模式：同组项目共图；单列模式：每个项目一张图（含目标虚线与低于目标红点）。</div>
        </div>
        <div class="toolbar-actions">
          <el-button :type="chartDisplayMode === 'grouped' ? 'primary' : 'default'" @click="chartDisplayMode = 'grouped'">分组图</el-button>
          <el-button :type="chartDisplayMode === 'single' ? 'primary' : 'default'" @click="chartDisplayMode = 'single'">单列图</el-button>
        </div>
      </div>
    </div>

    <!-- 趋势图容器 -->
    <template v-if="chartDisplayMode === 'grouped'">
      <div v-for="groupId in orderedColumnGroups()" :key="groupId" class="section-card chart-card">
        <div v-if="columns.filter((c) => c.groupId === groupId).some((c) => chartRows.some((r) => isNumericMetric(r.metrics[c.id])))" :ref="setRef(containerKey(groupId))" class="chart-box"></div>
        <div v-else class="chart-empty">{{ groupNameOf(groupId) }} 组暂无数值记录</div>
      </div>
    </template>
    <template v-else>
      <div v-for="column in columns" :key="column.id" class="section-card chart-card">
        <div v-if="chartRows.some((r) => isNumericMetric(r.metrics[column.id]))" :ref="setRef(columnKey(column.id))" class="chart-box"></div>
        <div v-else class="chart-empty">{{ column.name }} 暂无数值记录</div>
      </div>
    </template>

    <!-- 热力图 -->
    <div class="section-card chart-card">
      <div class="toolbar" style="display: flex; justify-content: space-between; align-items: center;">
        <div class="toolbar-note">选择月份查看当月综合强度</div>
        <el-input v-model="heatmapMonth" class="month-input" type="month" />
      </div>
      <div ref="heatmapEl" class="heatmap-box"></div>
      <div v-if="!rows.some((r) => r.date.startsWith(heatmapMonth))" class="chart-empty">该月还没有学习记录</div>
    </div>

    <!-- 时长趋势 -->
    <div class="section-card chart-card">
      <div ref="durationEl" class="duration-box"></div>
      <div v-if="!chartRows.length" class="chart-empty">还没有学习记录</div>
    </div>
  </div>
</template>

<style scoped>
.chart-tab {
  display: grid;
  gap: 12px;
}

.section-card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  padding: 14px 16px;
}

.chart-box {
  height: 300px;
  width: 100%;
}

.heatmap-box {
  height: 230px;
  width: 100%;
}

.duration-box {
  height: 240px;
  width: 100%;
}

.chart-empty {
  color: var(--text-secondary, #556171);
  font-size: 0.85rem;
  padding: 30px 0;
  text-align: center;
}

.table-toolbar-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.month-input {
  width: 160px;
}

.ep-input {
  padding: 7px 9px;
  border-radius: 9px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #fff;
  font: inherit;
  outline: none;
}
</style>
