import { computed, onMounted, onUnmounted, reactive, watch } from 'vue';
import { QueuePlayer } from '../practice/player.js';
import { readLocalValue, readValue, valueRecords } from '../practice/records.js';
import { usePracticeStorage } from '../practice/usePracticeStorage.js';
import { groupQueue, parseGroups, synonymPrefs } from './model.js';
import { fileCacheRecords, readFileCache, readImportedFiles, selectCachedFiles, updateFileCache } from './fileCache.js';
import defaultGroups from './default-groups.json';

const DEFAULT_SOURCE = '同义词-听力179考点词（默认示例）';

export function useSynonyms() {
  const app = reactive({ ready: false, groups: [], cachedFiles: [], pendingFiles: null, notes: new Map(), prefs: synonymPrefs(), index: 0, search: '', visibleCount: 40, playing: false, speaking: false, finished: false, repetition: 1, error: '', notice: '', source: '' });
  const storage = usePracticeStorage('ielts-synonyms-v1:');
  app.storage = storage.status;
  app.filteredGroups = computed(() => app.groups.map((words, index) => ({ words, index })).filter((group) => group.words.some((word) => word.toLowerCase().includes(app.search.trim().toLowerCase()))));
  app.items = computed(() => groupQueue(app.filteredGroups, app.prefs.groupLoops));
  app.current = computed(() => app.items[app.index] || null);
  app.noteCount = computed(() => [...app.notes.values()].filter((text) => text.trim()).length);
  let selection = null;
  const position = () => ['position', selection ? { group: selection.group, word: selection.word, cycle: selection.cycle } : null];
  const player = new QueuePlayer({
    onPosition: (index) => { app.index = index; selection = app.current; storage.save([position()]); },
    onState: (state) => Object.assign(app, state),
    onError: (error) => { app.error = error.message; },
  });
  const snapshot = () => [['prefs', { ...app.prefs }], position(), ...valueRecords('source', app.source), ...valueRecords('groups', app.groups), ...fileCacheRecords([], app.pendingFiles || app.cachedFiles), ...[...app.notes].flatMap(([word, note]) => valueRecords(`note:${encodeURIComponent(word)}`, note))];
  const confirmFiles = () => { if (app.pendingFiles) { app.cachedFiles = app.pendingFiles; app.pendingFiles = null; } };
  watch(() => storage.status.state, (state) => { if (state === 'saved') confirmFiles(); });
  app.retrySave = async () => { const saved = await storage.retry(snapshot()); if (saved) confirmFiles(); return saved; };
  app.pause = () => { player.stop(); };
  app.toggleCenterCurrent = () => {
    app.prefs.centerCurrent = !app.prefs.centerCurrent;
    return storage.save([['prefs', { ...app.prefs }]]);
  };
  app.savePrefs = () => {
    const current = selection;
    app.pause(); app.prefs = synonymPrefs(app.prefs); app.finished = false;
    app.index = Math.max(0, app.items.findIndex((item) => item.group === current?.group && item.word === current?.word && item.cycle === Math.min(current.cycle, app.prefs.groupLoops)));
    selection = app.current;
    return storage.save([['prefs', { ...app.prefs }], position()]);
  };
  const play = (automatic = true) => {
    if (!app.current) { app.error = app.groups.length ? '当前结果没有可播报的英文，含中文词条仅供展示。' : '请先导入词库或加载示例词库。'; return; }
    app.error = ''; app.notice = '';
    return player.start(app.items, app.index, { ...app.prefs, autoAdvance: automatic, repeat: automatic ? app.prefs.repeat : 1 });
  };
  app.toggle = () => {
    if (app.playing) { app.pause(); app.notice = '已暂停，继续时从当前词重新播放。'; }
    else { if (app.finished) app.index = 0; return play(); }
  };
  app.jump = (group, word) => {
    const index = app.items.findIndex((item) => item.group === group && item.word === word);
    if (index < 0) return;
    const automatic = app.playing;
    app.pause(); app.index = index;
    return play(automatic);
  };
  app.move = (step) => {
    const unique = groupQueue(app.filteredGroups);
    const index = unique.findIndex((item) => item.group === app.current?.group && item.word === app.current?.word);
    const next = unique[index + step];
    if (next) return app.jump(next.group, next.word);
  };
  app.canMove = (step) => {
    const unique = groupQueue(app.filteredGroups);
    const index = unique.findIndex((item) => item.group === app.current?.group && item.word === app.current?.word);
    return Boolean(unique[index + step]);
  };
  app.setGroups = (groups, source, records = []) => {
    app.pause(); app.groups = groups; app.source = source; app.search = ''; app.index = 0; app.finished = false; app.visibleCount = 40; app.error = '';
    selection = app.current;
    app.notice = `已加载 ${groups.length} 组同义词。`;
    return storage.save([...valueRecords('groups', groups), ...valueRecords('source', source), position(), ...records]);
  };
  app.loadSample = () => app.setGroups(defaultGroups.map((group) => [...group]), DEFAULT_SOURCE);
  app.importFiles = async (files, cachedNames = []) => {
    if (!files.length && !cachedNames.length) return false;
    let imported, selected;
    try { imported = await readImportedFiles(files); selected = selectCachedFiles(app.cachedFiles, cachedNames); }
    catch (error) { app.error = error.message; return false; }
    const groups = [...selected.groups, ...imported.groups];
    const source = [...selected.names, ...files.map((file) => file.name)].join('、');
    if (!files.length) return app.setGroups(groups, source);
    const previous = app.pendingFiles || app.cachedFiles;
    const next = updateFileCache(previous, imported.files);
    const records = fileCacheRecords(previous, next);
    app.pendingFiles = next;
    const saved = await app.setGroups(groups, source, records);
    if (saved) confirmFiles();
    return saved;
  };
  app.deleteCachedFile = async (name) => {
    const previous = app.pendingFiles || app.cachedFiles;
    const next = previous.filter((file) => file.name !== name);
    if (next.length === previous.length) { app.error = '缓存文件已不存在。'; return false; }
    app.error = '';
    const records = fileCacheRecords(previous, next);
    app.pendingFiles = next;
    const saved = await storage.save(records);
    if (saved) confirmFiles();
    return saved;
  };
  app.saveNote = (word, text) => {
    app.notes.set(word, text.trim());
    return storage.save(valueRecords(`note:${encodeURIComponent(word)}`, text.trim()));
  };
  app.groupNotes = (group) => [...new Set(group)].filter((word) => app.notes.get(word)?.trim()).map((word) => ({ word, text: app.notes.get(word) }));
  watch(() => app.search, () => { app.pause(); app.index = 0; selection = app.current; app.visibleCount = 40; app.finished = false; app.error = ''; });
  const keydown = (event) => {
    if (event.target.closest('input, textarea, select, button, dialog, [contenteditable]')) return;
    if (event.code === 'Space') { event.preventDefault(); app.toggle(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); app.move(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); app.move(1); }
  };
  onMounted(async () => {
    const entries = await storage.load();
    const groups = readValue(entries, 'groups', []);
    try { if (groups.length) app.groups = parseGroups(JSON.stringify(groups), 'saved.json'); } catch { app.error = '已保存词库格式不正确，已加载默认示例，请重新导入词库。'; }
    app.cachedFiles = readFileCache(entries);
    app.source = app.groups.length ? readValue(entries, 'source', '') || '已保存词库' : DEFAULT_SOURCE;
    if (!app.groups.length) app.groups = defaultGroups.map((group) => [...group]);
    const legacy = readLocalValue('ielts_notes_v4');
    if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) for (const [word, note] of Object.entries(legacy)) if (typeof note === 'string') app.notes.set(word, note);
    for (const [key, value] of entries) {
      if (key.startsWith('note:') && Number.isInteger(value?.parts)) {
        try { const note = readValue(entries, key, ''); if (typeof note === 'string') app.notes.set(decodeURIComponent(key.slice(5)), note); } catch { /* Invalid note keys do not affect other notes. */ }
      }
    }
    app.prefs = synonymPrefs(entries.get('prefs'));
    const saved = entries.get('position');
    app.index = Math.max(0, app.items.findIndex((item) => item.group === saved?.group && item.word === saved?.word && item.cycle === saved?.cycle));
    selection = app.current;
    app.ready = true; window.addEventListener('keydown', keydown);
  });
  onUnmounted(() => { player.stop(); window.removeEventListener('keydown', keydown); });
  return app;
}
