<script setup lang="ts">
import type { DiskUsage } from '~/types/games'

// A game's snapshots on disk: one row for the active ones, one for the inactive ones, one total.
defineProps<DiskUsage>()
</script>

<template>
  <ul class="w-40 space-y-0.5 text-xs">
    <li class="flex items-center gap-1.5">
      <UIcon
        name="i-lucide-circle-check"
        class="size-3.5 text-primary"
      />
      <span class="text-muted">active</span>
      <span class="ms-auto tabular-nums">{{ formatBytes(active) }}</span>
    </li>
    <li class="flex items-center gap-1.5">
      <UIcon
        name="i-lucide-circle"
        class="size-3.5 text-dimmed"
      />
      <span class="text-muted">inactive</span>
      <span class="ms-auto tabular-nums">{{ formatBytes(inactive) }}</span>
    </li>
    <li class="flex items-center gap-1.5 font-medium text-highlighted">
      <UIcon
        name="i-lucide-hard-drive"
        class="size-3.5"
      />
      <span>total</span>
      <span class="ms-auto tabular-nums">{{ formatBytes(total) }}</span>
    </li>
  </ul>
</template>
