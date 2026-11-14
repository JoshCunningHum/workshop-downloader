<script setup lang="ts">
import * as steam from '~/lib/services/steam'
import type { ItemDetails, Resolved } from '~/types/steam'

const catalog = useCatalog()
const jobsStore = useJobs()
const selection = useAppSelection()
const { settings } = useSettings()
const toast = useToast()
const route = useRoute()
const emit = defineEmits<{ queued: [] }>()

const input = ref('')
const resolving = ref(false)
const queuing = ref(false)
const resolved = ref<Resolved | null>(null)
const skipDownloaded = ref(true)
const latest = ref(new Map<string, number>())
const appNames = ref<Record<string, string>>({})
const excluded = ref(new Set<string>())

const ids = computed(() => parseWorkshopIds(input.value))
const invalid = computed(() => !!input.value.trim() && !ids.value.length)

const usable = computed(() => resolved.value?.items.filter(i => i.result === 1 && i.appId) ?? [])
const problems = computed(() => resolved.value?.items.filter(i => i.result !== 1 || !i.appId) ?? [])

// Items grouped by the AppID the Web API reports (consumer_app_id).
const groups = computed(() => {
  const map = new Map<number, ItemDetails[]>()
  for (const item of usable.value) {
    if (!map.has(item.appId)) map.set(item.appId, [])
    map.get(item.appId)!.push(item)
  }
  return [...map.entries()].map(([appId, items]) => ({ appId, items }))
})

const isCurrent = (item: ItemDetails) => (latest.value.get(item.id) ?? 0) >= item.timeUpdated
const willDownload = (item: ItemDetails) => !excluded.value.has(item.id) && !(skipDownloaded.value && isCurrent(item))
const downloadCount = (items: ItemDetails[]) => items.filter(item => willDownload(item)).length

/** Adds games seen for the first time so they show up in the sidebar selector. */
async function addNewApps(appIds: number[]) {
  const known = new Set(selection.apps.value.map(a => a.appId))
  const fresh = appIds.filter(id => !known.has(id))
  if (!fresh.length) return
  for (const appId of fresh) await catalog.ensureApp(appId, appNames.value[appId])
  await selection.refresh()
  // On a game page the sidebar stays on that game.
  if (fresh.length === 1 && !route.params.appId) selection.current.value = fresh[0]!
}

async function resolve() {
  if (!ids.value.length) return
  resolving.value = true
  resolved.value = null
  excluded.value = new Set()
  try {
    const result = await steam.resolve(ids.value)
    resolved.value = result
    latest.value = await catalog.latestSnapshotTimes(result.items.map(i => i.id))
    appNames.value = await steam.appNames(groups.value.map(g => g.appId)).catch(() => ({}))
    await addNewApps(groups.value.map(g => g.appId))
  } catch (e) {
    toast.add({ title: 'Could not resolve items', description: e instanceof Error ? e.message : String(e), color: 'error' })
  } finally {
    resolving.value = false
  }
}

function toggle(id: string, on: boolean | 'indeterminate') {
  const next = new Set(excluded.value)
  if (on) next.delete(id)
  else next.add(id)
  excluded.value = next
}

async function queue(appIds: number[]) {
  queuing.value = true
  try {
    let count = 0
    for (const appId of appIds) {
      const items = groups.value.find(g => g.appId === appId)?.items ?? []
      await catalog.ensureApp(appId, appNames.value[appId])
      await catalog.upsertItems(items)
      const chosen = items.filter(item => willDownload(item)).map(i => i.id)
      if (chosen.length) {
        await jobsStore.enqueue(appId, chosen)
        count += chosen.length
      }
    }
    toast.add({ title: count ? `Queued ${count} item(s)` : 'Saved; nothing new to download', color: 'success' })
    if (count) clear()
    emit('queued')
  } catch (e) {
    toast.add({ title: 'Could not queue downloads', description: e instanceof Error ? e.message : String(e), color: 'error' })
  } finally {
    queuing.value = false
  }
}

