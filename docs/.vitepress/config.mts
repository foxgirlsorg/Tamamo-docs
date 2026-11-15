import { defineConfig } from 'vitepress'

// Set DOCS_BASE (e.g. /tamamo-docs/) when the site is not served from the domain root.
const base = process.env.DOCS_BASE || '/'

export default defineConfig({
  base,
  lang: 'en-US',
  title: 'Tamamo',
  description: 'Keep bots off your website with a quick browser check.',
  appearance: 'force-dark',
  cleanUrls: true,
  lastUpdated: false,
  markdown: {
    // Inline code is shown as written; Vue must not read {{ }} inside it.
    config(md) {
      const render = md.renderer.rules.code_inline!
      md.renderer.rules.code_inline = (...args) => render(...args).replace('<code', '<code v-pre')
    },
  },
  head: [['link', { rel: 'icon', type: 'image/png', href: `${base}img/favicon.png` }]],

  themeConfig: {
    logo: '/img/logo.png',
    siteTitle: 'Tamamo',
    search: { provider: 'local' },
    outline: { level: [2, 3], label: 'On this page' },

    nav: [
      { text: 'Guide', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'Configuration', link: '/config/', activeMatch: '/config/' },
      { text: 'Guides', link: '/guides/reverse-proxy', activeMatch: '/guides/' },
      { text: 'Modules', link: '/modules/', activeMatch: '/modules/' },
      { text: 'Reference', link: '/reference/environment', activeMatch: '/reference/' },
      { text: 'Contributing', link: '/contributing' },
    ],

    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Installation', link: '/guide/installation' },
        ],
      },
      {
        text: 'Configuration',
        items: [
          { text: 'How settings work', link: '/config/' },
          { text: 'Server', link: '/config/server' },
          { text: 'Protection', link: '/config/protection' },
          { text: 'Webhooks', link: '/config/webhooks' },
          { text: 'Rules', link: '/config/rules' },
          { text: 'Sites', link: '/config/sites' },
          { text: 'Checking page', link: '/config/checking-page' },
          { text: 'Modules', link: '/config/modules' },
          { text: 'Web UI, login and statistics', link: '/config/admin' },
          { text: 'Full example', link: '/config/full-example' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Behind a reverse proxy', link: '/guides/reverse-proxy' },
          { text: 'nginx auth_request', link: '/guides/nginx-auth-request' },
          { text: 'Caddy and Traefik forward auth', link: '/guides/forward-auth' },
          { text: 'An API on another domain', link: '/guides/api-on-another-domain' },
          { text: 'Back up and upgrade', link: '/guides/backup-and-upgrade' },
        ],
      },
      {
        text: 'Writing modules',
        items: [
          { text: 'Overview', link: '/modules/' },
          { text: 'Write a module', link: '/modules/write' },
          { text: 'Build Tamamo with modules', link: '/modules/build' },
          { text: 'Hooks', link: '/modules/hooks' },
          { text: 'Settings', link: '/modules/settings' },
          { text: 'Module UI', link: '/modules/ui' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Environment variables', link: '/reference/environment' },
          { text: 'Command-line flags', link: '/reference/cli' },
          { text: 'Data folder', link: '/reference/files' },
          { text: 'HTTP endpoints', link: '/reference/endpoints' },
          { text: 'Troubleshooting', link: '/reference/troubleshooting' },
        ],
      },
      {
        text: 'Project',
        items: [{ text: 'Contributing', link: '/contributing' }],
      },
    ],

    docFooter: { prev: 'Previous', next: 'Next' },
    footer: { message: 'Released under the MIT License.' },
  },
})
