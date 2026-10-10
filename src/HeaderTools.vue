<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({ now: { type: Number, default: undefined } });
const currentTime = ref(Date.now());
const displayTime = computed(() => props.now ?? currentTime.value);
const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' }).format(displayTime.value));
let timer;
onMounted(() => { if (props.now === undefined) timer = setInterval(() => { currentTime.value = Date.now(); }, 60000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="header-tools">
    <slot />
    <div class="header-utilities">
      <button class="icon-button header-settings" type="button" aria-label="设置" title="设置（暂未开放）" disabled><Icon name="settings" :size="18" /></button>
      <time class="header-date" :datetime="new Date(displayTime).toISOString()"><Icon name="calendar" :size="16" /><span>{{ dateLabel }}</span></time>
    </div>
  </div>
</template>
