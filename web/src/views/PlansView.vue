<script setup lang="ts">
import { computed, ref } from 'vue'

import { readLearningEvents } from '@/shared/learning-events/events'

const events = ref(readLearningEvents())
const hasCorpusSession = computed(() => events.value.some((event) => event.moduleId === 'corpus-dictation' && event.type === 'session_completed'))
const hasMistakes = computed(() => events.value.some((event) => event.type === 'mistake_added'))
const hasMasteredWords = computed(() => events.value.some((event) => event.moduleId === 'vocabulary' && event.type === 'word_mastered'))

const steps = computed(() => [
  {
    index: '01',
    title: '语料库章节听写',
    copy: '完成一轮章节或自定义词组训练，产出正确率、错词和训练时长。',
    route: '/corpus-dictation',
    action: hasCorpusSession.value ? '继续训练' : '开始训练',
    status: hasCorpusSession.value ? '已产生训练记录' : '当前步骤',
    complete: hasCorpusSession.value,
  },
  {
    index: '02',
    title: '集中复习错词',
    copy: '把听写中暴露的问题带入词汇学习，通过难词和掌握状态持续消化。',
    route: '/vocabulary',
    action: '进入词汇复习',
    status: hasMasteredWords.value ? '已有掌握记录' : hasMistakes.value ? '已有错词待处理' : '等待训练结果',
    complete: hasMasteredWords.value,
  },
  {
    index: '03',
    title: '记录与晚间复盘',
    copy: '训练事实由系统自动汇总，只补充主观评分、弱项和明日计划。',
    route: '/study-tracker',
    action: '打开记录与复盘',
    status: hasCorpusSession.value ? '可开始复盘' : '等待训练结果',
    complete: false,
  },
])
</script>

<template>
  <div class="plans-page">
    <header>
      <p>LEARNING PATH</p>
      <h1>目标驱动，不再逐个打开工具</h1>
      <span>先把听力训练、错词复习和每日复盘连成一条真实可走的路径。</span>
    </header>

    <section class="plan-overview">
      <div>
        <p>当前路径</p>
        <h2>听力强化闭环</h2>
        <span>语料听写 → 错词复习 → 记录复盘</span>
      </div>
      <strong>{{ steps.filter((step) => step.complete).length }} / {{ steps.length }}</strong>
    </section>

    <section class="plan-steps">
      <article v-for="step in steps" :key="step.index" :class="{ 'is-complete': step.complete }">
        <span class="plan-index">{{ step.index }}</span>
        <div>
          <div class="plan-step-head"><h2>{{ step.title }}</h2><span>{{ step.status }}</span></div>
          <p>{{ step.copy }}</p>
        </div>
        <RouterLink :to="step.route">{{ step.action }} →</RouterLink>
      </article>
    </section>
  </div>
</template>

<style scoped>
.plans-page {
  width: min(calc(100% - 48px), var(--site-width));
  margin: 0 auto;
  padding: 40px 0 96px;
}

.plans-page header {
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

.plans-page header > p,
.plan-overview p {
  margin: 0 0 10px;
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.plans-page header h1 {
  max-width: 780px;
  margin: 0;
  font-size: clamp(48px, 6.7vw, 82px);
  letter-spacing: -0.06em;
  line-height: 1;
}

.plans-page header > span {
  display: block;
  margin-top: 20px;
  color: rgba(255, 255, 255, 0.55);
}

.plan-overview {
  margin: 22px 0 0;
  padding: 28px 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border: 1px solid var(--color-line);
  border-radius: 14px 14px 0 0;
  background: var(--color-surface);
  color: var(--color-ink);
}

.plan-overview h2 {
  margin: 0 0 8px;
  font-size: 24px;
}

.plan-overview span {
  color: var(--color-muted);
  font-size: 13px;
}

.plan-overview > strong {
  font-family: var(--font-mono);
  font-size: 22px;
}

.plan-steps {
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-top: 0;
  border-radius: 0 0 14px 14px;
}

.plan-steps article {
  min-height: 150px;
  padding: 24px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 20px;
  align-items: center;
  border: 0;
  border-top: 1px solid var(--color-line);
  background: var(--color-surface);
}

.plan-steps article:first-child {
  border-top: 0;
}

.plan-index {
  color: var(--color-accent);
  font-family: var(--font-mono);
  font-size: 12px;
}

.plan-step-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.plan-step-head h2 {
  margin: 0;
  font-size: 20px;
}

.plan-step-head span {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--color-soft-accent);
  color: var(--color-accent);
  font-size: 10px;
  font-weight: 650;
}

.plan-steps p {
  margin: 10px 0 0;
  color: var(--color-muted);
  font-size: 13px;
  line-height: 1.7;
}

.plan-steps article > a {
  color: var(--color-accent);
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.plan-steps article.is-complete {
  background: #f3f6f0;
}

@media (max-width: 680px) {
  .plans-page {
    width: min(calc(100% - 28px), 1040px);
    padding-top: 18px;
  }

  .plans-page header {
    min-height: 430px;
    padding: 30px 24px;
  }

  .plan-steps article {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .plan-steps article > a {
    grid-column: 2;
  }
}
</style>
