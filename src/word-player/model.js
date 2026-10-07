import { hasChinese } from '../synonyms/model.js';

export function parseWords(text) {
  const items = []; const seen = new Set();
  let chinese = 0; let duplicates = 0;
  for (const raw of text.split(/[,，\r\n]+/)) {
    const word = raw.trim();
    if (!word) continue;
    if (hasChinese(word)) { chinese += 1; continue; }
    if (word.length > 200) throw new Error('单个词条不能超过 200 个字符，请用逗号或换行分隔。');
    const key = word.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) { duplicates += 1; continue; }
    seen.add(key); items.push(word);
  }
  if (!items.length) throw new Error(chinese ? '全部词条都含中文，过滤后没有可播放的英文。' : '请输入有效的英文单词或词组。');
  return { items, chinese, duplicates };
}

export const wordPlayerPrefs = (value = {}) => ({
  voice: typeof (value.voice ?? value.selectedVoiceURI) === 'string' ? value.voice ?? value.selectedVoiceURI : '',
  rate: Math.max(0.5, Math.min(1.5, Number(value.rate ?? value.speechRate) || 1)),
  repeat: Math.max(1, Math.min(5, Math.floor(Number(value.repeat ?? value.repeatCount) || 1))),
  interval: Math.max(0.5, Math.min(5, Number(value.interval) || 1.5)),
  source: 'web',
  mode: value.mode === 'dictation' || value.dictationMode === true ? 'dictation' : 'listen',
});

export const matchesAnswer = (answer, expected) => answer.trim().toLowerCase().replace(/\s+/g, ' ') === expected.trim().toLowerCase().replace(/\s+/g, ' ');

export function shuffleWords(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
