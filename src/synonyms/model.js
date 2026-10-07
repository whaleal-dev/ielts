export const hasChinese = (text) => /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/u.test(text);
export function parseGroups(text, filename) {
  let rows;
  if (/\.json$/i.test(filename)) {
    try { rows = JSON.parse(text); } catch { throw new Error('JSON 格式不正确。'); }
    if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row) || row.some((word) => typeof word !== 'string'))) throw new Error('JSON 词库需要是由字符串组成的二维数组。');
  } else if (/\.txt$/i.test(filename)) {
    rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.split(/[,，]/));
  } else { throw new Error('请上传 TXT 词库文件。'); }
  const groups = rows.map((row) => row.map((word) => word.trim()).filter(Boolean)).filter((group) => group.length);
  if (!groups.length) throw new Error('词库没有有效分组。');
  if (groups.some((group) => group.some((word) => word.length > 200))) throw new Error('单个词条不能超过 200 个字符，请检查词库格式。');
  return groups;
}

export function groupQueue(groups, loops = 1) {
  const items = [];
  for (const group of groups) {
    for (let cycle = 1; cycle <= loops; cycle += 1) {
      group.words.forEach((text, word) => { if (!hasChinese(text)) items.push({ text, group: group.index, word, cycle }); });
    }
  }
  return items;
}

export const synonymPrefs = (value = {}) => ({
  voice: typeof value.voice === 'string' ? value.voice : '',
  rate: Math.max(0.5, Math.min(2, Number(value.rate) || 1)),
  repeat: [1, 2, 3, 5, 10].includes(Number(value.repeat)) ? Number(value.repeat) : 2,
  groupLoops: [1, 2, 3, 5, 10].includes(Number(value.groupLoops)) ? Number(value.groupLoops) : 1,
  interval: Math.max(0, Math.min(5, Number(value.interval) || 0)),
  centerCurrent: value.centerCurrent === true,
});
