<script lang="ts">
import type { ItemDetails } from '~/composables/useSteamApi'
import type { LinkRow, SnapshotRow } from '~/db/schema'

// Shared across every tooltip: one Web API call per item per session.
const detailsCache = new Map<string, Promise<ItemDetails | null>>()

function fetchDetails(id: string): Promise<ItemDetails | null> {
  let pending = detailsCache.get(id)
  if (!pending) {
    pending = useSteamApi().itemDetails([id]).then(list => list[0] ?? null)
    pending.catch(() => detailsCache.delete(id))
    detailsCache.set(id, pending)
  }
  return pending.catch(() => null)
}
</script>

<script setup lang="ts">
// Wraps a workshop item (row, thumbnail, ...) with a detail card that follows the cursor.
// Steam data is fetched on first hover and cached; library data is read each time it opens.
const props = defineProps<{
  itemId: string
  /** Already-fetched Web API details (e.g. a freshly resolved item); skips the fetch. */
  details?: ItemDetails | null
}>()

const catalog = useCatalog()
const library = useLibrary()

const open = ref(false)

// The tooltip is anchored to a zero-size box at the pointer; floating-ui re-reads it every
// frame (updatePositionStrategy: 'always'), so plain variables are enough.
let x = 0
let y = 0
const reference = {
  getBoundingClientRect: () => ({ x, y, left: x, right: x, top: y, bottom: y, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
}
function follow(event: PointerEvent) {
  x = event.clientX
  y = event.clientY
}

const remote = ref<ItemDetails | null>(props.details ?? null)
const loadingRemote = ref(false)
const local = ref<{ title: string | null, appName: string | null, snapshots: SnapshotRow[], active: SnapshotRow | null, link: LinkRow | null, autoUpdate: boolean, pinned: boolean, addedAt: number } | null>(null)

watch(open, async (value) => {
  if (!value) return
  await Promise.all([loadRemote(), loadLocal()])
})

async function loadRemote() {
  if (remote.value) return
  loadingRemote.value = true
  try {
    remote.value = await fetchDetails(props.itemId)
  } finally {
    loadingRemote.value = false
  }
}

async function loadLocal() {
  const item = await catalog.getItem(props.itemId)
  if (!item) {
    local.value = null
    return
  }
  const [snapshots, link, app] = await Promise.all([
    library.listSnapshots(item.id),
    library.linkFor(item.id),
    catalog.getApp(item.appId)
  ])
  local.value = {
    title: item.title,
    appName: app?.name ?? null,
    snapshots,
    active: snapshots.find(s => s.id === item.activeSnapshotId) ?? null,
    link,
    autoUpdate: item.autoUpdate,
    pinned: item.pinned,
    addedAt: item.addedAt
  }
}

const title = computed(() => remote.value?.title || local.value?.title || props.itemId)
const missing = computed(() => !!remote.value && remote.value.result !== 1)

/** Plain-text excerpt of the BBCode description. */
const excerpt = computed(() => {
  const text = (remote.value?.description ?? '')
    .replace(/\[url=[^\]]*\]/gi, '')
    .replace(/\[\/?[a-z*]+(=[^\]]*)?\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 320 ? `${text.slice(0, 320)}…` : text
})

const count = (n: number | undefined) => (n ?? 0).toLocaleString()
const tags = computed(() => remote.value?.tags ?? [])
</script>

<template>
  <UTooltip
    v-model:open="open"
    :reference="reference"
    :delay-duration="300"
    disable-hoverable-content
    :content="{ side: 'right', align: 'start', sideOffset: 16, collisionPadding: 12, updatePositionStrategy: 'always' }"
    :ui="{ content: 'pointer-events-none h-auto w-80 flex-col items-stretch gap-0 overflow-hidden rounded-md p-0 text-default' }"
  >
    <div
      class="min-w-0"
      @pointermove="follow"
      @pointerenter="follow"
    >
      <slot />
    </div>

    <template #content>
      <img
        v-if="remote?.previewUrl"
        :src="remote.previewUrl"
        alt=""
        class="max-h-44 w-full object-cover"
      >

      <div class="space-y-2 p-3 text-xs">
        <div>
          <p class="line-clamp-2 text-sm font-semibold text-highlighted">
            {{ title }}
          </p>
          <p class="text-muted">
            <template v-if="local?.appName">
              {{ local.appName }} ·
            </template>
            {{ itemId }}
          </p>
        </div>

        <div
          v-if="loadingRemote && !remote"
          class="flex items-center gap-1 text-muted"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="animate-spin"
          />
          Loading details from Steam…
        </div>

        <UAlert
          v-if="missing"
          color="warning"
          variant="subtle"
          :description="remote?.result === 9 ? 'Removed or private on the Workshop' : `Steam result ${remote?.result}`"
          :ui="{ root: 'p-2', description: 'text-xs' }"
        />

        <template v-else-if="remote">
          <UBadge
            v-if="remote.banned"
            color="error"
            variant="subtle"
            size="sm"
          >
            banned
          </UBadge>

          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt class="text-muted">
              Size
            </dt>
            <dd>{{ formatBytes(remote.fileSize) }}</dd>
            <dt class="text-muted">
              Subscribers
            </dt>
            <dd>{{ count(remote.subscriptions) }}</dd>
            <dt class="text-muted">
              Favorites
            </dt>
            <dd>{{ count(remote.favorited) }}</dd>
            <dt class="text-muted">
              Views
            </dt>
            <dd>{{ count(remote.views) }}</dd>
            <dt class="text-muted">
              Created
            </dt>
            <dd>{{ formatTime(remote.timeCreated) }}</dd>
            <dt class="text-muted">
              Updated
            </dt>
            <dd>{{ formatTime(remote.timeUpdated) }}</dd>
          </dl>

          <p
            v-if="excerpt"
            class="line-clamp-5 text-muted"
          >
            {{ excerpt }}
          </p>
        </template>

        <div
          v-if="local"
          class="border-t border-default pt-2"
        >
          <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt class="text-muted">
              Active revision
            </dt>
            <dd>
              {{ local.active ? formatTime(local.active.timeUpdated) : 'not downloaded' }}
              <span
                v-if="local.active && remote && remote.timeUpdated > local.active.timeUpdated"
                class="text-warning"
              >(update available)</span>
            </dd>
            <dt class="text-muted">
              Snapshots kept
            </dt>
            <dd>{{ local.snapshots.length }}</dd>
            <template v-if="local.active?.itemVersions.length">
              <dt class="text-muted">
                Versions
              </dt>
              <dd>{{ local.active.itemVersions.join(', ') }}</dd>
            </template>
            <dt class="text-muted">
              Link
            </dt>
            <dd>{{ local.link ? local.link.status.replace('_', ' ') : 'not linked' }}</dd>
            <dt class="text-muted">
              Auto-update
            </dt>
            <dd>{{ local.autoUpdate ? 'on' : 'off' }}{{ local.pinned ? ' · pinned' : '' }}</dd>
            <dt class="text-muted">
              Added
            </dt>
            <dd>{{ formatMs(local.addedAt) }}</dd>
          </dl>
        </div>

        <div
          v-if="tags.length"
          class="flex flex-wrap gap-1"
        >
          <UBadge
            v-for="tag in tags.slice(0, 10)"
            :key="tag"
            color="neutral"
            variant="outline"
            size="sm"
          >
            {{ tag }}
          </UBadge>
          <span
            v-if="tags.length > 10"
            class="text-muted"
          >+{{ tags.length - 10 }}</span>
        </div>
      </div>
    </template>
  </UTooltip>
</template>
