import { reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { chapters, groups, words, wordByKey, wordIndex, normalizeTerm } from './library.js';
import { RecordStore, wordRecords } from './storage.js';
import { dayKey, emptyDay, markStudied } from './progress.js';
import { normalizeDifficulty, changeDifficulty, scheduleReview, answerRecord, isReviewDue, reviewIntervals } from './learningModel.js';

const number = (value) => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value) || 0)));
const defaultRecord = () => ({ count: 0, mastered: false, masteredAt: '', difficulty: 0, stage: 0, nextReviewAt: '', failures: 0, note: '' });
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
    prefs: { source: 'all', chapter: 1, group: groups[0].id, view: 'study', mode: 'word', rate: 1, repeat: 1, interval: 2, showWord: true, showMeaning: true, reviewMin: 1, reviewMax: 10, reviewFilter: 'all', reviewSort: 'desc' },
    session: { items: groups[0].words, index: 0, key: groups[0].id, label: '自然地理 · 第一组', kind: 'group' },
    round: { options: [], selected: '', answered: false, correct: false },
    spelling: '', playing: false, speaking: false, search: '', visibleCount: 40,
    reviewSearch: '', notice: '', now: Date.now(),
    storage: { state: 'loading', message: '', mode: 'IndexedDB' },
  });
  const store = new RecordStore({ legacyKey: null, onStatus: (status) => Object.assign(app.storage, status) });
  let token = 0;
  let audio = null;
  let resolveAudio = null;
  let noticeTimer;
  let clockTimer;
  let exposed = '';

  watch(() => app.prefs.rate, (rate) => {
    if (audio) audio.playbackRate = rate;
  }, { flush: 'sync' });

  app.getRecord = (key) => {
    if (!app.records.has(key)) app.records.set(key, defaultRecord());
    return app.records.get(key);
  };
  app.current = computed(() => app.session.items[app.session.index] || null);
  app.currentRecord = computed(() => app.current ? app.getRecord(app.current.key) : defaultRecord());
  app.chapter = computed(() => chapters.find((chapter) => chapter.number === app.prefs.chapter) || chapters[0]);
  app.today = computed(() => app.days[dayKey(app.now)] || emptyDay());
  app.reviewWords = computed(() => words.filter((word) => app.records.get(word.key)?.difficulty > 0));
  app.isDue = (word) => isReviewDue(app.records.get(word.key), app.now);
  app.dueWords = computed(() => app.reviewWords.filter(app.isDue));
  app.stats = computed(() => {
    const records = words.map((word) => app.records.get(word.key));
    return {
      studied: records.filter((record) => record?.count > 0).length,
      mastered: records.filter((record) => record?.mastered).length,
      review: records.filter((record) => record?.difficulty > 0).length,
    };
  });
  app.groupStudied = computed(() => app.session.items.filter((word) => app.records.get(word.key)?.count > 0).length);
  app.groupMastered = computed(() => app.session.items.filter((word) => app.records.get(word.key)?.mastered).length);
  app.searchResults = computed(() => {
    const query = normalizeTerm(app.search);
    return query ? words.filter((word) => normalizeTerm(`${word.word} ${word.meaning} ${word.phonetic}`).includes(query)) : [];
  });
  app.reviewMatches = computed(() => {
    const query = normalizeTerm(app.reviewSearch);
    return words.filter((word) => {
      const difficulty = app.records.get(word.key)?.difficulty || 0;
      return difficulty >= app.prefs.reviewMin && difficulty <= app.prefs.reviewMax
        && (!query || normalizeTerm(`${word.word} ${word.meaning} ${word.phonetic}`).includes(query));
    }).sort((left, right) => {
      const difference = (app.records.get(right.key)?.difficulty || 0) - (app.records.get(left.key)?.difficulty || 0);
      return app.prefs.reviewSort === 'asc' ? -difference : difference;
    });
  });
  app.reviewDueWords = computed(() => app.reviewMatches.filter(app.isDue));
  app.filteredReview = computed(() => app.prefs.reviewFilter === 'due' ? app.reviewDueWords : app.reviewMatches);
  watch(() => [app.reviewSearch, app.prefs.reviewMin, app.prefs.reviewMax, app.prefs.reviewFilter, app.prefs.reviewSort], () => { app.visibleCount = 40; });
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
  app.setReviewRange = (bound, value) => {
    app.prefs[bound] = normalizeDifficulty(value);
    if (app.prefs.reviewMin > app.prefs.reviewMax) {
      app.prefs[bound === 'reviewMin' ? 'reviewMax' : 'reviewMin'] = app.prefs[bound];
    }
    app.savePrefs();
  };
  app.resetReviewFilters = () => {
    app.reviewSearch = '';
    Object.assign(app.prefs, { reviewMin: 1, reviewMax: 10, reviewFilter: 'all', reviewSort: 'desc' });
    app.savePrefs();
  };
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
    app.round = { options: shuffled([meaning, ...alternatives]), selected: '', answered: false, correct: false, difficultyAdded: 0, difficultyAfter: 0 };
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
  app.selectSource = () => app.selectGroup(app.prefs.group);
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
  app.startReview = (due = false) => app.startSession([...(due ? app.reviewDueWords : app.filteredReview)], due ? '到期复习' : '难度复习', 'review', 'review');
  app.openReviewWord = (word) => {
    const items = [...app.filteredReview];
    const index = items.findIndex((item) => item.key === word.key);
    if (index >= 0) app.startSession(items, '难度复习', 'review', 'review', index);
  };
  app.openWord = (word) => {
    const group = groups.find((entry) => entry.id === word.groupId);
    app.prefs.source = 'all'; app.prefs.group = group.id; app.prefs.chapter = group.chapter;
    app.startSession(group.words, `${word.chapterTitle} · ${word.groupTitle}`, group.id, 'group', word.wordIndex);
  };
  app.adjustDifficulty = (delta, word = app.current) => {
    if (!word) return;
    const record = app.getRecord(word.key);
    if (!changeDifficulty(record, delta)) return;
    saveWord(word);
  };
  const review = (record, correct) => {
    if (scheduleReview(record, correct)) today().reviewed += 1;
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
    const { reviewed, added } = answerRecord(record, correct);
    app.round.difficultyAdded = added;
    app.round.difficultyAfter = record.difficulty;
    if (reviewed) today().reviewed += 1;
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

  function hydrate(entries) {
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
          masteredAt: String(value.masteredAt || ''), lastStudiedAt: String(value.lastStudiedAt || ''), difficulty: normalizeDifficulty(value.difficulty),
          stage: Math.min(number(value.stage), reviewIntervals.length), nextReviewAt: String(value.nextReviewAt || ''), failures: number(value.failures),
          note: Array.from({ length: parts }, (_, index) => entries.get(`note:${wordKey}:${index}`) || '').join('') });
      }
    }
    app.prefs.source = 'all';
    if (!['study', 'library', 'review', 'stats'].includes(app.prefs.view)) app.prefs.view = 'study';
    if (!['word', 'quiz', 'spell'].includes(app.prefs.mode)) app.prefs.mode = 'word';
    app.prefs.rate = Math.max(0.6, Math.min(2, Number(app.prefs.rate) || 1));
    app.prefs.repeat = Math.max(1, Math.min(5, number(app.prefs.repeat) || 1));
    app.prefs.interval = Math.max(0, Math.min(5, Number(app.prefs.interval) || 0));
    app.prefs.showWord = app.prefs.showWord !== false;
    app.prefs.showMeaning = app.prefs.showMeaning !== false;
    app.prefs.reviewMin = normalizeDifficulty(app.prefs.reviewMin);
    app.prefs.reviewMax = Math.max(app.prefs.reviewMin, normalizeDifficulty(app.prefs.reviewMax));
    if (!['all', 'due'].includes(app.prefs.reviewFilter)) app.prefs.reviewFilter = 'all';
    if (!['desc', 'asc'].includes(app.prefs.reviewSort)) app.prefs.reviewSort = 'desc';
    const view = app.prefs.view;
    app.selectGroup(app.prefs.group, false);
    app.prefs.view = view;
  }

  const onKeyboard = (event) => {
    if (!app.ready || app.prefs.view !== 'study' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.defaultPrevented || document.querySelector('dialog[open]') || event.target.closest('input, textarea, select, button, a, [contenteditable], [role="combobox"], [role="listbox"], [role="option"]')) return;
    if (event.code === 'Space') { event.preventDefault(); app.toggleAuto(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); app.move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); app.move(-1); }
  };
  const onBeforeUnload = (event) => {
    if (store.pending.size) { event.preventDefault(); event.returnValue = ''; }
  };
  onMounted(async () => {
    try {
      const { entries } = await store.load();
      hydrate(entries);
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
