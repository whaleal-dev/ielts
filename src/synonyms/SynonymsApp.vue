<script setup>
import { ref } from 'vue';
import Icon from '../Icon.vue';
import PracticeHeader from '../practice/PracticeHeader.vue';
import BrowserNotice from '../practice/BrowserNotice.vue';
import VoiceSelect from '../practice/VoiceSelect.vue';
import { hasChinese } from './model.js';
import { useSynonyms } from './useSynonyms.js';
import '../practice/style.css';

const app = useSynonyms();
const importDialog = ref(null);
const noteDialog = ref(null);
const files = ref([]);
const importing = ref(false);
const noteGroup = ref([]);
const noteWord = ref('');
const noteText = ref('');
const dialogError = ref('');
const highlighted = (group, word) => app.current?.group === group && app.current?.word === word;
function openImport() { app.pause(); files.value = []; dialogError.value = ''; importDialog.value.showModal(); }
function addFiles(incoming) { files.value.push(...Array.from(incoming)); }
async function importFiles() {
  importing.value = true; dialogError.value = '';
  try { if (await app.importFiles(files.value)) importDialog.value.close(); else dialogError.value = app.error; }
  finally { importing.value = false; }
}
function openNote(group, word = group[0]) { app.pause(); noteGroup.value = [...new Set(group)]; noteWord.value = word; noteText.value = app.notes.get(word) || ''; noteDialog.value.showModal(); }
async function saveNote() { if (await app.saveNote(noteWord.value, noteText.value)) noteDialog.value.close(); }
function removeNote(word) { if (window.confirm(`移除「${word}」的笔记？`)) app.saveNote(word, ''); }
</script>

