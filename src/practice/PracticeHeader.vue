<script setup>
import { computed } from 'vue';
import Icon from '../Icon.vue';
import ModuleNav from '../ModuleNav.vue';
import HeaderTools from '../HeaderTools.vue';
const props = defineProps({ module: { type: String, required: true }, storage: { type: Object, required: true } });
const label = computed(() => props.storage.state === 'error' ? '尚未保存' : props.storage.state === 'loading' ? '正在读取' : props.storage.state === 'saving' ? '正在保存' : '本地已保存');
</script>

<template>
  <header class="site-header"><div class="header-inner">
    <a class="brand" href="/words/study_words.html" aria-label="IELTS Studio，返回单词学习"><span class="brand-symbol"><Icon name="book" :size="22" /></span><span class="brand-name">IELTS<span>Studio</span></span></a>
    <ModuleNav :active="module" />
    <HeaderTools><span class="save-indicator" :class="{ error: storage.state === 'error', fallback: storage.mode === 'localStorage' }" role="status"><span class="status-dot"></span>{{ label }}</span></HeaderTools>
  </div></header>
</template>
