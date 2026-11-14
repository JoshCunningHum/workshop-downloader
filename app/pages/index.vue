<script setup lang="ts">
import type { LiveJob } from '~/types/jobs'

// Downloads: the workshop link input, Steam Guard prompts, workers and the item tabs.
const { appNames, items, active, finished, failed, workers, guarded } = useDownloadRows()
const logJob = ref<LiveJob | null>(null)
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <WorkshopLinkSection />

      <DownloadGuardPrompt
        v-for="job in guarded"
        :key="job.id"
        :job="job"
        :app-name="appNames[job.appId]"
      />

      <DownloadWorkerBadges
        :workers="workers"
        :app-names="appNames"
      />

      <DownloadList
        :rows="{ active, finished, failed }"
        :items="items"
        :app-names="appNames"
        @log="logJob = $event"
      />

      <DownloadLogModal
        v-model="logJob"
        :app-names="appNames"
      />
    </template>
  </UDashboardPanel>
</template>
