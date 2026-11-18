<script setup lang="ts">
import type { ItemLibraryInfo } from '~/types/items'
import type { ItemDetails } from '~/types/steam'

// Everything known about a workshop item: Steam figures, description, tags and library state.
// `expanded` (the card is Shift-locked) shows the whole description, title and tags.
const props = defineProps<{
  itemId: string
  remote: ItemDetails | null
  loadingRemote: boolean
  local: ItemLibraryInfo | null
  expanded?: boolean
}>()

const title = computed(() => props.remote?.title || props.local?.title || props.itemId)
const missing = computed(() => !!props.remote && props.remote.result !== 1)

/** The BBCode description as (escaped, tag-whitelisted) HTML. */
const description = computed(() => props.remote?.description ? bbcodeToHtml(props.remote.description) : '')

/**
 * Links in the description never navigate the app: workshop item pages open in the Workshop
 * browser (when that setting is on), others in the system browser.
 */
const links = useItemLinks()
function openLink(event: MouseEvent) {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!link) return
  event.preventDefault()
  links.open(link.getAttribute('href')!)
}

// The image box keeps its size while the details or the image load, so the card doesn't jump.
const showImage = computed(() => !!props.remote?.previewUrl || (props.loadingRemote && !props.remote))
const imageLoaded = ref(false)
watch(() => props.remote?.previewUrl, () => imageLoaded.value = false)

const count = (n: number | undefined) => (n ?? 0).toLocaleString()
const tags = computed(() => props.remote?.tags ?? [])
const shownTags = computed(() => props.expanded ? tags.value : tags.value.slice(0, 10))
</script>

<template>
  <div
    v-if="showImage"
    class="relative h-44 w-full shrink-0 bg-elevated"
  >
    <UIcon
      v-if="!imageLoaded"
      name="i-lucide-image"
      class="absolute inset-0 m-auto size-6 text-dimmed"
    />
    <img
      v-if="remote?.previewUrl"
      :src="remote.previewUrl"
      alt=""
      class="absolute inset-0 size-full object-cover transition-opacity duration-200"
      :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
      @load="imageLoaded = true"
    >
  </div>

  <div class="space-y-2 p-3 text-xs">
    <div>
      <p
        class="text-sm font-semibold text-highlighted"
        :class="{ 'line-clamp-2': !expanded }"
      >
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

      <!-- eslint-disable vue/no-v-html -- bbcodeToHtml escapes the text and emits whitelisted tags only -->
      <div
        v-if="description"
        class="bbcode text-muted"
        :class="{ 'max-h-28 overflow-hidden mask-b-from-60%': !expanded }"
        @click="openLink"
        v-html="description"
      />
      <!-- eslint-enable vue/no-v-html -->
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
        v-for="tag in shownTags"
        :key="tag"
        color="neutral"
        variant="outline"
        size="sm"
      >
        {{ tag }}
      </UBadge>
      <span
        v-if="tags.length > shownTags.length"
        class="text-muted"
      >+{{ tags.length - shownTags.length }}</span>
    </div>

    <p
      v-if="!expanded"
      class="text-xs text-dimmed"
    >
      Hold ⇧ Shift to read more
    </p>
  </div>
</template>
