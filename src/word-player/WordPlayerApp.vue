<script setup>
import SelectButton from 'primevue/selectbutton';
import Icon from '../Icon.vue';
import PracticeHeader from '../practice/PracticeHeader.vue';
import BrowserNotice from '../practice/BrowserNotice.vue';
import VoiceSelect from '../practice/VoiceSelect.vue';
import { useWordPlayer } from './useWordPlayer.js';
import '../practice/style.css';

const app = useWordPlayer();
const modeOptions = [{ value: 'listen', label: '只听模式', icon: 'headphones' }, { value: 'dictation', label: '听写模式', icon: 'pen' }];
function clearWords() { if (window.confirm('清空当前词表和本模块播放设置？')) app.clear(); }
</script>

<template>
  <div class="app-shell practice-app word-player-app">
    <PracticeHeader module="word-player" :storage="app.storage" />
    <main class="main-container">
      <div class="page-heading"><div><div class="eyebrow">LET THE WORDS PLAY</div><h1>单词播放<span class="heading-dot">.</span></h1><p>放入你的词表，按自己的节奏反复听。</p></div></div>
      <div v-if="app.storage.state === 'error'" class="storage-warning" role="alert"><Icon name="storage" /><p>{{ app.storage.message }}</p><button class="secondary-button" @click="app.retrySave">{{ app.storage.loadFailed ? '重试读取' : '重试保存' }}</button></div>
      <div v-if="app.storage.mode === 'localStorage' && app.storage.state !== 'error'" class="fallback-notice">当前使用兼容存储，词表、播放设置与位置仅保存在当前浏览器。</div>
      <div v-if="!app.ready" class="loading-state" role="status"><span class="loading-ring"></span>正在读取词表与播放设置……</div>
      <template v-else-if="!app.storage.loadFailed">
        <section class="selection-panel player-input-panel" aria-label="加载单词列表"><div class="practice-toolbar"><div><h2>你的播放词表</h2><p>用逗号或换行分隔单词与词组，自动过滤含中文词条并去重。</p></div><span class="player-total">{{ app.items.length }} <small>个词条</small></span></div><label class="sr-only" for="playerWords">粘贴要播放的词表</label><textarea id="playerWords" v-model="app.rawText" class="practice-textarea" rows="3" maxlength="100000" placeholder="analyze, consequence, environment&#10;significant&#10;in advance, beneficial"></textarea><div class="practice-actions"><button id="playerLoad" class="primary-button" @click="app.loadWords"><Icon name="book" :size="16" />加载并重置进度</button><button class="text-button" :disabled="!app.items.length && !app.rawText" @click="clearWords">清空词表与设置</button></div></section>
        <p v-if="app.error" class="practice-error" role="alert">{{ app.error }}</p>
        <p v-else-if="app.notice" class="practice-notice" role="status">{{ app.notice }}</p>
        <div class="player-layout">
          <div class="player-left">
            <section class="content-panel player-stage" aria-label="当前播放词条"><div class="player-stage-top"><SelectButton class="ui-segmented" :model-value="app.prefs.mode" :options="modeOptions" option-label="label" option-value="value" :allow-empty="false" aria-label="单词播放练习模式" @update:model-value="app.setMode"><template #option="{ option }"><Icon :name="option.icon" :size="15" />{{ option.label }}</template></SelectButton><span class="player-position">{{ app.items.length ? app.index + 1 : 0 }} / {{ app.items.length }}</span></div><div class="player-word-area"><span class="eyebrow">{{ app.prefs.mode === 'dictation' ? 'LISTEN & SPELL' : 'LISTEN & REPEAT' }}</span><div class="player-word-title" aria-live="polite" aria-atomic="true"><h2 v-if="!app.current" class="player-empty-title">准备开始</h2><h2 v-else-if="app.prefs.mode === 'dictation' && !app.revealed" class="player-listen-title">听一听，写下来</h2><h2 v-else id="playerCurrentWord" class="player-current-word">{{ app.current }}</h2></div><button class="player-speak-button" :class="{ speaking: app.speaking }" :disabled="!app.current" aria-label="重播当前单词" @click="app.replay"><Icon name="volume" :size="27" /></button><p>{{ !app.current ? '先粘贴并加载一个词表。' : app.speaking ? `正在发音 · 第 ${app.repetition} / ${app.prefs.repeat} 次` : app.playing ? '等待间隔后播放下一个词' : app.finished ? '本轮已完成，可以重新播放' : app.prefs.mode === 'dictation' ? '听完输入拼写，检查答案后手动切换下一词。' : '点击开始播放，或单独重播当前词。' }}</p></div>
              <form v-if="app.prefs.mode === 'dictation'" class="player-answer" @submit.prevent="app.check"><label class="sr-only" for="playerAnswer">输入听到的单词</label><input id="playerAnswer" v-model="app.answer" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200" placeholder="输入拼写，按 Enter 检查" :disabled="!app.current" /><button class="primary-button" type="submit" :disabled="!app.current">检查答案</button><button class="text-button" type="button" :disabled="!app.current" @click="app.reveal"><Icon name="eye" :size="15" />显示答案</button><p class="player-feedback" :class="{ incorrect: app.feedback?.correct === false }" role="status">{{ app.feedback?.message }}</p></form>
              <div class="player-progress" :aria-label="`当前位置 ${app.items.length ? app.index + 1 : 0}，共 ${app.items.length} 个词条`"><span :style="{ width: app.items.length ? (app.index + 1) / app.items.length * 100 + '%' : '0%' }"></span></div>
              <div class="player-transport" role="group" aria-label="单词播放控制"><button class="secondary-button" :disabled="!app.current || app.index === 0" @click="app.move(-1)"><Icon name="left" :size="16" />上一个</button><button id="playerPlay" class="primary-button" :disabled="!app.current" @click="app.toggle"><Icon :name="app.playing ? 'pause' : 'play'" :size="16" />{{ app.playing ? '暂停播放' : app.finished ? '重新播放' : '开始播放' }}</button><button class="secondary-button" :disabled="!app.current || app.index === app.items.length - 1" @click="app.move(1)">下一个<Icon name="right" :size="16" /></button></div>
            </section>
            <section class="content-panel practice-playback-settings player-settings" aria-label="单词播放设置"><div class="section-heading"><div><h2>播放设置</h2><p>选择发音人、倍速、间隔与逐词重复次数。</p></div><Icon name="settings" :size="19" /></div><div class="practice-settings player-settings-grid"><VoiceSelect id="playerVoice" v-model="app.prefs.voice" prefer-google @change="app.savePrefs" /><label class="practice-field" for="playerRate">发音倍速<strong class="practice-setting-value">{{ app.prefs.rate.toFixed(2) }}×</strong><input id="playerRate" v-model.number="app.prefs.rate" type="range" min="0.5" max="1.5" step="0.05" @change="app.savePrefs" /></label><label class="practice-field" for="playerInterval">词间间隔<strong class="practice-setting-value">{{ app.prefs.interval }} 秒</strong><input id="playerInterval" v-model.number="app.prefs.interval" type="range" min="0.5" max="5" step="0.5" @change="app.savePrefs" /></label><label class="practice-field" for="playerRepeat">每词播放<strong class="practice-setting-value">{{ app.prefs.repeat }} 次</strong><input id="playerRepeat" v-model.number="app.prefs.repeat" type="range" min="1" max="5" step="1" @change="app.savePrefs" /></label></div></section>
          </div>
          <section class="content-panel player-queue" aria-label="单词播放列表"><div class="section-heading"><div><h2>播放列表<span class="subtle-count">{{ app.items.length }}</span></h2><p>{{ app.prefs.mode === 'dictation' ? '听写时隐藏拼写，点击序号跳转。' : '点击词条，跳转并播放。' }}</p></div><button class="text-button" :disabled="app.items.length < 2" @click="app.shuffle"><Icon name="refresh" :size="14" />乱序</button></div><div v-if="!app.items.length" class="player-queue-empty"><Icon name="book" :size="26" /><p>加载词表后显示播放列表。</p></div><div v-else class="player-queue-list"><button v-for="(word, index) in app.items" :key="index" :class="{ current: app.index === index }" :aria-current="app.index === index ? 'step' : undefined" :aria-label="app.prefs.mode === 'dictation' ? `播放第 ${index + 1} 个词` : `播放 ${word}`" @click="app.jump(index)"><span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ app.prefs.mode === 'dictation' ? '••••••' : word }}</strong><Icon v-if="app.index === index" :name="app.speaking ? 'volume' : 'right'" :size="15" /></button></div></section>
        </div>
      </template>
      <footer class="page-footer"><span>IELTS Studio<span class="footer-divider">/</span>每一次重复，让声音更熟悉。</span><span class="keyboard-hints"><kbd>←</kbd><kbd>→</kbd>切换<kbd>R</kbd>重播<span>·</span><kbd>Space</kbd>播放／暂停</span></footer>
      <BrowserNotice />
    </main>
  </div>
</template>
