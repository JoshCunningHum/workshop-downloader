<script setup lang="ts">
import type { AppRow, ItemRow, LinkRow } from '~/lib/db/schema'
import { ROUTES } from '~/constants/routes'

// A workshop item's details: preview, ids, revisions, link, tags, auto-update and download.
defineProps<{
  item: ItemRow
  app: AppRow | null
  link: LinkRow | null
  gameVersion: string | null
  downloading: boolean
}>()
const emit = defineEmits<{ 'auto-update': [on: boolean], 'download': [] }>()
</script>

<template>
  <div class="flex gap-4">
    <WorkshopItemThumbnail
      :src="item.previewUrl"
      :placeholder="false"
      class="size-28 rounded"
    />
    <div class="space-y-1 text-sm">
      <p class="text-base font-semibold">
        {{ item.title || item.id }}
      </p>
      <p>
        <span class="text-muted">Workshop id</span> {{ item.id }} ·
        <span class="text-muted">Game</span>
        <NuxtLink
          :to="ROUTES.game(item.appId)"
          class="hover:underline"
        >{{ app?.name ?? item.appId }}</NuxtLink>
      </p>
      <p><span class="text-muted">Latest on Steam</span> {{ formatTime(item.remoteTimeUpdated) }} ({{ formatBytes(item.fileSize) }})</p>
      <p><span class="text-muted">Installed game version</span> {{ gameVersion ?? 'unknown' }}</p>
      <p v-if="link">
        <span class="text-muted">Linked at</span> <code>{{ link.linkPath }}</code>
        <OpenFolderButton
          :path="link.linkPath"
          size="xs"
          variant="ghost"
        />
        <UBadge
          class="ms-1"
          size="sm"
          :color="link.status === 'ok' ? 'success' : 'error'"
          variant="subtle"
        >
          {{ link.status.replace('_', ' ') }}
        </UBadge>
      </p>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="tag in item.tags"
          :key="tag"
          color="neutral"
          variant="outline"
          size="sm"
        >
          {{ tag }}
        </UBadge>
      </div>
      <USwitch
        :model-value="item.autoUpdate"
        label="Include in automatic updates"
        @update:model-value="emit('auto-update', $event)"
      />
      <UButton
        size="sm"
        icon="i-lucide-download"
        :label="downloading ? 'Downloading…' : 'Download latest'"
        :disabled="downloading"
        @click="emit('download')"
      />
    </div>
  </div>
</template>
