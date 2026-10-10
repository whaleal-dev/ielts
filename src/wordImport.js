export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_WORDS = 5000;
export const normalizeTerm = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’‘ʼ]/g, "'");
export const templates = [
  { filename: 'word-library.csv', title: 'CSV 表格', content: '单词,释义,音标,分组\nenvironment,n. 环境,/ɪnˈvaɪrənmənt/,环境\nsustainable,adj. 可持续的,/səˈsteɪnəbl/,环境\ntake part in,参加,,常用词组\n' },
  { filename: 'word-library.txt', title: 'TXT 文本', content: 'environment | n. 环境 | /ɪnˈvaɪrənmənt/ | 环境\nsustainable | adj. 可持续的 | /səˈsteɪnəbl/ | 环境\ntake part in | 参加 | | 常用词组\n' },
];

export class WordImportError extends Error {
  constructor(errors) {
    super(errors.map(({ line, field, reason }) => `${line ? `第 ${line} 行 · ` : ''}${field}：${reason}`).join('\n'));
    this.errors = errors;
  }
}
const fail = (line, field, reason) => { throw new WordImportError([{ line, field, reason }]); };

export function validateWordFile(name, size) {
  if (!/\.(csv|txt)$/i.test(name)) fail(0, '文件格式', '请选择 .csv 或 .txt 文件。');
  if (size > MAX_FILE_BYTES) fail(0, '文件大小', '单个文件不能超过 2 MB。');
}

function csvRows(text) {
  const rows = [];
  let fields = [], value = '', quoted = false, closed = false, hadQuote = false, line = 1, start = 1;
  const field = () => { fields.push(value.trim()); value = ''; closed = false; };
  const row = () => {
    field();
    if (hadQuote || fields.length > 1 || fields[0]) rows.push({ fields, line: start });
    fields = []; hadQuote = false; start = line + 1;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { value += '"'; index += 1; }
        else { quoted = false; closed = true; }
      } else { value += char; if (char === '\n') line += 1; }
    } else if (char === ',') field();
    else if (char === '\n') { row(); line += 1; }
    else if (char === '"') {
      if (closed || value.trim()) fail(start, 'CSV 格式', '双引号只能包裹完整字段，字段内双引号请写成两个双引号。');
      value = ''; quoted = true; hadQuote = true;
    } else {
      if (closed && !/\s/.test(char)) fail(start, 'CSV 格式', '引号字段结束后只能接逗号或换行。');
      if (!closed) value += char;
    }
  }
  if (quoted) fail(start, 'CSV 格式', '双引号未闭合。');
  row();
  return rows;
}

export function parseWordText(raw, filename) {
  validateWordFile(filename, new TextEncoder().encode(raw).byteLength);
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let rows, columns = ['单词', '释义', '音标', '分组'];
  if (/\.csv$/i.test(filename)) {
    rows = csvRows(text);
    const header = rows.shift();
    if (!header) fail(0, '文件内容', '文件为空，请添加词条。');
    columns = header.fields;
    if (new Set(columns).size !== columns.length) fail(header.line, '表头', '表头不能重复。');
    if (columns.some((column) => !['单词', '释义', '音标', '分组'].includes(column))) fail(header.line, '表头', '只支持单词、释义、音标、分组。');
    if (!columns.includes('单词') || !columns.includes('释义')) fail(header.line, '表头', '必须包含「单词」「释义」。');
  } else {
    rows = text.split('\n').map((line, index) => ({ fields: line.split('|').map((value) => value.trim()), line: index + 1 })).filter((row) => row.fields.length > 1 || row.fields[0]);
  }
  const errors = [], entries = [];
  for (const row of rows) {
    const csv = /\.csv$/i.test(filename);
    if (csv ? row.fields.length !== columns.length : row.fields.length < 2 || row.fields.length > 4) {
      errors.push({ line: row.line, field: '字段数量', reason: csv ? `需要 ${columns.length} 列，实际 ${row.fields.length} 列。` : '每行需要 2～4 个字段，使用半角竖线分隔。' });
      continue;
    }
    const values = Object.fromEntries(columns.map((column, index) => [column, row.fields[index] || '']));
    if (!values['单词'] || /\p{Script=Han}/u.test(values['单词']) || !/[a-z0-9]/i.test(values['单词']) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(values['单词'])) errors.push({ line: row.line, field: '单词', reason: '请填写英文单词或完整词组，不能留空或夹杂中文。' });
    if (!values['释义']) errors.push({ line: row.line, field: '释义', reason: '释义不能为空。' });
    entries.push({ word: values['单词'], meaning: values['释义'], phonetic: values['音标'] || '', group: values['分组'] || '', line: row.line });
  }
  if (errors.length) throw new WordImportError(errors);
  const named = entries.some((entry) => entry.group);
  const unique = [], seen = new Set();
  for (const entry of entries) {
    const key = JSON.stringify([named ? entry.group || '未分组' : '', normalizeTerm(entry.word), entry.meaning, entry.phonetic]);
    if (!seen.has(key)) { seen.add(key); unique.push(entry); }
  }
  if (!unique.length) fail(0, '文件内容', '没有有效词条，请添加单词和释义。');
  if (unique.length > MAX_WORDS) fail(0, '词条数量', '去重后每个词库最多 5000 个词条。');
  const groups = new Map();
  unique.forEach((entry, index) => {
    const title = named ? entry.group || '未分组' : `第 ${Math.floor(index / 50) + 1} 组`;
    if (!groups.has(title)) groups.set(title, { title, words: [] });
    groups.get(title).words.push({ ...entry, group: title });
  });
  return { groups: [...groups.values()], words: unique, count: unique.length, duplicates: entries.length - unique.length };
}

export function parseWordBytes(bytes, filename) {
  validateWordFile(filename, bytes.byteLength);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { fail(0, '文件编码', '不是有效的 UTF-8，请重新以 UTF-8 保存。'); }
  return parseWordText(text, filename);
}
