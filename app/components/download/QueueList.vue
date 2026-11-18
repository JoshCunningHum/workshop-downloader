<script setup lang="ts">
import { DOWNLOAD_TABS } from '~/constants/downloads'

// The Queue tab: pasted items waiting to be downloaded, ticked ones start with "Download".
// `noDetails` turns off the rows' hover cards (used beside the Workshop browser).
defineProps<{ noDetails?: boolean }>()
const queue = useDownloadQueue()
const { settings } = useSettings()
const empty = DOWNLOAD_TABS.queue.empty
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="queue.entries.value.length"
      class="flex flex-wrap items-center gap-2"
    >
      <UCheckbox
        :model-value="queue.allChecked.value"
        label="Select all"
        @update:model-value="queue.toggleAll"
      />
      <UButton
        class="ms-auto"
        size="xs"
        icon="i-lucide-download"
        :label="`Download ${queue.checked.value.length}`"
        :loading="queue.downloading.value"
        :disabled="!queue.checked.value.length || !settings.libraryPath"
        @click="queue.download"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        label="Clear queue"
        @click="queue.clear"
      />
    </div>

    <UEmpty
      v-if="!queue.entries.value.length"
      :icon="DOWNLOAD_TABS.queue.icon"
      :title="empty.title"
      :description="empty.description"
    />
    <ul
      v-auto-animate
      class="divide-y divide-default"
    >
      <DownloadQueueItem
        v-for="entry in queue.entries.value"
        :key="entry.details.id"
        :entry="entry"
        :no-details="noDetails"
        @toggle="queue.toggle(entry.details.id, $event)"
        @remove="queue.remove(entry.details.id)"
      />
    </ul>
  </div>
</template>
