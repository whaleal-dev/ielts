const chapterFiles = import.meta.glob('./generated/chapter-*.json', { import: 'default' });
const groupFiles = Object.assign({}, ...await Promise.all(Object.values(chapterFiles).map((load) => load())));
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

export const sources = [
  { id: 'all', title: '雅思主题词汇', description: '按主题循序学习', words },
];

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
