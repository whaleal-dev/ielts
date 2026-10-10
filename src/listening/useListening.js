import { computed, onMounted, onUnmounted, reactive } from 'vue';
import { library } from './library.js';
import { AudioPlayer } from './player.js';
import { createListeningStore, readLegacy } from './storage.js';
import { addScore, count, defaultPrefs, emptyRecord, formatWords, hydrateLegacy, isFullGroup, localDay, normalize, parseWords, recordAnswer, resolveInput, sanitizePrefs, sanitizeRecord } from './model.js';

const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const emptySession = (mode = 'dictation') => ({ items: [], index: 0, loop: 1, loops: 1, mode, options: {}, full: false, groupId: '', answers: new Map(), skipped: 0 });

export function useListening() {
  const app = reactive({
    ready: false, prefs: defaultPrefs(library.groups[0].id), customText: '', records: new Map(), scores: new Map(),
    status: 'idle', speaking: false, paused: false, audioEnded: false, audioError: '', answer: '', feedback: null, notice: '', inputNotice: '',
    session: emptySession(),
    mistakeGroups: [], mistakeSearch: '', mistakeFilter: 'all', selected: new Set(), visibleCount: 40,
    storage: { state: 'loading', message: '', mode: 'IndexedDB', revision: 0 },
  });
  const store = createListeningStore({ onStatus: (status) => Object.assign(app.storage, status, { revision: app.storage.revision + 1 }) });
  const player = new AudioPlayer({ onState: (speaking) => { app.speaking = speaking; } });
  let timer = null;
  let task = null;
  let deadline = 0;
  let remaining = 0;
  let generation = 0;
  let playerTag = '';
  let noticeTimer;

  app.group = computed(() => library.groups.find((group) => group.id === app.prefs.groupId));
  app.active = computed(() => app.status === 'running');
  app.current = computed(() => app.session.items[app.session.index] || null);
  app.currentRecord = computed(() => app.records.get(app.current?.key) || emptyRecord());
  app.answered = computed(() => app.session.answers.has(app.session.index));
  app.correctCount = computed(() => [...app.session.answers.values()].filter((result) => result.correct).length);
  app.wrongItems = computed(() => [...app.session.answers.entries()].filter(([, result]) => !result.correct && !result.skipped).map(([index]) => app.session.items[index]));
  app.mistakes = computed(() => library.words.filter((word) => app.records.get(word.key)?.errorLevel > 0));
  app.filteredMistakes = computed(() => {
    const query = normalize(app.mistakeSearch);
    const list = app.mistakes.filter((word) => {
      const record = app.records.get(word.key);
      if (app.mistakeGroups.length && !app.mistakeGroups.includes(word.groupId)) return false;
      if (query && !word.word.includes(query)) return false;
      if (app.mistakeFilter === 'low' && (!record.practiceCount || record.correctCount / record.practiceCount >= 0.6)) return false;
      if (app.mistakeFilter === 'high' && record.wrongCount < 3) return false;
      if (app.mistakeFilter === 'recent' && record.lastWrongAt < Date.now() - 7 * 86400000) return false;
      return true;
    });
    return list.sort((a, b) => {
      const left = app.records.get(a.key); const right = app.records.get(b.key);
      if (app.prefs.sort === 'recent') return right.lastWrongAt - left.lastWrongAt;
      if (app.prefs.sort === 'wrongCount') return right.wrongCount - left.wrongCount;
      if (app.prefs.sort === 'errorRate') return (left.practiceCount ? left.correctCount / left.practiceCount : 1) - (right.practiceCount ? right.correctCount / right.practiceCount : 1);
      return right.errorLevel - left.errorLevel || right.lastWrongAt - left.lastWrongAt;
    });
  });
  app.selectedCount = computed(() => app.filteredMistakes.filter((word) => app.selected.has(word.key)).length);
  app.scoreRows = computed(() => [...app.scores].filter(([key]) => key.startsWith(`${app.prefs.statsGroup}:`)).map(([key, value]) => ({ day: key.split(':').at(-1), ...value })).sort((a, b) => a.day.localeCompare(b.day)));
  app.scoreSummary = computed(() => app.scoreRows.reduce((total, row) => ({ sessions: total.sessions + row.sessions, correct: total.correct + row.correct, total: total.total + row.total, best: Math.max(total.best, row.best) }), { sessions: 0, correct: 0, total: 0, best: 0 }));
  app.storageSizes = computed(() => { void app.storage.revision; return store.sizes(); });
  app.notify = (message) => { clearTimeout(noticeTimer); app.notice = message; noticeTimer = setTimeout(() => { app.notice = ''; }, 4500); };
  const persist = (entries) => {
    if (!store.loaded) return Promise.resolve(false);
    try { return store.setMany(entries); }
    catch (error) { app.storage.state = 'error'; app.storage.message = error.message; return Promise.resolve(false); }
  };
  app.savePrefs = () => {
    app.prefs = sanitizePrefs(app.prefs, library.groups);
    return persist([['prefs', { ...app.prefs }]]);
  };
  app.saveCustom = () => {
    const chunks = [];
    for (let index = 0; index < app.customText.length; index += 1024) chunks.push(app.customText.slice(index, index + 1024));
    return persist([['customParts', chunks.length], ...chunks.map((text, index) => [`custom:${index}`, text])]);
  };
  app.retrySave = async () => {
    if (app.storage.loadFailed) return restore();
    return store.pending.size ? store.flush() : app.savePrefs();
  };
  const clearTimer = () => { clearTimeout(timer); timer = null; task = null; remaining = 0; };
  const queue = (callback, milliseconds) => {
    clearTimer(); task = callback; remaining = milliseconds;
    if (app.paused) return;
    const currentGeneration = generation;
    deadline = Date.now() + milliseconds;
    timer = setTimeout(() => {
      if (currentGeneration !== generation || !app.active || app.paused) return;
      clearTimer(); callback();
    }, milliseconds);
  };
  const queueAfterAudio = () => {
    const interval = app.session.options.interval * 1000;
    if (!interval || !app.active || app.audioError) return;
    if (app.session.mode === 'listen' || app.answered) queue(app.next, interval);
    else queue(() => { resolveAnswer(app.answer || '未作答', false, true); app.next(); }, interval);
  };
  app.replay = () => {
    if (!app.active || !app.current) return;
    clearTimer(); app.paused = false; app.audioError = ''; app.audioEnded = false;
    playerTag = `session:${app.current.key}`;
    const currentGeneration = ++generation;
    const options = app.session.options;
    player.play(app.current.audio, { rate: /\s/.test(app.current.word) ? options.phraseRate : options.rate, repeat: app.session.mode === 'listen' ? options.repeat : 1,
      onEnd: () => { if (generation !== currentGeneration) return; app.audioEnded = true; queueAfterAudio(); },
      onError: (error) => { if (generation !== currentGeneration) return; clearTimer(); app.audioError = error.message; app.audioEnded = true; },
    });
  };
  app.togglePause = () => {
    if (!app.active) return;
    if (!app.paused) {
      if (timer) { remaining = Math.max(0, deadline - Date.now()); clearTimeout(timer); timer = null; }
      app.paused = true; player.pause();
    } else {
      app.paused = false;
      if (playerTag === 'preview' && app.audioEnded) player.stop();
      if (task) { const callback = task; queue(callback, remaining); }
      if (!app.audioEnded) {
        if (playerTag === `session:${app.current.key}`) player.resume();
        else app.replay();
      }
    }
  };
  app.showView = (view) => {
    if (app.active && !app.paused && view !== 'practice') app.togglePause();
    if (!app.active) player.stop();
    app.prefs.view = view; app.visibleCount = 40; app.savePrefs();
  };
  app.selectGroup = () => { app.end(); app.customText = app.group ? formatWords(app.group.items.map((word) => word.word)) : ''; app.inputNotice = ''; app.feedback = null; app.savePrefs(); app.saveCustom(); };
  app.setMode = (mode) => { app.prefs.mode = mode; if (app.status === 'idle') app.session = emptySession(mode); app.savePrefs(); };
  app.end = () => { generation += 1; clearTimer(); player.stop(); app.status = 'idle'; app.session = emptySession(app.prefs.mode); app.paused = false; app.audioError = ''; };

  const launch = (items, full = false, groupId = '') => {
    app.end();
    const options = sanitizePrefs(app.prefs, library.groups);
    app.session = { items: options.order === 'random' && options.mode === 'listen' ? shuffle(items) : [...items], index: 0, loop: 1, loops: options.mode === 'listen' ? options.loops : 1, mode: options.mode, options, full, groupId, answers: new Map(), skipped: 0 };
    app.prefs.view = 'practice'; app.status = 'running'; app.feedback = null; app.answer = ''; app.savePrefs(); app.replay();
  };
  app.start = () => {
    const resolved = resolveInput(library, app.customText, app.prefs.groupId);
    const messages = [];
    if (resolved.missing.length) messages.push(`词库中不存在，已移除：${resolved.missing.slice(0, 12).join('、')}${resolved.missing.length > 12 ? '……' : ''}`);
    if (resolved.mismatch.length) messages.push(`不属于所选分组，已移除：${resolved.mismatch.slice(0, 12).join('、')}`);
    if (resolved.unavailable.length) messages.push(`缺少本地音频，已跳过：${resolved.unavailable.join('、')}。本轮不计完整章节成绩`);
    app.inputNotice = messages.join('；');
    if (!resolved.items.length) { app.inputNotice = app.inputNotice || '请先选择分组，或输入语料，用分号、逗号或换行分隔。'; return; }
    if (resolved.missing.length || resolved.mismatch.length) app.customText = formatWords(resolved.items.map((word) => word.word));
    app.savePrefs(); app.saveCustom();
    launch(resolved.items, isFullGroup(resolved.items, app.group), app.group?.id || '');
  };
  const finish = () => {
    generation += 1; clearTimer(); player.stop(); app.status = 'finished'; app.paused = false;
    if (app.session.mode !== 'dictation' || !app.session.full || app.session.skipped || app.session.answers.size !== app.session.items.length) return;
    const key = `${app.session.groupId}:${localDay()}`;
    const score = addScore(app.scores.get(key), app.correctCount, app.session.items.length);
    app.scores.set(key, score); app.prefs.statsGroup = app.session.groupId;
    persist([[`chapter:${key}`, score], ['prefs', { ...app.prefs }]]);
  };
  app.next = () => {
    if (!app.active || (app.session.mode === 'dictation' && !app.answered)) return;
    clearTimer(); player.stop(); app.paused = false;
    if (app.session.index + 1 >= app.session.items.length) {
      if (app.session.loop < app.session.loops) {
        app.session.loop += 1; app.session.index = 0;
        if (app.session.options.order === 'random') app.session.items = shuffle(app.session.items);
      } else { finish(); return; }
    } else app.session.index += 1;
    app.answer = ''; app.feedback = null; app.replay();
  };
  app.previous = () => { if (app.active && app.session.mode === 'listen' && app.session.index > 0) { app.session.index -= 1; app.answer = ''; app.feedback = null; app.replay(); } };
  app.skipAudio = () => {
    if (!app.active || !app.audioError) return;
    app.session.full = false; app.session.skipped += 1;
    if (app.session.mode === 'dictation') app.session.answers.set(app.session.index, { correct: false, skipped: true });
    app.next();
  };
  function resolveAnswer(answer, correct, timedOut = false) {
    if (!app.active || app.session.mode !== 'dictation' || app.answered || app.paused || app.audioError) return;
    const word = app.current;
    const record = recordAnswer(app.records.get(word.key), answer, correct);
    app.records.set(word.key, record);
    app.session.answers.set(app.session.index, { correct, answer });
    app.feedback = { word: word.word, correct, answer, timedOut };
    persist([[`word:${word.key}`, record]]);
    if (correct) { clearTimer(); player.stop(); app.audioEnded = true; queue(app.next, 350); }
    else if (app.audioEnded && !timedOut) queueAfterAudio();
  }
  app.submit = () => {
    if (!normalize(app.answer)) { app.notify('先输入你听到的单词。'); return; }
    resolveAnswer(app.answer, normalize(app.answer) === app.current?.word);
  };
  app.reveal = () => resolveAnswer(app.answer || '已查看答案', false);
  app.toggleWords = () => { app.prefs.showWords = !app.prefs.showWords; app.savePrefs(); };
  app.toggleCurrentWord = () => { app.prefs.showCurrentWord = !app.prefs.showCurrentWord; app.savePrefs(); };
  app.toggleProgress = () => { app.prefs.progressExpanded = !app.prefs.progressExpanded; app.savePrefs(); };
  app.preview = (word) => {
    if (app.active && !app.paused) app.togglePause();
    if (!word.audio) { app.notify('这条语料暂缺本地音频。'); return; }
    playerTag = 'preview';
    player.play(word.audio, { rate: /\s/.test(word.word) ? app.prefs.phraseRate : app.prefs.rate, onError: (error) => app.notify(error.message) });
  };
  app.changeLevel = (word, delta) => {
    const record = sanitizeRecord(app.records.get(word.key));
    record.errorLevel = Math.max(0, Math.min(10, record.errorLevel + delta));
    if (delta > 0) record.lastWrongAt = Date.now();
    app.records.set(word.key, record);
    persist([[`word:${word.key}`, record]]);
  };
  app.removeMistake = (word) => app.changeLevel(word, -10);
  app.toggleSelected = (key) => { if (app.selected.has(key)) app.selected.delete(key); else app.selected.add(key); };
  app.selectAll = (invert = false) => { for (const word of app.filteredMistakes) { if (invert && app.selected.has(word.key)) app.selected.delete(word.key); else app.selected.add(word.key); } };
  app.startMistakes = () => {
    const chosen = app.selectedCount ? app.filteredMistakes.filter((word) => app.selected.has(word.key)) : app.filteredMistakes;
    const items = chosen.filter((word) => word.audio);
    if (!items.length) { app.notify('当前没有可播放的错词。'); return; }
    app.inputNotice = chosen.length === items.length ? '错词复练不计入完整章节成绩。' : '已跳过缺少音频的错词，本轮不计完整章节成绩。';
    app.prefs.mode = 'dictation'; launch(items);
  };
  app.restartWrong = () => {
    const items = app.wrongItems;
    if (!items.length) return;
    app.inputNotice = '本轮错词复练不计入完整章节成绩。'; app.prefs.mode = 'dictation'; launch(items);
  };

  const onKeyboard = (event) => {
    if (!app.active || app.prefs.view !== 'practice' || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
    if (event.defaultPrevented || event.target.closest('input, textarea, select, button, a, [contenteditable], [role="combobox"], [role="listbox"], [role="option"]')) return;
    if (event.code === 'Space') { event.preventDefault(); app.togglePause(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); app.replay(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); app.next(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); app.previous(); }
  };
  const onBeforeUnload = (event) => { if (store.pending.size) { event.preventDefault(); event.returnValue = ''; } };
  async function restore() {
    app.end(); store.loaded = false;
    Object.assign(app.storage, { state: 'loading', loadFailed: true, message: '' });
    try {
      await store.open();
      const legacy = await readLegacy(store), legacyBytes = store.legacyBytes;
      const { entries } = await store.load();
      const old = hydrateLegacy(legacy, library);
      store.legacyBytes = legacyBytes;
      app.records = old.records; app.scores = old.scores; app.prefs = old.prefs; app.customText = old.customText;
      for (const [key, value] of entries) {
        if (key === 'prefs') app.prefs = sanitizePrefs(value, library.groups);
        if (key.startsWith('word:') && library.byKey.has(key.slice(5))) app.records.set(key.slice(5), sanitizeRecord(value));
        if (key.startsWith('chapter:') && /^\d+:\d{4}-\d{2}-\d{2}$/.test(key.slice(8)) && value && typeof value === 'object') {
          app.scores.set(key.slice(8), { sessions: count(value.sessions), correct: Math.min(count(value.correct), count(value.total)), total: count(value.total), best: Math.max(0, Math.min(100, Number(value.best) || 0)), lastAccuracy: Math.max(0, Math.min(100, Number(value.lastAccuracy) || 0)), lastAt: count(value.lastAt) });
        }
      }
      if (entries.has('customParts')) app.customText = Array.from({ length: Math.min(1000, count(entries.get('customParts'))) }, (_, index) => typeof entries.get(`custom:${index}`) === 'string' ? entries.get(`custom:${index}`) : '').join('');
      else if (!app.customText && app.group) app.customText = formatWords(app.group.items.map((word) => word.word));
      if (app.group) app.customText = formatWords(parseWords(app.customText, library, app.prefs.groupId));
      app.storage.revision += 1;
      app.session = emptySession(app.prefs.mode);
      return true;
    } catch {
      store.loaded = false;
      Object.assign(app.storage, { state: 'error', loadFailed: true, message: '无法读取浏览器存储。请允许本站使用存储后重试读取；当前练习不会保存。' });
      return false;
    }
  }
  onMounted(async () => {
    await restore();
    app.ready = true;
    window.addEventListener('keydown', onKeyboard); window.addEventListener('beforeunload', onBeforeUnload);
  });
  onUnmounted(() => { app.end(); clearTimeout(noticeTimer); window.removeEventListener('keydown', onKeyboard); window.removeEventListener('beforeunload', onBeforeUnload); store.db?.close(); });
  return app;
}
