<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Back, CircleCheck } from '@element-plus/icons-vue'

import { getModule } from '@/modules'

const props = defineProps<{ moduleId: string }>()

const router = useRouter()

const mod = computed(() => getModule(props.moduleId))
</script>

<template>
  <div v-if="mod" class="ph">
    <el-card shadow="never" class="ph-card">
      <div class="ph-head">
        <el-icon class="ph-icon" :size="30"><component :is="mod.icon" /></el-icon>
        <div>
          <div class="ph-title">
            {{ mod.title }}
            <el-tag size="small" :type="mod.status === 'done' ? 'success' : mod.status === 'active' ? 'warning' : 'info'" effect="dark">
              {{ mod.status === 'done' ? '已完成重构' : mod.status === 'active' ? '重构中' : '待重构 · 占位页' }}
            </el-tag>
          </div>
          <div class="ph-sub">{{ mod.subtitle }}</div>
        </div>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="当前为重构占位页"
        description="本模块将在后续迭代中以 Vue 3 现代实现替换旧页面（交互链路与数据口径对齐旧版本）。旧页面与历史数据均已备份，重构期间可持续对照。"
      />

      <p class="ph-summary">{{ mod.summary }}</p>

      <el-alert
        v-if="mod.notes"
        type="warning"
        :closable="false"
        show-icon
        :title="mod.notes"
        class="ph-notes"
      />

      <el-descriptions title="被替换的旧页面（legacy）" :column="1" border class="ph-desc">
        <el-descriptions-item label="文件">
          <span v-for="(l, i) in mod.legacy" :key="l" class="mono legacy-file">
            {{ l }}<template v-if="i < mod.legacy.length - 1">, </template>
          </span>
        </el-descriptions-item>
      </el-descriptions>

      <el-descriptions title="功能验收清单" :column="1" class="ph-desc">
        <el-descriptions-item label="功能">
          <ul class="feature-list">
            <li v-for="f in mod.features" :key="f">
              <el-icon><CircleCheck /></el-icon>
              <span>{{ f }}</span>
            </li>
          </ul>
        </el-descriptions-item>
      </el-descriptions>

      <el-button type="primary" plain @click="router.push('/')">
        <el-icon><Back /></el-icon>
        <span>返回总览</span>
      </el-button>
    </el-card>
  </div>

  <el-empty v-else description="模块不存在" />
</template>

<style scoped>
.ph {
  max-width: 960px;
  margin: 0 auto;
}

.ph-card {
  border-radius: 12px;
}

.ph-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.ph-icon {
  width: 54px;
  height: 54px;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ph-title {
  font-size: 20px;
  font-weight: 700;
  color: #1f2d3d;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ph-sub {
  margin-top: 4px;
  color: #909399;
  font-size: 13px;
}

.ph-summary {
  margin: 16px 0 4px;
  color: #4a5a6a;
  font-size: 14px;
  line-height: 1.8;
}

.ph-notes {
  margin: 12px 0;
}

.ph-desc {
  margin: 18px 0;
}

.legacy-file {
  font-size: 12.5px;
  color: #4a5a6a;
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
}

.feature-list {
  margin: 0;
  padding-left: 0;
  list-style: none;
}

.feature-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  color: #4a5a6a;
  font-size: 13.5px;
}

.feature-list li :deep(.el-icon) {
  color: #22c55e;
}
</style>
