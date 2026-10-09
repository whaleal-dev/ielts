<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import SelectButton from 'primevue/selectbutton';
import Icon from './Icon.vue';
import { relatedTerms } from './library.js';
const props = defineProps({ learning: { type: Object, required: true } });
const spellInput = ref(null);
const noteOpen = ref(true);
const modes = [{ id: 'word', label: '单词卡片' }, { id: 'quiz', label: '选中文' }, { id: 'spell', label: '听音拼写' }];
const wordVisible = computed(() => props.learning.prefs.mode !== 'word' || props.learning.prefs.showWord);
const answerFeedback = computed(() => {
  const { round, prefs, current } = props.learning;
  if (round.correct) return '回答正确，继续保持。';
  const adjustment = round.difficultyAdded ? `难度＋${round.difficultyAdded}，当前 ${round.difficultyAfter}／10。` : '难度已达上限 10。';
  return `正确答案：${prefs.mode === 'quiz' ? current?.meaning : current?.word}。${adjustment}`;
});
watch(() => props.learning.prefs.mode, async (mode) => { if (mode === 'spell') { await nextTick(); spellInput.value?.focus(); } });
watch(() => props.learning.current?.key, async () => { if (props.learning.prefs.mode === 'spell') { await nextTick(); spellInput.value?.focus(); } });
</script>

