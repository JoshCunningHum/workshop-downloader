<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import type { AppRow } from '~/lib/db/schema'

// Steam store banner, description and credits of a game (shown when the store has a page).
const props = defineProps<{ app: AppRow }>()

const store = computed(() => props.app.store)
const meta = computed(() => {
  const s = store.value
  if (!s) return []
  return [
    s.developers.length ? `by ${s.developers.join(', ')}` : null,
    s.publishers.length && s.publishers.join() !== s.developers.join() ? `published by ${s.publishers.join(', ')}` : null,
    s.releaseDate,
    s.genres.join(', ') || null
  ].filter(Boolean) as string[]
})
</script>

<template>
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
        v-if="meta.length"
        class="text-xs text-dimmed"
      >
        {{ meta.join(' · ') }}
      </p>
    </div>
  </div>
</template>
