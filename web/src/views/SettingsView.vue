<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'

import { applyImportPlan, createAppBackup, inspectAppBackup } from '@/shared/backup/app-backup'
import { backupProviders } from '@/shared/backup/providers'
import type { AppImportPlan } from '@/shared/backup/types'
import { downloadJson } from '@/shared/files/download'
import { readAppSettings, updateAppSettings } from '@/shared/settings/app-settings'

const MAX_BACKUP_SIZE = 25 * 1024 * 1024

const fileInput = ref<HTMLInputElement | null>(null)
const pendingPlan = ref<AppImportPlan | null>(null)
const pendingFileName = ref('')
const status = ref('')
const error = ref('')
const busy = ref(false)
const settings = ref(readAppSettings())

const lastBackupText = computed(() => formatDateTime(settings.value.lastBackupAt) || '尚未导出完整备份')
const lastImportText = computed(() => formatDateTime(settings.value.lastImportAt) || '尚未导入备份')

function formatDateTime(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

async function exportFullBackup() {
  busy.value = true
  error.value = ''
  status.value = ''
  try {
    const payload = await createAppBackup(backupProviders)
    const moduleCount = Object.keys(payload.modules).length
    if (!moduleCount) {
      status.value = '当前还没有可备份的学习数据。完成一次记录或训练后再导出。'
      return
    }
    const day = payload.exportedAt.slice(0, 10)
    downloadJson(`ielts-dev-完整备份-${day}.json`, payload)
    settings.value = updateAppSettings({ lastBackupAt: payload.exportedAt })
    status.value = `完整备份已导出，共包含 ${moduleCount} 个数据域。`
  } catch (cause) {
    error.value = `导出失败：${cause instanceof Error ? cause.message : '无法读取本地学习数据'} `
  } finally {
    busy.value = false
  }
}

function chooseImportFile() {
  fileInput.value?.click()
}

async function previewImport(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  pendingPlan.value = null
  pendingFileName.value = ''
  status.value = ''
  error.value = ''
  if (!file) return
  if (file.size > MAX_BACKUP_SIZE) {
    error.value = '导入失败：备份文件超过 25 MB。音频文件不应包含在备份中。'
    return
  }
  try {
    const parsed: unknown = JSON.parse(await file.text())
    pendingPlan.value = inspectAppBackup(parsed, backupProviders)
    pendingFileName.value = file.name
  } catch (cause) {
    error.value = `导入失败：${cause instanceof Error ? cause.message : '不是有效的 JSON 备份'} `
  }
}

function cancelImport() {
  pendingPlan.value = null
  pendingFileName.value = ''
}

function scrollToSetting(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function confirmImport() {
  const plan = pendingPlan.value
  if (!plan) return
  try {
    await ElMessageBox.confirm(
      `将覆盖 ${plan.items.map((item) => item.label).join('、')} 的现有本地数据。其他模块不会改变。`,
      '确认恢复备份',
      {
        confirmButtonText: '确认覆盖并恢复',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  busy.value = true
  error.value = ''
  try {
    await applyImportPlan(plan, backupProviders)
    const importedAt = new Date().toISOString()
    settings.value = updateAppSettings({ lastImportAt: importedAt })
    status.value = `恢复完成，已更新 ${plan.items.length} 个数据域。重新进入对应训练页即可读取恢复后的数据。`
    cancelImport()
  } catch (cause) {
    error.value = `恢复失败：${cause instanceof Error ? cause.message : '写入本地存储失败'}。系统已尝试回滚已写入的数据。`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="settings-heading">
      <div>
        <p class="settings-kicker">GLOBAL SETTINGS</p>
        <h1>全局设置</h1>
        <p>完整数据只在这里备份和恢复；训练页保留 Excel、PDF、CSV 等业务结果导出。</p>
      </div>
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
        <button class="is-active" type="button" @click="scrollToSetting('data')">数据与备份</button>
        <button type="button" @click="scrollToSetting('reminders')">提醒</button>
        <button type="button" @click="scrollToSetting('playback')">播放与语音</button>
        <button type="button" @click="scrollToSetting('appearance')">外观</button>
      </nav>

      <div class="settings-content">
        <section id="data" class="settings-section">
          <div class="settings-section-head">
            <div>
              <p class="settings-kicker">DATA & BACKUP</p>
              <h2>数据与备份</h2>
            </div>
            <span class="settings-health"><i></i> 本地优先</span>
          </div>

          <div class="settings-row">
            <div>
              <h3>导出完整备份</h3>
              <p>包含学习记录、词汇进度、听写缓存、错词和统计；不包含音频 Blob。</p>
              <small>最近备份：{{ lastBackupText }}</small>
            </div>
            <button class="settings-primary" type="button" :disabled="busy" @click="exportFullBackup">
              {{ busy ? '处理中…' : '导出完整备份' }}
            </button>
          </div>

          <div class="settings-row">
            <div>
              <h3>导入完整备份</h3>
              <p>支持新的应用完整备份，以及旧版学习记录、词汇和语料库单模块备份。</p>
              <small>最近导入：{{ lastImportText }}</small>
            </div>
            <button type="button" :disabled="busy" @click="chooseImportFile">选择备份文件</button>
            <input ref="fileInput" class="visually-hidden" type="file" accept="application/json,.json" @change="previewImport" />
          </div>

          <div v-if="pendingPlan" class="import-preview" aria-live="polite">
            <div class="import-preview-head">
              <div>
                <strong>导入预览</strong>
                <p>{{ pendingFileName }} · {{ pendingPlan.source === 'app' ? '完整应用备份' : '旧版单模块备份' }}</p>
              </div>
              <span>{{ pendingPlan.items.length }} 个数据域</span>
            </div>
            <ul>
              <li v-for="item in pendingPlan.items" :key="item.id">
                <strong>{{ item.label }}</strong>
                <span>{{ item.summary }}</span>
              </li>
            </ul>
            <p class="import-warning">确认后只覆盖以上数据域。写入前会保留当前快照，失败时自动尝试回滚。</p>
            <div class="import-actions">
              <button type="button" @click="cancelImport">取消</button>
              <button class="settings-primary" type="button" :disabled="busy" @click="confirmImport">确认覆盖并恢复</button>
            </div>
          </div>

          <p v-if="status" class="settings-feedback is-success" role="status">{{ status }}</p>
          <p v-if="error" class="settings-feedback is-error" role="alert">{{ error }}</p>
        </section>

        <section id="reminders" class="settings-section compact-section">
          <div><p class="settings-kicker">REMINDERS</p><h2>提醒</h2></div>
          <p>当前提醒仍由学习记录模块管理。接入统一今日计划后迁移到这里，避免同时维护两套配置。</p>
        </section>

        <section id="playback" class="settings-section compact-section">
          <div><p class="settings-kicker">PLAYBACK & VOICE</p><h2>播放与语音</h2></div>
          <p>各训练模块目前使用不同的播放速度和循环参数。共享默认值将在音频生命周期统一后接入。</p>
        </section>

        <section id="appearance" class="settings-section compact-section">
          <div><p class="settings-kicker">APPEARANCE</p><h2>外观</h2></div>
          <p>首轮统一页面结构和设计变量，不增加尚未生效的主题开关。</p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  width: min(calc(100% - 48px), var(--site-width));
  margin: 0 auto;
  padding: 40px 0 96px;
}

.settings-heading {
  min-height: 340px;
  margin-bottom: 28px;
  padding: clamp(38px, 6vw, 72px);
  display: flex;
  align-items: flex-end;
  border-radius: 18px;
  background:
    radial-gradient(circle at 86% 10%, rgba(104, 112, 235, 0.48), transparent 34%),
    var(--color-night);
  color: #fff;
}

.settings-heading h1 {
  margin: 0;
  font-size: clamp(48px, 6.7vw, 82px);
  letter-spacing: -0.055em;
  line-height: 1;
}

.settings-heading > div > p:last-child {
  max-width: 680px;
  margin: 18px 0 0;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.8;
}

.settings-kicker {
  margin: 0 0 10px;
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
}

.settings-layout {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 28px;
}

.settings-nav {
  position: sticky;
  top: 104px;
  align-self: start;
  display: grid;
  gap: 4px;
}

.settings-nav button {
  padding: 11px 13px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
}

.settings-nav button:hover,
.settings-nav button.is-active {
  background: var(--color-night);
  color: #fff;
}

.settings-content {
  display: grid;
  gap: 16px;
}

.settings-section {
  padding: 30px;
  border: 1px solid var(--color-line);
  border-radius: 14px;
  background: var(--color-surface);
}

.settings-section-head,
.settings-row,
.import-preview-head,
.import-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.settings-section h2,
.settings-section h3,
.settings-section p {
  margin-top: 0;
}

.settings-section h2 {
  margin-bottom: 0;
  font-size: 24px;
}

.settings-health {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #287553;
  font-size: 12px;
  font-weight: 650;
}

.settings-health i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #46af7a;
}

.settings-row {
  padding: 22px 0;
  border-top: 1px solid var(--color-line);
}

.settings-row:first-of-type {
  margin-top: 24px;
}

.settings-row h3 {
  margin-bottom: 7px;
  font-size: 16px;
}

.settings-row p,
.compact-section > p,
.import-preview p {
  margin-bottom: 6px;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
}

.settings-row small {
  color: #929087;
}

.settings-row button,
.import-actions button {
  min-height: 40px;
  padding: 0 15px;
  flex: none;
  border: 1px solid var(--color-line);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-ink);
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
}

.settings-row button:disabled,
.import-actions button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.settings-row button.settings-primary,
.import-actions button.settings-primary {
  border-color: var(--color-accent);
  background: var(--color-accent);
  color: #fff;
}

.import-preview {
  padding: 20px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  background: #f3f2ee;
}

.import-preview-head > span {
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 11px;
}

.import-preview ul {
  margin: 16px 0;
  padding: 0;
  border-top: 1px solid var(--color-line);
  list-style: none;
}

.import-preview li {
  padding: 12px 0;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--color-line);
  font-size: 13px;
}

.import-preview li span {
  color: var(--color-muted);
  text-align: right;
}

.import-warning {
  color: #9a5e14 !important;
}

.import-actions {
  margin-top: 16px;
  justify-content: flex-end;
}

.settings-feedback {
  margin: 18px 0 0 !important;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 13px;
}

.settings-feedback.is-success {
  background: #edf8f2;
  color: #236945;
}

.settings-feedback.is-error {
  background: #fff1f1;
  color: #a63333;
}

.compact-section {
  display: grid;
  grid-template-columns: minmax(160px, 0.4fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.compact-section > p {
  margin-bottom: 0;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 760px) {
  .settings-page {
    width: min(calc(100% - 28px), 1120px);
    padding-top: 18px;
  }

  .settings-heading {
    min-height: 400px;
    padding: 30px 24px;
  }

  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    position: static;
    grid-template-columns: repeat(4, minmax(max-content, 1fr));
    overflow-x: auto;
  }

  .settings-row,
  .compact-section {
    align-items: flex-start;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .settings-section {
    padding: 20px;
  }

  .settings-section-head,
  .settings-row,
  .import-preview-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .settings-row button {
    width: 100%;
  }

  .settings-nav {
    grid-template-columns: repeat(4, max-content);
  }
}
</style>
