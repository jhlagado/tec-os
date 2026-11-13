import { defineComponent, h, onMounted } from 'vue';
import DefaultTheme from 'vitepress/theme';
import { onContentUpdated } from 'vitepress';
import { enhancePage } from './page-enhancements.js';
import PageEyebrow from './PageEyebrow.vue';
import Mark from './Mark.vue';
import BookShelf from './BookShelf.vue';
import './custom.css';

const Layout = defineComponent({
  name: 'DocumentationLayout',
  setup() {
    onMounted(enhancePage);
    onContentUpdated(enhancePage);
    return () => h(DefaultTheme.Layout, null, {
      'doc-before': () => h(PageEyebrow),
      'nav-bar-title-before': () => h(Mark, { size: 20 })
    });
  }
});

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('Mark', Mark);
    app.component('BookShelf', BookShelf);
  }
};
