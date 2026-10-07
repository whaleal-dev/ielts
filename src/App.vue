<script setup>
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import ModuleNav from './ModuleNav.vue';
import StudyCard from './StudyCard.vue';
import { useLearning } from './useLearning.js';
import { chapters, groups, words, sources } from './library.js';

const learning = useLearning();
const settings = ref(null);
const storageEstimate = ref(null);
const tabs = [{ id: 'study', label: '开始学习', icon: 'book' }, { id: 'library', label: '我的词库', icon: 'grid' }, { id: 'difficult', label: '难词复习', icon: 'star' }, { id: 'stats', label: '学习统计', icon: 'chart' }];
const sevenDays = computed(() => learning.lastDays(7));
const monthDays = computed(() => learning.lastDays(30));
const chartMax = computed(() => Math.max(5, ...sevenDays.value.map((day) => day.studied)));
const masteredPercent = computed(() => Math.round(learning.groupMastered / Math.max(1, learning.session.items.length) * 100));
const totalPercent = computed(() => Math.round(learning.stats.mastered / words.length * 100));
const saveLabel = computed(() => learning.storage.state === 'error' ? '尚未保存' : learning.storage.state === 'saving' ? '正在保存' : learning.storage.state === 'loading' ? '正在读取' : '本地已保存');
const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' }).format(learning.now));
const formatBytes = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
const groupCount = (group) => group.words.filter((word) => learning.records.get(word.key)?.mastered).length;
const heatLevel = (count) => count === 0 ? 0 : count < 10 ? 1 : count < 30 ? 2 : count < 60 ? 3 : 4;
const selectedSource = computed(() => sources.find((source) => source.id === learning.prefs.source));

