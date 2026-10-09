<script setup>
import { computed } from 'vue';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Icon from './Icon.vue';
import ModuleNav from './ModuleNav.vue';
import HeaderTools from './HeaderTools.vue';
import StudyCard from './StudyCard.vue';
import { useLearning } from './useLearning.js';
import { chapters, groups, words, sources } from './library.js';

const learning = useLearning();
const tabs = [{ id: 'study', label: '开始学习', icon: 'book' }, { id: 'library', label: '我的词库', icon: 'grid' }, { id: 'review', label: '难度复习', icon: 'refresh' }, { id: 'stats', label: '学习统计', icon: 'chart' }];
const sevenDays = computed(() => learning.lastDays(7));
const monthDays = computed(() => learning.lastDays(30));
const chartMax = computed(() => Math.max(5, ...sevenDays.value.map((day) => day.studied)));
const masteredPercent = computed(() => Math.round(learning.groupMastered / Math.max(1, learning.session.items.length) * 100));
const currentWordStatus = computed(() => learning.currentRecord.mastered ? '已掌握' : learning.currentRecord.count > 0 ? '学习中' : '未学习');
const totalPercent = computed(() => Math.round(learning.stats.mastered / words.length * 100));
const saveLabel = computed(() => learning.storage.state === 'error' ? '尚未保存' : learning.storage.state === 'saving' ? '正在保存' : learning.storage.state === 'loading' ? '正在读取' : '本地已保存');
const groupCount = (group) => group.words.filter((word) => learning.records.get(word.key)?.mastered).length;
const heatLevel = (count) => count === 0 ? 0 : count < 10 ? 1 : count < 30 ? 2 : count < 60 ? 3 : 4;
const chapterOptions = chapters.map((chapter) => ({ value: chapter.number, label: `${String(chapter.number).padStart(2, '0')} · ${chapter.title}` }));
const reviewFilters = computed(() => [{ value: 'all', label: `全部 ${learning.reviewMatches.length}` }, { value: 'due', label: `到期 ${learning.reviewDueWords.length}` }]);
const difficultyOptions = Array.from({ length: 11 }, (_, value) => ({ value, label: String(value) }));
const reviewSortOptions = [{ value: 'desc', label: '难度从高到低' }, { value: 'asc', label: '难度从低到高' }];

