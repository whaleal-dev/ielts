export const LISTENING_PREFIX = 'ielts-listening-v1:';
export const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’‘]/g, "'");
const corrections = {
  'actor&#37413;&#27290; delivery': "actor's delivery",
  'new year&#37413;&#27290; eve party': "new year's eve party",
};
export const displayWord = (word) => corrections[normalize(word)] || normalize(word);
export const audioFilename = (word, encoding) => (encoding === 'underscore' ? word.replace(/ /g, '_') : encodeURIComponent(word).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%20/g, '+')) + '.mp3';
export const audioUrl = (path) => path ? encodeURI('/listening-word/' + path).replace(/[?#]/g, encodeURIComponent) : '';
export const count = (value) => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value) || 0)));
const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export const localDay = (value = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

export function buildLibrary(data) {
  const chapterTitles = { 3: '特别名词', 4: '形容词与副词', 5: '吞音连读', 8: '数字与信息', 11: '真题语料' };
  const groups = Object.values(data).sort((a, b) => Number(a.id) - Number(b.id)).map((group) => {
    const chapter = Number(group.title.match(/^Chapter\s+(\d+)/)?.[1]);
    let label = group.title.replace(/^Chapter\s+\d+[_\s]*/, '');
    if (chapter === 8) {
      const match = group.title.match(/^Chapter 8 (.+?) (\d{2}_.+)_chunks$/);
      if (match) label = match[2].replace(/^\d{2}_/, '').replace(/^Training_\d+-/, '').replace('常见词汇-', '常见词汇 · ').replace(/(Test_\d+)(.+)/, '$1 · $2').replace(/Test_(\d+)/, '练习 $1');
    } else if (chapter !== 11) label = label.split(/[:：]/).at(-1).trim().replace(/Test Paper (\d+)/, '练习 $1');
    else label = label.replace('Section ', 'Section ').replace('_', ' · ');
    const missing = new Set(group.missing || []);
    const items = [...new Set(group.words.map(normalize))].map((raw, index) => {
      const word = displayWord(raw);
      const path = missing.has(raw) ? '' : group.overrides?.[raw] || `${group.directory}/${audioFilename(word, group.encoding)}`;
      return { key: `${group.id}::${raw}`, word, raw, groupId: group.id, groupTitle: label, chapter, chapterTitle: chapterTitles[chapter], index, audio: audioUrl(path) };
    });
    return { ...group, chapter, label, items };
  });
  const words = groups.flatMap((group) => group.items);
  const byKey = new Map(words.map((word) => [word.key, word]));
  const byText = new Map();
  for (const word of words) {
    for (const text of new Set([word.word, word.raw])) {
      if (!byText.has(text)) byText.set(text, []);
      byText.get(text).push(word);
    }
  }
  const chapters = Object.entries(chapterTitles).map(([id, title]) => ({ id: Number(id), title, groups: groups.filter((group) => group.chapter === Number(id)) }));
  return { groups, words, byKey, byText, chapters };
}

export function parseWords(raw, library, groupId = '') {
  let text = String(raw || '').toLowerCase();
  for (const [source, word] of Object.entries(corrections)) text = text.replaceAll(source, word);
  const commaWords = [...(library?.byText.keys() || [])].filter((word) => /[,，]/.test(word)).sort((a, b) => b.length - a.length);
  const belongsToGroup = (word) => library?.byText.get(displayWord(word))?.some((item) => item.groupId === groupId);
  const words = [];
  for (let remaining of text.split(/[\r\n;；]+/).map(displayWord)) {
    while (remaining) {
      const first = remaining.split(/[,，]/, 1)[0];
      const word = commaWords.find((candidate) => remaining.startsWith(candidate) && /^\s*(?:[,，]|$)/.test(remaining.slice(candidate.length)) && (!groupId || belongsToGroup(candidate) || !belongsToGroup(first))) || first;
      words.push(displayWord(word));
      remaining = remaining.slice(word.length).replace(/^[,，\s]+/, '');
    }
  }
  return [...new Set(words.filter(Boolean))];
}
export const formatWords = (words) => words.map(displayWord).join('； ');
export function resolveInput(library, raw, groupId = '') {
  const result = { items: [], missing: [], mismatch: [], unavailable: [] };
  for (const text of parseWords(raw, library, groupId)) {
    const matches = library.byText.get(text);
    if (!matches) { result.missing.push(text); continue; }
    const item = groupId ? matches.find((word) => word.groupId === groupId) : matches.find((word) => word.audio) || matches[0];
    if (!item) { result.mismatch.push(text); continue; }
    if (!item.audio) { result.unavailable.push(text); continue; }
    result.items.push(item);
  }
  return result;
}
export function isFullGroup(items, group) {
  return Boolean(group && items.length === group.items.length && new Set(items.map((item) => item.key)).size === group.items.length && group.items.every((word) => items.some((item) => item.key === word.key)));
}

export const defaultPrefs = (groupId) => ({ groupId, view: 'practice', mode: 'dictation', order: 'sequence', rate: 1, phraseRate: 0.8, repeat: 1, loops: 1, interval: 2, showWords: false, showCurrentWord: false, progressExpanded: true, sort: 'errorLevel', statsGroup: groupId });
export function sanitizePrefs(value, groups) {
  const prefs = defaultPrefs(groups[0].id);
  if (!value || typeof value !== 'object') return prefs;
  if (value.groupId === '' || groups.some((group) => group.id === value.groupId)) prefs.groupId = value.groupId;
  if (groups.some((group) => group.id === value.statsGroup)) prefs.statsGroup = value.statsGroup;
  for (const [field, options] of Object.entries({ view: ['practice', 'mistakes', 'stats'], mode: ['dictation', 'listen'], order: ['sequence', 'random'], sort: ['errorLevel', 'wrongCount', 'errorRate', 'recent'] })) {
    if (options.includes(value[field])) prefs[field] = value[field];
  }
  prefs.rate = bounded(value.rate, 0.4, 2, 1);
  prefs.phraseRate = bounded(value.phraseRate, 0.4, 2, 0.8);
  prefs.repeat = Math.floor(bounded(value.repeat, 1, Number.MAX_SAFE_INTEGER, 1));
  prefs.loops = Math.floor(bounded(value.loops, 1, Number.MAX_SAFE_INTEGER, 1));
  prefs.interval = bounded(value.interval, 0, 60, 2);
  prefs.showWords = value.showWords === true;
  prefs.showCurrentWord = typeof value.showCurrentWord === 'boolean' ? value.showCurrentWord : prefs.showWords;
  prefs.progressExpanded = typeof value.progressExpanded === 'boolean' ? value.progressExpanded : true;
  return prefs;
}

export const emptyRecord = () => ({ practiceCount: 0, correctCount: 0, wrongCount: 0, errorLevel: 0, recentAnswers: [], lastWrongAt: 0 });
export function sanitizeRecord(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const practiceCount = count(value.practiceCount);
  return { practiceCount, correctCount: Math.min(practiceCount, count(value.correctCount)), wrongCount: count(value.wrongCount), errorLevel: Math.min(10, count(value.errorLevel)), recentAnswers: (Array.isArray(value.recentAnswers) ? value.recentAnswers : []).filter((answer) => typeof answer === 'string').slice(0, 5).map((answer) => answer.slice(0, 400)), lastWrongAt: count(value.lastWrongAt) };
}
export function recordAnswer(record, answer, correct, now = Date.now()) {
  const result = sanitizeRecord(record);
  result.practiceCount += 1;
  if (correct) result.correctCount += 1;
  else {
    result.wrongCount += 1;
    result.errorLevel = Math.min(10, result.errorLevel + 3);
    result.lastWrongAt = now;
    result.recentAnswers = [String(answer || '未作答').slice(0, 400), ...result.recentAnswers].slice(0, 5);
  }
  return result;
}

export const emptyScore = () => ({ sessions: 0, correct: 0, total: 0, best: 0, lastAccuracy: 0, lastAt: 0 });
export function addScore(previous, correct, total, at = Date.now()) {
  const value = { ...emptyScore(), ...previous };
  const accuracy = total ? Math.round(correct / total * 1000) / 10 : 0;
  return { sessions: count(value.sessions) + 1, correct: count(value.correct) + correct, total: count(value.total) + total, best: Math.max(Number(value.best) || 0, accuracy), lastAccuracy: at >= value.lastAt ? accuracy : value.lastAccuracy, lastAt: Math.max(at, count(value.lastAt)) };
}

export function hydrateLegacy(legacy, library) {
  const records = new Map();
  for (const [oldKey, value] of Object.entries(legacy.wordStats || {})) {
    const separator = oldKey.indexOf('::');
    const key = `${oldKey.slice(0, separator)}::${normalize(oldKey.slice(separator + 2))}`;
    if (separator >= 0 && library.byKey.has(key)) records.set(key, sanitizeRecord(value));
  }
  for (const mistake of Array.isArray(legacy.mistakes) ? legacy.mistakes : []) {
    if (!mistake || typeof mistake.word !== 'string') continue;
    const key = `${mistake.chapterId}::${normalize(mistake.word)}`;
    if (!library.byKey.has(key)) continue;
    const wrongCount = count(mistake.wrongCount);
    const old = records.get(key) || emptyRecord();
    records.set(key, sanitizeRecord({ ...old, ...mistake, practiceCount: Math.max(old.practiceCount, wrongCount), errorLevel: Number.isFinite(Number(mistake.errorLevel)) ? mistake.errorLevel : Math.min(10, Math.max(1, wrongCount * 3)), recentAnswers: mistake.recentAnswers || (mistake.lastAnswer ? [mistake.lastAnswer] : []) }));
  }
  const scores = new Map();
  for (const [groupId, entries] of Object.entries(legacy.chapterStats || {})) {
    if (!library.groups.some((group) => group.id === groupId) || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      const at = Number(entry?.timestamp);
      if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(new Date(at).getTime()) || !count(entry.total)) continue;
      const key = `${groupId}:${localDay(at)}`;
      scores.set(key, addScore(scores.get(key), Math.min(count(entry.correct), count(entry.total)), count(entry.total), at));
    }
  }
  const settings = legacy.settings || {};
  const prefs = sanitizePrefs({ groupId: settings.chapter, view: settings.activeTab, mode: settings.mode, order: settings.listenOrder, rate: settings.speed, phraseRate: settings.phraseSpeed, repeat: settings.listenRepeat, loops: settings.listenBigLoop, interval: settings.interval, showWords: settings.showWords, sort: settings.mistakeSortKey === 'accuracy' ? 'errorRate' : settings.mistakeSortKey, statsGroup: settings.statsChapterId }, library.groups);
  return { records, scores, prefs, customText: String(settings.words || '') };
}
