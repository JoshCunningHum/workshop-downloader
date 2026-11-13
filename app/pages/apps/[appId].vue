<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { inArray } from 'drizzle-orm'
import type { TableColumn } from '@nuxt/ui'
import { isCompatible } from '~/adapters/engine'
import { snapshots as snapshotsTable, type AppRow, type ItemRow, type LinkMode, type LinkRow, type SnapshotRow } from '~/db/schema'

const route = useRoute()
const appId = Number(route.params.appId)

const { db } = useDb()
const catalog = useCatalog()
const library = useLibrary()
const adaptersApi = useAdapters()
const accountsApi = useAccounts()
const jobsStore = useJobs()
const updates = useUpdateChecker()
const steam = useSteamApi()
const toast = useToast()

const { data, refresh } = useAsyncData(`app-${appId}`, async () => {
  const app = await catalog.getApp(appId)
  if (!app) return null
  const items = await catalog.listItems(appId)
  const snaps = items.length
    ? await db().select().from(snapshotsTable).where(inArray(snapshotsTable.itemId, items.map(i => i.id)))
    : []
  const links = await library.linksForApp(appId)
  return {
    app,
    items,
    snapshots: snaps,
    links,
    adapter: await adaptersApi.forApp(app),
    adapters: await adaptersApi.list(),
    accounts: await accountsApi.list()
  }
})

const app = computed(() => data.value?.app ?? null)

// Steam store metadata: fetched on open when missing or older than a week.
watch(app, async (value) => {
  if (!value || !catalog.storeStale(value)) return
  const updated = await catalog.refreshStore(value).catch(() => null)
  if (updated && data.value) data.value.app = updated
}, { immediate: true })

const store = computed(() => app.value?.store ?? null)
const storeMeta = computed(() => {
  const s = store.value
  if (!s) return []
  return [
    s.developers.length ? `by ${s.developers.join(', ')}` : null,
    s.publishers.length && s.publishers.join() !== s.developers.join() ? `published by ${s.publishers.join(', ')}` : null,
    s.releaseDate,
    s.genres.join(', ') || null
  ].filter(Boolean) as string[]
})
const gameVersion = computed(() => app.value?.manualGameVersion || app.value?.detectedGameVersion || null)

interface Row {
  item: ItemRow
  active: SnapshotRow | null
  latest: SnapshotRow | null
  count: number
  link: LinkRow | null
  updateAvailable: boolean
  compatible: boolean | null
}

const rows = computed<Row[]>(() => {
  if (!data.value) return []
  const byItem = new Map<string, SnapshotRow[]>()
  for (const s of data.value.snapshots) {
    if (!byItem.has(s.itemId)) byItem.set(s.itemId, [])
    byItem.get(s.itemId)!.push(s)
  }
  return data.value.items.map((item) => {
    const snaps = (byItem.get(item.id) ?? []).sort((a, b) => b.timeUpdated - a.timeUpdated)
    const active = snaps.find(s => s.id === item.activeSnapshotId) ?? null
    const latest = snaps[0] ?? null
    return {
      item,
      active,
      latest,
      count: snaps.length,
      link: data.value!.links.find(l => l.itemId === item.id) ?? null,
      updateAvailable: item.remoteTimeUpdated > (latest?.timeUpdated ?? 0),
      compatible: isCompatible(gameVersion.value, active?.itemVersions ?? [])
    }
  })
})

const selected = ref(new Set<string>())
const allSelected = computed(() => rows.value.length > 0 && selected.value.size === rows.value.length)
function toggleAll(on: boolean | 'indeterminate') {
  selected.value = on === true ? new Set(rows.value.map(r => r.item.id)) : new Set()
}
function toggle(id: string, on: boolean | 'indeterminate') {
  const next = new Set(selected.value)
  if (on === true) next.add(id)
  else next.delete(id)
  selected.value = next
}

const columns: TableColumn<Row>[] = [
  { id: 'select' },
  { id: 'title', header: 'Item' },
  { id: 'versions', header: 'Item versions' },
  { id: 'active', header: 'Active snapshot' },
  { id: 'link', header: 'Link' },
  { id: 'actions' }
]

const busy = ref(false)
async function run(label: string, action: () => Promise<unknown>) {
  busy.value = true
  try {
    await action()
    await refresh()
  } catch (e) {
    toast.add({ title: `${label} failed`, description: e instanceof Error ? e.message : String(e), color: 'error' })
  } finally {
    busy.value = false
  }
}

