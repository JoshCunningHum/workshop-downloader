<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const CATEGORIES = [
  { id: 'library', label: 'Library & downloads', icon: 'i-lucide-download' },
  { id: 'steam', label: 'Steam', icon: 'i-simple-icons-steam' },
  { id: 'accounts', label: 'Steam accounts', icon: 'i-lucide-users' },
  { id: 'steamcmd', label: 'SteamCMD', icon: 'i-lucide-terminal' },
  { id: 'diagnostics', label: 'Diagnostics', icon: 'i-lucide-activity' }
] as const
type Category = typeof CATEGORIES[number]['id']

const route = useRoute()
const router = useRouter()

// ?category= opens a category directly, and follows the selection.
function categoryFrom(value: unknown): Category {
  return CATEGORIES.find(c => c.id === value)?.id ?? 'library'
}

const selected = ref<Category>(categoryFrom(route.query.category))

watch(() => route.query.category, (value) => {
  selected.value = categoryFrom(value)
})

const items = computed<NavigationMenuItem[]>(() => CATEGORIES.map(category => ({
  label: category.label,
  icon: category.icon,
  active: category.id === selected.value,
  onSelect: () => {
    selected.value = category.id
    void router.replace({ query: { ...route.query, category: category.id } })
  }
})))

const active = computed(() => CATEGORIES.find(c => c.id === selected.value))
</script>

<template>
  <UDashboardPanel
    id="settings"
    :ui="{ body: 'p-0 sm:p-0 flex-row gap-0 sm:gap-0' }"
  >
    <template #body>
      <aside class="flex w-56 shrink-0 flex-col border-r border-default p-2">
        <UNavigationMenu
          :items="items"
          orientation="vertical"
        />
      </aside>

      <div class="min-w-0 flex-1 overflow-y-auto">
        <div class="mx-auto max-w-4xl p-6">
          <h2 class="text-lg font-semibold text-highlighted">
            {{ active?.label }}
          </h2>

          <SettingsLibrary
            v-if="selected === 'library'"
            class="mt-2"
          />
          <SettingsSteam
            v-else-if="selected === 'steam'"
            class="mt-2"
          />
          <SettingsAccounts
            v-else-if="selected === 'accounts'"
            class="mt-2"
          />
          <SettingsSteamCmd
            v-else-if="selected === 'steamcmd'"
            class="mt-2"
          />
          <SettingsDiagnostics
            v-else
            class="mt-2"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
