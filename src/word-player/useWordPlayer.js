import { computed, onMounted, onUnmounted, reactive } from 'vue';
import { QueuePlayer } from '../practice/player.js';
import { readLocalValue, readValue, valueRecords } from '../practice/records.js';
import { usePracticeStorage } from '../practice/usePracticeStorage.js';
import { matchesAnswer, parseWords, shuffleWords, wordPlayerPrefs } from './model.js';

export function useWordPlayer() {
  const app = reactive({ ready: false, items: [], rawText: '', prefs: wordPlayerPrefs(), index: 0, playing: false, speaking: false, finished: false, repetition: 1, answer: '', revealed: false, feedback: null, error: '', notice: '' });
  const storage = usePracticeStorage('ielts-word-player-v1:');
  app.storage = storage.status;
  app.current = computed(() => app.items[app.index] || '');
  app.queue = computed(() => app.items.map((text) => ({ text })));
  const position = () => ['position', { index: app.index, finished: app.finished }];
  const resetAnswer = () => { app.answer = ''; app.revealed = false; app.feedback = null; };
  const player = new QueuePlayer({
    onPosition: (index) => { app.index = index; resetAnswer(); storage.save([position()]); },
    onState: (state) => { Object.assign(app, state); if (state.finished) { app.notice = '本轮播放完成。'; storage.save([position()]); } },
    onError: (error) => { app.error = error.message; },
  });
  const snapshot = () => [['prefs', { ...app.prefs }], ...valueRecords('list', app.items), position()];
  app.retrySave = () => storage.retry(snapshot());
  app.pause = () => player.stop();
  app.savePrefs = () => { app.pause(); app.prefs = wordPlayerPrefs(app.prefs); return storage.save([['prefs', { ...app.prefs }]]); };
  const play = (automatic) => {
    if (!app.current) { app.error = '请先粘贴并加载词表。'; return; }
    app.error = ''; app.notice = '';
    return player.start(app.queue, app.index, { ...app.prefs, autoAdvance: automatic && app.prefs.mode === 'listen' });
  };
  app.toggle = () => {
    if (app.playing) { app.pause(); app.notice = '已暂停，继续时从当前词重新播放。'; }
    else { if (app.finished) app.index = 0; return play(true); }
  };
  app.replay = () => play(app.playing);
  app.jump = (index) => {
    if (!app.items[index]) return;
    const automatic = app.playing;
    app.pause(); app.index = index; app.finished = false;
    return play(automatic);
  };
  app.move = (step) => { if (app.items[app.index + step]) return app.jump(app.index + step); };
  app.loadWords = () => {
    try {
      const parsed = parseWords(app.rawText);
      app.pause(); app.items = parsed.items; app.index = 0; app.finished = false; resetAnswer(); app.error = '';
      app.notice = `已加载 ${app.items.length} 个词条${parsed.chinese ? `，过滤 ${parsed.chinese} 个含中文词条` : ''}${parsed.duplicates ? `，去除 ${parsed.duplicates} 个重复词条` : ''}。`;
      return storage.save([...valueRecords('list', app.items), position()]);
    } catch (error) { app.error = error.message; return Promise.resolve(false); }
  };
  app.shuffle = () => {
    if (!app.items.length) return;
    app.pause(); app.items = shuffleWords(app.items); app.index = 0; app.finished = false; resetAnswer(); app.error = '';
    app.notice = '词表已乱序，播放位置已回到第一个词。';
    return storage.save([...valueRecords('list', app.items), position()]);
  };
  app.clear = () => {
    app.pause(); app.items = []; app.rawText = ''; app.index = 0; app.finished = false; app.prefs = wordPlayerPrefs(); resetAnswer(); app.error = ''; app.notice = '当前词表和播放设置已清空。';
    return storage.save(snapshot());
  };
  app.setMode = (mode) => { app.pause(); app.prefs.mode = mode; app.finished = false; resetAnswer(); return app.savePrefs(); };
  app.check = () => {
    if (!app.current) return;
    if (!app.answer.trim()) { app.feedback = { correct: false, message: '请先输入听到的单词。' }; return; }
    app.revealed = true;
    const correct = matchesAnswer(app.answer, app.current);
    app.feedback = { correct, message: correct ? '回答正确。' : '拼写有误，请查看上方答案。' };
  };
  app.reveal = () => { if (app.current) { app.revealed = true; app.feedback = null; } };
  const keydown = (event) => {
    if (event.target.closest('input, textarea, select, button, dialog, [contenteditable]')) return;
    if (event.code === 'Space') { event.preventDefault(); app.toggle(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); app.move(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); app.move(1); }
    else if (event.key.toLowerCase() === 'r') { event.preventDefault(); app.replay(); }
  };
  onMounted(async () => {
    const entries = await storage.load();
    const legacy = readLocalValue('ielts_listen_repeat');
    const savedItems = readValue(entries, 'list', null);
    const items = savedItems ?? legacy?.wordItems?.map((word) => word?.text).filter((text) => typeof text === 'string') ?? [];
    try { if (items.length) app.items = parseWords(items.join('\n')).items; } catch { app.error = '已保存词表没有可播放的英文，请重新加载词表。'; }
    app.prefs = wordPlayerPrefs(entries.get('prefs') || legacy || {});
    const saved = entries.get('position');
    app.index = Math.max(0, Math.min(app.items.length - 1, Number(saved?.index) || 0)); app.finished = saved?.finished === true;
    app.rawText = app.items.join('\n'); app.ready = true;
    if (app.items.length) app.notice = `已恢复 ${app.items.length} 个词条和播放设置。`;
    window.addEventListener('keydown', keydown);
  });
  onUnmounted(() => { player.stop(); window.removeEventListener('keydown', keydown); });
  return app;
}