<template>
  <div class="app-shell practice-app synonyms-app">
    <PracticeHeader module="synonyms" :storage="app.storage" />
    <main class="main-container">
      <div class="page-heading"><div><div class="eyebrow">SAME MEANING, NEW WORDS</div><h1>同义词<span class="heading-dot">.</span></h1><p>把同义替换放在一起，听一听，记得更牢。</p></div></div>
      <div v-if="app.storage.state === 'error'" class="storage-warning" role="alert"><Icon name="storage" /><p>{{ app.storage.message }}</p><button class="secondary-button" @click="app.retrySave">重试保存</button></div>
      <div v-if="app.storage.mode === 'localStorage' && app.storage.state !== 'error'" class="fallback-notice">当前使用兼容存储，词库、设置与笔记仍仅保存在当前浏览器。</div>
      <div v-if="!app.ready" class="loading-state" role="status"><span class="loading-ring"></span>正在读取词库与笔记……</div>
      <template v-else>
        <section class="selection-panel synonym-controls" aria-label="同义词播放设置">
          <div class="practice-toolbar"><div class="synonym-source"><Icon name="book" :size="19" /><div><strong>{{ app.source || '选择你的同义词词库' }}</strong><span>{{ app.groups.length }} 组 · {{ app.noteCount }} 条笔记</span></div></div><div class="practice-actions"><button class="secondary-button" @click="app.loadSample">示例词库</button><button class="primary-button" @click="openImport"><Icon name="grid" :size="15" />导入词库</button></div></div>
          <div class="practice-settings synonym-settings">
            <VoiceSelect id="synonymVoice" v-model="app.prefs.voice" @change="app.savePrefs" />
            <label class="practice-field" for="synonymRepeat">每词播放<select id="synonymRepeat" v-model.number="app.prefs.repeat" @change="app.savePrefs"><option v-for="count in [1, 2, 3, 5, 10]" :key="count" :value="count">{{ count }} 次</option></select></label>
            <label class="practice-field" for="synonymLoops">每组循环<select id="synonymLoops" v-model.number="app.prefs.groupLoops" @change="app.savePrefs"><option v-for="count in [1, 2, 3, 5, 10]" :key="count" :value="count">{{ count }} 轮</option></select></label>
            <label class="practice-field" for="synonymRate">发音倍速<select id="synonymRate" v-model.number="app.prefs.rate" @change="app.savePrefs"><option v-for="rate in [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2]" :key="rate" :value="rate">{{ rate.toFixed(1) }}×</option></select></label>
            <label class="practice-field" for="synonymInterval">词间间隔<select id="synonymInterval" v-model.number="app.prefs.interval" @change="app.savePrefs"><option v-for="interval in [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]" :key="interval" :value="interval">{{ interval }} 秒</option></select></label>
          </div>
          <div class="synonym-transport"><div class="practice-current"><span class="status-dot" :class="{ 'is-speaking': app.speaking }"></span><strong>{{ app.current?.text || '准备开始' }}</strong><span v-if="app.current">第 {{ app.current.cycle }} / {{ app.prefs.groupLoops }} 轮<span v-if="app.playing"> · 第 {{ app.repetition }} / {{ app.prefs.repeat }} 次</span></span></div><div class="practice-actions"><button class="secondary-button" :disabled="!app.canMove(-1)" aria-label="上一个同义词" @click="app.move(-1)"><Icon name="left" :size="17" /></button><button id="synonymPlay" class="primary-button" :disabled="!app.items.length" @click="app.toggle"><Icon :name="app.playing ? 'pause' : 'play'" :size="16" />{{ app.playing ? '暂停播放' : app.finished ? '重新播放' : '自动播放' }}</button><button class="secondary-button" :disabled="!app.canMove(1)" aria-label="下一个同义词" @click="app.move(1)"><Icon name="right" :size="17" /></button></div></div>
        </section>
        <p v-if="app.error" class="practice-error" role="alert">{{ app.error }}</p>
        <p v-else-if="app.notice || app.finished" class="practice-notice" role="status">{{ app.finished ? '当前列表已播放完成。' : app.notice }}</p>
        <div class="synonym-list-heading"><div><h2>同义替换<span class="subtle-count">{{ app.filteredGroups.length }}</span></h2><p>点击英文词条发音，含中文词条只展示。</p></div><form class="search-field" role="search" @submit.prevent><Icon name="search" :size="18" /><label class="sr-only" for="synonymSearch">搜索单词或同义词</label><input id="synonymSearch" v-model="app.search" type="search" placeholder="搜索单词或同义词" autocomplete="off" /></form></div>
        <section v-if="!app.groups.length" class="content-panel empty-state"><span class="empty-icon"><Icon name="refresh" :size="29" /></span><h3>从一组同义词开始</h3><p>导入 TXT／JSON 词库，或先试试示例词库。</p><button class="secondary-button" @click="app.loadSample">加载示例词库<Icon name="right" :size="15" /></button></section>
        <section v-else-if="!app.filteredGroups.length" class="content-panel empty-state"><Icon name="search" :size="28" /><h3>没有匹配的同义词组</h3><p>试试其他英文或中文关键词。</p></section>
        <div v-else class="synonym-list">
          <article v-for="group in app.filteredGroups.slice(0, app.visibleCount)" :key="group.index" class="content-panel synonym-card" :class="{ 'current-group': app.current?.group === group.index }">
            <div class="synonym-group-number">{{ String(group.index + 1).padStart(2, '0') }}</div>
            <div class="synonym-card-body"><button class="synonym-main-word" :class="{ highlighted: highlighted(group.index, 0) }" :disabled="hasChinese(group.words[0])" :aria-label="`播放 ${group.words[0]}`" @click="app.jump(group.index, 0)">{{ group.words[0] }}<Icon v-if="!hasChinese(group.words[0])" name="volume" :size="18" /></button><div class="synonym-terms"><button v-for="(word, index) in group.words.slice(1)" :key="index" :class="{ highlighted: highlighted(group.index, index + 1) }" :disabled="hasChinese(word)" :aria-label="`播放 ${word}`" @click="app.jump(group.index, index + 1)">{{ word }}<Icon v-if="!hasChinese(word)" name="volume" :size="14" /></button></div>
              <div class="synonym-notes"><div v-for="note in app.groupNotes(group.words)" :key="note.word" class="synonym-note"><button class="synonym-note-content" :aria-label="`编辑 ${note.word} 的笔记`" @click="openNote(group.words, note.word)"><strong>{{ note.word }}</strong><span>{{ note.text }}</span></button><button class="icon-button" :aria-label="`移除 ${note.word} 的笔记`" @click="removeNote(note.word)"><Icon name="close" :size="13" /></button></div><button class="text-button synonym-add-note" @click="openNote(group.words)"><Icon name="pen" :size="14" />添加笔记</button></div>
            </div>
          </article>
          <button v-if="app.filteredGroups.length > app.visibleCount" class="load-more" @click="app.visibleCount += 40">显示更多同义词组</button>
        </div>
      </template>
      <footer class="page-footer"><span>IELTS Studio<span class="footer-divider">/</span>换个表达，记住同一个意思。</span><span class="keyboard-hints"><kbd>←</kbd><kbd>→</kbd>切换<span>·</span><kbd>Space</kbd>播放／暂停</span></footer>
      <BrowserNotice />
    </main>
    <dialog ref="importDialog" class="settings-dialog practice-dialog" aria-labelledby="synonymImportTitle"><div class="dialog-heading"><div><div class="eyebrow">YOUR SYNONYM COLLECTION</div><h2 id="synonymImportTitle">导入同义词词库</h2></div><button class="icon-button" aria-label="关闭导入窗口" :disabled="importing" @click="importDialog.close()"><Icon name="close" /></button></div><div class="dialog-body"><p class="practice-dialog-copy">TXT 每行一组，用英文或中文逗号分隔。JSON 使用二维字符串数组。多文件按选择顺序合并，导入后替换当前词库。</p><pre class="practice-file-example">reserve, book, prebook&#10;in advance, ahead, beforehand</pre><label class="practice-file-drop" for="synonymFiles" @dragover.prevent @drop.prevent="addFiles($event.dataTransfer.files)"><Icon name="grid" :size="27" /><strong>选择或拖入 TXT／JSON 文件</strong><span>文件只在当前浏览器读取</span><input id="synonymFiles" type="file" accept=".txt,.json" multiple :disabled="importing" @change="addFiles($event.target.files); $event.target.value = ''" /></label><ol v-if="files.length" class="practice-file-list"><li v-for="(file, index) in files" :key="index"><span>{{ file.name }}</span><button class="icon-button" :disabled="importing" :aria-label="`移除待导入文件 ${file.name}`" @click="files.splice(index, 1)"><Icon name="close" :size="15" /></button></li></ol><p v-if="dialogError" class="practice-error" role="alert">{{ dialogError }}</p></div><div class="dialog-footer"><button class="secondary-button" :disabled="importing" @click="importDialog.close()">取消</button><button class="primary-button" :disabled="!files.length || importing" @click="importFiles">{{ importing ? '正在读取' : '导入词库' }}</button></div></dialog>
    <dialog ref="noteDialog" class="settings-dialog practice-dialog" aria-labelledby="synonymNoteTitle"><div class="dialog-heading"><div><div class="eyebrow">A NOTE TO REMEMBER</div><h2 id="synonymNoteTitle">同义词笔记</h2></div><button class="icon-button" aria-label="关闭笔记窗口" @click="noteDialog.close()"><Icon name="close" /></button></div><form @submit.prevent="saveNote"><div class="dialog-body"><label class="practice-field" for="synonymNoteWord">关联词条<select id="synonymNoteWord" v-model="noteWord" @change="noteText = app.notes.get(noteWord) || ''"><option v-for="word in noteGroup" :key="word" :value="word">{{ word }}</option></select></label><label class="practice-field" for="synonymNoteText">学习笔记<textarea id="synonymNoteText" v-model="noteText" rows="4" :maxlength="Math.max(400, (app.notes.get(noteWord) || '').length)" placeholder="记下语境、搭配或易混点……"></textarea></label><span class="practice-input-count">{{ noteText.length }} / {{ Math.max(400, (app.notes.get(noteWord) || '').length) }}</span><p v-if="app.storage.state === 'error'" class="practice-error" role="alert">{{ app.storage.message }}</p></div><div class="dialog-footer"><button class="secondary-button" type="button" @click="noteDialog.close()">取消</button><button class="primary-button" type="submit">保存笔记<Icon name="check" :size="16" /></button></div></form></dialog>
  </div>
</template>
