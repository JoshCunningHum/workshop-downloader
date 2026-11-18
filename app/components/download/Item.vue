<script setup lang="ts">
import { ITEM_STATE_COLORS } from '~/constants/downloads'
import type { ItemRow } from '~/lib/db/schema'
import type { LiveJob } from '~/types/jobs'
import { ROUTES } from '~/constants/routes'

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

const speed = useItemSpeed()
const downloading = computed(() => status.value.state === 'downloading')
const live = computed(() => speed.stats(props.job.id, props.itemId, progress.value.bytes, progress.value.total))

// Cancelling stops the SteamCMD process, which may be fetching other items too.
const others = computed(() => props.job.itemIds.filter(id => id !== props.itemId && !props.job.itemsDone[id]).length)
</script>

<template>
  <li class="flex items-center gap-3 py-2">
    <WorkshopItemTooltip
      :item-id="itemId"
      class="flex flex-1 items-center gap-3"
    >
      <WorkshopItemThumbnail
        :src="item?.previewUrl"
        class="size-10 rounded"
      />

      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex items-center gap-2">
          <NuxtLink
            :to="ROUTES.item(itemId)"
            class="truncate text-sm font-medium hover:underline"
          >
            {{ item?.title || itemId }}
          </NuxtLink>
          <NuxtLink
            :to="ROUTES.game(job.appId)"
            class="shrink-0 truncate text-xs text-muted hover:underline"
          >
            {{ appName ?? `App ${job.appId}` }}
          </NuxtLink>
        </div>
        <div class="flex items-center gap-2">
          <span
            v-if="status.reason"
            class="min-w-0 flex-1 truncate text-xs text-error"
            :title="status.reason"
          >{{ status.reason }}</span>
          <template v-else>
            <DownloadSpeedGraph
              class="flex-1"
              :bars="live.bars"
              :percent="progress.percent ?? 0"
            />
            <span class="w-9 shrink-0 text-right text-xs text-muted tabular-nums">{{ progress.percent ?? 0 }}%</span>
          </template>
        </div>
      </div>

      <!-- Speed on top; size and time left below. Icons and units instead of labels. -->
      <div class="w-44 shrink-0 space-y-1 text-right text-xs text-muted tabular-nums">
        <div
          v-if="downloading"
          class="flex items-center justify-end gap-1 font-medium text-highlighted"
          title="Download speed"
        >
          <UIcon
            name="i-lucide-arrow-down"
            class="size-3.5 text-primary"
          />
          {{ formatBytes(live.speed) }}/s
        </div>
        <div class="flex items-center justify-end gap-1.5">
          <span title="Downloaded / total">
            <template v-if="downloading || status.state === 'done'"><span :class="{ 'text-primary': downloading }">{{ formatBytes(progress.bytes) }}</span> / </template>{{ formatBytes(progress.total) }}
          </span>
          <span
            v-if="downloading"
            class="flex items-center gap-0.5"
            title="Time left"
          >
            <UIcon
              name="i-lucide-clock"
              class="size-3"
            />
            {{ formatDuration(live.eta) }}
          </span>
        </div>
      </div>
    </WorkshopItemTooltip>

    <UBadge
      :color="ITEM_STATE_COLORS[status.state]"
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
