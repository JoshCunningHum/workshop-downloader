// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@formkit/auto-animate/nuxt'
  ],

  // Tauri serves a static SPA; there is no Nuxt server at runtime.
  ssr: false,

  // Composables live in feature folders (composables/<feature>/use-*.ts); auto-import them all.
  imports: {
    dirs: ['composables/**']
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  ignore: ['**/src-tauri/**', '**/crates/**'],

  devServer: {
    host: process.env.TAURI_DEV_HOST
  },

  compatibilityDate: '2026-06-30',

  vite: {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_'],
    server: {
      strictPort: true
    },
    optimizeDeps: {
      include: [
        '@tauri-apps/api/core',
        '@tauri-apps/api/event',
        '@tauri-apps/api/path',
        '@tauri-apps/plugin-clipboard-manager',
        '@tauri-apps/plugin-dialog',
        '@tauri-apps/plugin-opener',
        '@tauri-apps/plugin-sql',
        '@vue/devtools-core',
        'drizzle-orm',
        'drizzle-orm/sqlite-core',
        'drizzle-orm/sqlite-proxy'
      ]
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
