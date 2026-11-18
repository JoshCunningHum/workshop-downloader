<script setup lang="ts">
import * as steam from '~/lib/services/steam'
import { ROUTES } from '~/constants/routes'
import { workshopHome } from '~/lib/services/workshop-browser'

const { collapsed = false } = defineProps<{ collapsed?: boolean }>()

const { apps, index, current, refresh } = useAppSelection()
const catalog = useCatalog()
const toast = useToast()
const route = useRoute()

onMounted(refresh)

// Your games first, then the rest of the Steam app list (added as a game when picked).
const items = computed(() => {
  const owned = new Set(apps.value.map(a => a.appId))
  return [
    ...apps.value.map(app => ({ label: app.name ?? `App ${app.appId}`, value: app.appId, inLibrary: true })),
    ...index.value
      .filter(app => !owned.has(app.appId))
      .map(app => ({ label: app.name ?? `App ${app.appId}`, value: app.appId, inLibrary: false }))
  ]
})
const selected = computed(() => items.value.find(i => i.value === current.value) ?? null)

/** On the Workshop tab, picking a game opens its workshop instead of its game page. */
const onWorkshop = computed(() => route.path === ROUTES.workshop || route.path.startsWith(`${ROUTES.workshop}/`))

// Follow the game (or game workshop) page that is open.
watch(() => route.params.appId, (appId) => {
  const onGamePage = route.path.startsWith(`${ROUTES.games}/`) || route.path.startsWith(`${ROUTES.workshop}/`)
  if (onGamePage && appId) current.value = Number(appId)
}, { immediate: true })

// The Workshop browser is a native layer this dropdown can't draw over; move it aside meanwhile.
const workshop = useWorkshopBrowser()
const open = ref(false)
watch(open, isOpen => isOpen ? workshop.suspend() : workshop.resume())
onBeforeUnmount(() => {
  if (open.value) workshop.resume()
})

const search = ref('')
const searching = ref(false)

async function select(appId: number) {
  const item = items.value.find(i => i.value === appId)
  if (item && !item.inLibrary) {
    try {
      await catalog.ensureApp(appId, item.label)
      await refresh()
    } catch (e) {
      toast.add({ title: 'Could not add the game', description: e instanceof Error ? e.message : String(e), color: 'error' })
      return
    }
  }
  current.value = appId
  // Same game while browsing its workshop: back to its workshop home (the route doesn't change).
  if (route.path === ROUTES.workshopApp(appId)) return workshop.navigate(workshopHome(appId)).catch(() => {})
  return navigateTo(onWorkshop.value ? ROUTES.workshopApp(appId) : ROUTES.game(appId))
}

/**
 * "Create" from the search box: an AppID is looked up and added directly; a name is matched
 * against games installed in the local Steam libraries (there is no store-wide name search).
 */
async function onCreate(query: string) {
  query = query.trim()
  if (!query) return
  searching.value = true
  try {
    let appId: number | undefined
    let name: string | undefined
    if (/^\d+$/.test(query)) {
      appId = Number(query)
    } else {
      const needle = query.toLowerCase()
      const game = (await steam.installedGames()).find(g => g.name.toLowerCase().includes(needle))
      if (!game) {
        toast.add({ title: `No installed game matches "${query}"`, description: 'Enter its AppID instead.', color: 'warning' })
        return
      }
      appId = game.appId
      name = game.name
    }
    await catalog.ensureApp(appId, name)
    await refresh()
    search.value = ''
    await select(appId)
  } catch (e) {
    toast.add({ title: 'Could not add the game', description: e instanceof Error ? e.message : String(e), color: 'error' })
  } finally {
    searching.value = false
  }
}
</script>

<template>
  <div class="w-full space-y-2">
    <UTooltip
      :disabled="!collapsed || !selected"
      :content="{ side: 'right' }"
      :text="selected ? `${selected.label} (${selected.value})` : undefined"
    >
      <USelectMenu
        v-model:search-term="search"
        v-model:open="open"
        :model-value="current ?? undefined"
        :items="items"
        value-key="value"
        :loading="searching"
        :virtualize="{ estimateSize: 50 }"
        :search-input="{ icon: 'i-lucide-search', placeholder: 'Search or enter an AppID' }"
        :ui="{
          content: collapsed ? 'min-w-50' : 'min-w-fit',
          base: collapsed ? 'border-0 ring-0 p-0' : undefined
        }"
        :content="{
          align: collapsed ? 'start' : undefined,
          side: collapsed ? 'right' : undefined
        }"
        class="w-full"
        placeholder="Select game"
        create-item
        @update:model-value="(v: number | undefined) => v !== undefined && select(v)"
        @create="onCreate"
      >
        <template #default>
          <div
            v-if="!collapsed"
            class="w-full text-start"
          >
            <template v-if="selected">
              <div class="truncate">
                {{ selected.label }}
              </div>
              <div class="text-xs text-muted">
                {{ selected.value }}
              </div>
            </template>
            <span
              v-else
              class="text-dimmed"
            >Select game</span>
          </div>
          <UIcon
            v-else
            name="i-lucide-gamepad-2"
            class="size-5"
          />
        </template>

        <template #trailing>
          <UIcon
            :class="{ hidden: collapsed }"
            class="size-5 text-dimmed"
            name="i-lucide-chevron-down"
          />
        </template>

        <template #create-item-label="{ item }">
          <div class="flex text-dimmed">
            <div class="flex w-fit items-center gap-1">
              <UIcon name="i-simple-icons-steam" /> Add:
            </div>
            <div class="pl-2 text-success">
              {{ item }}
            </div>
          </div>
        </template>

        <template #item-description="{ item }">
          <span class="text-xs text-muted">{{ item.value }}</span>
        </template>

        <template #item-trailing="{ item }">
          <UIcon
            v-if="item.inLibrary"
            name="i-lucide-library"
            class="size-4 text-dimmed"
          />
        </template>

        <template #empty>
          <span class="text-xs text-dimmed">No games yet</span>
        </template>
      </USelectMenu>
    </UTooltip>
  </div>
</template>
