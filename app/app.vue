<script setup lang="ts">
import { ROUTES } from '~/constants/routes'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  },
  title: 'Workshop Downloader'
})

const { ready, error } = useDb()

if (ready.value) useUpdateChecker().startTimer()

// The Workshop browser is a native webview that toasts can't draw over; its toolbar shows them.
const route = useRoute()
const toaster = computed(() => route.path.startsWith(`${ROUTES.workshop}/`) ? null : undefined)
</script>

<template>
  <UApp :toaster="toaster">
    <UMain
      v-if="error"
      class="flex items-center justify-center p-8"
    >
      <UAlert
        class="max-w-xl"
        color="error"
        title="Database failed to open"
        :description="error"
      />
    </UMain>

    <NuxtLayout v-else-if="ready">
      <NuxtPage />
    </NuxtLayout>

    <NuxtLoadingIndicator color="var(--ui-primary)" />
  </UApp>
</template>
