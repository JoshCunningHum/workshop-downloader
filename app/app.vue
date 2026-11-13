<script setup lang="ts">
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
</script>

<template>
  <UApp>
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