const selectedRows = () => rows.value.filter(r => selected.value.has(r.item.id))

function download(ids: string[]) {
  return run('Download', async () => {
    const busyIds = jobsStore.busyItemIds.value
    const queue = ids.filter(id => !busyIds.has(id))
    if (!queue.length) throw new Error('Those items are already downloading')
    await jobsStore.enqueue(appId, queue)
    toast.add({ title: `Queued ${queue.length} item(s)`, color: 'success' })
  })
}

function linkRows(target: Row[]) {
  return run('Link', async () => {
    for (const row of target) {
      const snapshot = row.active ?? row.latest
      if (snapshot) await library.activate(snapshot.id)
    }
  })
}

function unlinkRows(target: Row[]) {
  return run('Unlink', async () => {
    for (const row of target) await library.unlink(row.item.id)
  })
}

function removeRows(target: Row[]) {
  return run('Remove', async () => {
    for (const row of target) await library.removeItem(row.item.id)
    selected.value = new Set()
  })
}

const checkUpdates = () => run('Update check', async () => {
  const outdated = await updates.check(appId)
  toast.add({ title: outdated?.length ? `${outdated.length} update(s) available` : 'Everything is up to date', color: 'success' })
})

const verifyLinks = () => run('Verify links', async () => {
  const results = await library.verifyLinks(appId)
  const bad = results.filter(r => r.status !== 'ok').length
  toast.add({ title: bad ? `${bad} link(s) need attention` : 'All links are fine', color: bad ? 'warning' : 'success' })
})

const detectGameVersion = () => run('Game version detection', async () => {
  const version = await adaptersApi.gameVersion(app.value!)
  await catalog.updateApp(appId, { detectedGameVersion: version })
  toast.add({ title: version ? `Game version ${version}` : 'Could not detect the game version', color: version ? 'success' : 'warning' })
})

// --- settings form ---
// Text inputs edit strings; empty strings are saved back as null.
type AppForm = AppRow & { name: string, installPath: string, modsPath: string, manualGameVersion: string }
const form = ref<AppForm | null>(null)
watch(app, (value) => {
  form.value = value
    ? { ...value, name: value.name ?? '', installPath: value.installPath ?? '', modsPath: value.modsPath ?? '', manualGameVersion: value.manualGameVersion ?? '' }
    : null
}, { immediate: true })

// USelect (Reka UI) rejects '' as an item value, so "Automatic" (adapterId null) uses a sentinel.
const AUTO_ADAPTER = '__auto__'
const adapterItems = computed(() => [
  { label: `Automatic (${data.value?.adapter.name ?? '—'})`, value: AUTO_ADAPTER },
  ...(data.value?.adapters ?? []).map(a => ({ label: a.name, value: a.id }))
])
const accountItems = computed(() => [
  { label: 'Anonymous', value: 0 },
  ...(data.value?.accounts ?? []).map(a => ({ label: a.username, value: a.id }))
])
const linkModes: { label: string, value: LinkMode }[] = [
  { label: 'Junction (no admin needed)', value: 'junction' },
  { label: 'Symlink (needs Developer Mode)', value: 'symlink' }
]

async function browse(field: 'installPath' | 'modsPath') {
  const dir = await open({ directory: true, defaultPath: form.value?.[field] || undefined })
  if (typeof dir === 'string' && form.value) form.value[field] = dir
}

async function detectInstall() {
  const game = await steam.installedGame(appId).catch(() => null)
  if (game && form.value) {
    form.value.installPath = game.installPath
    form.value.name ||= game.name
  } else {
    toast.add({ title: 'Not found in your Steam libraries', color: 'warning' })
  }
}

// Setting (or changing) the mods folder offers to import the item folders already in it.
const importOpen = ref(false)

const saveSettings = async () => {
  const before = app.value?.modsPath ?? null
  await save()
  const after = app.value?.modsPath ?? null
  if (after && after !== before) importOpen.value = true
}

const save = () => run('Saving', async () => {
  const f = form.value!
  await catalog.updateApp(appId, {
    name: f.name || null,
    installPath: f.installPath || null,
    modsPath: f.modsPath || null,
    linkMode: f.linkMode,
    adapterId: f.adapterId || null,
    accountId: f.accountId || null,
    autoUpdate: f.autoUpdate,
    retention: Math.max(0, Number(f.retention) || 0),
    manualGameVersion: f.manualGameVersion || null
  })
  toast.add({ title: 'Saved', color: 'success' })
})

