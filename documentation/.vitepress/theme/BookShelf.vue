<script setup lang="ts">
import books from '../../books.json';
import Mark from './Mark.vue';
</script>

<template>
  <nav class="library-shelf" aria-label="Books">
    <a v-for="book in books" :key="book.id" :class="['volume', 'volume--' + book.accent]" :href="'/' + book.id + '/'">
      <span class="volume__tag">Book · TEC-1G</span>
      <span class="volume__head"><Mark :size="26" /><span class="volume__title">{{ book.title }}</span></span>
      <span class="volume__desc">{{ book.description }}</span>
      <span class="volume__enter">Read the book →</span>
    </a>
  </nav>
</template>