function clear() {
  input.value = ''
  resolved.value = null
}

// Editing the input invalidates an earlier result.
watch(input, () => {
  resolved.value = null
})
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-start gap-2">
      <WorkshopLinkInput
        v-model="input"
        class="flex-1"
        @submit="resolve"
      />
      <UButton
        icon="i-lucide-search"
        :label="`Resolve${ids.length ? ` ${ids.length}` : ''}`"
        :loading="resolving"
        :disabled="!ids.length"
        @click="resolve"
      />
    </div>

    <UAlert
      v-if="invalid"
      color="warning"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="No workshop ids found"
      description="Paste workshop item or collection ids, steamcommunity.com links, or steam:// links."
    />

    <UAlert
      v-if="!settings.libraryPath"
      color="warning"
      variant="subtle"
      title="No library folder yet"
      description="Choose where snapshots are stored before downloading."
      :actions="[{ label: 'Open settings', to: '/settings' }]"
    />

    <template v-if="resolved">
      <div class="flex flex-wrap items-center gap-3">
        <USwitch
          v-model="skipDownloaded"
          label="Skip items whose latest revision is already downloaded"
        />
        <span
          v-if="resolved.collections.length"
          class="text-sm text-muted"
        >
          Expanded {{ resolved.collections.length }} collection(s).
        </span>
      </div>

      <UCard
        v-for="group in groups"
        :key="group.appId"
      >
        <template #header>
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ appNames[group.appId] ?? `App ${group.appId}` }}</span>
            <UBadge
              color="neutral"
              variant="subtle"
            >
              AppID {{ group.appId }}
            </UBadge>
            <UButton
              class="ms-auto"
              size="sm"
              icon="i-lucide-download"
              :label="`Download ${downloadCount(group.items)}`"
              :loading="queuing"
              :disabled="!settings.libraryPath"
              @click="queue([group.appId])"
            />
          </div>
        </template>
        <ul class="divide-y divide-default">
          <li
            v-for="item in group.items"
            :key="item.id"
            class="flex items-center gap-3 py-2"
          >
            <UCheckbox
              :model-value="!excluded.has(item.id)"
              @update:model-value="toggle(item.id, $event)"
            />
            <WorkshopItemTooltip
              :item-id="item.id"
              :details="item"
              class="flex flex-1 items-center gap-3"
            >
              <WorkshopItemThumbnail
                :src="item.previewUrl"
                :placeholder="false"
                class="size-10 rounded"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate">
                  {{ item.title || item.id }}
                </p>
                <p class="text-xs text-muted">
                  {{ formatBytes(item.fileSize) }} · updated {{ formatTime(item.timeUpdated) }}
                </p>
              </div>
            </WorkshopItemTooltip>
            <UBadge
              v-if="isCurrent(item)"
              color="success"
              variant="subtle"
            >
              downloaded
            </UBadge>
            <UBadge
              v-else-if="latest.has(item.id)"
              color="warning"
              variant="subtle"
            >
              update
            </UBadge>
          </li>
        </ul>
      </UCard>

      <div
        v-if="groups.length > 1"
        class="flex justify-end"
      >
        <UButton
          icon="i-lucide-download"
          label="Download all groups"
          :loading="queuing"
          :disabled="!settings.libraryPath"
          @click="queue(groups.map(g => g.appId))"
        />
      </div>

      <UAlert
        v-if="problems.length"
        color="warning"
        variant="subtle"
        title="Not downloadable"
      >
        <template #description>
          <ul>
            <li
              v-for="item in problems"
              :key="item.id"
            >
              {{ item.id }}: {{ item.result === 9 ? 'not found (removed or private)' : `Steam result ${item.result}` }}
            </li>
          </ul>
        </template>
      </UAlert>
    </template>
  </section>
</template>
