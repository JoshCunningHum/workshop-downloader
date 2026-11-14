<script setup lang="ts">
import { ROUTES } from '~/constants/routes'

// Paste workshop links or ids (or press Ctrl/⌘+V anywhere on the page): they're resolved with
// Steam and added to the download queue.
const { settings } = useSettings()
const queue = useDownloadQueue()
const toast = useToast()
const route = useRoute()

const input = ref('')
const ids = computed(() => parseWorkshopIds(input.value))
const invalid = computed(() => !!input.value.trim() && !ids.value.length)

const openSettings = [{ label: 'Open settings', to: ROUTES.settings }]

async function addToQueue() {
  if (!ids.value.length) return
  const added = await queue.add(input.value)
  if (!added) return
  input.value = ''
  const onDownloads = route.path === ROUTES.home
  toast.add({
    title: `Added ${added} item(s) to the queue`,
    color: 'success',
    actions: onDownloads ? undefined : [{ label: 'View queue', onClick: () => navigateTo(ROUTES.home) }]
  })
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-start gap-2">
      <WorkshopLinkInput
        v-model="input"
        class="flex-1"
        @submit="addToQueue"
      />
      <UButton
        icon="i-lucide-list-plus"
        :label="`Add to queue${ids.length ? ` (${ids.length})` : ''}`"
        :loading="queue.adding.value"
        :disabled="!ids.length"
        @click="addToQueue"
      />
    </div>

    <UAlert
      v-if="invalid"
      color="warning"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="No workshop ids found"
      description="Paste workshop item or collection ids, steamcommunity.com links, or steam:// links."
    />

    <UAlert
      v-if="!settings.libraryPath"
      color="warning"
      variant="subtle"
      title="No library folder yet"
      description="Choose where snapshots are stored before downloading."
      :actions="openSettings"
    />
  </section>
</template>
