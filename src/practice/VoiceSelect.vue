<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
const props = defineProps({ modelValue: { type: String, default: '' }, disabled: Boolean, id: { type: String, required: true }, preferGoogle: Boolean });
const emit = defineEmits(['update:modelValue', 'change']);
const voices = ref([]);
const preferredGoogle = computed(() => {
  if (!props.preferGoogle) return;
  const google = voices.value.filter((voice) => /google/i.test(voice.name));
  return google.find((voice) => /^en[-_]GB/i.test(voice.lang)) || google[0];
});
watch([() => props.modelValue, preferredGoogle], ([value, voice]) => {
  if (voice && (!value || !voices.value.some((entry) => entry.id === value))) { emit('update:modelValue', voice.id); emit('change'); }
});
const load = () => { voices.value = (globalThis.speechSynthesis?.getVoices() || []).filter((voice) => /^en/i.test(voice.lang)).map((voice) => ({ id: voice.voiceURI || voice.name, name: voice.name, lang: voice.lang })); };
onMounted(() => { load(); globalThis.speechSynthesis?.addEventListener('voiceschanged', load); });
onUnmounted(() => globalThis.speechSynthesis?.removeEventListener('voiceschanged', load));
</script>

<template>
  <label class="practice-field" :for="id">英文发音人<select :id="id" :value="modelValue" :disabled="disabled" @change="emit('update:modelValue', $event.target.value); emit('change')"><option value="">默认英语语音 · {{ preferGoogle ? 'Google 优先' : '英音优先' }}</option><option v-for="voice in voices" :key="voice.id" :value="voice.id">{{ voice.name }} · {{ voice.lang }}</option><option v-if="modelValue && !voices.some(voice => voice.id === modelValue)" :value="modelValue">已选语音暂不可用 · 使用默认英语</option></select></label>
</template>
