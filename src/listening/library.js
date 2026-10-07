import { buildLibrary } from './model.js';

const files = import.meta.glob('../generated/listening-chapter-*.json', { import: 'default' });
export const library = buildLibrary(Object.assign({}, ...await Promise.all(Object.values(files).map((load) => load()))));
