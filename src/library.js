const chapterFiles = import.meta.glob('./generated/chapter-*.json', { import: 'default' });
const groupFiles = Object.assign({}, ...await Promise.all(Object.values(chapterFiles).map((load) => load())));
const vocabularyFiles = import.meta.glob('../words/data/source/vocabulary/*.json', {
  eager: true, import: 'default',
});
const synonymFiles = import.meta.glob('../words/data/source/synonyms/同义词*.json', {
  eager: true, import: 'default',
});

export const normalizeTerm = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’‘]/g, "'");
const groupNames = ['第一组', '第二组', '第三组', '第四组', '第五组', '第六组', '第七组', '第八组', '第九组'];

export const chapters = [];
for (const [path, data] of Object.entries(groupFiles)) {
  const number = Number(data.chapter.match(/Chapter\s+(\d+)/)?.[1]);
  let chapter = chapters.find((entry) => entry.number === number);
  if (!chapter) {
    chapter = { number, title: data.chapter.replace(/^Chapter\s+\d+\s*/, ''), groups: [] };
    chapters.push(chapter);
  }
  const id = `output_word_groups/${path.split('/').at(-1)}`;
  chapter.groups.push({
    id, title: data.group, number: groupNames.indexOf(data.group) + 1, chapter: number,
    words: data.words.map((word, index) => ({
      key: `${id}::${word.id || index}::${word.word}`,
      id: String(word.id || ''), word: word.word, phonetic: word.eng_phonetic || '',
      meaning: word.meaning || '', chapter: number, chapterTitle: chapter.title,
      groupId: id, groupTitle: data.group, wordIndex: index,
      audio: word.id ? `/words/assets/audio/eng/${encodeURIComponent(word.id)}.mp3` : '',
    })),
  });
}
chapters.sort((a, b) => a.number - b.number);
chapters.forEach((chapter) => chapter.groups.sort((a, b) => a.number - b.number));
export const groups = chapters.flatMap((chapter) => chapter.groups);
export const words = groups.flatMap((group) => group.words);
export const wordByKey = new Map(words.map((word) => [word.key, word]));
export const wordIndex = new Map(words.map((word, index) => [word.key, index]));

const sourceTerms = (filename) => new Set(Object.entries(vocabularyFiles)
  .filter(([path]) => path.split('/').at(-1).includes(filename))
  .flatMap(([, entries]) => entries).map(normalizeTerm));
export const sources = [
  { id: 'all', title: '雅思主题词汇', description: '按主题循序学习', terms: null },
  { id: 'core', title: '核心词汇', description: '主词库中的核心词汇', terms: sourceTerms('核心词汇') },
  { id: 'reading', title: '阅读考点词', description: '主词库中匹配阅读考点的词汇', terms: sourceTerms('阅读538') },
  { id: 'listening', title: '听力考点词', description: '主词库中匹配听力考点的词汇', terms: sourceTerms('听力179') },
];
sources.forEach((source) => {
  source.words = source.terms ? words.filter((word) => source.terms.has(normalizeTerm(word.word))) : words;
});

const synonyms = new Map();
for (const entries of Object.values(synonymFiles)) {
  for (const entry of entries) {
    const terms = Array.isArray(entry) ? entry : (entry?.terms || entry?.words || []);
    if (!Array.isArray(terms)) continue;
    for (const term of terms) {
      const key = normalizeTerm(term);
      if (!key) continue;
      if (!synonyms.has(key)) synonyms.set(key, new Set());
      terms.forEach((related) => {
        if (normalizeTerm(related) !== key) synonyms.get(key).add(String(related));
      });
    }
  }
}
export const relatedTerms = (word) => [...(synonyms.get(normalizeTerm(word?.word)) || [])].slice(0, 8);
export const sourceLabels = (word) => sources.filter((source) => source.terms?.has(normalizeTerm(word?.word))).map((source) => source.title);
