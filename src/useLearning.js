import { reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { chapters, groups, words, sources, wordIndex, normalizeTerm, audioForTerm } from './library.js';
import { RecordStore, wordRecords, PREFIX } from './storage.js';
import { createWordLibrary, expandWordLibrary, directoryRecords, wordLibraryRecords, readWordLibraries, libraryDeleteKeys } from './wordLibraries.js';
import { SpeechPlayer, chooseEnglishVoice } from './practice/player.js';
import { dayKey, emptyDay, markStudied, recentDays, studyStreak } from './progress.js';
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
    ready: false, records: new Map(), days: {}, positions: {}, libraries: [], libraryPositions: {}, personalDays: {}, libraryBusy: false, libraryError: '', playbackOpen: false, voiceWarning: '',
    prefs: { source: 'all', chapter: 1, group: groups[0].id, view: 'study', mode: 'word', voice: '', rate: 1, repeat: 1, interval: 2, showWord: true, showMeaning: true, reviewMin: 1, reviewMax: 10, reviewFilter: 'all', reviewSort: 'desc' },
    session: { items: groups[0].words, index: 0, key: groups[0].id, label: '自然地理 · 第一组', kind: 'group' },
    round: { options: [], selected: '', answered: false, correct: false },
    spelling: '', playing: false, speaking: false, search: '', visibleCount: 40,
    reviewSearch: '', notice: '', now: Date.now(),
    storage: { state: 'loading', message: '', mode: 'IndexedDB', loadFailed: false },
  });
  const store = new RecordStore({ legacyKey: null, onStatus: (status) => Object.assign(app.storage, status) });
  let token = 0;
  let audio = null;
  let resolveAudio = null;
  let noticeTimer;
  let clockTimer;
  let exposed = '';
  let libraryRetry = null;
  let waitTimer, resolveWait;
  const speech = new SpeechPlayer();

  app.sources = computed(() => [sources[0], ...app.libraries]);
  app.source = computed(() => app.sources.find((source) => source.id === app.prefs.source) || sources[0]);
  app.sourceWords = computed(() => app.source.words);
  app.sourceGroups = computed(() => app.source.personal ? app.source.groups : app.chapter.groups);
  const byKey = computed(() => new Map(app.sources.flatMap((source) => source.words).map((word) => [word.key, word])));

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
  app.reviewWords = computed(() => app.sourceWords.filter((word) => app.records.get(word.key)?.difficulty > 0));
  app.isDue = (word) => isReviewDue(app.records.get(word.key), app.now);
  app.dueWords = computed(() => app.reviewWords.filter(app.isDue));
  app.stats = computed(() => {
    const records = app.sourceWords.map((word) => app.records.get(word.key));
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
    return query ? app.sourceWords.filter((word) => normalizeTerm(`${word.word} ${word.meaning} ${word.phonetic}`).includes(query)) : [];
  });
  app.reviewMatches = computed(() => {
    const query = normalizeTerm(app.reviewSearch);
    return app.sourceWords.filter((word) => {
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
  app.lastDays = (count) => recentDays(count, app.now).map((key) => ({ key, label: `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`, ...emptyDay(), ...app.days[key] }));
  app.streak = computed(() => studyStreak(app.days, app.now));
  app.notify = (text) => {
    app.notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { app.notice = ''; }, 4000);
  };
  const persist = (entries) => {
    if (!store.loaded) return Promise.resolve(false);
    try { return store.setMany(entries); }
    catch (error) { app.storage.state = 'error'; app.storage.message = error.message; return Promise.resolve(false); }
  };
  app.savePrefs = () => persist([['prefs', { ...app.prefs }]]);
  app.retrySave = async () => {
    if (app.storage.loadFailed) {
      try { hydrate((await store.load()).entries); prepareVoices(); return true; } catch { return false; }
    }
    return libraryRetry ? libraryRetry() : store.pending.size ? store.flush() : app.savePrefs();
  };
  app.cancelLibrarySave = () => { const cancelled = !!libraryRetry; libraryRetry = null; app.libraryError = ''; if (cancelled && !store.pending.size && app.storage.state === 'error') Object.assign(app.storage, { state: 'saved', message: '' }); prepareVoices(); };
  const storedKeys = () => [...new Set([...store.saved.keys(), ...store.pending.keys()])].map((key) => key.slice(PREFIX.length));
  const channel = window.BroadcastChannel ? new window.BroadcastChannel('ielts-word-libraries') : null;
  function adoptLibraries(libraries, entries) {
    app.libraries = libraries;
    for (const [key, value] of entries) {
      if (key.startsWith('word:') && byKey.value.has(key.slice(5)) && !app.records.has(key.slice(5)) && value && typeof value === 'object') hydrateWord(key.slice(5), value, entries);
      if (key.startsWith('position:') && !(key.slice(9) in app.positions)) app.positions[key.slice(9)] = number(value);
      if (key.startsWith('libraryPosition:') && !app.libraryPositions[key.slice(16)] && value && typeof value === 'object') app.libraryPositions[key.slice(16)] = value;
      if (key.startsWith('libraryDay:') && value && typeof value === 'object') {
        const [, id, date] = key.split(':');
        const days = app.personalDays[id] ||= {}; days[date] ||= { ...emptyDay(), ...value };
      }
    }
  }
  const refreshLibraries = async () => {
    if (!app.ready || app.libraryBusy || app.storage.loadFailed || !await store.flush()) return;
    try {
      const { entries } = await store.load();
      adoptLibraries(readWordLibraries(entries, audioForTerm), entries);
      if (!app.sources.some((source) => source.id === app.prefs.source)) {
        app.stop(); app.selectSource('all', false); app.notify('当前个人词库已在其他页面删除，已返回雅思主题词汇。');
      }
    } catch { /* The storage status reports the read error and preserves the current library. */ }
  };
  let librarySyncTimer;
  const scheduleLibrarySync = () => { clearTimeout(librarySyncTimer); librarySyncTimer = setTimeout(refreshLibraries, 40); };
  if (channel) channel.onmessage = scheduleLibrarySync;
  const onLibraryStorage = (event) => { if (event.key?.startsWith(PREFIX + 'libraryInfo:') || event.key?.startsWith(PREFIX + 'library:')) scheduleLibrarySync(); };
  app.saveLibrary = async (parsed, name, filename, pendingLibrary = null) => {
    if (app.libraryBusy) return null;
    app.libraryBusy = true; app.libraryError = '';
    libraryRetry = () => app.saveLibrary(parsed, name, filename);
    try {
      if (!await store.flush()) return null;
      const { entries } = await store.load();
      const latest = readWordLibraries(entries, audioForTerm);
      const library = pendingLibrary || expandWordLibrary(createWordLibrary(parsed, name, [sources[0].title, ...latest.map((source) => source.title)], { filename }), audioForTerm);
      libraryRetry = () => app.saveLibrary(parsed, name, filename, library);
      const next = [library, ...latest.filter((entry) => entry.id !== library.id)];
      if (!await store.commit([...wordLibraryRecords(library), ...directoryRecords([library])])) {
        app.libraryError = '尚未保存。解析结果和名称已保留，请重试保存。'; return null;
      }
      adoptLibraries(next, entries); libraryRetry = null;
      channel?.postMessage('changed');
      app.notify('词库已导入，可以开始学习。');
      return library;
    } catch (error) { app.libraryError = error.message; return null; }
    finally { app.libraryBusy = false; prepareVoices(); }
  };
  app.deleteLibrary = async (library) => {
    if (app.libraryBusy || !library.personal || !app.libraries.some((entry) => entry.id === library.id)) return false;
    app.stop(); app.libraryBusy = true; app.libraryError = '';
    libraryRetry = () => app.deleteLibrary(library);
    try {
      if (!await store.flush()) return false;
      const { entries } = await store.load();
      const latest = readWordLibraries(entries, audioForTerm);
      const next = latest.filter((entry) => entry.id !== library.id);
      const selected = app.prefs.source === library.id;
      const builtIn = app.libraryPositions.all || { group: groups[0].id, chapter: 1 };
      const prefs = selected ? { ...app.prefs, source: 'all', ...builtIn } : { ...app.prefs };
      const deleted = libraryDeleteKeys(storedKeys(), library);
      if (!await store.commit([['prefs', prefs]], deleted)) { app.libraryError = '删除失败，词库和当前选择已保留，请重试。'; return false; }
      adoptLibraries(next, entries); libraryRetry = null;
      channel?.postMessage('changed');
      for (const word of library.words) app.records.delete(word.key);
      for (const key of Object.keys(app.positions)) if (key.startsWith(`personal:${library.id}:`)) delete app.positions[key];
      delete app.libraryPositions[library.id]; delete app.personalDays[library.id];
      if (selected) { const view = app.prefs.view; app.selectSource('all', false); app.prefs.view = view; }
      app.notify('个人词库已删除。');
      return true;
    } catch (error) { app.libraryError = error.message; return false; }
    finally { app.libraryBusy = false; prepareVoices(); }
  };
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
      ...(word.sourceId !== 'all' && app.personalDays[word.sourceId]?.[dayKey(app.now)] ? [[`libraryDay:${word.sourceId}:${dayKey(app.now)}`, { ...app.personalDays[word.sourceId][dayKey(app.now)] }]] : []),
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
    if (word.sourceId === 'all') markStudied(day, wordIndex.get(word.key), words.length);
    else {
      const source = app.sources.find((entry) => entry.id === word.sourceId);
      const days = app.personalDays[word.sourceId] ||= {};
      const personalDay = days[dayKey(app.now)] ||= emptyDay();
      if (markStudied(personalDay, source.words.findIndex((entry) => entry.key === word.key), source.words.length)) day.studied += 1;
    }
    exposed = word.key;
    saveWord(word);
  };
  app.stop = () => {
    token += 1;
    app.playing = false;
    app.speaking = false;
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio = null; }
    if (resolveAudio) { resolveAudio(); resolveAudio = null; }
    speech.stop(); clearTimeout(waitTimer); resolveWait?.(); resolveWait = null;
  };
  const resetRound = () => {
    app.spelling = '';
    const meaning = app.current?.meaning;
    const local = shuffled([...new Set(app.sourceWords.map((word) => word.meaning))].filter((text) => text && text !== meaning));
    const fallback = shuffled([...new Set(words.map((word) => word.meaning))].filter((text) => text && text !== meaning && !local.includes(text)));
    const alternatives = [...local, ...fallback].slice(0, 3);
    app.round = { options: shuffled([meaning, ...alternatives]), selected: '', answered: false, correct: false, difficultyAdded: 0, difficultyAfter: 0 };
  };
  const savePosition = () => {
    app.positions[app.session.key] = app.session.index;
    const entries = [[`position:${app.session.key}`, app.session.index], ['prefs', { ...app.prefs }]];
    if (app.session.kind === 'group') {
      app.libraryPositions[app.prefs.source] = { group: app.prefs.group, chapter: app.prefs.chapter };
      entries.push([`libraryPosition:${app.prefs.source}`, { ...app.libraryPositions[app.prefs.source] }]);
    }
    persist(entries);
  };
  app.startSession = (items, label, key, kind = 'custom', index = 0, countExposure = true) => {
    app.stop();
    if (!items.length) { app.notify('当前没有可练习的单词。'); return; }
    app.session = { items: [...items], label, key, kind, index: Math.max(0, Math.min(index, items.length - 1)) };
    app.prefs.view = 'study';
    app.search = '';
    exposed = '';
    resetRound();
    if (countExposure) { expose(); savePosition(); }
  };
  app.selectGroup = (id, countExposure = true) => {
    if (groups.some((group) => group.id === id)) app.prefs.source = 'all';
    const group = app.source.groups.find((entry) => entry.id === id) || app.source.groups[0];
    app.prefs.group = group.id;
    if (!app.source.personal) app.prefs.chapter = group.chapter;
    app.startSession(group.words, `${app.source.personal ? app.source.title : app.chapter.title} · ${group.title}`, group.id, 'group', app.positions[group.id] || 0, countExposure);
  };
  app.selectSource = (id = 'all', countExposure = true) => {
    app.stop();
    if (countExposure && id !== app.prefs.source && app.libraryPositions[app.prefs.source]) {
      persist([[`libraryPosition:${app.prefs.source}`, { ...app.libraryPositions[app.prefs.source] }]]);
    }
    app.prefs.source = app.sources.some((source) => source.id === id) ? id : 'all';
    app.reviewSearch = ''; app.visibleCount = 40;
    const position = app.libraryPositions[app.prefs.source];
    app.selectGroup(position?.group || (app.source.personal ? app.source.groups[0].id : app.prefs.group), countExposure);
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
  app.startReview = (due = false) => app.startSession([...(due ? app.reviewDueWords : app.filteredReview)], due ? '到期复习' : '难度复习', app.source.personal ? `personal:${app.source.id}:review` : 'review', 'review');
  app.openReviewWord = (word) => {
    const items = [...app.filteredReview];
    const index = items.findIndex((item) => item.key === word.key);
    if (index >= 0) app.startSession(items, '难度复习', app.source.personal ? `personal:${app.source.id}:review` : 'review', 'review', index);
  };
  app.openWord = (word) => {
    const group = app.source.groups.find((entry) => entry.id === word.groupId);
    app.prefs.group = group.id; if (!app.source.personal) app.prefs.chapter = group.chapter;
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
  const play = (word, currentToken) => {
    if (!word.audio) return speech.play(word.word, { voice: app.prefs.voice, rate: app.prefs.rate, preferGoogle: true });
    return new Promise((resolve, reject) => {
      audio = new Audio(word.audio);
      audio.playbackRate = app.prefs.rate;
      resolveAudio = resolve;
      audio.onended = resolve;
      audio.onerror = () => reject(new Error('此单词匹配的本地 MP3 暂时无法播放，请重播。'));
      audio.play().catch(() => reject(new Error('此单词匹配的本地 MP3 暂时无法播放，请重播。')));
      if (currentToken !== token) resolve();
    });
  };
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
    catch (error) { if (currentToken === token) { app.stop(); app.notify(error.message); } }
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
        await new Promise((resolve) => { resolveWait = resolve; waitTimer = setTimeout(() => { resolveWait = null; resolve(); }, app.prefs.interval * 1000); });
        if (app.playing && currentToken === token) app.move(1, true);
      }
    } catch (error) {
      if (currentToken === token) { app.stop(); app.notify(`${error.message}自动播放已暂停。`); }
    }
  };

  function hydrateWord(wordKey, value, entries) {
    const parts = Math.min(number(value.noteParts), 20000);
    app.records.set(wordKey, { ...defaultRecord(), count: number(value.count), mastered: value.mastered === true,
      masteredAt: String(value.masteredAt || ''), lastStudiedAt: String(value.lastStudiedAt || ''), difficulty: normalizeDifficulty(value.difficulty),
      stage: Math.min(number(value.stage), reviewIntervals.length), nextReviewAt: String(value.nextReviewAt || ''), failures: number(value.failures),
      note: Array.from({ length: parts }, (_, index) => entries.get(`note:${wordKey}:${index}`) || '').join('') });
  }

  function hydrate(entries) {
    app.libraries = readWordLibraries(entries, audioForTerm);
    for (const [key, value] of entries) {
      if (key === 'prefs' && value && typeof value === 'object') {
        for (const field of Object.keys(app.prefs)) if (field in value) app.prefs[field] = value[field];
      }
      if (key.startsWith('position:')) app.positions[key.slice(9)] = number(value);
      if (key.startsWith('libraryPosition:') && value && typeof value === 'object') app.libraryPositions[key.slice(16)] = value;
      if (key.startsWith('libraryDay:') && value && typeof value === 'object') {
        const [, id, date] = key.split(':');
        const days = app.personalDays[id] ||= {}; days[date] = { ...emptyDay(), ...value };
      }
      if (key.startsWith('day:') && value && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(4))) {
        app.days[key.slice(4)] = { studied: number(value.studied), events: number(value.events), mastered: number(value.mastered), reviewed: number(value.reviewed), seen: typeof value.seen === 'string' ? value.seen : '' };
      }
      if (key.startsWith('word:') && byKey.value.has(key.slice(5)) && value && typeof value === 'object') {
        hydrateWord(key.slice(5), value, entries);
      }
    }
    if (!app.sources.some((source) => source.id === app.prefs.source)) app.prefs.source = 'all';
    if (!app.libraryPositions.all) {
      const group = groups.find((entry) => entry.id === app.prefs.group) || groups[0];
      app.libraryPositions.all = { group: group.id, chapter: group.chapter };
    }
    if (!['study', 'library', 'review', 'stats'].includes(app.prefs.view)) app.prefs.view = 'study';
    if (!['word', 'quiz', 'spell'].includes(app.prefs.mode)) app.prefs.mode = 'word';
    app.prefs.rate = Math.max(0.6, Math.min(2, Number(app.prefs.rate) || 1));
    app.prefs.repeat = Math.max(1, Math.min(5, number(app.prefs.repeat) || 1));
    app.prefs.interval = Math.max(0, Math.min(5, Number(app.prefs.interval) || 0));
    app.prefs.voice = typeof app.prefs.voice === 'string' ? app.prefs.voice : '';
    app.prefs.showWord = app.prefs.showWord !== false;
    app.prefs.showMeaning = app.prefs.showMeaning !== false;
    app.prefs.reviewMin = normalizeDifficulty(app.prefs.reviewMin);
    app.prefs.reviewMax = Math.max(app.prefs.reviewMin, normalizeDifficulty(app.prefs.reviewMax));
    if (!['all', 'due'].includes(app.prefs.reviewFilter)) app.prefs.reviewFilter = 'all';
    if (!['desc', 'asc'].includes(app.prefs.reviewSort)) app.prefs.reviewSort = 'desc';
    const view = app.prefs.view;
    app.selectSource(app.prefs.source, false);
    app.prefs.view = view;
  }

  function prepareVoices() {
    if (!app.ready || app.storage.loadFailed || app.libraryBusy || libraryRetry) return;
    const voices = globalThis.speechSynthesis?.getVoices() || [];
    const selected = chooseEnglishVoice(voices, app.prefs.voice, true);
    if (!selected) return;
    const id = selected.voiceURI || selected.name;
    if (app.prefs.voice !== id) {
      app.voiceWarning = app.prefs.voice ? '已选语音暂不可用，已使用默认英语语音。' : '';
      app.prefs.voice = id; app.savePrefs();
    }
  }

  const onKeyboard = (event) => {
    if (!app.ready || app.prefs.view !== 'study' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.defaultPrevented || document.querySelector('dialog[open]') || event.target.closest('input, textarea, select, button, a, [contenteditable], [role="combobox"], [role="listbox"], [role="option"]')) return;
    if (event.code === 'Space') { event.preventDefault(); app.toggleAuto(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); app.move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); app.move(-1); }
  };
  const onBeforeUnload = (event) => {
    if (store.pending.size || libraryRetry) { event.preventDefault(); event.returnValue = ''; }
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
    prepareVoices();
    globalThis.speechSynthesis?.addEventListener('voiceschanged', prepareVoices);
    clockTimer = setInterval(() => { app.now = Date.now(); }, 60000);
    window.addEventListener('keydown', onKeyboard);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('focus', scheduleLibrarySync);
    window.addEventListener('storage', onLibraryStorage);
  });
  onUnmounted(() => {
    app.stop(); clearInterval(clockTimer); clearTimeout(noticeTimer);
    window.removeEventListener('keydown', onKeyboard);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('focus', scheduleLibrarySync);
    window.removeEventListener('storage', onLibraryStorage);
    clearTimeout(librarySyncTimer); channel?.close();
    globalThis.speechSynthesis?.removeEventListener('voiceschanged', prepareVoices);
    store.db?.close();
  });
  return app;
}