async function openSettings() {
  settings.value.showModal();
  try { storageEstimate.value = await navigator.storage?.estimate?.(); }
  catch { storageEstimate.value = null; }
}
function updateSearch() { learning.visibleCount = 40; }
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <div class="header-inner">
        <button class="brand" aria-label="IELTS Studio，返回单词学习" @click="learning.showView('study')"><span class="brand-symbol"><Icon name="book" :size="22" /></span><span class="brand-name">IELTS<span>Studio</span></span></button>
        <ModuleNav active="words" />
        <button class="save-indicator" :class="{ error: learning.storage.state === 'error', fallback: learning.storage.mode === 'localStorage' }" @click="openSettings"><span class="status-dot"></span><span>{{ saveLabel }}</span></button>
      </div>
    </header>

    <main class="main-container">
      <div class="page-heading"><div><div class="eyebrow">BUILD YOUR VOCABULARY</div><h1>单词学习<span class="heading-dot">.</span></h1><p>从一个单词开始，让每一次练习都留下进步。</p></div><div class="heading-date"><Icon name="calendar" :size="17" /><span>{{ dateLabel }}</span></div></div>

      <div class="workspace-nav">
        <nav class="page-nav" aria-label="单词模块导航"><button v-for="tab in tabs" :key="tab.id" :class="{ active: learning.prefs.view === tab.id }" :aria-current="learning.prefs.view === tab.id ? 'page' : undefined" @click="learning.showView(tab.id)"><Icon :name="tab.icon" :size="17" />{{ tab.label }}<span v-if="tab.id === 'difficult' && learning.stats.difficult" class="nav-count">{{ learning.stats.difficult }}</span></button></nav>
        <form class="search-field" role="search" @submit.prevent="learning.startSearch"><Icon name="search" :size="18" /><label class="sr-only" for="searchInput">搜索单词或中文释义</label><input id="searchInput" v-model="learning.search" type="search" placeholder="搜索单词或中文释义" autocomplete="off" @input="updateSearch" /><kbd v-if="!learning.search">↵</kbd></form>
      </div>

      <div v-if="learning.storage.state === 'error'" class="storage-warning" role="alert"><Icon name="storage" :size="20" /><p>{{ learning.storage.message }}</p><button class="secondary-button" @click="learning.retrySave"><Icon name="refresh" :size="15" />重试保存</button></div>
      <div v-if="learning.storage.mode === 'localStorage' && learning.storage.state !== 'error'" class="fallback-notice">当前浏览器使用兼容存储，容量较小。请留意学习设置中的存储占用。</div>

      <div v-if="!learning.ready" class="loading-state" role="status"><span class="loading-ring"></span>正在准备词库与学习记录……</div>
      <template v-else>
        <section v-if="learning.search && learning.prefs.view !== 'difficult'" class="content-panel search-panel">
          <div class="section-heading"><div><div class="eyebrow">SEARCH RESULTS</div><h2>找到 {{ learning.searchResults.length }} 个词条</h2></div><button class="primary-button" :disabled="!learning.searchResults.length" @click="learning.startSearch">练习这些词<Icon name="right" :size="16" /></button></div>
          <div v-if="!learning.searchResults.length" class="empty-state"><Icon name="search" :size="28" /><h3>没有找到这个词</h3><p>试试输入较短的英文，或中文释义。</p></div>
          <div v-else class="word-table"><button v-for="word in learning.searchResults.slice(0, learning.visibleCount)" :key="word.key" class="word-row" @click="learning.openWord(word)"><strong>{{ word.word }}</strong><span class="row-meaning">{{ word.meaning }}</span><span class="row-source">{{ word.chapterTitle }}</span><Icon name="right" :size="16" /></button></div>
          <button v-if="learning.searchResults.length > learning.visibleCount" class="load-more" @click="learning.visibleCount += 40">显示更多词条</button>
        </section>

        <template v-if="learning.prefs.view === 'study' && !learning.search">
          <section class="selection-panel" aria-label="选择学习内容">
            <div class="selection-row"><div class="select-field source-select"><label for="sourceSelect">学习词库</label><select id="sourceSelect" v-model="learning.prefs.source" @change="learning.selectSource"><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.title }}</option></select></div><div v-if="learning.prefs.source === 'all'" class="select-field chapter-select"><label for="chapterSelect">当前章节</label><select id="chapterSelect" v-model.number="learning.prefs.chapter" @change="learning.selectChapter"><option v-for="chapter in chapters" :key="chapter.number" :value="chapter.number">{{ String(chapter.number).padStart(2, '0') }} · {{ chapter.title }}</option></select></div><div class="selection-meta"><Icon name="book" :size="16" /><span>{{ learning.prefs.source === 'all' ? `${learning.chapter.groups.length} 个分组` : selectedSource.description }}<span class="meta-divider">·</span>{{ learning.prefs.source === 'all' ? learning.chapter.groups.reduce((sum, group) => sum + group.words.length, 0) : selectedSource.words.length }} 个词条</span></div></div>
            <div v-if="learning.prefs.source === 'all'" class="group-picker" role="group" aria-label="章节分组"><button v-for="group in learning.chapter.groups" :key="group.id" :class="{ active: learning.session.key === group.id }" :aria-pressed="learning.session.key === group.id" @click="learning.selectGroup(group.id)">{{ group.title }}<span>{{ group.words.length }}</span><Icon v-if="groupCount(group) === group.words.length" name="check" :size="12" /></button></div>
          </section>

          <div class="study-layout">
            <StudyCard :learning="learning" @settings="openSettings" />
            <aside class="study-aside" aria-label="当前学习进度">
              <section class="progress-panel"><div class="panel-heading"><span>本轮掌握进度</span><Icon name="leaf" :size="19" /></div><div class="progress-ring" :style="{ '--progress': masteredPercent + '%' }"><div><strong>{{ masteredPercent }}<span>%</span></strong><span>已掌握</span></div></div><p>{{ learning.groupMastered }} <span>/ {{ learning.session.items.length }} 个词条</span></p><div class="aside-divider"></div><div class="current-position"><span>当前学习位置</span><strong>{{ learning.session.index + 1 }}<span> / {{ learning.session.items.length }}</span></strong></div><div class="small-progress"><span :style="{ width: (learning.session.index + 1) / learning.session.items.length * 100 + '%' }"></span></div></section>
              <section class="today-panel"><div class="panel-heading"><span>今天的小积累</span><span class="today-badge">TODAY</span></div><div class="today-metrics"><div><span class="metric-icon"><Icon name="book" :size="17" /></span><span>学习词条</span><strong>{{ learning.today.studied }}</strong></div><div><span class="metric-icon"><Icon name="check" :size="17" /></span><span>新掌握</span><strong>{{ learning.today.mastered }}</strong></div><div><span class="metric-icon"><Icon name="refresh" :size="17" /></span><span>难词复习</span><strong>{{ learning.today.reviewed }}</strong></div></div></section>
              <div class="streak-note"><span class="streak-leaf"><Icon name="leaf" :size="22" /></span><div><strong>{{ learning.streak ? `已连续学习 ${learning.streak} 天` : '今天，从这里开始' }}</strong><p>{{ learning.streak ? '每一次积累，都算数。' : '学过的词，会记录在这里。' }}</p></div></div>
            </aside>
          </div>

          <section class="session-list content-panel"><div class="section-heading"><div><h2>本轮词表<span class="subtle-count">{{ learning.session.items.length }}</span></h2><p>点击任意单词，继续练习。</p></div><span class="session-label">{{ learning.session.label }}</span></div><div class="session-words"><button v-for="(word, index) in learning.session.items.slice(0, learning.visibleCount)" :key="word.key" :class="{ current: index === learning.session.index, mastered: learning.records.get(word.key)?.mastered }" @click="learning.jumpTo(index)"><span class="list-index">{{ String(index + 1).padStart(2, '0') }}</span><span>{{ word.word }}</span><Icon v-if="learning.records.get(word.key)?.mastered" name="check" :size="14" /><Icon v-else-if="learning.records.get(word.key)?.difficult" name="star" :size="14" /></button></div><button v-if="learning.session.items.length > learning.visibleCount" class="load-more" @click="learning.visibleCount += 40">显示更多词条</button></section>
        </template>

        <section v-if="learning.prefs.view === 'library' && !learning.search" class="library-view">
          <div class="section-heading"><div><div class="eyebrow">YOUR WORD COLLECTION</div><h2>找到适合你的学习起点</h2><p>{{ chapters.length }} 个主题章节，{{ groups.length }} 个分组，共 {{ words.length }} 个词条。</p></div></div>
          <div class="source-grid"><button v-for="(source, index) in sources" :key="source.id" class="source-card" :class="'source-card-' + index" @click="learning.prefs.source = source.id; learning.selectSource()"><span class="source-card-icon"><Icon :name="['book', 'leaf', 'pen', 'headphones'][index]" :size="23" /></span><h3>{{ source.title }}</h3><p>{{ source.description }}</p><div><strong>{{ source.words.length }}<span> 个词条</span></strong><Icon name="right" :size="18" /></div></button></div>
          <div class="chapters-heading"><h2>主题章节</h2><span>按章节和分组学习</span></div>
          <details v-for="chapter in chapters" :key="chapter.number" class="chapter-collection" :open="chapter.number === learning.prefs.chapter"><summary><span class="chapter-number">{{ String(chapter.number).padStart(2, '0') }}</span><div><strong>{{ chapter.title }}</strong><span>{{ chapter.groups.length }} 组 · {{ chapter.groups.reduce((sum, group) => sum + group.words.length, 0) }} 个词条</span></div><Icon name="down" :size="18" /></summary><div class="library-groups"><button v-for="group in chapter.groups" :key="group.id" @click="learning.selectGroup(group.id)"><div><strong>{{ group.title }}</strong><Icon name="right" :size="16" /></div><p>{{ groupCount(group) }} / {{ group.words.length }} 已掌握</p><div class="small-progress"><span :style="{ width: groupCount(group) / group.words.length * 100 + '%' }"></span></div></button></div></details>
        </section>

        <section v-if="learning.prefs.view === 'difficult'" class="content-panel difficult-view">
          <div class="section-heading"><div><div class="eyebrow">A LITTLE MORE PRACTICE</div><h2>给难词多一点时间<span class="subtle-count">{{ learning.difficultWords.length }}</span></h2><p>记不牢的词先收起来，再一点点掌握。</p></div><button class="primary-button" :disabled="!learning.dueWords.length" @click="learning.startDifficult(true)"><Icon name="refresh" :size="17" />复习到期词<span>{{ learning.dueWords.length }}</span></button></div>
          <div class="difficult-toolbar"><div class="filter-tabs"><button :class="{ active: learning.difficultFilter === 'all' }" @click="learning.difficultFilter = 'all'">全部难词 {{ learning.difficultWords.length }}</button><button :class="{ active: learning.difficultFilter === 'due' }" @click="learning.difficultFilter = 'due'">待复习 {{ learning.dueWords.length }}</button></div><button class="text-button" :disabled="!learning.filteredDifficult.length" @click="learning.startDifficult(false)">练习当前列表<Icon name="right" :size="16" /></button></div>
          <div v-if="!learning.filteredDifficult.length" class="empty-state"><span class="empty-icon"><Icon name="star" :size="30" /></span><h3>{{ learning.search ? '没有匹配的难词' : learning.difficultFilter === 'due' ? '到期词已复习完' : '还没有加入难词' }}</h3><p>{{ learning.difficultFilter === 'due' ? '稍后再来，或继续学习新的词汇。' : '学习时点击「加入难词」，以后就能在这里找到它。' }}</p><button class="secondary-button" @click="learning.showView('study')">回到学习<Icon name="right" :size="16" /></button></div>
          <div v-else class="word-table"><div v-for="word in learning.filteredDifficult.slice(0, learning.visibleCount)" :key="word.key" class="word-row difficult-row"><button class="word-row-main" @click="learning.openWord(word)"><strong>{{ word.word }}</strong><span class="row-meaning">{{ word.meaning }}</span></button><span class="review-badge" :class="{ due: learning.dueWords.includes(word) }">{{ learning.dueWords.includes(word) ? '待复习' : '已安排复习' }}</span><button class="icon-button" :aria-label="`移出难词 ${word.word}`" @click="learning.toggleDifficult(word)"><Icon name="star" :size="18" /></button></div></div>
          <button v-if="learning.filteredDifficult.length > learning.visibleCount" class="load-more" @click="learning.visibleCount += 40">显示更多难词</button>
        </section>

        <section v-if="learning.prefs.view === 'stats' && !learning.search" class="stats-view">
          <div class="section-heading"><div><div class="eyebrow">EVERY WORD COUNTS</div><h2>看得见的积累</h2><p>从学习到掌握，记录每一步进度。</p></div><span class="stats-period">词库掌握度 {{ totalPercent }}%</span></div>
          <div class="stats-grid"><article><span><Icon name="book" :size="18" />已学习词条</span><strong>{{ learning.stats.studied }}<small> / {{ words.length }}</small></strong><p>曾经练习过的词条</p></article><article><span><Icon name="check" :size="18" />已掌握词条</span><strong>{{ learning.stats.mastered }}</strong><p>手动标记为已掌握</p></article><article><span><Icon name="star" :size="18" />待巩固难词</span><strong>{{ learning.stats.difficult }}</strong><p>{{ learning.dueWords.length }} 个词条已到复习时间</p></article><article><span><Icon name="leaf" :size="18" />连续学习</span><strong>{{ learning.streak }}<small> 天</small></strong><p>每天的积累都算数</p></article></div>
          <div class="chart-layout"><section class="content-panel trend-panel"><div class="section-heading"><div><h2>最近 7 天</h2><p>每天学习的不同词条数。</p></div><span class="chart-legend"><i></i>学习词条</span></div><div class="bar-chart" role="img" :aria-label="sevenDays.map(day => `${day.label}学习${day.studied}个词条`).join('，')"><div v-for="day in sevenDays" :key="day.key" class="bar-column"><span class="bar-value">{{ day.studied }}</span><div class="bar-track"><div class="bar" :style="{ height: day.studied / chartMax * 100 + '%' }"></div></div><span class="bar-label">{{ day.label }}</span></div></div></section><section class="content-panel heatmap-panel"><div class="section-heading"><div><h2>学习足迹</h2><p>最近 30 天的学习记录。</p></div><Icon name="calendar" :size="19" /></div><div class="heatmap"><div v-for="day in monthDays" :key="day.key" :class="'heat-' + heatLevel(day.studied)" :title="`${day.key}：学习 ${day.studied} 个词条`" :aria-label="`${day.key}：学习 ${day.studied} 个词条`"><span>{{ Number(day.key.slice(-2)) }}</span></div></div><div class="heatmap-legend"><span>少</span><i v-for="level in 5" :key="level" :class="'heat-' + (level - 1)"></i><span>多</span></div><div class="footprint-total"><strong>{{ monthDays.filter(day => day.studied > 0).length }}</strong><span>天有学习记录</span></div></section></div>
        </section>
      </template>

      <footer class="page-footer"><span>IELTS Studio<span class="footer-divider">/</span>一点积累，一点进步。</span><span v-if="learning.prefs.view === 'study'" class="keyboard-hints"><kbd>←</kbd><kbd>→</kbd>切换单词<span>·</span><kbd>Space</kbd>播放／暂停</span></footer>
    </main>

    <dialog ref="settings" class="settings-dialog" aria-labelledby="settingsTitle"><div class="dialog-heading"><div><div class="eyebrow">MAKE IT YOURS</div><h2 id="settingsTitle">学习设置</h2></div><button class="icon-button" aria-label="关闭学习设置" @click="settings.close()"><Icon name="close" /></button></div><div class="dialog-body"><label class="range-setting" for="rateInput"><span>发音倍速<strong>{{ learning.prefs.rate.toFixed(1) }}×</strong></span><input id="rateInput" v-model.number="learning.prefs.rate" type="range" min="0.6" max="2" step="0.1" @input="learning.savePrefs" /></label><label class="range-setting" for="repeatInput"><span>每个词播放次数<strong>{{ learning.prefs.repeat }} 次</strong></span><input id="repeatInput" v-model.number="learning.prefs.repeat" type="range" min="1" max="5" step="1" @input="learning.savePrefs" /></label><label class="range-setting" for="intervalInput"><span>自动播放间隔<strong>{{ learning.prefs.interval }} 秒</strong></span><input id="intervalInput" v-model.number="learning.prefs.interval" type="range" min="0" max="5" step="1" @input="learning.savePrefs" /></label><section class="storage-details"><h3><Icon name="storage" :size="17" />浏览器存储</h3><p>学习进度和笔记仅保存在当前浏览器中。</p><dl><div><dt>保存方式</dt><dd>{{ learning.storage.mode }}</dd></div><div><dt>学习记录占用</dt><dd>{{ formatBytes(learning.storageSizes.total) }}</dd></div><div><dt>最大单条记录</dt><dd>{{ formatBytes(learning.storageSizes.largest) }}<span> / 8 KiB</span></dd></div><div v-if="storageEstimate?.quota && learning.storage.mode === 'IndexedDB'"><dt>来源可用空间估算</dt><dd>{{ formatBytes(Math.max(0, storageEstimate.quota - (storageEstimate.usage || 0))) }}</dd></div></dl><p class="storage-explanation">按词条分开保存，统计按天汇总。笔记独立存储，每条记录都有大小上限。</p><button v-if="learning.storage.state === 'error'" class="secondary-button" @click="learning.retrySave">重新尝试保存<Icon name="refresh" :size="15" /></button></section></div><div class="dialog-footer"><button class="primary-button" @click="settings.close()">完成<Icon name="check" :size="16" /></button></div></dialog>
    <Transition name="toast"><div v-if="learning.notice" class="toast-message" role="status">{{ learning.notice }}</div></Transition>
  </div>
</template>
