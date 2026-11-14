import { defineConfig } from 'vitepress';
import { catalogue, ROOT, SITE } from '../scripts/catalogue.mjs';

const books = catalogue();

export default defineConfig({
  title: 'TEC-OS',
  description: 'Books and reference material for TEC-OS and the Thorium tools on the TEC-1G.',
  lang: 'en-AU',
  srcDir: 'content',
  base: '/',
  cleanUrls: false,
  appearance: false,
  lastUpdated: false,
  ignoreDeadLinks: false,
  sitemap: { hostname: SITE },
  vite: { publicDir: ROOT + '/public' },
  markdown: {
    languageAlias: { z80: 'asm' },
    theme: 'github-light'
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#236c4a' }],
    ['meta', { property: 'og:site_name', content: 'TEC-OS' }],
    ['meta', { property: 'og:type', content: 'website' }]
  ],
  themeConfig: {
    siteTitle: 'TEC-OS',
    nav: [{ text: 'Library', link: '/' }, ...books.map(book => ({ text: book.label, link: book.link })), { text: 'Thorium', link: '/thorium/' }],
    sidebar: Object.fromEntries(books.map(book => [book.link, book.sidebar])),
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/jhlagado/tec-os' }],
    outline: { level: [2, 3] },
    footer: { message: 'TEC-OS and Thorium documentation' }
  },
  transformPageData(pageData) {
    if (['default', 'home'].includes(pageData.frontmatter.layout)) delete pageData.frontmatter.layout;
    const path = pageData.relativePath.replace(/index\.md$/, '').replace(/\.md$/, '.html');
    pageData.frontmatter.head = [
      ...(pageData.frontmatter.head ?? []),
      ['link', { rel: 'canonical', href: SITE + '/' + path }],
      ['meta', { property: 'og:url', content: SITE + '/' + path }]
    ];
  }
});
