<script setup lang="ts">
import type { ItemDetails, Resolved } from '~/composables/useSteamApi'

const steam = useSteamApi()
const catalog = useCatalog()
const jobsStore = useJobs()
const { settings } = useSettings()
const toast = useToast()

const input = ref('')
const resolving = ref(false)
const queuing = ref(false)
const resolved = ref<Resolved | null>(null)
const skipDownloaded = ref(true)
const latest = ref(new Map<string, number>())
const appNames = ref<Record<string, string>>({})
const excluded = ref(new Set<string>())

const ids = computed(() => parseWorkshopIds(input.value))

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

async function resolve() {
  resolving.value = true
  resolved.value = null
  excluded.value = new Set()
  try {
    const result = await steam.resolve(ids.value)
    resolved.value = result
    latest.value = await catalog.latestSnapshotTimes(result.items.map(i => i.id))
    const appIds = [...new Set(result.items.map(i => i.appId).filter(Boolean))]
    appNames.value = await steam.appNames(appIds).catch(() => ({}))
  } catch (e) {
    toast.add({ title: 'Could not resolve items', description: String(e), color: 'error' })
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
      const chosen = items.filter(willDownload).map(i => i.id)
      if (chosen.length) {
        await jobsStore.enqueue(appId, chosen)
        count += chosen.length
      }
    }
    toast.add({ title: count ? `Queued ${count} item(s)` : 'Saved; nothing new to download', color: 'success' })
    if (count) await navigateTo('/')
  } catch (e) {
    toast.add({ title: 'Could not queue downloads', description: e instanceof Error ? e.message : String(e), color: 'error' })
  } finally {
    queuing.value = false
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Add items" />
    </template>

    <template #body>
      <UFormField
        label="Workshop items or collections"
        description="Paste ids or URLs (one per line, or separated by spaces/commas). Collections are expanded."
      >
        <UTextarea
          v-model="input"
          :rows="5"
          class="w-full"
          placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=2009463077"
        />
      </UFormField>
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-search"
          :label="`Resolve ${ids.length || ''} id(s)`"
          :loading="resolving"
          :disabled="!ids.length"
          @click="resolve"
        />
        <USwitch
          v-model="skipDownloaded"
          label="Skip items whose latest revision is already downloaded"
        />
      </div>

      <UAlert
        v-if="!settings.libraryPath"
        color="warning"
        variant="subtle"
        description="Set a library folder in Settings before downloading."
      />

      <template v-if="resolved">
        <p
          v-if="resolved.collections.length"
          class="text-sm text-muted"
        >
          Expanded {{ resolved.collections.length }} collection(s).
        </p>

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
                :label="`Download ${group.items.filter(willDownload).length}`"
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
              <img
                v-if="item.previewUrl"
                :src="item.previewUrl"
                alt=""
                class="size-10 rounded object-cover"
              >
              <div class="min-w-0 flex-1">
                <p class="truncate">
                  {{ item.title || item.id }}
                </p>
                <p class="text-xs text-muted">
                  {{ formatBytes(item.fileSize) }} · updated {{ formatTime(item.timeUpdated) }}
                </p>
              </div>
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
    </template>
  </UDashboardPanel>
</template>
