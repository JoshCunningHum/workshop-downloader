<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { ROUTES } from '~/constants/routes'

const { active } = useJobs()
const { apps, itemCounts, refreshCounts } = useAppSelection()
const route = useRoute()

// Item counts change with imports, downloads and removals; re-read them on each navigation.
watch(() => route.fullPath, () => {
  refreshCounts().catch(() => {})
}, { immediate: true })

// Open sections of the menu; Games starts open and opens again whenever it's clicked.
const openSections = ref<string[]>(['games'])
function openGames() {
  if (!openSections.value.includes('games')) openSections.value = [...openSections.value, 'games']
}

const nav = computed<NavigationMenuItem[]>(() => [
  { label: 'Downloads', icon: 'i-lucide-download', to: ROUTES.home, badge: active.value.length || undefined },
  {
    label: 'Games',
    icon: 'i-lucide-gamepad-2',
    value: 'games',
    // The label shows the game list in the content; the chevron only folds the section.
    to: ROUTES.games,
    exact: true,
    onSelect: openGames,
    // The game list scrolls on its own once there are many.
    ui: { childList: 'max-h-[40vh] overflow-y-auto' },
    children: apps.value.map(app => ({
      label: app.name ?? `App ${app.appId}`,
      to: ROUTES.game(app.appId),
      badge: itemCounts.value[app.appId] ?? ''
    }))
  },
  { label: 'Adapters', icon: 'i-lucide-puzzle', to: ROUTES.adapters },
  { label: 'Settings', icon: 'i-lucide-settings', to: ROUTES.settings }
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
        v-model="openSections"
        :items="nav"
        :collapsed="collapsed"
        orientation="vertical"
        tooltip
        popover
      />
    </template>

    <template #footer>
      <UColorModeButton />
    </template>
  </UDashboardSidebar>
</template>
