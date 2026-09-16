<script setup lang="ts">
/**
 * 复盘信息展览表（tab=review）—— 忠实还原 legacy review pane。
 * 行=有日期的学习记录，列为日期 + 每个复盘字段，支持日期区间与关键词筛选。
 */
import { computed } from 'vue'

import type { StudyRow, NoteField } from '../model/tableModel'

const props = defineProps<{ state: any }>()

const st = computed(() => props.state)
const noteFields = computed<NoteField[]>(() => st.value.noteFields ?? [])
const rows = computed<StudyRow[]>(() => st.value.tableData ?? [])

const dateRange = computed({
  get: () => st.value.reviewFilter?.dateRange ?? [],
  set: (v: string[]) => {
    st.value.reviewFilter.dateRange = v
  },
})
const keyword = computed({
  get: () => st.value.reviewFilter?.keyword ?? '',
  set: (v: string) => {
    st.value.reviewFilter.keyword = v
  },
})

const visibleRows = computed(() => {
  const [start, end] = dateRange.value
  const query = String(keyword.value || '').trim().toLowerCase()
  const result = rows.value
    .filter((row) => row.date)
    .filter((row) => {
      if (start && row.date < String(start).slice(0, 10)) return false
      if (end && row.date > String(end).slice(0, 10)) return false
      if (!query) return true
      const haystack = [row.date]
      for (const field of noteFields.value) {
        if (row.notes[field.id]) haystack.push(row.notes[field.id])
      }
      return haystack.join('\n').toLowerCase().includes(query)
    })
  return [...result].sort((a, b) => a.date.localeCompare(b.date))
})

function onRangeStart(value: string) {
  const next = [value, dateRange.value[1] || '']
  st.value.reviewFilter.dateRange = next
}

function onRangeEnd(value: string) {
  const next = [dateRange.value[0] || '', value]
  st.value.reviewFilter.dateRange = next
}

function hasAnyNote(row: StudyRow): boolean {
  return noteFields.value.some((f) => (row.notes[f.id] || '').trim())
}

function resetFilter() {
  st.value.reviewFilter = { dateRange: [], keyword: '' }
}
</script>

<template>
  <div class="tab-pane-block">
    <div class="section-card table-toolbar-card">
      <div class="table-toolbar-head">
        <div>
          <div class="toolbar-title">复盘信息展览表</div>
          <div class="toolbar-note">按日查看「总结 / 弱项 / 明日计划」等复盘字段，支持日期区间与关键词检索。</div>
        </div>
        <div class="table-toolbar-meta">
          <span>展示 {{ visibleRows.length }} 行</span>
        </div>
      </div>
      <div class="review-filter-bar">
        <div class="review-filter-field date-range-field">
          <span>日期区间</span>
          <el-input type="date" :model-value="dateRange[0] || ''" @update:model-value="onRangeStart(String($event))" />
          <span>至</span>
          <el-input type="date" :model-value="dateRange[1] || ''" @update:model-value="onRangeEnd(String($event))" />
        </div>
        <div class="review-filter-field">
          <span>关键词</span>
          <el-input v-model="keyword" clearable placeholder="搜索复盘内容" />
        </div>
        <el-button @click="resetFilter">重置筛选</el-button>
      </div>
    </div>

    <div class="core-table-wrapper" style="margin-top: 12px;">
      <table class="core-table">
        <thead>
          <tr>
            <th style="width: 130px;">日期</th>
            <th v-for="field in noteFields" :key="field.id">{{ field.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in visibleRows" :key="row.id">
            <td class="dim">{{ row.date }}</td>
            <td v-for="field in noteFields" :key="field.id">
              <span v-if="(row.notes[field.id] || '').trim()" class="review-text">{{ row.notes[field.id] }}</span>
              <span v-else class="dim review-empty">未填写</span>
            </td>
          </tr>
          <tr v-if="!visibleRows.length">
            <td :colspan="1 + noteFields.length" class="empty-row">没有符合条件的复盘记录。</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="dim" style="margin-top: 6px;">含复盘内容的行：{{ visibleRows.filter(hasAnyNote).length }}</div>
  </div>
</template>

<style scoped>
.review-filter-bar {
  margin-top: 18px;
  padding-top: 16px;
  display: grid;
  grid-template-columns: minmax(300px, 1.3fr) minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: end;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
}

.review-filter-field {
  display: grid;
  gap: 6px;
  color: #6e6e73;
  font-size: 12px;
}

.date-range-field {
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}

.date-range-field > span:first-child {
  grid-column: 1 / -1;
}

.core-table-wrapper {
  overflow-x: auto;
  background: #fff;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.core-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.core-table th,
.core-table td {
  border-bottom: 1px solid rgba(15, 23, 42, 0.07);
  padding: 12px;
  vertical-align: top;
  text-align: left;
}

.core-table thead th {
  background: #f6f7f9;
  color: #4e5663;
  font-weight: 600;
}

.review-text {
  white-space: pre-wrap;
  line-height: 1.6;
  color: #334155;
}

.review-empty {
  font-size: 0.75rem;
}

.empty-row {
  text-align: center;
  color: #98a2b3;
  padding: 18px;
}

.dim {
  color: var(--text-secondary, #556171);
  font-size: 0.78rem;
}

@media (max-width: 680px) {
  .review-filter-bar {
    grid-template-columns: 1fr;
  }
}
</style>
