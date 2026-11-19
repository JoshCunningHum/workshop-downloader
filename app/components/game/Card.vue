<script setup lang="ts">
import type { AppRow } from '~/lib/db/schema'
import { ROUTES } from '~/constants/routes'

// A game in the Games list: store banner on the left, name and badges on the right.
// Opens the game's page unless `to` says otherwise (the Workshop list opens its workshop).
defineProps<{ app: AppRow & { items: number }, outdated: number, to?: string }>()
</script>

<template>
  <NuxtLink
    :to="to ?? ROUTES.game(app.appId)"
    class="flex overflow-hidden rounded-lg border border-default bg-default transition-colors hover:bg-elevated/50"
  >
    <img
      v-if="app.store?.headerImage"
      :src="app.store.headerImage"
      alt=""
      class="aspect-460/215 w-44 shrink-0 object-cover"
      loading="lazy"
    >
    <div
      v-else
      class="flex aspect-460/215 w-44 shrink-0 items-center justify-center bg-elevated"
    >
      <UIcon
        name="i-lucide-gamepad-2"
        class="size-8 text-dimmed"
      />
    </div>

    <div class="min-w-0 flex-1 space-y-1 p-3">
      <p class="truncate font-medium text-highlighted">
        {{ app.name ?? `App ${app.appId}` }}
      </p>
      <p class="text-xs text-muted">
        AppID {{ app.appId }} · {{ app.items }} item(s)
      </p>
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-if="outdated"
          size="sm"
          color="warning"
          variant="subtle"
        >
          {{ outdated }} update(s)
        </UBadge>
        <UBadge
          v-if="app.manualGameVersion || app.detectedGameVersion"
          size="sm"
          color="neutral"
          variant="subtle"
        >
          game {{ app.manualGameVersion || app.detectedGameVersion }}
        </UBadge>
        <UBadge
          v-if="app.hidden"
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-eye-off"
        >
          hidden
        </UBadge>
        <UBadge
          v-if="!app.installPath"
          size="sm"
          color="neutral"
          variant="outline"
        >
          install folder unknown
        </UBadge>
      </div>
    </div>
  </NuxtLink>
</template>
