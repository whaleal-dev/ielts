import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  base: '/',
  publicDir: false,
  build: {
    emptyOutDir: false,
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        words: fileURLToPath(new URL('./words/study_words.html', import.meta.url)),
        listening: fileURLToPath(new URL('./listening-word/王璐语料库_源码.html', import.meta.url)),
        synonyms: fileURLToPath(new URL('./synonyms/index.html', import.meta.url)),
        wordPlayer: fileURLToPath(new URL('./word-player/index.html', import.meta.url)),
      },
    },
  },
});