// The item list, or the game's settings (opened from the gear button).
const view = ref<'items' | 'settings'>('items')
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <WorkshopLinkSection @queued="refresh" />

      <UEmpty
        v-if="!app"
        title="Unknown game"
        description="This AppID has no items yet."
      />

      <template v-else>
        <div
          v-if="store"
          class="flex gap-4"
        >
          <img
            v-if="store.headerImage"
            :src="store.headerImage"
            alt=""
            class="aspect-460/215 h-20 shrink-0 rounded-md object-cover"
          >
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-semibold">{{ app.name ?? store.name }}</span>
              <UButton
                size="xs"
                color="neutral"
                variant="link"
                icon="i-lucide-external-link"
                label="Store page"
                @click="openUrl(`https://store.steampowered.com/app/${app.appId}/`)"
              />
            </div>
            <p
              v-if="store.shortDescription"
              class="line-clamp-2 text-sm text-muted"
            >
              {{ store.shortDescription }}
            </p>
            <p
              v-if="storeMeta.length"
              class="text-xs text-dimmed"
            >
              {{ storeMeta.join(' · ') }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 text-sm">
          <span>AppID {{ app.appId }}</span>
          <span class="text-muted">·</span>
          <span>
            Installed version:
            <strong>{{ gameVersion ?? 'unknown' }}</strong>
            <span
              v-if="app.manualGameVersion"
              class="text-muted"
            > (manual)</span>
          </span>
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-scan-search"
            label="Detect"
            :loading="busy"
            @click="detectGameVersion"
          />
          <span class="text-muted">· adapter: {{ data?.adapter.name }}</span>
          <div class="ms-auto flex flex-wrap gap-2">
            <UButton
              size="xs"
              icon="i-lucide-refresh-cw"
              label="Check updates"
              color="neutral"
              variant="outline"
              :loading="busy"
              @click="checkUpdates"
            />
            <UButton
              size="xs"
              icon="i-lucide-link"
              label="Verify links"
              color="neutral"
              variant="outline"
              :loading="busy"
              @click="verifyLinks"
            />
            <UTooltip text="Game settings">
              <UButton
                size="xs"
                icon="i-lucide-settings"
                color="neutral"
                :variant="view === 'settings' ? 'soft' : 'outline'"
                aria-label="Game settings"
                @click="view = 'settings'"
              />
            </UTooltip>
          </div>
        </div>

        <template v-if="view === 'items'">
          <div class="mb-3 flex flex-wrap gap-2">
            <UButton
              size="sm"
              icon="i-lucide-download"
              label="Update outdated"
              :disabled="!rows.some(r => r.updateAvailable)"
              :loading="busy"
              @click="download(rows.filter(r => r.updateAvailable).map(r => r.item.id))"
            />
            <template v-if="selected.size">
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-download"
                :label="`Download ${selected.size}`"
                @click="download([...selected])"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-link"
                label="Link"
                @click="linkRows(selectedRows())"
              />
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-unlink"
                label="Unlink"
                @click="unlinkRows(selectedRows())"
              />
              <UButton
                size="sm"
                color="error"
                variant="outline"
                icon="i-lucide-trash-2"
                label="Remove"
                @click="removeRows(selectedRows())"
              />
            </template>
          </div>

          <UTable
            :data="rows"
            :columns="columns"
          >
            <template #select-header>
              <UCheckbox
                :model-value="allSelected"
                @update:model-value="toggleAll"
              />
            </template>
            <template #select-cell="{ row }">
              <UCheckbox
                :model-value="selected.has(row.original.item.id)"
                @update:model-value="toggle(row.original.item.id, $event)"
              />
            </template>
            <template #title-cell="{ row }">
              <NuxtLink
                :to="`/items/${row.original.item.id}`"
                class="font-medium hover:underline"
              >
                {{ row.original.item.title || row.original.item.id }}
              </NuxtLink>
              <div class="flex gap-1">
                <UBadge
                  v-if="row.original.updateAvailable"
                  size="sm"
                  color="warning"
                  variant="subtle"
                >
                  {{ row.original.latest ? 'update available' : 'not downloaded' }}
                </UBadge>
                <UBadge
                  v-if="jobsStore.busyItemIds.value.has(row.original.item.id)"
                  size="sm"
                  color="primary"
                  variant="subtle"
                >
                  downloading
                </UBadge>
              </div>
            </template>
            <template #versions-cell="{ row }">
              <span>{{ row.original.active?.itemVersions.join(', ') || '—' }}</span>
              <UBadge
                v-if="row.original.compatible !== null"
                class="ms-2"
                size="sm"
                :color="row.original.compatible ? 'success' : 'error'"
                variant="subtle"
              >
                {{ row.original.compatible ? 'fits' : 'mismatch' }}
              </UBadge>
            </template>
            <template #active-cell="{ row }">
              <span v-if="row.original.active">{{ formatTime(row.original.active.timeUpdated) }}</span>
              <span
                v-else
                class="text-muted"
              >—</span>
              <span class="text-xs text-muted"> ({{ row.original.count }} kept)</span>
            </template>
            <template #link-cell="{ row }">
              <UBadge
                v-if="row.original.link"
                :color="row.original.link.status === 'ok' ? 'success' : 'error'"
                variant="subtle"
              >
                {{ row.original.link.status.replace('_', ' ') }}
              </UBadge>
              <span
                v-else
                class="text-muted"
              >not linked</span>
            </template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-download"
                  title="Download latest"
                  @click="download([row.original.item.id])"
                />
                <UButton
                  v-if="row.original.link"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-unlink"
                  title="Unlink"
                  @click="unlinkRows([row.original])"
                />
                <UButton
                  v-else-if="row.original.latest"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-link"
                  title="Link"
                  @click="linkRows([row.original])"
                />
              </div>
            </template>
          </UTable>
        </template>

        <template v-else>
          <div class="flex items-center gap-2">
            <UButton
              size="sm"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              aria-label="Back to items"
              @click="view = 'items'"
            />
            <h2 class="font-semibold">
              Settings
            </h2>
          </div>
          <form
            v-if="form"
            class="max-w-2xl space-y-4"
            @submit.prevent="saveSettings"
          >
            <UFormField label="Name">
              <UInput
                v-model="form.name"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Game install folder"
              description="Used for {install} in adapter templates and game version detection."
            >
              <div class="flex gap-2">
                <UInput
                  v-model="form.installPath"
                  class="flex-1"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  label="Browse"
                  @click="browse('installPath')"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  label="Find in Steam"
                  @click="detectInstall"
                />
              </div>
            </UFormField>
            <UFormField
              label="Mods folder"
              :description="`Where links are created. Empty uses the adapter's template${data?.adapter.modsPath ? ` (${data.adapter.modsPath})` : ''}.`"
            >
              <div class="flex gap-2">
                <UInput
                  v-model="form.modsPath"
                  class="flex-1"
                  :placeholder="data?.adapter.modsPath"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  label="Browse"
                  @click="browse('modsPath')"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-folder-input"
                  label="Import existing…"
                  :disabled="form.modsPath !== (app.modsPath ?? '')"
                  :title="form.modsPath !== (app.modsPath ?? '') ? 'Save the new folder first' : undefined"
                  @click="importOpen = true"
                />
              </div>
            </UFormField>
            <UFormField
              label="Link type"
              description="Windows only; the macOS dev build always uses symlinks."
            >
              <USelect
                v-model="form.linkMode"
                :items="linkModes"
                class="w-72"
              />
            </UFormField>
            <UFormField label="Adapter">
              <USelect
                :model-value="form.adapterId ?? AUTO_ADAPTER"
                :items="adapterItems"
                class="w-72"
                @update:model-value="form.adapterId = $event === AUTO_ADAPTER ? null : $event"
              />
            </UFormField>
            <UFormField
              label="Manual game version"
              description="Overrides the detected version."
            >
              <UInput v-model="form.manualGameVersion" />
            </UFormField>
            <UFormField
              label="Steam account"
              description="Some workshop items need an account that owns the game."
            >
              <USelect
                :model-value="form.accountId ?? 0"
                :items="accountItems"
                class="w-72"
                @update:model-value="form.accountId = $event || null"
              />
            </UFormField>
            <UFormField
              label="Snapshots to keep per item"
              description="Older ones are deleted after a new download. Pinned and active snapshots are always kept. 0 keeps everything."
            >
              <UInputNumber
                v-model="form.retention"
                :min="0"
              />
            </UFormField>
            <USwitch
              v-model="form.autoUpdate"
              label="Download updates automatically when the timed update check finds them"
            />
            <UButton
              type="submit"
              label="Save"
              :loading="busy"
            />
          </form>
        </template>

        <ModsImportDialog
          v-model:open="importOpen"
          :app="app"
          @imported="refresh"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
