import { createApp } from 'vue';
import './style.css';

const { default: App } = await (location.pathname.startsWith('/listening-word/')
  ? import('./listening/ListeningApp.vue')
  : import('./App.vue'));
createApp(App).mount('#app');
