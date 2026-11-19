<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AppRow, ItemRow, LinkRow } from '~/lib/db/schema'

// A workshop item's header card: preview, title, status badges and details, with Download as the
// main action and the rest (workshop page, re-detect, unlink, release hold) in a menu.
const props = defineProps<{
  item: ItemRow
  app: AppRow | null
  link: LinkRow | null
  gameVersion: string | null
  downloading: boolean
  updateAvailable: boolean
  busy: boolean
  canRedetect: boolean
}>()
const emit = defineEmits<{
  'auto-update': [on: boolean]
  'download': []
  'open-workshop': []
  'redetect': []
  'unlink': []
  'release-hold': []
}>()

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Open its workshop page', icon: 'i-lucide-store', onSelect: () => emit('open-workshop') },
    { label: 'Re-detect versions', icon: 'i-lucide-scan-search', disabled: !props.canRedetect, onSelect: () => emit('redetect') }
  ],
  [
    ...(props.item.held ? [{ label: 'Release hold', icon: 'i-lucide-lock-open', onSelect: () => emit('release-hold') }] : []),
    ...(props.link ? [{ label: 'Unlink', icon: 'i-lucide-unlink', color: 'error' as const, onSelect: () => emit('unlink') }] : [])
  ]
].filter(group => group.length))
</script>

<template>
  <section class="flex flex-col gap-4 rounded-lg border border-default p-4 sm:flex-row">
    <WorkshopItemThumbnail
      :src="item.previewUrl"
      :placeholder="false"
      class="size-32 shrink-0 rounded-md"
    />

    <div class="min-w-0 flex-1 space-y-3">
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-highlighted">
            {{ item.title || item.id }}
          </h1>
          <p class="text-sm text-muted">
            <template v-if="item.author">
              by {{ item.author }} ·
            </template>{{ app?.name ?? `App ${item.appId}` }}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <UButton
            icon="i-lucide-download"
            :label="downloading ? 'Downloading…' : updateAvailable ? 'Download update' : 'Download latest'"
            :disabled="downloading"
            :loading="busy && !downloading"
            @click="emit('download')"
          />
          <UDropdownMenu
            :items="menu"
            :content="{ align: 'end' }"
          >
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              aria-label="More actions"
            />
          </UDropdownMenu>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <UBadge
          v-if="link"
          :color="link.status === 'ok' ? 'success' : 'error'"
          variant="subtle"
          icon="i-lucide-link"
        >
          {{ link.status === 'ok' ? 'linked' : link.status.replace('_', ' ') }}
        </UBadge>
        <UBadge
          v-else
          color="neutral"
          variant="subtle"
          icon="i-lucide-unlink"
        >
          not linked
        </UBadge>
        <UBadge
          v-if="updateAvailable"
          color="warning"
          variant="subtle"
        >
          update available
        </UBadge>
        <UBadge
          v-if="item.held"
          color="info"
          variant="subtle"
          icon="i-lucide-lock"
          title="Held at this version: auto-update skips it and new downloads aren't made active"
        >
          held
        </UBadge>
        <UBadge
          v-for="tag in item.tags"
          :key="tag"
          color="neutral"
          variant="outline"
        >
          {{ tag }}
        </UBadge>
      </div>

      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt class="text-muted">
          Workshop id
        </dt>
        <dd class="tabular-nums">
          {{ item.id }}
        </dd>
        <dt class="text-muted">
          Latest on Steam
        </dt>
        <dd>{{ formatTime(item.remoteTimeUpdated) }} · {{ formatBytes(item.fileSize) }}</dd>
        <dt class="text-muted">
          Game version
        </dt>
        <dd>{{ gameVersion ?? 'unknown' }}</dd>
        <template v-if="link">
          <dt class="text-muted">
            Linked at
          </dt>
          <dd class="flex min-w-0 items-center gap-1">
            <code class="truncate text-xs">{{ link.linkPath }}</code>
            <OpenFolderButton
              :path="link.linkPath"
              size="xs"
              variant="ghost"
            />
          </dd>
        </template>
        <dt class="text-muted">
          Auto-update
        </dt>
        <dd>
          <USwitch
            :model-value="item.autoUpdate"
            size="sm"
            aria-label="Include in automatic updates"
            @update:model-value="emit('auto-update', $event)"
          />
        </dd>
      </dl>
    </div>
  </section>
</template>
