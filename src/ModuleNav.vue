<script setup>
import Icon from './Icon.vue';
defineProps({ active: { type: String, required: true } });
const modules = [
  { id: 'words', label: '单词', icon: 'book', href: '/words/study_words.html' },
  { id: 'listening', label: '听力', icon: 'headphones', href: '/listening-word/王璐语料库_源码.html' },
  { id: 'synonyms', label: '同义词', icon: 'refresh', href: '/synonyms/index.html' },
  { id: 'word-player', label: '单词播放', icon: 'volume', href: '/word-player/index.html' },
];
</script>

<template>
  <nav class="module-nav" aria-label="网站导航"><a v-for="module in modules" :key="module.id" :href="module.href" :class="{ active: active === module.id }" :aria-current="active === module.id ? 'page' : undefined"><Icon :name="module.icon" :size="17" />{{ module.label }}</a></nav>
</template>
