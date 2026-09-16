<script setup lang="ts">
/**
 * 设置弹窗 —— 对应 legacy renderSettings / showModalSettings（Element Plus 实现）。
 */
import { computed, ref, watch } from 'vue'

import { useVocabularyStore } from '../stores/vocabulary'
import { availableSynonymSourceNames } from '../data/synonyms'

const store = useVocabularyStore()

/** 同义词源启用的运行期选择状态（null = 全部启用） */
const sourceSelection = ref<string[] | null>(null)

const open = computed({
  get: () => store.ui.modalSettings,
  set: (value: boolean) => {
    store.ui.modalSettings = value
  },
})

watch(open, (isOpen) => {
  if (isOpen) sourceSelection.value = store.data.settings.enabledSynonymSources
})

const isAllEnabled = () => sourceSelection.value === null

function toggleSource(name: string) {
  const current = sourceSelection.value
  if (current === null) {
    // 由“全开”进入自定义：默认关闭全部后仅开当前
    sourceSelection.value = [name]
  } else {
    const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
    sourceSelection.value = next.length ? next : []
  }
  void store.save(true)
}

function selectAll() {
  sourceSelection.value = null
  void store.save(true)
}

function clearAll() {
  sourceSelection.value = []
  void store.save(true)
}

</script>

<template>
  <el-dialog v-model="open" title="设置" width="600px" top="8vh">
    <el-form label-width="120px" size="small">
      <el-form-item label="播放倍速">
        <el-slider v-model="store.data.settings.playbackRate" :min="0.6" :max="2" :step="0.1" show-input />
      </el-form-item>
      <el-form-item label="自动间隔(秒)">
        <el-slider v-model="store.data.settings.intervalSeconds" :min="0" :max="5" :step="1" show-input />
      </el-form-item>
      <el-form-item label="每词重复">
        <el-slider v-model="store.data.settings.repeatCount" :min="1" :max="5" :step="1" show-input />
      </el-form-item>
      <el-form-item label="单词模式显示">
        <div>
          <el-switch v-model="store.data.practice.showWord" />
          <el-switch v-model="store.data.practice.showMeaning" style="margin-left: 14px" />
          <span class="hint">左：显示单词 · 右：显示释义（quiz 答题前 / 拼写模式固定隐藏）</span>
        </div>
      </el-form-item>
      <el-form-item label="同义词卡片">
        <el-switch v-model="store.data.settings.showSynonym" @change="store.updateSetting('showSynonym', $event)" />
      </el-form-item>
      <el-form-item label="同义词源">
        <div class="source-col">
          <div class="source-list">
            <el-checkbox
              v-for="name in availableSynonymSourceNames"
              :key="name"
              :model-value="isAllEnabled() || (sourceSelection ?? []).includes(name)"
              @change="toggleSource(name)"
            >
              {{ name }}
            </el-checkbox>
          </div>
          <div>
            <el-button size="small" text type="primary" @click="selectAll">全部启用</el-button>
            <el-button size="small" text @click="clearAll">全部停用</el-button>
            <span class="hint">默认全部启用</span>
          </div>
        </div>
      </el-form-item>
      <el-form-item label="听力语料卡">
        <el-switch v-model="store.data.settings.showListeningCorpus" @change="store.updateSetting('showListeningCorpus', $event)" />
        <span class="hint">语料词源与相关句子（语料数据将在后续版本接入）</span>
      </el-form-item>
      <el-divider content-position="left">数据备份</el-divider>
      <el-form-item label="完整备份">
        <RouterLink class="global-settings-link" to="/settings" @click="open = false">前往全局设置管理导入导出 →</RouterLink>
      </el-form-item>
    </el-form>
  </el-dialog>
</template>

<style scoped>
.hint {
  color: #a0a6ad;
  font-size: 12px;
  margin-left: 8px;
}

.source-col {
  width: 100%;
}

.source-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-bottom: 6px;
}

.global-settings-link {
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 600;
}
</style>
