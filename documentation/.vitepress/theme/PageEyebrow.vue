<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

// The eyebrow is the running identification line at the top of every
// chapter, the way a printed manual repeats its section and folio. Both
// halves come from the Jekyll front matter the sidebar generator already
// relies on: `parent` names the volume, `nav_order` gives the folio.
const { frontmatter, page } = useData();

const volume = computed(() => String(frontmatter.value.parent ?? '').trim());

const folio = computed(() => {
  const order = Number(frontmatter.value.nav_order);
  if (!Number.isFinite(order) || order <= 0) return '';
  return String(order).padStart(2, '0');
});

// Appendices and index pages have no folio, so they get the volume alone
// rather than a dangling separator.
const show = computed(() => volume.value !== '' && !page.value.frontmatter.layout?.includes('home'));
</script>

<template>
  <p v-if="show" class="page-eyebrow" :data-folio="folio">
    <span class="page-eyebrow__volume">{{ volume }}</span>
    <span v-if="folio" class="page-eyebrow__folio">{{ folio }}</span>
  </p>
</template>
