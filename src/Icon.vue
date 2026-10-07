<script setup>
defineProps({ name: { type: String, required: true }, size: { type: [String, Number], default: 20 } });
const paths = {
  book: ['M4 4h6c2 0 2 1 2 2v15c0-2-2-3-4-3H4z', 'M20 4h-6c-2 0-2 1-2 2v15c0-2 2-3 4-3h4z'],
  headphones: ['M4 14v-3a8 8 0 0 1 16 0v3', 'M4 12H3v7h4v-7zM20 12h1v7h-4v-7z'],
  pen: ['m4 16 12-12 4 4L8 20H4z', 'm13 7 4 4'],
  search: ['M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0', 'm15 15 5 5'],
  settings: ['M4 6h16M4 12h16M4 18h16', 'M8 3v6M16 9v6M10 15v6'],
  storage: ['M4 4h16v16H4z', 'M8 4v6h8V4M8 20v-6h8v6'],
  check: ['m5 12 4 4L19 6'],
  star: ['m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L3.2 9.7l6.4-.9z'],
  eye: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  volume: ['M4 9h4l5-4v14l-5-4H4z', 'M17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14'],
  left: ['m14 6-6 6 6 6'],
  right: ['m10 6 6 6-6 6'],
  play: ['m8 5 11 7-11 7z'],
  pause: ['M8 5v14M16 5v14'],
  grid: ['M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'],
  upload: ['M12 16V4m-5 5 5-5 5 5', 'M4 15v5h16v-5'],
  chart: ['M4 4v16h16M8 15v-4M13 15V6M18 15V9'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0', 'M12 7v5l3 2'],
  leaf: ['M19 4C9 3 4 7 5 14c5 6 14 0 14-10z', 'M4 21 16 9'],
  close: ['m6 6 12 12M6 18 18 6'],
  trash: ['M3 6h18M9 6V3h6v3', 'M5 6l1 15h12l1-15M10 10v7M14 10v7'],
  down: ['m6 9 6 6 6-6'],
  refresh: ['M20 11a8 8 0 1 0-2 7', 'M20 4v7h-7'],
  calendar: ['M4 5h16v15H4zM8 3v4M16 3v4M4 10h16'],
};
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(path, index) in paths[name] || paths.book" :key="index" :d="path" />
  </svg>
</template>
