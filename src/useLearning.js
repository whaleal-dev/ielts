import { reactive, computed, onMounted, onUnmounted } from 'vue';
import { chapters, groups, words, wordByKey, wordIndex, sources, normalizeTerm } from './library.js';
import { RecordStore, wordRecords } from './storage.js';
import { dayKey, emptyDay, markStudied } from './progress.js';

const intervals = [12, 24, 72, 168, 360];
const number = (value) => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value) || 0)));
const defaultRecord = () => ({ count: 0, mastered: false, masteredAt: '', difficult: false, stage: 0, nextReviewAt: '', failures: 0, note: '' });
const shuffled = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export function useLearning() {
  const app = reactive({
    ready: false, records: new Map(), days: {}, positions: {},
    prefs: { source: 'all', chapter: 1, group: groups[0].id, view: 'study', mode: 'word', rate: 1, repeat: 1, interval: 2, showMeaning: true },
    session: { items: groups[0].words, index: 0, key: groups[0].id, label: '自然地理 · 第一组', kind: 'group' },
    round: { options: [], selected: '', answered: false, correct: false },
    spelling: '', playing: false, speaking: false, search: '', visibleCount: 40,
    difficultFilter: 'all', notice: '', now: Date.now(),
    storage: { state: 'loading', message: '', mode: 'IndexedDB', revision: 0 },
  });
  const store = new RecordStore({ onStatus: (status) => Object.assign(app.storage, status, { revision: app.storage.revision + 1 }) });
  let token = 0;
  let audio = null;
  let resolveAudio = null;
  let noticeTimer;
  let clockTimer;
  let exposed = '';

  app.getRecord = (key) => {
    if (!app.records.has(key)) app.records.set(key, defaultRecord());
    return app.records.get(key);
  };
  app.current = computed(() => app.session.items[app.session.index] || null);
  app.currentRecord = computed(() => app.current ? app.getRecord(app.current.key) : defaultRecord());
  app.chapter = computed(() => chapters.find((chapter) => chapter.number === app.prefs.chapter) || chapters[0]);
  app.today = computed(() => app.days[dayKey(app.now)] || emptyDay());
  app.difficultWords = computed(() => words.filter((word) => app.records.get(word.key)?.difficult));
  app.dueWords = computed(() => app.difficultWords.filter((word) => !app.records.get(word.key).nextReviewAt || new Date(app.records.get(word.key).nextReviewAt).getTime() <= app.now));
  app.stats = computed(() => {
    const records = words.map((word) => app.records.get(word.key));
    return {
      studied: records.filter((record) => record?.count > 0).length,
      mastered: records.filter((record) => record?.mastered).length,
      difficult: records.filter((record) => record?.difficult).length,
    };
  });
  app.groupMastered = computed(() => app.session.items.filter((word) => app.records.get(word.key)?.mastered).length);
  app.searchResults = computed(() => {
    const query = normalizeTerm(app.search);
    return query ? words.filter((word) => normalizeTerm(`${word.word} ${word.meaning} ${word.phonetic}`).includes(query)) : [];
  });
  app.filteredDifficult = computed(() => {
    const list = app.difficultFilter === 'due' ? app.dueWords : app.difficultWords;
    const query = normalizeTerm(app.search);
    return query ? list.filter((word) => normalizeTerm(`${word.word} ${word.meaning}`).includes(query)) : list;
  });
  app.lastDays = (count) => Array.from({ length: count }, (_, index) => {
    const date = new Date(app.now);
    date.setDate(date.getDate() - count + 1 + index);
    const key = dayKey(date);
    return { key, label: `${date.getMonth() + 1}/${date.getDate()}`, ...emptyDay(), ...app.days[key] };
  });
  app.streak = computed(() => {
    const date = new Date(app.now);
    if (!app.days[dayKey(date)]?.studied) date.setDate(date.getDate() - 1);
    let result = 0;
    while (app.days[dayKey(date)]?.studied) { result += 1; date.setDate(date.getDate() - 1); }
    return result;
  });
  app.storageSizes = computed(() => { void app.storage.revision; return store.sizes(); });
  app.notify = (text) => {
    app.notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { app.notice = ''; }, 4000);
  };
  const persist = (entries) => {
    try { return store.setMany(entries); }
    catch (error) { app.storage.state = 'error'; app.storage.message = error.message; return Promise.resolve(false); }
  };
  app.savePrefs = () => persist([['prefs', { ...app.prefs }]]);
  app.retrySave = () => store.pending.size ? store.flush() : app.savePrefs();
  const today = () => {
    app.now = Date.now();
    const key = dayKey(app.now);
    if (!app.days[key]) app.days[key] = emptyDay();
    return app.days[key];
  };
  const saveWord = (word) => {
    const day = today();
    return persist([
      ...wordRecords(word.key, app.getRecord(word.key)),
      [`day:${dayKey(app.now)}`, { ...day }],
    ]);
  };
  const expose = () => {
    const word = app.current;
    if (!word || exposed === word.key) return;
    const record = app.getRecord(word.key);
    record.count += 1;
    record.lastStudiedAt = new Date().toISOString();
    const day = today();
    day.events += 1;
    markStudied(day, wordIndex.get(word.key), words.length);
    exposed = word.key;
    saveWord(word);
  };
  app.stop = () => {
    token += 1;
    app.playing = false;
    app.speaking = false;
    if (audio) { audio.pause(); audio = null; }
    if (resolveAudio) { resolveAudio(); resolveAudio = null; }
  };
  const resetRound = () => {
    app.spelling = '';
    const meaning = app.current?.meaning;
    const alternatives = shuffled([...new Set(words.map((word) => word.meaning))].filter((text) => text && text !== meaning)).slice(0, 3);
    app.round = { options: shuffled([meaning, ...alternatives]), selected: '', answered: false, correct: false };
  };
  const savePosition = () => {
    app.positions[app.session.key] = app.session.index;
    persist([[`position:${app.session.key}`, app.session.index], ['prefs', { ...app.prefs }]]);
  };
  app.startSession = (items, label, key, kind = 'custom', index = 0, countExposure = true) => {
    app.stop();
    if (!items.length) { app.notify('当前没有可练习的单词。'); return; }
    app.session = { items, label, key, kind, index: Math.max(0, Math.min(index, items.length - 1)) };
    app.prefs.view = 'study';
    app.search = '';
    exposed = '';
    resetRound();
    if (countExposure) { expose(); savePosition(); }
  };
  app.selectGroup = (id, countExposure = true) => {
    const group = groups.find((entry) => entry.id === id) || groups[0];
    app.prefs.group = group.id;
    app.prefs.chapter = group.chapter;
    app.prefs.source = 'all';
    app.startSession(group.words, `${app.chapter.title} · ${group.title}`, group.id, 'group', app.positions[group.id] || 0, countExposure);
  };
  app.selectSource = () => {
    if (app.prefs.source === 'all') { app.selectGroup(app.prefs.group); return; }
    const source = sources.find((entry) => entry.id === app.prefs.source);
    if (source) app.startSession(source.words, source.title, `source:${source.id}`, 'source', app.positions[`source:${source.id}`] || 0);
  };
  app.selectChapter = () => app.selectGroup(app.chapter.groups[0].id);
  app.showView = (view) => {
    if (view !== 'study') app.stop();
    app.prefs.view = view;
    app.search = '';
    app.visibleCount = 40;
    app.savePrefs();
  };
  app.setMode = (mode) => {
    app.stop();
    app.prefs.mode = mode;
    resetRound();
    app.savePrefs();
  };
  app.move = (step, keepPlaying = false) => {
    const next = app.session.index + step;
    if (next < 0 || next >= app.session.items.length) {
      if (next >= app.session.items.length) { app.stop(); app.notify('本轮学习已完成。可以切换下一组继续学习。'); }
      return;
    }
    if (!keepPlaying) app.stop();
    expose();
    app.session.index = next;
    exposed = '';
    expose();
    resetRound();
    savePosition();
  };
  app.jumpTo = (index) => {
    app.stop();
    app.session.index = index;
    exposed = '';
    expose(); resetRound(); savePosition();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  app.startSearch = () => app.startSession(app.searchResults, '搜索结果', 'search');
  app.startDifficult = (due = false) => app.startSession(due ? app.dueWords : app.filteredDifficult, due ? '到期复习' : '难词复习', 'difficult', 'difficult');
  app.openWord = (word) => {
    const group = groups.find((entry) => entry.id === word.groupId);
    app.prefs.source = 'all'; app.prefs.group = group.id; app.prefs.chapter = group.chapter;
    app.startSession(group.words, `${word.chapterTitle} · ${word.groupTitle}`, group.id, 'group', word.wordIndex);
  };
  app.toggleDifficult = (word = app.current) => {
    if (!word) return;
    const record = app.getRecord(word.key);
    record.difficult = !record.difficult;
    if (record.difficult) { record.stage = 0; record.nextReviewAt = new Date().toISOString(); }
    saveWord(word);
  };
  const review = (record, correct) => {
    if (!record.difficult) return;
    record.stage = correct ? Math.min(record.stage + 1, intervals.length) : 0;
    record.failures += correct ? 0 : 1;
    record.nextReviewAt = new Date(Date.now() + (correct ? intervals[Math.max(0, record.stage - 1)] * 3600000 : 0)).toISOString();
    today().reviewed += 1;
  };
  app.toggleMastered = () => {
    if (!app.current) return;
    expose();
    const record = app.currentRecord;
    const day = today();
    if (record.mastered && dayKey(record.masteredAt) === dayKey(app.now)) day.mastered = Math.max(0, day.mastered - 1);
    record.mastered = !record.mastered;
    record.masteredAt = record.mastered ? new Date().toISOString() : '';
    if (record.mastered) { day.mastered += 1; review(record, true); }
    saveWord(app.current);
  };
  app.saveNote = (note) => {
    if (!app.current) return;
    app.currentRecord.note = note;
    saveWord(app.current);
  };
  app.answer = (answer) => {
    if (app.round.answered || !app.current) return;
    if (app.prefs.mode === 'spell' && !normalizeTerm(answer)) { app.notify('先输入你听到的单词。'); return; }
    expose();
    const correct = app.prefs.mode === 'quiz' ? answer === app.current.meaning : normalizeTerm(answer) === normalizeTerm(app.current.word);
    app.round.selected = answer; app.round.answered = true; app.round.correct = correct;
    const record = app.currentRecord;
    const wasDifficult = record.difficult;
    if (!correct) { record.difficult = true; record.nextReviewAt = new Date().toISOString(); }
    if (wasDifficult) review(record, correct);
    saveWord(app.current);
  };
  const play = (word, currentToken) => new Promise((resolve, reject) => {
    audio = new Audio(word.audio);
    audio.playbackRate = app.prefs.rate;
    resolveAudio = resolve;
    audio.onended = resolve;
    audio.onerror = () => reject(new Error('Audio unavailable'));
    audio.play().catch(reject);
    if (currentToken !== token) resolve();
  });
  const playCurrent = async (currentToken) => {
    app.speaking = true;
    try {
      for (let i = 0; i < app.prefs.repeat && currentToken === token; i += 1) await play(app.current, currentToken);
    } finally {
      if (currentToken === token) { app.speaking = false; audio = null; resolveAudio = null; }
    }
  };
  app.pronounce = async () => {
    app.stop(); expose();
    const currentToken = token;
    try { await playCurrent(currentToken); }
    catch { if (currentToken === token) app.notify('此单词的本地音频暂时无法播放。'); }
  };
  app.toggleAuto = async () => {
    if (app.playing) { app.stop(); return; }
    app.stop(); expose(); app.playing = true;
    const currentToken = token;
    try {
      while (app.playing && currentToken === token) {
        await playCurrent(currentToken);
        if (!app.playing || currentToken !== token) break;
        if (app.session.index === app.session.items.length - 1) { app.stop(); app.notify('本轮自动播放已完成。'); break; }
        await new Promise((resolve) => setTimeout(resolve, app.prefs.interval * 1000));
        if (app.playing && currentToken === token) app.move(1, true);
      }
    } catch {
      if (currentToken === token) { app.stop(); app.notify('音频暂时无法播放，自动播放已暂停。'); }
    }
  };

  function hydrate(legacy, entries) {
    if (legacy && typeof legacy === 'object') {
      const oldKeys = new Set([...Object.keys(legacy.wordStats || {}), ...Object.keys(legacy.difficultWords || {}), ...Object.keys(legacy.wordNotes || {})]);
      oldKeys.forEach((key) => {
        if (!wordByKey.has(key)) return;
        const old = legacy.wordStats?.[key] || {};
        const difficult = legacy.difficultWords?.[key];
        app.records.set(key, { ...defaultRecord(), count: number(old.count), mastered: old.mastered === true, masteredAt: old.masteredAt || '',
          lastStudiedAt: old.lastStudiedAt || '', difficult: Boolean(difficult), stage: Math.min(number(difficult?.reviewStage), intervals.length),
          nextReviewAt: difficult?.nextReviewAt || '', failures: number(difficult?.reviewFailures),
          note: String(legacy.wordNotes?.[key] || difficult?.note || old.note || '') });
      });
      for (const [key, value] of Object.entries(legacy.progressByGroup || {})) app.positions[key] = number(value.currentIndex);
      if (groups.some((group) => group.id === legacy.selectedGroupId)) app.prefs.group = legacy.selectedGroupId;
      app.prefs.view = legacy.activeTab === 'overview' ? 'stats' : legacy.activeTab === 'difficult' ? 'difficult' : 'study';
      app.prefs.rate = Math.max(0.6, Math.min(2, Number(legacy.settings?.playbackRate) || 1));
      app.prefs.repeat = Math.max(1, Math.min(5, number(legacy.settings?.repeatCount) || 1));
      for (const event of (Array.isArray(legacy.studyLog) ? legacy.studyLog : [])) {
        const key = dayKey(event.at);
        if (!key) continue;
        if (!app.days[key]) app.days[key] = emptyDay();
        const day = app.days[key];
        if (event.kind === 'study' && wordIndex.has(event.wordKey)) { markStudied(day, wordIndex.get(event.wordKey), words.length); day.events += 1; }
        if (event.kind === 'mastered') day.mastered += 1;
        if (event.kind === 'review') day.reviewed += 1;
      }
    }
    for (const [key, value] of entries) {
      if (key === 'prefs' && value && typeof value === 'object') {
        for (const field of Object.keys(app.prefs)) if (field in value) app.prefs[field] = value[field];
      }
      if (key.startsWith('position:')) app.positions[key.slice(9)] = number(value);
      if (key.startsWith('day:') && value && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(4))) {
        app.days[key.slice(4)] = { studied: number(value.studied), events: number(value.events), mastered: number(value.mastered), reviewed: number(value.reviewed), seen: typeof value.seen === 'string' ? value.seen : '' };
      }
      if (key.startsWith('word:') && wordByKey.has(key.slice(5)) && value && typeof value === 'object') {
        const wordKey = key.slice(5);
        const parts = Math.min(number(value.noteParts), 20000);
        app.records.set(wordKey, { ...defaultRecord(), count: number(value.count), mastered: value.mastered === true,
          masteredAt: String(value.masteredAt || ''), lastStudiedAt: String(value.lastStudiedAt || ''), difficult: value.difficult === true,
          stage: Math.min(number(value.stage), intervals.length), nextReviewAt: String(value.nextReviewAt || ''), failures: number(value.failures),
          note: Array.from({ length: parts }, (_, index) => entries.get(`note:${wordKey}:${index}`) || '').join('') });
      }
    }
    if (!sources.some((source) => source.id === app.prefs.source)) app.prefs.source = 'all';
    if (!['study', 'library', 'difficult', 'stats'].includes(app.prefs.view)) app.prefs.view = 'study';
    if (!['word', 'quiz', 'spell'].includes(app.prefs.mode)) app.prefs.mode = 'word';
    app.prefs.rate = Math.max(0.6, Math.min(2, Number(app.prefs.rate) || 1));
    app.prefs.repeat = Math.max(1, Math.min(5, number(app.prefs.repeat) || 1));
    app.prefs.interval = Math.max(0, Math.min(5, Number(app.prefs.interval) || 0));
    const view = app.prefs.view;
    if (app.prefs.source === 'all') app.selectGroup(app.prefs.group, false);
    else {
      const source = sources.find((entry) => entry.id === app.prefs.source);
      app.startSession(source.words, source.title, `source:${source.id}`, 'source', app.positions[`source:${source.id}`] || 0, false);
    }
    app.prefs.view = view;
  }

  const onKeyboard = (event) => {
    if (!app.ready || app.prefs.view !== 'study' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open]') || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(event.target.tagName) || event.target.isContentEditable) return;
    if (event.code === 'Space') { event.preventDefault(); app.toggleAuto(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); app.move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); app.move(-1); }
  };
  const onBeforeUnload = (event) => {
    if (store.pending.size) { event.preventDefault(); event.returnValue = ''; }
  };
  onMounted(async () => {
    try {
      const { legacy, entries } = await store.load();
      hydrate(legacy, entries);
    } catch {
      app.storage.state = 'error';
      app.storage.message = '无法读取浏览器存储。请允许本站使用存储；当前页面仍可练习。';
      resetRound();
    }
    app.ready = true;
    clockTimer = setInterval(() => { app.now = Date.now(); }, 60000);
    window.addEventListener('keydown', onKeyboard);
    window.addEventListener('beforeunload', onBeforeUnload);
  });
  onUnmounted(() => {
    app.stop(); clearInterval(clockTimer); clearTimeout(noticeTimer);
    window.removeEventListener('keydown', onKeyboard);
    window.removeEventListener('beforeunload', onBeforeUnload);
    store.db?.close();
  });
  return app;
}
