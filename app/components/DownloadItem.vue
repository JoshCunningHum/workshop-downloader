<script setup lang="ts">
import type { ItemRow } from '~/db/schema'
import type { LiveJob } from '~/composables/useJobs'

// One workshop item of a download, with its own status and progress.
const props = defineProps<{ job: LiveJob, itemId: string, item?: ItemRow, appName?: string | null }>()
const emit = defineEmits<{ log: [job: LiveJob] }>()

const jobsStore = useJobs()
const attempt = useAttempt()

const status = computed(() => itemState(props.job, props.itemId))
const active = computed(() => ['queued', 'waiting', 'downloading'].includes(status.value.state))

const progress = computed(() => {
  const p = props.job.progress[props.itemId]
  const total = p?.total || props.item?.fileSize || 0
  const bytes = status.value.state === 'done' ? total : Math.min(p?.bytes ?? 0, total || Infinity)
  return { bytes, total, percent: total ? Math.round(bytes / total * 100) : null }
})

const COLORS = {
  queued: 'neutral',
  waiting: 'neutral',
  downloading: 'primary',
  done: 'success',
  failed: 'error',
  cancelled: 'neutral',
  needs_guard: 'warning',
  interrupted: 'neutral'
} as const

// Cancelling stops the SteamCMD process, which may be fetching other items too.
const others = computed(() => props.job.itemIds.filter(id => id !== props.itemId && !props.job.itemsDone[id]).length)
</script>

<template>
  <li class="flex items-center gap-3 py-2">
    <img
      v-if="item?.previewUrl"
      :src="item.previewUrl"
      alt=""
      class="size-10 shrink-0 rounded object-cover"
      loading="lazy"
    >
    <div
      v-else
      class="flex size-10 shrink-0 items-center justify-center rounded bg-elevated"
    >
      <UIcon
        name="i-lucide-package"
        class="size-5 text-dimmed"
      />
    </div>

    <div class="min-w-0 flex-1 space-y-1">
      <div class="flex items-center gap-2">
        <NuxtLink
          :to="`/items/${itemId}`"
          class="truncate text-sm font-medium hover:underline"
        >
          {{ item?.title || itemId }}
        </NuxtLink>
        <NuxtLink
          :to="`/apps/${job.appId}`"
          class="shrink-0 truncate text-xs text-muted hover:underline"
        >
          {{ appName ?? `App ${job.appId}` }}
        </NuxtLink>
      </div>
      <div class="flex items-center gap-2">
        <UProgress
          v-if="status.state !== 'failed' && status.state !== 'cancelled'"
          :model-value="status.state === 'downloading' && progress.percent === null ? null : (progress.percent ?? 0)"
          :max="100"
          :color="status.state === 'done' ? 'success' : 'primary'"
          size="sm"
          class="flex-1"
        />
        <span
          v-if="status.reason"
          class="min-w-0 flex-1 truncate text-xs text-error"
          :title="status.reason"
        >{{ status.reason }}</span>
        <span class="shrink-0 text-xs text-muted tabular-nums">
          <template v-if="status.state === 'downloading' || status.state === 'done'">{{ formatBytes(progress.bytes) }} / </template>{{ formatBytes(progress.total) }}
        </span>
      </div>
    </div>

    <UBadge
      :color="COLORS[status.state]"
      variant="subtle"
      class="shrink-0"
    >
      {{ status.state.replace('_', ' ') }}
    </UBadge>

    <div class="flex shrink-0 gap-1">
      <UTooltip
        v-if="active"
        :text="others ? `Also stops ${others} other item(s) downloading in the same SteamCMD process` : 'Cancel'"
      >
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-square"
          aria-label="Cancel"
          @click="attempt('Cancel', () => jobsStore.cancel(job.id))"
        />
      </UTooltip>
      <UTooltip
        v-else-if="status.state !== 'done'"
        text="Retry"
      >
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-rotate-ccw"
          aria-label="Retry"
          @click="attempt('Retry', () => jobsStore.retryItem(job, itemId))"
        />
      </UTooltip>
      <UTooltip text="SteamCMD log">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-scroll-text"
          aria-label="SteamCMD log"
          @click="emit('log', job)"
        />
      </UTooltip>
    </div>
  </li>
</template>