function updateSearch() { learning.visibleCount = 40; }
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <div class="header-inner">
        <button class="brand" aria-label="IELTS Studio，返回单词学习" @click="learning.showView('study')"><span class="brand-symbol"><Icon name="book" :size="22" /></span><span class="brand-name">IELTS<span>Studio</span></span></button>
        <ModuleNav active="words" />
        <HeaderTools :now="learning.now"><span class="save-indicator" :class="{ error: learning.storage.state === 'error', fallback: learning.storage.mode === 'localStorage' }" role="status"><span class="status-dot"></span><span>{{ saveLabel }}</span></span></HeaderTools>
      </div>
    </header>

    <main class="main-container">
      <div class="page-heading"><div><div class="eyebrow">BUILD YOUR VOCABULARY</div><h1>单词学习<span class="heading-dot">.</span></h1><p>从一个单词开始，让每一次练习都留下进步。</p></div></div>

      <div class="workspace-nav">
        <nav class="page-nav" aria-label="单词模块导航"><button v-for="tab in tabs" :key="tab.id" :class="{ active: learning.prefs.view === tab.id }" :aria-current="learning.prefs.view === tab.id ? 'page' : undefined" @click="learning.showView(tab.id)"><Icon :name="tab.icon" :size="17" />{{ tab.label }}<span v-if="tab.id === 'review' && learning.stats.review" class="nav-count">{{ learning.stats.review }}</span></button></nav>
        <form v-if="learning.prefs.view !== 'review'" class="search-field" role="search" @submit.prevent="learning.startSearch"><Icon name="search" :size="18" /><label class="sr-only" for="searchInput">搜索单词或中文释义</label><input id="searchInput" v-model="learning.search" type="search" placeholder="搜索单词或中文释义" autocomplete="off" @input="updateSearch" /><kbd v-if="!learning.search">↵</kbd></form>
      </div>

      <div v-if="learning.storage.state === 'error'" class="storage-warning" role="alert"><Icon name="storage" :size="20" /><p>{{ learning.storage.message }}</p><button class="secondary-button" @click="learning.retrySave"><Icon name="refresh" :size="15" />重试保存</button></div>
      <div v-if="learning.storage.mode === 'localStorage' && learning.storage.state !== 'error'" class="fallback-notice">当前浏览器使用兼容存储，容量较小。</div>

      <div v-if="!learning.ready" class="loading-state" role="status"><span class="loading-ring"></span>正在准备词库与学习记录……</div>
      <template v-else>
        <section v-if="learning.search && learning.prefs.view !== 'review'" class="content-panel search-panel">
          <div class="section-heading"><div><div class="eyebrow">SEARCH RESULTS</div><h2>找到 {{ learning.searchResults.length }} 个词条</h2></div><button class="primary-button" :disabled="!learning.searchResults.length" @click="learning.startSearch">练习这些词<Icon name="right" :size="16" /></button></div>
          <div v-if="!learning.searchResults.length" class="empty-state"><Icon name="search" :size="28" /><h3>没有找到这个词</h3><p>试试输入较短的英文，或中文释义。</p></div>
          <div v-else class="word-table"><button v-for="word in learning.searchResults.slice(0, learning.visibleCount)" :key="word.key" class="word-row" @click="learning.openWord(word)"><strong>{{ word.word }}</strong><span class="row-meaning">{{ word.meaning }}</span><span class="row-source">{{ word.chapterTitle }}</span><Icon name="right" :size="16" /></button></div>
          <button v-if="learning.searchResults.length > learning.visibleCount" class="load-more" @click="learning.visibleCount += 40">显示更多词条</button>
        </section>

        <template v-if="learning.prefs.view === 'study' && !learning.search">
          <section class="selection-panel" aria-label="选择学习内容">
            <div class="selection-row"><div class="select-field source-select"><label for="sourceSelect">学习词库</label><Select input-id="sourceSelect" v-model="learning.prefs.source" :options="sources" option-label="title" option-value="id" checkmark aria-label="学习词库" @change="learning.selectSource" /></div><div class="select-field chapter-select"><label for="chapterSelect">当前章节</label><Select input-id="chapterSelect" v-model="learning.prefs.chapter" :options="chapterOptions" option-label="label" option-value="value" filter filter-placeholder="搜索章节" reset-filter-on-hide checkmark aria-label="当前章节" @change="learning.selectChapter" /></div><div class="selection-meta"><Icon name="book" :size="16" /><span>{{ learning.chapter.groups.length }} 个分组<span class="meta-divider">·</span>{{ learning.chapter.groups.reduce((sum, group) => sum + group.words.length, 0) }} 个词条</span></div></div>
            <SelectButton class="group-picker ui-pills" :model-value="learning.session.key" :options="learning.chapter.groups" option-label="title" option-value="id" :allow-empty="false" aria-label="章节分组" @update:model-value="learning.selectGroup"><template #option="{ option }">{{ option.title }}<span class="ui-option-count">{{ option.words.length }}</span><Icon v-if="groupCount(option) === option.words.length" name="check" :size="12" /></template></SelectButton>
          </section>

          <section class="content-panel word-playback-settings" aria-labelledby="wordPlaybackTitle">
            <div class="section-heading"><h2 id="wordPlaybackTitle">播放设置</h2><Icon name="settings" :size="19" /></div>
            <div class="word-playback-grid">
              <label class="range-setting" for="rateInput"><span>播放速度<strong>{{ learning.prefs.rate.toFixed(1) }}×</strong></span><input id="rateInput" v-model.number="learning.prefs.rate" type="range" min="0.6" max="2" step="0.1" @input="learning.savePrefs" /></label>
              <label class="range-setting" for="intervalInput"><span>播放间隔<strong>{{ learning.prefs.interval }} 秒</strong></span><input id="intervalInput" v-model.number="learning.prefs.interval" type="range" min="0" max="5" step="1" @input="learning.savePrefs" /></label>
              <label class="range-setting" for="repeatInput"><span>播放次数<strong>{{ learning.prefs.repeat }} 次</strong></span><input id="repeatInput" v-model.number="learning.prefs.repeat" type="range" min="1" max="5" step="1" @input="learning.savePrefs" /></label>
            </div>
          </section>

          <div class="study-layout">
            <StudyCard :learning="learning" />
            <aside class="study-aside" aria-label="当前学习进度">
              <section class="progress-panel">
                <div class="panel-heading"><span>本轮掌握进度</span><Icon name="leaf" :size="19" /></div>
                <div class="progress-overview">
                  <div class="progress-ring" :style="{ '--progress': masteredPercent + '%' }"><div><strong>{{ masteredPercent }}<span>%</span></strong><span>已掌握</span></div></div>
                  <dl class="progress-metrics group-metrics" aria-live="polite">
                    <div><dt>当前组已学词</dt><dd>{{ learning.groupStudied }}<span>／{{ learning.session.items.length }}</span></dd></div>
                    <div><dt>当前组已掌握</dt><dd>{{ learning.groupMastered }}<span>／{{ learning.session.items.length }}</span></dd></div>
                  </dl>
                </div>
                <div class="aside-divider"></div>
                <dl class="progress-metrics current-word-metrics" aria-live="polite">
                  <div><dt>当前词学习次数</dt><dd>{{ learning.currentRecord.count }}<span> 次</span></dd></div>
                  <div><dt>当前词状态</dt><dd><span class="word-status" :class="{ mastered: learning.currentRecord.mastered, learning: learning.currentRecord.count > 0 && !learning.currentRecord.mastered }">{{ currentWordStatus }}</span></dd></div>
                </dl>
                <div class="current-position"><span>当前学习位置</span><strong>{{ learning.session.index + 1 }}<span> / {{ learning.session.items.length }}</span></strong></div>
                <div class="small-progress"><span :style="{ width: (learning.session.index + 1) / learning.session.items.length * 100 + '%' }"></span></div>
              </section>
              <section class="today-panel">
                <div class="panel-heading"><span>今天的小积累</span><span class="today-badge">TODAY</span></div>
                <div class="today-metrics"><div><span class="metric-icon"><Icon name="book" :size="17" /></span><span>学习词条</span><strong>{{ learning.today.studied }}</strong></div><div><span class="metric-icon"><Icon name="check" :size="17" /></span><span>新掌握</span><strong>{{ learning.today.mastered }}</strong></div><div><span class="metric-icon"><Icon name="refresh" :size="17" /></span><span>单词复习</span><strong>{{ learning.today.reviewed }}</strong></div></div>
                <div class="streak-note"><span class="streak-leaf"><Icon name="leaf" :size="22" /></span><div><strong>{{ learning.streak ? `已连续学习 ${learning.streak} 天` : '今天，从这里开始' }}</strong><p>{{ learning.streak ? '每一次积累，都算数。' : '学过的词，会记录在这里。' }}</p></div></div>
              </section>
            </aside>
          </div>

          <section class="session-list content-panel"><div class="section-heading"><div><h2>本轮词表<span class="subtle-count">{{ learning.session.items.length }}</span></h2><p>点击任意单词，继续练习。</p></div><button v-if="learning.session.kind === 'review'" class="text-button" @click="learning.showView('review')"><Icon name="left" :size="16" />返回筛选列表</button><span v-else class="session-label">{{ learning.session.label }}</span></div><div class="session-words"><button v-for="(word, index) in learning.session.items.slice(0, learning.visibleCount)" :key="word.key" :class="{ current: index === learning.session.index, mastered: learning.records.get(word.key)?.mastered }" @click="learning.jumpTo(index)"><span class="list-index">{{ String(index + 1).padStart(2, '0') }}</span><span>{{ word.word }}</span><span v-if="learning.records.get(word.key)?.difficulty" class="session-difficulty" :aria-label="`难度 ${learning.records.get(word.key).difficulty}`">{{ learning.records.get(word.key).difficulty }}</span><Icon v-if="learning.records.get(word.key)?.mastered" name="check" :size="14" /></button></div><button v-if="learning.session.items.length > learning.visibleCount" class="load-more" @click="learning.visibleCount += 40">显示更多词条</button></section>
        </template>

        <section v-if="learning.prefs.view === 'library' && !learning.search" class="library-view">
          <div class="section-heading"><div><div class="eyebrow">YOUR WORD COLLECTION</div><h2>找到适合你的学习起点</h2><p>{{ chapters.length }} 个主题章节，{{ groups.length }} 个分组，共 {{ words.length }} 个词条。</p></div></div>
          <div class="source-grid"><button v-for="source in sources" :key="source.id" class="source-card" @click="learning.selectSource()"><span class="source-card-icon"><Icon name="book" :size="23" /></span><div class="source-card-copy"><h3>{{ source.title }}</h3><p>{{ source.description }}</p></div><div class="source-card-count"><strong>{{ source.words.length }}<span> 个词条</span></strong><Icon name="right" :size="18" /></div></button></div>
          <div class="chapters-heading"><h2>主题章节</h2><span>按章节和分组学习</span></div>
          <details v-for="chapter in chapters" :key="chapter.number" class="chapter-collection" :open="chapter.number === learning.prefs.chapter"><summary><span class="chapter-number">{{ String(chapter.number).padStart(2, '0') }}</span><div><strong>{{ chapter.title }}</strong><span>{{ chapter.groups.length }} 组 · {{ chapter.groups.reduce((sum, group) => sum + group.words.length, 0) }} 个词条</span></div><Icon name="down" :size="18" /></summary><div class="library-groups"><button v-for="group in chapter.groups" :key="group.id" @click="learning.selectGroup(group.id)"><div><strong>{{ group.title }}</strong><Icon name="right" :size="16" /></div><p>{{ groupCount(group) }} / {{ group.words.length }} 已掌握</p><div class="small-progress"><span :style="{ width: groupCount(group) / group.words.length * 100 + '%' }"></span></div></button></div></details>
        </section>

        <section v-if="learning.prefs.view === 'review'" class="content-panel review-view">
          <div class="section-heading"><div><div class="eyebrow">PRACTICE BY DIFFICULTY</div><h2>按难度安排复习<span class="subtle-count">{{ learning.reviewWords.length }}</span></h2><p>难度越高，越优先练习。答错难度＋3，最高为 10。</p></div></div>
          <div class="review-filters">
            <form class="review-search" role="search" @submit.prevent="learning.startReview()"><label for="reviewSearch">搜索词条</label><div class="search-field"><Icon name="search" :size="18" /><input id="reviewSearch" v-model="learning.reviewSearch" type="search" placeholder="英文、中文释义或音标" autocomplete="off" /></div></form>
            <div class="review-filter-field"><label for="reviewMin">最低难度</label><Select input-id="reviewMin" :model-value="learning.prefs.reviewMin" :options="difficultyOptions" option-label="label" option-value="value" checkmark aria-label="最低难度" @update:model-value="learning.setReviewRange('reviewMin', $event)" /></div>
            <div class="review-filter-field"><label for="reviewMax">最高难度</label><Select input-id="reviewMax" :model-value="learning.prefs.reviewMax" :options="difficultyOptions" option-label="label" option-value="value" checkmark aria-label="最高难度" @update:model-value="learning.setReviewRange('reviewMax', $event)" /></div>
            <div class="review-filter-field review-sort"><label for="reviewSort">排序</label><Select input-id="reviewSort" v-model="learning.prefs.reviewSort" :options="reviewSortOptions" option-label="label" option-value="value" checkmark aria-label="复习排序" @change="learning.savePrefs" /></div>
          </div>
          <div class="review-toolbar"><SelectButton class="ui-segmented" v-model="learning.prefs.reviewFilter" :options="reviewFilters" option-label="label" option-value="value" :allow-empty="false" aria-label="复习状态筛选" @change="learning.savePrefs" /><button class="text-button" @click="learning.resetReviewFilters">重置筛选</button></div>
          <div class="review-list-heading"><p role="status">筛选到 <strong>{{ learning.filteredReview.length }}</strong> 个词条<span>难度 {{ learning.prefs.reviewMin }}～{{ learning.prefs.reviewMax }}</span></p><div class="review-start-actions"><button class="secondary-button" :disabled="!learning.reviewDueWords.length" @click="learning.startReview(true)"><Icon name="clock" :size="16" />复习到期词<span>{{ learning.reviewDueWords.length }}</span></button><button class="primary-button" :disabled="!learning.filteredReview.length" @click="learning.startReview()">练习筛选结果<Icon name="right" :size="16" /></button></div></div>
          <div v-if="!learning.filteredReview.length" class="empty-state"><span class="empty-icon"><Icon name="search" :size="30" /></span><h3>{{ learning.reviewSearch ? '没有匹配的单词' : learning.prefs.reviewFilter === 'due' ? '当前范围没有到期词' : '当前难度范围没有单词' }}</h3><p>调整搜索或难度范围，或在学习时增加单词难度。</p><button class="secondary-button" @click="learning.showView('study')">回到学习<Icon name="right" :size="16" /></button></div>
          <div v-else class="word-table"><div v-for="word in learning.filteredReview.slice(0, learning.visibleCount)" :key="word.key" class="review-row"><button class="review-word-main" @click="learning.openReviewWord(word)"><strong>{{ word.word }}</strong><span class="row-meaning">{{ word.meaning }}</span><span class="review-source">{{ word.chapterTitle }} · {{ word.groupTitle }}</span></button><div class="review-row-status"><span class="difficulty-badge" :class="{ high: (learning.records.get(word.key)?.difficulty || 0) >= 7 }">难度 {{ learning.records.get(word.key)?.difficulty || 0 }}<small>／10</small></span><span class="review-badge" :class="{ due: learning.isDue(word) }">{{ learning.isDue(word) ? '待复习' : learning.records.get(word.key)?.difficulty ? '已安排复习' : '无需到期复习' }}</span></div><div class="difficulty-adjust"><button class="secondary-button" :aria-label="`${word.word} 难度减 1`" :disabled="!(learning.records.get(word.key)?.difficulty)" @click="learning.adjustDifficulty(-1, word)">－1</button><button class="secondary-button" :aria-label="`${word.word} 难度加 1`" :disabled="learning.records.get(word.key)?.difficulty === 10" @click="learning.adjustDifficulty(1, word)">＋1</button></div></div></div>
          <button v-if="learning.filteredReview.length > learning.visibleCount" class="load-more" @click="learning.visibleCount += 40">显示更多词条</button>
        </section>

        <section v-if="learning.prefs.view === 'stats' && !learning.search" class="stats-view">
          <div class="section-heading"><div><div class="eyebrow">EVERY WORD COUNTS</div><h2>看得见的积累</h2><p>从学习到掌握，记录每一步进度。</p></div><span class="stats-period">词库掌握度 {{ totalPercent }}%</span></div>
          <div class="stats-grid"><article><span><Icon name="book" :size="18" />已学习词条</span><strong>{{ learning.stats.studied }}<small> / {{ words.length }}</small></strong><p>曾经练习过的词条</p></article><article><span><Icon name="check" :size="18" />已掌握词条</span><strong>{{ learning.stats.mastered }}</strong><p>手动标记为已掌握</p></article><article><span><Icon name="refresh" :size="18" />待巩固词条</span><strong>{{ learning.stats.review }}</strong><p>难度大于 0，{{ learning.dueWords.length }} 个已到复习时间</p></article><article><span><Icon name="leaf" :size="18" />连续学习</span><strong>{{ learning.streak }}<small> 天</small></strong><p>每天的积累都算数</p></article></div>
          <div class="chart-layout"><section class="content-panel trend-panel"><div class="section-heading"><div><h2>最近 7 天</h2><p>每天学习的不同词条数。</p></div><span class="chart-legend"><i></i>学习词条</span></div><div class="bar-chart" role="img" :aria-label="sevenDays.map(day => `${day.label}学习${day.studied}个词条`).join('，')"><div v-for="day in sevenDays" :key="day.key" class="bar-column"><span class="bar-value">{{ day.studied }}</span><div class="bar-track"><div class="bar" :style="{ height: day.studied / chartMax * 100 + '%' }"></div></div><span class="bar-label">{{ day.label }}</span></div></div></section><section class="content-panel heatmap-panel"><div class="section-heading"><div><h2>学习足迹</h2><p>最近 30 天的学习记录。</p></div><Icon name="calendar" :size="19" /></div><div class="heatmap"><div v-for="day in monthDays" :key="day.key" :class="'heat-' + heatLevel(day.studied)" :title="`${day.key}：学习 ${day.studied} 个词条`" :aria-label="`${day.key}：学习 ${day.studied} 个词条`"><span>{{ Number(day.key.slice(-2)) }}</span></div></div><div class="heatmap-legend"><span>少</span><i v-for="level in 5" :key="level" :class="'heat-' + (level - 1)"></i><span>多</span></div><div class="footprint-total"><strong>{{ monthDays.filter(day => day.studied > 0).length }}</strong><span>天有学习记录</span></div></section></div>
        </section>
      </template>

      <footer class="page-footer"><span>IELTS Studio<span class="footer-divider">/</span>一点积累，一点进步。</span><span v-if="learning.prefs.view === 'study'" class="keyboard-hints"><kbd>←</kbd><kbd>→</kbd>切换单词<span>·</span><kbd>Space</kbd>播放／暂停</span></footer>
    </main>

    <Transition name="toast"><div v-if="learning.notice" class="toast-message" role="status">{{ learning.notice }}</div></Transition>
  </div>
</template>