<template>
  <section class="study-card" aria-label="单词练习">
    <div class="card-toolbar">
      <SelectButton class="ui-segmented" :model-value="learning.prefs.mode" :options="modes" option-label="label" option-value="id" :allow-empty="false" aria-label="练习模式" @update:model-value="learning.setMode" />
    </div>

    <div class="word-content" :class="{ 'exercise-content': learning.prefs.mode !== 'word' }">
      <div class="word-context"><span>{{ learning.session.label }}</span><span class="word-sequence">{{ String(learning.session.index + 1).padStart(2, '0') }} <span>/ {{ learning.session.items.length }}</span></span></div>
      <div v-if="learning.prefs.mode === 'spell' && !learning.round.answered" class="listening-prompt">
        <button class="listen-button" :class="{ speaking: learning.speaking }" aria-label="播放当前单词发音" @click="learning.pronounce"><Icon name="volume" :size="34" /></button>
        <h2>听一听，写下这个词</h2><p>可以重复播放，直到听清楚。</p>
      </div>
      <div v-else class="word-heading">
        <div class="word-tags"><span v-if="learning.currentRecord.mastered" class="mastered-tag"><Icon name="check" :size="12" />已掌握</span></div>
        <h2 id="wordText" :class="{ 'word-detail-hidden': !wordVisible }">{{ learning.current?.word }}</h2>
        <div class="phonetic"><span id="wordPhonetic" :class="{ 'word-detail-hidden': !wordVisible }">/{{ learning.current?.phonetic || '—' }}/</span><button class="pronounce-button" :class="{ speaking: learning.speaking }" aria-label="播放发音" @click="learning.pronounce"><Icon name="volume" :size="18" /><span>英音</span></button></div>
      </div>

      <div v-if="learning.prefs.mode === 'word'" class="meaning-section">
        <p id="meaningText" :class="{ 'word-detail-hidden': !learning.prefs.showMeaning }">{{ learning.current?.meaning }}</p>
      </div>

      <div v-if="learning.prefs.mode === 'quiz'" class="quiz-options">
        <button v-for="(option, index) in learning.round.options" :key="option" :disabled="learning.round.answered" :class="{ correct: learning.round.answered && option === learning.current.meaning, wrong: learning.round.answered && option === learning.round.selected && !learning.round.correct }" @click="learning.answer(option)"><span class="option-letter">{{ 'ABCD'[index] }}</span><span>{{ option }}</span><Icon v-if="learning.round.answered && option === learning.current.meaning" name="check" :size="18" /></button>
      </div>
      <form v-if="learning.prefs.mode === 'spell'" class="spelling-form" @submit.prevent="learning.round.answered ? learning.move(1) : learning.answer(learning.spelling)">
        <label class="sr-only" for="spellingInput">输入听到的单词</label>
        <input id="spellingInput" ref="spellInput" v-model="learning.spelling" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入你听到的单词" :disabled="learning.round.answered" />
        <button class="primary-button" type="submit">{{ learning.round.answered ? '下一个词' : '检查答案' }}<Icon name="right" :size="17" /></button>
      </form>
      <p v-if="learning.round.answered && learning.prefs.mode !== 'word'" class="answer-feedback" :class="{ incorrect: !learning.round.correct }" role="status">{{ answerFeedback }}</p>
      <div v-if="learning.prefs.mode === 'word' && relatedTerms(learning.current).length" class="synonyms"><span class="detail-label">关联词汇</span><span v-for="term in relatedTerms(learning.current)" :key="term" class="synonym-chip">{{ term }}</span></div>
    </div>

    <div class="word-actions">
      <div class="difficulty-controls" role="group" aria-label="单词难度"><span>当前难度<strong class="difficulty-value" aria-live="polite">{{ learning.currentRecord.difficulty }}<small>／10</small></strong></span><div class="difficulty-adjust"><button class="secondary-button" aria-label="单词难度减 1" :disabled="learning.currentRecord.difficulty === 0" @click="learning.adjustDifficulty(-1)">－1</button><button class="secondary-button" aria-label="单词难度加 1" :disabled="learning.currentRecord.difficulty === 10" @click="learning.adjustDifficulty(1)">＋1</button></div></div>
      <button class="secondary-button word-visibility-button" :class="{ selected: !learning.prefs.showWord }" :aria-pressed="!learning.prefs.showWord" aria-controls="wordText wordPhonetic" :disabled="learning.prefs.mode !== 'word'" @click="learning.prefs.showWord = !learning.prefs.showWord; learning.savePrefs()"><Icon name="eye" :size="17" />{{ learning.prefs.showWord ? '隐藏单词' : '显示单词' }}</button>
      <button class="secondary-button word-visibility-button" :class="{ selected: !learning.prefs.showMeaning }" :aria-pressed="!learning.prefs.showMeaning" aria-controls="meaningText" :disabled="learning.prefs.mode !== 'word'" @click="learning.prefs.showMeaning = !learning.prefs.showMeaning; learning.savePrefs()"><Icon name="eye" :size="17" />{{ learning.prefs.showMeaning ? '隐藏释义' : '显示释义' }}</button>
      <button class="secondary-button difficulty-button" :disabled="learning.currentRecord.difficulty === 10" @click="learning.adjustDifficulty(3)"><Icon name="chart" :size="18" />难度＋3</button>
      <button class="primary-button mastered-button" :class="{ selected: learning.currentRecord.mastered }" :aria-pressed="learning.currentRecord.mastered" @click="learning.toggleMastered"><Icon name="check" :size="18" />{{ learning.currentRecord.mastered ? '已掌握' : '标记已掌握' }}</button>
    </div>
    <div class="transport-bar">
      <button class="text-button" :disabled="learning.session.index === 0" @click="learning.move(-1)"><Icon name="left" :size="18" />上一个</button>
      <button class="auto-button" :class="{ playing: learning.playing }" @click="learning.toggleAuto"><Icon :name="learning.playing ? 'pause' : 'play'" :size="15" />{{ learning.playing ? '暂停播放' : '自动播放' }}<span>{{ learning.prefs.rate.toFixed(1) }}×</span></button>
      <button class="text-button next-button" @click="learning.move(1)">{{ learning.session.index === learning.session.items.length - 1 ? '完成本组' : '下一个' }}<Icon name="right" :size="18" /></button>
    </div>
    <div class="note-section">
      <button class="text-button" :aria-expanded="noteOpen" aria-controls="wordNote" @click="noteOpen = !noteOpen"><Icon name="pen" :size="15" />我的笔记<Icon name="down" :size="14" :class="{ rotated: noteOpen }" /></button>
      <div v-if="noteOpen" id="wordNote" class="note-editor"><label class="sr-only" for="noteInput">当前单词的学习笔记</label><textarea id="noteInput" :value="learning.currentRecord.note" :maxlength="Math.max(400, learning.currentRecord.note.length)" placeholder="记下搭配、易错点，或自己的记忆方法……" @input="learning.saveNote($event.target.value)"></textarea><span>{{ learning.currentRecord.note.length }} / {{ Math.max(400, learning.currentRecord.note.length) }}</span></div>
    </div>
  </section>
</template>
