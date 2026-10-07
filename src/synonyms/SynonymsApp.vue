<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import Icon from '../Icon.vue';
import PracticeHeader from '../practice/PracticeHeader.vue';
import BrowserNotice from '../practice/BrowserNotice.vue';
import VoiceSelect from '../practice/VoiceSelect.vue';
import { hasChinese, parseGroups } from './model.js';
import { MAX_CACHED_FILES, validateFileSize } from './fileCache.js';
import { useSynonyms } from './useSynonyms.js';
import basicDemo from './demo-basic.txt?raw';
import chineseCommaDemo from './demo-chinese-comma.txt?raw';
import phrasesDemo from './demo-phrases.txt?raw';
import chineseLabelsDemo from './demo-chinese-labels.txt?raw';
import '../practice/style.css';

const app = useSynonyms();
const importDialog = ref(null);
const fileDemoDialog = ref(null);
const noteDialog = ref(null);
const synonymList = ref(null);
const fileDemos = [
  { title: '英文逗号分隔', filename: 'demo-basic.txt', content: basicDemo, tip: '同一行的词条归入同一组，换行开始下一组。' },
  { title: '中文逗号分隔', filename: 'demo-chinese-comma.txt', content: chineseCommaDemo, tip: '中文逗号也可以分隔词条，两种逗号可以混用。' },
  { title: '英文词组', filename: 'demo-phrases.txt', content: phrasesDemo, tip: '词组内部的空格保留，不会把一个词组拆成多个单词。' },
  { title: '中英标签混合', filename: 'demo-chinese-labels.txt', content: chineseLabelsDemo, tip: '中文标签与英文词条一起展示，含中文的词条不参与发音。' },
].map((demo) => ({ ...demo, groups: parseGroups(demo.content, demo.filename) }));
const files = ref([]);
const cachedSelection = ref([]);
const selectedCachedFiles = computed(() => app.cachedFiles.slice().reverse().filter((file) => cachedSelection.value.includes(file.name)));
const dragDepth = ref(0);
const importing = ref(false);
const noteGroup = ref([]);
const noteWord = ref('');
const noteText = ref('');
const dialogError = ref('');
const highlighted = (group, word) => app.current?.group === group && app.current?.word === word;
watch(() => app.cachedFiles, (cached) => { cachedSelection.value = cachedSelection.value.filter((name) => cached.some((file) => file.name === name)); });
watch([() => app.prefs.centerCurrent, () => app.current, () => app.playing], async ([enabled, current, playing], [wasEnabled]) => {
  if (!app.ready || !enabled || !current || (!playing && wasEnabled) || document.querySelector('dialog[open]')) return;
  const groupIndex = app.filteredGroups.findIndex((group) => group.index === current.group);
  app.visibleCount = Math.max(app.visibleCount, groupIndex + 1);
  await nextTick();
  if (app.prefs.centerCurrent && !document.querySelector('dialog[open]')) synonymList.value?.querySelector('.current-group')?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
}, { flush: 'post' });
function openImport() { app.pause(); files.value = []; cachedSelection.value = []; dragDepth.value = 0; dialogError.value = ''; importDialog.value.showModal(); }
function openFileDemo() { app.pause(); fileDemoDialog.value.showModal(); }
function toggleCachedFile(name) {
  if (cachedSelection.value.includes(name)) cachedSelection.value = cachedSelection.value.filter((selected) => selected !== name);
  else cachedSelection.value.push(name);
}
function addFiles(incoming) {
  if (importing.value) return;
  const added = Array.from(incoming);
  try { added.forEach(validateFileSize); files.value.push(...added); dialogError.value = ''; }
  catch (error) { dialogError.value = error.message; }
}
function dropFiles(event) { dragDepth.value = 0; addFiles(event.dataTransfer.files); }
const fileSize = (size) => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`;
async function runImport(action) {
  importing.value = true; dialogError.value = '';
  try { if (await action()) importDialog.value.close(); else dialogError.value = app.error || app.storage.message; }
  finally { importing.value = false; }
}
async function deleteCachedFile(name) {
  importing.value = true; dialogError.value = '';
  try { if (!(await app.deleteCachedFile(name))) dialogError.value = app.error || app.storage.message; }
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
          <div class="practice-toolbar"><div class="synonym-source"><Icon name="book" :size="19" /><div><strong>{{ app.source || '选择你的同义词词库' }}</strong><span>{{ app.groups.length }} 组 · {{ app.noteCount }} 条笔记</span></div></div><div class="practice-actions"><button class="secondary-button synonym-center-toggle" :class="{ 'is-active': app.prefs.centerCurrent }" :aria-pressed="app.prefs.centerCurrent" aria-label="播放行居中" title="开启后，当前播放单词所在行自动滚动到屏幕中央" @click="app.toggleCenterCurrent">播放行居中：{{ app.prefs.centerCurrent ? '开' : '关' }}</button><button class="secondary-button" @click="app.loadSample">示例词库</button><button class="secondary-button" @click="openFileDemo">示例文件</button><button class="primary-button" @click="openImport"><Icon name="grid" :size="15" />导入词库</button></div></div>
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
        <section v-if="!app.groups.length" class="content-panel empty-state"><span class="empty-icon"><Icon name="refresh" :size="29" /></span><h3>从一组同义词开始</h3><p>导入 TXT 词库，或先试试示例词库。</p><button class="secondary-button" @click="app.loadSample">加载示例词库<Icon name="right" :size="15" /></button></section>
        <section v-else-if="!app.filteredGroups.length" class="content-panel empty-state"><Icon name="search" :size="28" /><h3>没有匹配的同义词组</h3><p>试试其他英文或中文关键词。</p></section>
        <div v-else ref="synonymList" class="synonym-list" :class="{ 'is-centering': app.prefs.centerCurrent }">
          <article v-for="group in app.filteredGroups.slice(0, app.visibleCount)" :key="group.index" class="content-panel synonym-card" :class="{ 'current-group': app.current?.group === group.index }">
            <div class="synonym-group-number">{{ String(group.index + 1).padStart(2, '0') }}</div>
            <div class="synonym-card-body"><button class="synonym-main-word" :class="{ highlighted: highlighted(group.index, 0) }" :disabled="hasChinese(group.words[0])" :aria-label="`播放 ${group.words[0]}`" @click="app.jump(group.index, 0)">{{ group.words[0] }}<Icon v-if="!hasChinese(group.words[0])" name="volume" :size="18" /></button><div class="synonym-terms"><button v-for="(word, index) in group.words.slice(1)" :key="index" :class="{ highlighted: highlighted(group.index, index + 1) }" :disabled="hasChinese(word)" :aria-label="`播放 ${word}`" @click="app.jump(group.index, index + 1)">{{ word }}<Icon v-if="!hasChinese(word)" name="volume" :size="14" /></button></div>
              <div v-if="app.groupNotes(group.words).length" class="synonym-notes"><div v-for="note in app.groupNotes(group.words)" :key="note.word" class="synonym-note"><button class="synonym-note-content" :aria-label="`编辑 ${note.word} 的笔记`" @click="openNote(group.words, note.word)"><strong>{{ note.word }}</strong><span>{{ note.text }}</span></button><button class="icon-button" :aria-label="`移除 ${note.word} 的笔记`" @click="removeNote(note.word)"><Icon name="close" :size="13" /></button></div></div>
            </div>
          </article>
          <button v-if="app.filteredGroups.length > app.visibleCount" class="load-more" @click="app.visibleCount += 40">显示更多同义词组</button>
        </div>
      </template>
      <footer class="page-footer"><span>IELTS Studio<span class="footer-divider">/</span>换个表达，记住同一个意思。</span><span class="keyboard-hints"><kbd>←</kbd><kbd>→</kbd>切换<span>·</span><kbd>Space</kbd>播放／暂停</span></footer>
      <BrowserNotice />
    </main>
    <dialog ref="importDialog" class="settings-dialog practice-dialog" aria-labelledby="synonymImportTitle">
      <div class="dialog-heading"><div><div class="eyebrow">YOUR SYNONYM COLLECTION</div><h2 id="synonymImportTitle">导入同义词词库</h2></div><button class="icon-button" aria-label="关闭导入窗口" :disabled="importing" @click="importDialog.close()"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <p class="practice-dialog-copy">TXT 每行一组，用英文或中文逗号分隔。多文件按选择顺序合并，导入后替换当前词库。</p>
        <pre class="practice-file-example">reserve, book, prebook&#10;in advance, ahead, beforehand</pre>
        <div class="practice-file-upload">
          <label class="practice-file-drop" :class="{ 'is-dragging': dragDepth > 0 && !importing, 'is-disabled': importing }" for="synonymFiles" @dragenter.prevent="!importing && dragDepth++" @dragover.prevent @dragleave.prevent="dragDepth = Math.max(0, dragDepth - 1)" @drop.prevent="dropFiles">
            <span class="practice-file-drop-icon"><Icon name="upload" :size="25" /></span>
            <strong>{{ dragDepth > 0 && !importing ? '松开即可添加文件' : '拖拽词库文件到这里' }}</strong>
            <span id="synonymFileHint" class="practice-file-hint">TXT · 单个最大 2 MB</span>
            <span class="secondary-button practice-file-button">{{ files.length ? '继续添加文件' : '选择文件' }}<Icon name="right" :size="15" /></span>
            <input id="synonymFiles" class="sr-only" type="file" accept=".txt,.json" multiple aria-label="选择 TXT 词库文件" aria-describedby="synonymFileHint synonymFilePrivacy" :disabled="importing" @change="addFiles($event.target.files); $event.target.value = ''" />
          </label>
          <p id="synonymFilePrivacy" class="practice-file-privacy">导入后仅保存在当前浏览器</p>
        </div>
        <div v-if="files.length" class="practice-file-selection">
          <div class="practice-file-list-heading"><strong>待导入文件</strong><span aria-live="polite">{{ files.length }} 个</span></div>
          <ol class="practice-file-list">
            <li v-for="(file, index) in files" :key="index"><span class="practice-file-index">{{ index + 1 }}</span><span class="practice-file-name">{{ file.name }}</span><button class="icon-button" :disabled="importing" :aria-label="`移除待导入文件 ${file.name}`" @click="files.splice(index, 1)"><Icon name="close" :size="15" /></button></li>
          </ol>
        </div>
        <p v-if="dialogError" class="practice-error" role="alert">{{ dialogError }}</p>
        <button v-if="app.pendingFiles && app.storage.state === 'error'" class="text-button practice-cache-retry" :disabled="importing" @click="runImport(app.retrySave)">缓存更改尚未保存，重试保存<Icon name="refresh" :size="15" /></button>
        <section v-if="app.cachedFiles.length" class="practice-file-selection practice-file-cache" aria-label="已缓存文件">
          <div class="practice-file-list-heading"><strong>已缓存文件</strong><span aria-live="polite"><template v-if="selectedCachedFiles.length">已选 {{ selectedCachedFiles.length }} · </template>{{ app.cachedFiles.length }}／{{ MAX_CACHED_FILES }}</span></div>
          <p class="practice-cache-copy">可多选，按列表顺序合并。超过 {{ MAX_CACHED_FILES }} 个时移除最早导入的文件。</p>
          <ul class="practice-file-list practice-cached-list">
            <li v-for="file in app.cachedFiles.slice().reverse()" :key="file.slot" :class="{ 'is-selected': cachedSelection.includes(file.name) }">
              <div class="practice-cached-info"><strong>{{ file.name }}</strong><span>{{ fileSize(file.size) }} · {{ file.groupCount }} 组</span></div>
              <button class="secondary-button practice-cache-select" :class="{ 'is-selected': cachedSelection.includes(file.name) }" :disabled="importing" :aria-pressed="cachedSelection.includes(file.name)" :aria-label="`${cachedSelection.includes(file.name) ? '取消选择' : '选择'}缓存文件 ${file.name}`" @click="toggleCachedFile(file.name)"><Icon v-if="cachedSelection.includes(file.name)" name="check" :size="14" />{{ cachedSelection.includes(file.name) ? '已选' : '选择' }}</button>
              <button class="icon-button practice-cache-delete" :disabled="importing" :aria-label="`删除缓存文件 ${file.name}`" title="删除缓存，当前已加载词库保留" @click="deleteCachedFile(file.name)"><Icon name="trash" :size="16" /></button>
            </li>
          </ul>
        </section>
      </div>
      <div class="dialog-footer"><button class="secondary-button" :disabled="importing" @click="importDialog.close()">取消</button><button class="primary-button" :disabled="(!files.length && !selectedCachedFiles.length) || importing" @click="runImport(() => app.importFiles(files, selectedCachedFiles.map((file) => file.name)))">{{ importing ? '正在处理' : selectedCachedFiles.length ? `选择词库（${files.length + selectedCachedFiles.length}）` : '导入词库' }}</button></div>
    </dialog>
    <dialog ref="fileDemoDialog" class="settings-dialog practice-dialog synonym-file-demo-dialog" aria-labelledby="synonymFileDemoTitle">
      <div class="dialog-heading"><div><div class="eyebrow">SYNONYM FILE EXAMPLES</div><h2 id="synonymFileDemoTitle">词库文件格式与示例</h2></div><button class="icon-button" aria-label="关闭文件示例窗口" @click="fileDemoDialog.close()"><Icon name="close" /></button></div>
      <div class="dialog-body">
        <p class="practice-dialog-copy">在文本编辑器中填写词表：每行一组同义词，组内用英文逗号或中文逗号分隔。无需添加标题或序号，词组中的空格保留，空行会忽略。</p>
        <p class="practice-dialog-copy">将内容保存为 UTF-8 编码的 .txt 纯文本文件，再点击「导入词库」，选择或拖入文件并确认导入。可同时选择多个文件，按选择顺序合并并替换当前词库。单个文件最大 2 MB，单个词条最多 200 个字符。</p>
        <section v-for="(demo, index) in fileDemos" :key="demo.filename" class="practice-file-selection synonym-demo-example">
          <h3>示例 {{ index + 1 }}：{{ demo.title }}</h3>
          <p class="practice-dialog-copy">{{ demo.tip }}</p>
          <div class="synonym-demo-comparison">
            <div class="practice-file-selection"><strong class="synonym-demo-label">上传的文件内容</strong><span class="synonym-demo-filename">{{ demo.filename }}</span><pre class="practice-file-example">{{ demo.content.trimEnd() }}</pre></div>
            <div class="practice-file-selection"><strong class="synonym-demo-label">解析后的分组</strong><span class="synonym-demo-filename">每行对应一组，按文件中的顺序展示。</span><ol class="synonym-demo-groups"><li v-for="(words, groupIndex) in demo.groups" :key="groupIndex"><span class="synonym-demo-group-number">第 {{ groupIndex + 1 }} 组</span><div class="synonym-demo-terms"><span v-for="(word, wordIndex) in words" :key="wordIndex" :class="{ 'is-label': hasChinese(word) }">{{ word }}<small v-if="hasChinese(word)">仅展示</small></span></div></li></ol></div>
          </div>
        </section>
      </div>
      <div class="dialog-footer"><button class="primary-button" @click="fileDemoDialog.close()">知道了</button></div>
    </dialog>
    <dialog ref="noteDialog" class="settings-dialog practice-dialog" aria-labelledby="synonymNoteTitle"><div class="dialog-heading"><div><div class="eyebrow">A NOTE TO REMEMBER</div><h2 id="synonymNoteTitle">同义词笔记</h2></div><button class="icon-button" aria-label="关闭笔记窗口" @click="noteDialog.close()"><Icon name="close" /></button></div><form @submit.prevent="saveNote"><div class="dialog-body"><label class="practice-field" for="synonymNoteWord">关联词条<select id="synonymNoteWord" v-model="noteWord" @change="noteText = app.notes.get(noteWord) || ''"><option v-for="word in noteGroup" :key="word" :value="word">{{ word }}</option></select></label><label class="practice-field" for="synonymNoteText">学习笔记<textarea id="synonymNoteText" v-model="noteText" rows="4" :maxlength="Math.max(400, (app.notes.get(noteWord) || '').length)" placeholder="记下语境、搭配或易混点……"></textarea></label><span class="practice-input-count">{{ noteText.length }} / {{ Math.max(400, (app.notes.get(noteWord) || '').length) }}</span><p v-if="app.storage.state === 'error'" class="practice-error" role="alert">{{ app.storage.message }}</p></div><div class="dialog-footer"><button class="secondary-button" type="button" @click="noteDialog.close()">取消</button><button class="primary-button" type="submit">保存笔记<Icon name="check" :size="16" /></button></div></form></dialog>
  </div>
</template>
