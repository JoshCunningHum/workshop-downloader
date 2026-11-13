<script setup lang="ts">
const jobsStore = useJobs()
const { settings } = useSettings()
const catalog = useCatalog()

const appNames = ref<Record<number, string | null>>({})
const titles = ref<Record<string, string>>({})

// Names for apps/items shown in job cards, fetched as new ids appear.
watch(() => jobsStore.jobs.value.map(j => j.id).join(), async () => {
  const appIds = [...new Set(jobsStore.jobs.value.map(j => j.appId))].filter(id => !(id in appNames.value))
  for (const appId of appIds) appNames.value[appId] = (await catalog.getApp(appId))?.name ?? null
  const itemIds = [...new Set(jobsStore.jobs.value.flatMap(j => j.itemIds))].filter(id => !(id in titles.value))
  for (const item of await catalog.itemsByIds(itemIds)) titles.value[item.id] = item.title
}, { immediate: true })

const finished = computed(() => jobsStore.jobs.value.filter(j => !jobsStore.active.value.includes(j)))

// Which job holds each worker slot.
const workers = computed(() => Array.from({ length: settings.value.concurrency }, (_, slot) =>
  jobsStore.active.value.find(j => j.status === 'running' && j.slot === slot) ?? null))
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <WorkshopLinkSection />

      <section>
        <h2 class="mb-2 text-sm font-semibold text-muted">
          Workers
        </h2>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="(job, slot) in workers"
            :key="slot"
            :color="job ? 'primary' : 'neutral'"
            variant="subtle"
          >
            #{{ slot }} {{ job ? (appNames[job.appId] ?? job.appId) : 'idle' }}
          </UBadge>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-muted">
          Active ({{ jobsStore.active.value.length }})
        </h2>
        <UEmpty
          v-if="!jobsStore.active.value.length"
          icon="i-lucide-download"
          title="Nothing downloading"
          description="Queued and running SteamCMD jobs show up here."
        />
        <JobCard
          v-for="job in jobsStore.active.value"
          :key="job.id"
          :job="job"
          :app-name="appNames[job.appId]"
          :titles="titles"
        />
      </section>

      <section
        v-if="finished.length"
        class="space-y-3"
      >
        <div class="flex items-center">
          <h2 class="text-sm font-semibold text-muted">
            History
          </h2>
          <UButton
            class="ms-auto"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            label="Clear"
            @click="jobsStore.clearFinished()"
          />
        </div>
        <JobCard
          v-for="job in finished"
          :key="job.id"
          :job="job"
          :app-name="appNames[job.appId]"
          :titles="titles"
        />
      </section>
    </template>
  </UDashboardPanel>
</template>
