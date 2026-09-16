<script setup lang="ts">
import { modules } from '@/modules'

const groups = [
  {
    id: 'listening',
    title: '听力与听写',
    copy: '从章节听写到自由精听，围绕输入、辨音和拼写组织训练。',
    moduleIds: ['corpus-dictation', 'dictation', 'listen-dictation', 'audio-player'],
  },
  {
    id: 'vocabulary',
    title: '词汇与表达',
    copy: '学习词汇、处理难词并积累同义表达。',
    moduleIds: ['vocabulary', 'pronunciation', 'synonyms'],
  },
  {
    id: 'management',
    title: '记录与复盘',
    copy: '汇总学习结果、补充主观记录并回看长期趋势。',
    moduleIds: ['study-tracker'],
  },
].map((group) => ({
  ...group,
  modules: group.moduleIds.map((id) => modules.find((module) => module.id === id)).filter((module) => module !== undefined),
}))
</script>

<template>
  <div class="tools-page">
    <header>
      <p>ALL TRAINING</p>
      <h1>工具保留，按学习目的重新组织</h1>
      <span>直接选择能力入口；日常学习优先从「今日」或「学习路径」开始。</span>
    </header>

    <section v-for="group in groups" :key="group.id" class="tool-group">
      <div class="tool-group-heading">
        <div><p>{{ String(groups.indexOf(group) + 1).padStart(2, '0') }}</p><h2>{{ group.title }}</h2></div>
        <span>{{ group.copy }}</span>
      </div>
      <div class="tool-grid">
        <RouterLink v-for="module in group.modules" :key="module.id" :to="`/${module.id}`">
          <span class="tool-icon"><el-icon :size="20"><component :is="module.icon" /></el-icon></span>
          <div><h3>{{ module.title }}</h3><p>{{ module.subtitle }}</p></div>
          <span class="tool-arrow">→</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tools-page {
  width: min(calc(100% - 48px), var(--site-width));
  margin: 0 auto;
  padding: 40px 0 96px;
}

.tools-page header {
  min-height: 380px;
  padding: clamp(38px, 6vw, 72px);
  display: flex;
  justify-content: flex-end;
  flex-direction: column;
  border-radius: 18px;
  background:
    radial-gradient(circle at 86% 10%, rgba(104, 112, 235, 0.48), transparent 34%),
    var(--color-night);
  color: #fff;
}

.tools-page header > p,
.tool-group-heading p {
  margin: 0 0 10px;
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .16em;
}

.tools-page header h1 {
  max-width: 800px;
  margin: 0;
  font-size: clamp(48px, 6.7vw, 82px);
  letter-spacing: -.06em;
  line-height: 1;
}

.tools-page header > span {
  display: block;
  margin-top: 20px;
  color: rgba(255, 255, 255, 0.55);
}

.tool-group {
  padding: 52px 0;
  border-top: 1px solid var(--color-line);
}

.tools-page header + .tool-group {
  margin-top: 28px;
}

.tool-group-heading {
  margin-bottom: 20px;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 28px;
  align-items: end;
}

.tool-group-heading h2 {
  margin: 0;
  font-size: 25px;
}

.tool-group-heading > span {
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: 14px;
  background: var(--color-line);
}

.tool-grid > a {
  min-height: 92px;
  padding: 18px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 13px;
  align-items: center;
  border: 0;
  background: var(--color-surface);
  transition: background-color 160ms ease;
}

.tool-grid > a:hover {
  background: #f0efe9;
}

.tool-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--color-soft-accent);
  color: var(--color-accent);
}

.tool-grid h3 {
  margin: 0;
  font-size: 15px;
}

.tool-grid p {
  margin: 6px 0 0;
  color: var(--color-muted);
  font-size: 12px;
}

.tool-arrow {
  color: var(--color-accent);
}

@media (max-width: 720px) {
  .tools-page {
    width: min(calc(100% - 28px), 1120px);
    padding-top: 18px;
  }

  .tools-page header {
    min-height: 430px;
    padding: 30px 24px;
  }

  .tool-group-heading,
  .tool-grid {
    grid-template-columns: 1fr;
  }
}
</style>
