<script setup lang="ts">
import { DOWNLOAD_TABS } from '~/constants/downloads'
import type { ItemRow } from '~/lib/db/schema'
import type { DownloadRow, DownloadTab } from '~/types/downloads'
import type { LiveJob } from '~/types/jobs'

// The Active / Finished / Failed tabs and the items in the selected one.
const props = defineProps<{
  rows: Record<DownloadTab, DownloadRow[]>
  items: Record<string, ItemRow>
  appNames: Record<number, string | null>
}>()
const emit = defineEmits<{ log: [job: LiveJob] }>()

const jobsStore = useJobs()

const tab = ref<DownloadTab>('active')
const tabs = computed(() => (Object.keys(DOWNLOAD_TABS) as DownloadTab[]).map(value => ({
  label: DOWNLOAD_TABS[value].label,
  value,
  icon: DOWNLOAD_TABS[value].icon,
  badge: String(props.rows[value].length)
})))
const shown = computed(() => props.rows[tab.value])
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
        v-if="tab !== 'active' && shown.length"
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

    <UEmpty
      v-if="!shown.length"
      :icon="empty.icon"
      :title="empty.empty.title"
      :description="empty.empty.description"
    />
    <ul
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
