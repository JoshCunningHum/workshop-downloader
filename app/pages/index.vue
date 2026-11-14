<script setup lang="ts">
import type { ItemRow } from '~/lib/db/schema'
import type { LiveJob } from '~/composables/useJobs'

const jobsStore = useJobs()
const { settings } = useSettings()
const catalog = useCatalog()
const attempt = useAttempt()

const appNames = ref<Record<number, string | null>>({})
const items = ref<Record<string, ItemRow>>({})

// Names, titles and previews for what's listed, fetched as new ids appear.
watch(() => jobsStore.jobs.value.map(j => j.id).join(), async () => {
  const appIds = [...new Set(jobsStore.jobs.value.map(j => j.appId))].filter(id => !(id in appNames.value))
  for (const appId of appIds) appNames.value[appId] = (await catalog.getApp(appId))?.name ?? null
  const itemIds = [...new Set(jobsStore.jobs.value.flatMap(j => j.itemIds))].filter(id => !(id in items.value))
  for (const item of await catalog.itemsByIds(itemIds)) items.value[item.id] = item
}, { immediate: true })

// One row per item, whichever SteamCMD process it runs in.
interface Row { key: string, job: LiveJob, itemId: string, state: ItemState }
const rows = computed<Row[]>(() => jobsStore.jobs.value.flatMap(job => job.itemIds.map(itemId => ({
  key: `${job.id}:${itemId}`,
  job,
  itemId,
  state: itemState(job, itemId).state
}))))

// Share of an item downloaded so far (0..1); size falls back to the Web API's file size.
function ratio(row: Row) {
  const p = row.job.progress[row.itemId]
  const total = p?.total || items.value[row.itemId]?.fileSize || 0
  return total && p ? Math.min(1, p.bytes / total) : 0
}

// Furthest along first; ties: downloading, waiting, queued, then oldest first.
const ACTIVE_ORDER: ItemState[] = ['downloading', 'waiting', 'queued']
const active = computed(() => rows.value
  .filter(r => ACTIVE_ORDER.includes(r.state))
  .sort((a, b) => ratio(b) - ratio(a)
    || ACTIVE_ORDER.indexOf(a.state) - ACTIVE_ORDER.indexOf(b.state)
    || a.job.createdAt - b.job.createdAt))
// Items finished inside a still-running process sort to the top.
const history = computed(() => rows.value
  .filter(r => !ACTIVE_ORDER.includes(r.state))
  .sort((a, b) => (b.job.finishedAt ?? Infinity) - (a.job.finishedAt ?? Infinity)))

// Finished downloads split into the ones that made it and the ones that didn't.
const finished = computed(() => history.value.filter(r => r.state === 'done'))
const failed = computed(() => history.value.filter(r => r.state !== 'done'))

type Tab = 'active' | 'finished' | 'failed'
const tab = ref<Tab>('active')
const tabs = computed(() => [
  { label: 'Active', value: 'active', icon: 'i-lucide-download', badge: String(active.value.length) },
  { label: 'Finished', value: 'finished', icon: 'i-lucide-circle-check', badge: String(finished.value.length) },
  { label: 'Failed', value: 'failed', icon: 'i-lucide-circle-x', badge: String(failed.value.length) }
])
// The selected tab takes its own colour: green for active, neutral for finished, red for failed.
const TAB_COLOR = { active: 'primary', finished: 'neutral', failed: 'error' } as const
const shown = computed(() => ({ active: active.value, finished: finished.value, failed: failed.value })[tab.value])
const EMPTY: Record<Tab, { icon: string, title: string, description: string }> = {
  active: { icon: 'i-lucide-download', title: 'Nothing downloading', description: 'Queued and downloading items show up here.' },
  finished: { icon: 'i-lucide-circle-check', title: 'No finished downloads', description: 'Items that downloaded successfully show up here.' },
  failed: { icon: 'i-lucide-circle-x', title: 'No failed downloads', description: 'Failed, cancelled and interrupted items show up here.' }
}

const guarded = computed(() => jobsStore.jobs.value.filter(j => j.guard))
const guardCodes = ref<Record<string, string>>({})

// What each worker is downloading right now.
const workers = computed(() => Array.from({ length: settings.value.concurrency }, (_, slot) => {
  const job = jobsStore.active.value.find(j => j.status === 'running' && j.slot === slot)
  const current = job ? active.value.find(r => r.job === job && r.state === 'downloading') : undefined
  return { slot, job, title: current ? (items.value[current.itemId]?.title || current.itemId) : null }
}))

const logJob = ref<LiveJob | null>(null)
const logEl = useTemplateRef<HTMLElement>('logEl')
watch(() => logJob.value?.log.length, async () => {
  await nextTick()
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight })
})
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <WorkshopLinkSection />

      <UAlert
        v-for="job in guarded"
        :key="job.id"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        :title="`Steam Guard code needed for ${appNames[job.appId] ?? `App ${job.appId}`} (${job.itemIds.length} item(s))`"
      >
        <template #description>
          <form
            class="mt-2 flex items-end gap-2"
            @submit.prevent="attempt('Steam Guard', () => jobsStore.submitGuardCode(job, guardCodes[job.id] ?? ''))"
          >
            <UFormField
              :label="job.guard === 'email' ? 'Code sent by email' : 'Code from the mobile authenticator'"
              class="flex-1"
            >
              <UInput
                v-model="guardCodes[job.id]"
                autocomplete="one-time-code"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              label="Continue"
              :disabled="!guardCodes[job.id]?.trim()"
            />
          </form>
        </template>
      </UAlert>

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

      <section class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <UTabs
            v-model="tab"
            :items="tabs"
            :content="false"
            :color="TAB_COLOR[tab]"
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
          :icon="EMPTY[tab].icon"
          :title="EMPTY[tab].title"
          :description="EMPTY[tab].description"
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
            @log="logJob = $event"
          />
        </ul>
      </section>

      <UModal
        :open="!!logJob"
        title="SteamCMD log"
        :description="logJob ? `${appNames[logJob.appId] ?? `App ${logJob.appId}`} · ${logJob.itemIds.length} item(s) in this process` : undefined"
        :ui="{ content: 'max-w-3xl' }"
        @update:open="!$event && (logJob = null)"
      >
        <template #body>
          <pre
            ref="logEl"
            class="max-h-[60vh] overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap"
          >{{ logJob?.log.join('\n') || 'No output yet.' }}</pre>
          <UAlert
            v-if="logJob?.error"
            class="mt-3"
            color="error"
            variant="subtle"
            :description="logJob.error"
          />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
