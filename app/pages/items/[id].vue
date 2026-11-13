<script setup lang="ts">
import { isCompatible } from '~/adapters/engine'

const route = useRoute()
const id = String(route.params.id)

const catalog = useCatalog()
const library = useLibrary()
const jobsStore = useJobs()
const toast = useToast()

const { data, refresh } = useAsyncData(`item-${id}`, async () => {
  const item = await catalog.getItem(id)
  if (!item) return null
  return {
    item,
    app: await catalog.getApp(item.appId),
    snapshots: await library.listSnapshots(id),
    link: await library.linkFor(id)
  }
})

const gameVersion = computed(() => data.value?.app?.manualGameVersion || data.value?.app?.detectedGameVersion || null)
const downloading = computed(() => jobsStore.busyItemIds.value.has(id))

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

const makeActive = (snapshotId: number) => run('Switching version', async () => {
  const { linked } = await library.activate(snapshotId)
  toast.add({ title: linked ? 'Link now points at this version' : 'Active version set (no mods folder configured, so nothing was linked)', color: 'success' })
})
const togglePin = (snapshotId: number, pinned: boolean) => run('Pin', () => library.setPinned(snapshotId, pinned))
const remove = (snapshotId: number) => run('Delete', () => library.deleteSnapshot(snapshotId))
const unlink = () => run('Unlink', () => library.unlink(id))
const redetect = () => run('Version detection', async () => {
  for (const s of data.value!.snapshots) await library.detectVersions(s, data.value!.item, data.value!.app!)
})
const download = () => run('Download', () => jobsStore.enqueue(data.value!.item.appId, [id]))
const setAutoUpdate = (on: boolean) => run('Saving', () => catalog.updateItem(id, { autoUpdate: on }))
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <UEmpty
        v-if="!data"
        title="Item not found"
      />

      <template v-else>
        <div class="flex gap-4">
          <img
            v-if="data.item.previewUrl"
            :src="data.item.previewUrl"
            alt=""
            class="size-28 rounded object-cover"
          >
          <div class="space-y-1 text-sm">
            <p class="text-base font-semibold">
              {{ data.item.title || data.item.id }}
            </p>
            <p>
              <span class="text-muted">Workshop id</span> {{ data.item.id }} ·
              <span class="text-muted">Game</span>
              <NuxtLink
                :to="`/apps/${data.item.appId}`"
                class="hover:underline"
              >{{ data.app?.name ?? data.item.appId }}</NuxtLink>
            </p>
            <p><span class="text-muted">Latest on Steam</span> {{ formatTime(data.item.remoteTimeUpdated) }} ({{ formatBytes(data.item.fileSize) }})</p>
            <p><span class="text-muted">Installed game version</span> {{ gameVersion ?? 'unknown' }}</p>
            <p v-if="data.link">
              <span class="text-muted">Linked at</span> <code>{{ data.link.linkPath }}</code>
              <UBadge
                class="ms-1"
                size="sm"
                :color="data.link.status === 'ok' ? 'success' : 'error'"
                variant="subtle"
              >
                {{ data.link.status.replace('_', ' ') }}
              </UBadge>
            </p>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="tag in data.item.tags"
                :key="tag"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ tag }}
              </UBadge>
            </div>
            <USwitch
              :model-value="data.item.autoUpdate"
              label="Include in automatic updates"
              @update:model-value="setAutoUpdate"
            />
            <UButton
              size="sm"
              icon="i-lucide-download"
              :label="downloading ? 'Downloading…' : 'Download latest'"
              :disabled="downloading"
              @click="download"
            />
          </div>
        </div>

        <div class="flex items-center gap-2">
          <h2 class="font-semibold">
            Snapshots
          </h2>
          <UButton
            class="ms-auto"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-scan-search"
            label="Re-detect versions"
            :disabled="!data.snapshots.length || !data.app"
            :loading="busy"
            @click="redetect"
          />
          <UButton
            v-if="data.link"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-unlink"
            label="Unlink"
            :loading="busy"
            @click="unlink"
          />
        </div>

        <UEmpty
          v-if="!data.snapshots.length"
          icon="i-lucide-history"
          title="No snapshots yet"
          description="Each download keeps its revision here, so you can switch back later."
        />

        <ul class="divide-y divide-default rounded-md border border-default">
          <li
            v-for="s in data.snapshots"
            :key="s.id"
            class="flex flex-wrap items-center gap-3 p-3"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                Revision {{ formatTime(s.timeUpdated) }}
                <UBadge
                  v-if="s.id === data.item.activeSnapshotId"
                  size="sm"
                  color="primary"
                  variant="subtle"
                >
                  active
                </UBadge>
                <UBadge
                  v-if="s.pinned"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                >
                  pinned
                </UBadge>
              </p>
              <p class="text-xs text-muted">
                {{ formatBytes(s.sizeBytes) }} · downloaded {{ formatMs(s.downloadedAt) }}
                · versions {{ s.itemVersions.join(', ') || 'unknown' }}
                <template v-if="isCompatible(gameVersion, s.itemVersions) === false">
                  · <span class="text-error">doesn't list {{ gameVersion }}</span>
                </template>
              </p>
              <p class="truncate text-xs text-dimmed">
                {{ s.path }}
              </p>
            </div>
            <UButton
              v-if="s.id !== data.item.activeSnapshotId || !data.link"
              size="xs"
              icon="i-lucide-circle-check"
              label="Make active"
              :loading="busy"
              @click="makeActive(s.id)"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              :icon="s.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
              :label="s.pinned ? 'Unpin' : 'Pin'"
              @click="togglePin(s.id, !s.pinned)"
            />
            <UButton
              size="xs"
              color="error"
              variant="outline"
              icon="i-lucide-trash-2"
              :disabled="s.id === data.item.activeSnapshotId"
              @click="remove(s.id)"
            />
          </li>
        </ul>
      </template>
    </template>
  </UDashboardPanel>
</template>
