<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 24 });
</script>

<template>
  <svg class="mark" :width="size" :height="size" viewBox="0 0 32 32" fill="none" role="img" aria-label="TEC-OS">
    <rect x="3" y="5" width="26" height="22" rx="1" stroke="currentColor" stroke-width="2" />
    <path class="mark__accent" d="m9 12 5 4-5 4m9 0h5" stroke-width="2" stroke-linecap="square" />
  </svg>
</template>
