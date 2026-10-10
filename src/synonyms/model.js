export const hasChinese = (text) => /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/u.test(text);
export const MAX_GROUP_WORDS = 200;
export const MAX_LIBRARY_WORDS = 10000;
export const GROUP_PAGE_SIZE = 50;

export function validateGroups(groups) {
  let total = 0;
  for (const group of groups) {
    if (group.length > MAX_GROUP_WORDS) throw new Error('单组不能超过 200 个词条，请拆分为多行。');
    total += group.length;
    if (total > MAX_LIBRARY_WORDS) throw new Error('合并词库不能超过 10000 个词条，中文标签也计入总数。');
    if (group.some((word) => word.length > 200)) throw new Error('单个词条不能超过 200 个字符，请检查词库格式。');
  }
  return groups;
}

export function parseGroups(text, filename) {
  text = text.replace(/^\uFEFF/, '');
  let rows;
  if (/\.json$/i.test(filename)) {
    try { rows = JSON.parse(text); } catch { throw new Error('JSON 格式不正确。'); }
    if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.some((word) => typeof word !== 'string'))) throw new Error('JSON 词库需要是由字符串组成的二维数组。');
  } else if (/\.txt$/i.test(filename)) {
    rows = (function* () {
      for (const line of text.matchAll(/[^\r\n]+/g)) {
        yield (function* () { for (const word of line[0].matchAll(/[^,，]+/g)) yield word[0]; })();
      }
    })();
  } else { throw new Error('请上传 TXT 词库文件。'); }
  const groups = [];
  let total = 0;
  for (const row of rows) {
    const group = [];
    for (const raw of row) {
      const word = raw.trim();
      if (!word) continue;
      if (word.length > 200) throw new Error('单个词条不能超过 200 个字符，请检查词库格式。');
      group.push(word);
      if (group.length > MAX_GROUP_WORDS) throw new Error('单组不能超过 200 个词条，请拆分为多行。');
      if (++total > MAX_LIBRARY_WORDS) throw new Error('合并词库不能超过 10000 个词条，中文标签也计入总数。');
    }
    if (group.length) groups.push(group);
  }
  if (!groups.length) throw new Error('词库没有有效分组。');
  return groups;
}

export function groupQueue(groups, loops = 1) {
  const segments = [];
  let length = 0;
  for (const group of groups) {
    const items = group.words.flatMap((text, word) => hasChinese(text) ? [] : [{ text, group: group.index, word }]);
    if (!items.length) continue;
    segments.push({ start: length, items });
    length += items.length * loops;
  }
  return {
    length,
    at(index) {
      if (!Number.isInteger(index) || index < 0 || index >= length) return undefined;
      let left = 0, right = segments.length - 1;
      while (left < right) {
        const middle = Math.ceil((left + right) / 2);
        if (segments[middle].start <= index) left = middle; else right = middle - 1;
      }
      const { start, items } = segments[left], offset = index - start;
      return { ...items[offset % items.length], cycle: Math.floor(offset / items.length) + 1 };
    },
    position(group, word, cycle = 1) {
      for (const segment of segments) {
        if (segment.items[0].group !== group) continue;
        const offset = segment.items.findIndex((item) => item.word === word);
        return offset < 0 || cycle < 1 || cycle > loops ? -1 : segment.start + (cycle - 1) * segment.items.length + offset;
      }
      return -1;
    },
    *[Symbol.iterator]() { for (let index = 0; index < length; index++) yield this.at(index); },
  };
}

export const synonymPrefs = (value = {}) => ({
  voice: typeof value.voice === 'string' ? value.voice : '',
  rate: Math.max(0.5, Math.min(2, Number(value.rate) || 1)),
  repeat: [1, 2, 3, 5, 10].includes(Number(value.repeat)) ? Number(value.repeat) : 2,
  groupLoops: [1, 2, 3, 5, 10].includes(Number(value.groupLoops)) ? Number(value.groupLoops) : 1,
  interval: Math.max(0, Math.min(5, Number(value.interval) || 0)),
  centerCurrent: value.centerCurrent === true,
});
