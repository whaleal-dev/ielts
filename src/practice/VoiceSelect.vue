<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
defineProps({ modelValue: { type: String, default: '' }, disabled: Boolean, id: { type: String, required: true } });
const emit = defineEmits(['update:modelValue', 'change']);
const voices = ref([]);
const load = () => { voices.value = (globalThis.speechSynthesis?.getVoices() || []).filter((voice) => /^en/i.test(voice.lang)).map((voice) => ({ id: voice.voiceURI || voice.name, name: voice.name, lang: voice.lang })); };
onMounted(() => { load(); globalThis.speechSynthesis?.addEventListener('voiceschanged', load); });
onUnmounted(() => globalThis.speechSynthesis?.removeEventListener('voiceschanged', load));
</script>

<template>
  <label class="practice-field" :for="id">英文发音人<select :id="id" :value="modelValue" :disabled="disabled" @change="emit('update:modelValue', $event.target.value); emit('change')"><option value="">默认英语语音 · 英音优先</option><option v-for="voice in voices" :key="voice.id" :value="voice.id">{{ voice.name }} · {{ voice.lang }}</option><option v-if="modelValue && !voices.some(voice => voice.id === modelValue)" :value="modelValue">已选语音暂不可用 · 使用默认英语</option></select></label>
</template>
