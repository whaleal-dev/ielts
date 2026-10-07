<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { relatedTerms, sourceLabels } from './library.js';
const props = defineProps({ learning: { type: Object, required: true } });
defineEmits(['settings']);
const spellInput = ref(null);
const noteOpen = ref(false);
const modes = [{ id: 'word', label: '单词卡片' }, { id: 'quiz', label: '选中文' }, { id: 'spell', label: '听音拼写' }];
const meaningVisible = computed(() => props.learning.prefs.mode === 'word' ? props.learning.prefs.showMeaning : props.learning.round.answered);
watch(() => props.learning.prefs.mode, async (mode) => { if (mode === 'spell') { await nextTick(); spellInput.value?.focus(); } });
watch(() => props.learning.current?.key, async () => { if (props.learning.prefs.mode === 'spell') { await nextTick(); spellInput.value?.focus(); } });
</script>

<template>
  <section class="study-card" aria-label="单词练习">
    <div class="card-toolbar">
      <div class="mode-tabs" role="group" aria-label="练习模式">
        <button v-for="mode in modes" :key="mode.id" :class="{ active: learning.prefs.mode === mode.id }" :aria-pressed="learning.prefs.mode === mode.id" @click="learning.setMode(mode.id)">{{ mode.label }}</button>
      </div>
      <button class="icon-button" aria-label="打开学习设置" @click="$emit('settings')"><Icon name="settings" /></button>
    </div>

    <div class="word-content" :class="{ 'exercise-content': learning.prefs.mode !== 'word' }">
      <div class="word-context"><span>{{ learning.session.label }}</span><span class="word-sequence">{{ String(learning.session.index + 1).padStart(2, '0') }} <span>/ {{ learning.session.items.length }}</span></span></div>
      <div v-if="learning.prefs.mode === 'spell' && !learning.round.answered" class="listening-prompt">
        <button class="listen-button" :class="{ speaking: learning.speaking }" aria-label="播放当前单词发音" @click="learning.pronounce"><Icon name="volume" :size="34" /></button>
        <h2>听一听，写下这个词</h2><p>可以重复播放，直到听清楚。</p>
      </div>
      <div v-else class="word-heading">
        <div class="word-tags"><span v-for="label in sourceLabels(learning.current)" :key="label">{{ label }}</span><span v-if="learning.currentRecord.mastered" class="mastered-tag"><Icon name="check" :size="12" />已掌握</span></div>
        <h2 id="wordText">{{ learning.current?.word }}</h2>
        <div class="phonetic"><span>/{{ learning.current?.phonetic || '—' }}/</span><button class="pronounce-button" :class="{ speaking: learning.speaking }" aria-label="播放发音" @click="learning.pronounce"><Icon name="volume" :size="18" /><span>英音</span></button></div>
      </div>

      <div v-if="learning.prefs.mode === 'word'" class="meaning-section">
        <p v-if="meaningVisible" id="meaningText">{{ learning.current?.meaning }}</p>
        <button v-else class="reveal-meaning" @click="learning.prefs.showMeaning = true; learning.savePrefs()"><Icon name="eye" :size="18" />点击查看释义</button>
        <button class="text-button meaning-toggle" @click="learning.prefs.showMeaning = !learning.prefs.showMeaning; learning.savePrefs()"><Icon name="eye" :size="15" />{{ meaningVisible ? '隐藏释义' : '显示释义' }}</button>
      </div>

      <div v-if="learning.prefs.mode === 'quiz'" class="quiz-options">
        <button v-for="(option, index) in learning.round.options" :key="option" :disabled="learning.round.answered" :class="{ correct: learning.round.answered && option === learning.current.meaning, wrong: learning.round.answered && option === learning.round.selected && !learning.round.correct }" @click="learning.answer(option)"><span class="option-letter">{{ 'ABCD'[index] }}</span><span>{{ option }}</span><Icon v-if="learning.round.answered && option === learning.current.meaning" name="check" :size="18" /></button>
      </div>
      <form v-if="learning.prefs.mode === 'spell'" class="spelling-form" @submit.prevent="learning.round.answered ? learning.move(1) : learning.answer(learning.spelling)">
        <label class="sr-only" for="spellingInput">输入听到的单词</label>
        <input id="spellingInput" ref="spellInput" v-model="learning.spelling" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入你听到的单词" :disabled="learning.round.answered" />
        <button class="primary-button" type="submit">{{ learning.round.answered ? '下一个词' : '检查答案' }}<Icon name="right" :size="17" /></button>
      </form>
      <p v-if="learning.round.answered && learning.prefs.mode !== 'word'" class="answer-feedback" :class="{ incorrect: !learning.round.correct }" role="status">{{ learning.round.correct ? '回答正确，继续保持。' : `正确答案：${learning.prefs.mode === 'quiz' ? learning.current.meaning : learning.current.word}。已加入难词。` }}</p>
      <div v-if="learning.prefs.mode === 'word' && relatedTerms(learning.current).length" class="synonyms"><span class="detail-label">关联词汇</span><span v-for="term in relatedTerms(learning.current)" :key="term" class="synonym-chip">{{ term }}</span></div>
    </div>

    <div class="word-actions">
      <button class="secondary-button difficult-button" :class="{ selected: learning.currentRecord.difficult }" :aria-pressed="learning.currentRecord.difficult" @click="learning.toggleDifficult()"><Icon name="star" :size="18" />{{ learning.currentRecord.difficult ? '已加入难词' : '加入难词' }}</button>
      <button class="primary-button mastered-button" :class="{ selected: learning.currentRecord.mastered }" :aria-pressed="learning.currentRecord.mastered" @click="learning.toggleMastered"><Icon name="check" :size="18" />{{ learning.currentRecord.mastered ? '已掌握' : '标记已掌握' }}</button>
    </div>
    <div class="transport-bar">
      <button class="text-button" :disabled="learning.session.index === 0" @click="learning.move(-1)"><Icon name="left" :size="18" />上一个</button>
      <button class="auto-button" :class="{ playing: learning.playing }" @click="learning.toggleAuto"><Icon :name="learning.playing ? 'pause' : 'play'" :size="15" />{{ learning.playing ? '暂停播放' : '自动播放' }}<span>{{ learning.prefs.rate.toFixed(1) }}×</span></button>
      <button class="text-button next-button" @click="learning.move(1)">{{ learning.session.index === learning.session.items.length - 1 ? '完成本组' : '下一个' }}<Icon name="right" :size="18" /></button>
    </div>
    <div class="note-section">
      <button class="text-button" :aria-expanded="noteOpen" aria-controls="wordNote" @click="noteOpen = !noteOpen"><Icon name="pen" :size="15" />{{ learning.currentRecord.note ? '我的笔记' : '添加学习笔记' }}<Icon name="down" :size="14" :class="{ rotated: noteOpen }" /></button>
      <div v-if="noteOpen" id="wordNote" class="note-editor"><label class="sr-only" for="noteInput">当前单词的学习笔记</label><textarea id="noteInput" :value="learning.currentRecord.note" :maxlength="Math.max(400, learning.currentRecord.note.length)" placeholder="记下搭配、易错点，或自己的记忆方法……" @input="learning.saveNote($event.target.value)"></textarea><span>{{ learning.currentRecord.note.length }} / {{ Math.max(400, learning.currentRecord.note.length) }}</span></div>
    </div>
  </section>
</template>
