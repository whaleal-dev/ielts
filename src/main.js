import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import { selectionUi } from './ui/theme.js';
import './style.css';
import './ui/style.css';

const { default: App } = await (location.pathname.startsWith('/listening-word/')
  ? import('./listening/ListeningApp.vue')
  : location.pathname.startsWith('/synonyms/')
    ? import('./synonyms/SynonymsApp.vue')
    : location.pathname.startsWith('/word-player/')
      ? import('./word-player/WordPlayerApp.vue')
      : import('./App.vue'));
createApp(App).use(PrimeVue, selectionUi).mount('#app');
