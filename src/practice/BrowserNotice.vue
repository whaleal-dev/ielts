<script setup>
import { onMounted, ref } from 'vue';
import Icon from '../Icon.vue';
import { claimChromeNotice } from './browser.js';

const dialog = ref(null);
onMounted(() => { if (claimChromeNotice()) dialog.value.showModal(); });
</script>

<template>
  <p class="browser-recommendation">建议使用 Google 浏览器＋VPN</p>
  <dialog ref="dialog" class="settings-dialog practice-dialog" aria-labelledby="chromeNoticeTitle">
    <div class="dialog-heading"><h2 id="chromeNoticeTitle">浏览器提示</h2><button class="icon-button" aria-label="关闭浏览器提示" @click="dialog.close()"><Icon name="close" /></button></div>
    <div class="dialog-body"><p class="practice-dialog-copy">请使用 Google 浏览器。</p></div>
    <div class="dialog-footer"><button class="primary-button" autofocus @click="dialog.close()">知道了</button></div>
  </dialog>
</template>

<style scoped>
.browser-recommendation { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.8; text-align: center; }
</style>
