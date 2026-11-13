<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { active } = useJobs()

const nav = computed<NavigationMenuItem[]>(() => [
  { label: 'Downloads', icon: 'i-lucide-download', to: '/', badge: active.value.length || undefined },
  { label: 'Games', icon: 'i-lucide-gamepad-2', to: '/apps' },
  { label: 'Adapters', icon: 'i-lucide-puzzle', to: '/adapters' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
])
</script>

<template>
  <UDashboardSidebar
    :ui="{ header: 'h-fit py-4' }"
    collapsible
    resizable
  >
    <template #header="{ collapsed }">
      <SidebarAppSelect :collapsed="collapsed" />
    </template>

    <template #default="{ collapsed }">
      <UNavigationMenu
        :items="nav"
        :collapsed="collapsed"
        orientation="vertical"
        tooltip
      />
    </template>

    <template #footer>
      <UColorModeButton />
    </template>
  </UDashboardSidebar>
</template>
