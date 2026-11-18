<script setup lang="ts">
// A game's Steam Workshop in the embedded browser, under a toolbar. The browser is a native
// webview kept over the frame below; its Subscribe buttons are "Add to queue" buttons.
const route = useRoute()
const appId = computed(() => Number(route.params.appId))

const { apps } = useAppSelection()
const name = computed(() => apps.value.find(a => a.appId === appId.value)?.name ?? `App ${appId.value}`)

// The queue panel on the right; remembered between visits.
const queueOpen = useLocalStorage('workshop:queue-open', false)

const frame = useTemplateRef<HTMLElement>('frame')
const { error, location, retry } = useWorkshopFrame(frame, appId)
</script>

<template>
  <UDashboardPanel :ui="{ body: 'p-0 sm:p-0 gap-0 sm:gap-0 overflow-hidden' }">
    <template #header>
      <WorkshopBrowserToolbar
        v-model:queue-open="queueOpen"
        :app-id="appId"
        :name="name"
        :location="location"
      />
    </template>

    <template #body>
      <div class="flex min-h-0 flex-1">
        <div
          ref="frame"
          class="relative min-w-0 flex-1"
        >
          <UEmpty
            v-if="error"
            class="absolute inset-0"
            icon="i-lucide-globe-lock"
            title="The workshop browser could not open"
            :description="error"
            :actions="[{ label: 'Try again', onClick: () => retry() }]"
          />
          <div
            v-else
            class="absolute inset-0 flex items-center justify-center text-sm text-dimmed"
          >
            Loading the workshop…
          </div>
        </div>

        <aside
          v-if="queueOpen"
          class="w-96 shrink-0 overflow-y-auto border-l border-default p-4"
        >
          <h2 class="mb-3 text-sm font-medium text-highlighted">
            Queue
          </h2>
          <DownloadQueueList no-details />
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
