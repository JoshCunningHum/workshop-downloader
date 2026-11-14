<script setup lang="ts">
import { DOWNLOAD_TABS } from '~/constants/downloads'
import type { ItemRow } from '~/lib/db/schema'
import type { DownloadRow, DownloadTab } from '~/types/downloads'
import type { LiveJob } from '~/types/jobs'

// The Queue / Active / Finished / Failed tabs and the items in the selected one.
const props = defineProps<{
  rows: Record<Exclude<DownloadTab, 'queue'>, DownloadRow[]>
  items: Record<string, ItemRow>
  appNames: Record<number, string | null>
}>()
const emit = defineEmits<{ log: [job: LiveJob] }>()

const jobsStore = useJobs()
// Shared with the queue, so pasting a link switches to the Queue tab.
const { tab, entries } = useDownloadQueue()

const count = (value: DownloadTab) => value === 'queue' ? entries.value.length : props.rows[value].length
const tabs = computed(() => (Object.keys(DOWNLOAD_TABS) as DownloadTab[]).map(value => ({
  label: DOWNLOAD_TABS[value].label,
  value,
  icon: DOWNLOAD_TABS[value].icon,
  badge: String(count(value))
})))
const shown = computed(() => tab.value === 'queue' ? [] : props.rows[tab.value])
const empty = computed(() => DOWNLOAD_TABS[tab.value])
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <UTabs
        v-model="tab"
        :items="tabs"
        :content="false"
        :color="DOWNLOAD_TABS[tab].color"
        size="sm"
        :ui="{ list: 'w-fit' }"
      />
      <UTooltip
        v-if="(tab === 'finished' || tab === 'failed') && shown.length"
        text="Clears finished and failed downloads"
      >
        <UButton
          class="ms-auto"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-trash-2"
          label="Clear history"
          @click="jobsStore.clearFinished()"
        />
      </UTooltip>
    </div>

    <DownloadQueueList v-if="tab === 'queue'" />

    <UEmpty
      v-else-if="!shown.length"
      :icon="empty.icon"
      :title="empty.empty.title"
      :description="empty.empty.description"
    />
    <ul
      v-if="tab !== 'queue'"
      :key="tab"
      v-auto-animate
      class="divide-y divide-default"
    >
      <DownloadItem
        v-for="row in shown"
        :key="row.key"
        :job="row.job"
        :item-id="row.itemId"
        :item="items[row.itemId]"
        :app-name="appNames[row.job.appId]"
        @log="emit('log', $event)"
      />
    </ul>
  </section>
</template>
