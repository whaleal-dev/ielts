<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import Select from 'primevue/select';
const props = defineProps({ modelValue: { type: String, default: '' }, disabled: Boolean, id: { type: String, required: true }, preferGoogle: Boolean });
const emit = defineEmits(['update:modelValue', 'change']);
const voices = ref([]);
const options = computed(() => [
  { value: '', label: `默认英语语音 · ${props.preferGoogle ? 'Google 优先' : '英音优先'}` },
  ...voices.value.map((voice) => ({ value: voice.id, label: `${voice.name} · ${voice.lang}` })),
  ...(props.modelValue && !voices.value.some((voice) => voice.id === props.modelValue) ? [{ value: props.modelValue, label: '已选语音暂不可用 · 使用默认英语' }] : []),
]);
const preferredGoogle = computed(() => {
  if (!props.preferGoogle) return;
  const google = voices.value.filter((voice) => /google/i.test(voice.name));
  return google.find((voice) => /^en[-_]GB/i.test(voice.lang)) || google[0];
});
watch([() => props.modelValue, preferredGoogle], ([value, voice]) => {
  if (voice && !value) { emit('update:modelValue', voice.id); emit('change'); }
});
const load = () => { voices.value = (globalThis.speechSynthesis?.getVoices() || []).filter((voice) => /^en/i.test(voice.lang)).map((voice) => ({ id: voice.voiceURI || voice.name, name: voice.name, lang: voice.lang })); };
onMounted(() => { load(); globalThis.speechSynthesis?.addEventListener('voiceschanged', load); });
onUnmounted(() => globalThis.speechSynthesis?.removeEventListener('voiceschanged', load));
</script>

<template>
  <div class="practice-field"><label :for="id">英文发音人</label><Select :input-id="id" :model-value="options.find(option => option.value === modelValue)" :options="options" option-label="label" data-key="value" :disabled="disabled" filter filter-placeholder="搜索发音人或语言" reset-filter-on-hide checkmark aria-label="英文发音人" @update:model-value="emit('update:modelValue', $event.value)" @change="emit('change')" /></div>
</template>
