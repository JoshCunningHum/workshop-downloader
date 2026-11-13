<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

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
const { active } = ready.value ? useJobs() : { active: computed(() => []) }

const nav = computed<NavigationMenuItem[]>(() => [
  { label: 'Downloads', icon: 'i-lucide-download', to: '/', badge: active.value.length || undefined },
  { label: 'Add items', icon: 'i-lucide-plus', to: '/add' },
  { label: 'Games', icon: 'i-lucide-gamepad-2', to: '/apps' },
  { label: 'Adapters', icon: 'i-lucide-puzzle', to: '/adapters' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
])

if (ready.value) useUpdateChecker().startTimer()
</script>

<template>
  <UApp>
    <UDashboardGroup>
      <UDashboardSidebar>
        <template #header>
          <span class="truncate font-semibold">Workshop Downloader</span>
        </template>

        <UNavigationMenu
          :items="nav"
          orientation="vertical"
        />

        <template #footer>
          <UColorModeButton />
        </template>
      </UDashboardSidebar>

      <UDashboardPanel v-if="error">
        <template #body>
          <UAlert
            color="error"
            title="Database failed to open"
            :description="error"
          />
        </template>
      </UDashboardPanel>

      <NuxtPage v-else-if="ready" />
    </UDashboardGroup>
  </UApp>
</template>
