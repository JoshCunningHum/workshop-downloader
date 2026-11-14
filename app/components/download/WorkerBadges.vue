<script setup lang="ts">
import type { LiveJob } from '~/types/jobs'

// One badge per SteamCMD worker: the item it's downloading, its game, or idle.
defineProps<{
  workers: { slot: number, job?: LiveJob, title: string | null }[]
  appNames: Record<number, string | null>
}>()
</script>

<template>
  <section class="flex flex-wrap items-center gap-2">
    <UBadge
      v-for="w in workers"
      :key="w.slot"
      :color="w.job ? 'primary' : 'neutral'"
      variant="subtle"
      class="max-w-64"
    >
      <span class="truncate">#{{ w.slot }} {{ w.job ? (w.title ?? appNames[w.job.appId] ?? w.job.appId) : 'idle' }}</span>
    </UBadge>
  </section>
</template>
