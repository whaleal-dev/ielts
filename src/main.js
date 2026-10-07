import { createApp } from 'vue';
import './style.css';

const { default: App } = await (location.pathname.startsWith('/listening-word/')
  ? import('./listening/ListeningApp.vue')
  : location.pathname.startsWith('/synonyms/')
    ? import('./synonyms/SynonymsApp.vue')
    : location.pathname.startsWith('/word-player/')
      ? import('./word-player/WordPlayerApp.vue')
      : import('./App.vue'));
createApp(App).mount('#app');
