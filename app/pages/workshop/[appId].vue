<script setup lang="ts">
// A game's Steam Workshop in the embedded browser, under a toolbar. The browser is a native
// webview kept over the frame below; its Subscribe buttons are "Add to queue" buttons.
const route = useRoute()
const appId = computed(() => Number(route.params.appId))

const { apps } = useAppSelection()
const name = computed(() => apps.value.find(a => a.appId === appId.value)?.name ?? `App ${appId.value}`)

const frame = useTemplateRef<HTMLElement>('frame')
const { error, location, retry } = useWorkshopFrame(frame, appId)
</script>

<template>
  <UDashboardPanel :ui="{ body: 'p-0 sm:p-0 gap-0 sm:gap-0 overflow-hidden' }">
    <template #header>
      <WorkshopBrowserToolbar
        :app-id="appId"
        :name="name"
        :location="location"
      />
    </template>

    <template #body>
      <div
        ref="frame"
        class="relative min-h-0 flex-1"
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
    </template>
  </UDashboardPanel>
</template>
