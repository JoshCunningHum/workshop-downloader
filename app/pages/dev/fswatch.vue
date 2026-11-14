<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import * as files from '~/lib/services/files'

// Exercises the fswatch sidecar: one-off size and a live watch of a folder.

const path = ref('')
const size = ref<files.Totals | null>(null)
const live = ref<files.Totals | null>(null)
const updates = ref(0)
const watching = ref(false)
const error = ref<string | null>(null)
const WATCH_ID = 'dev-fswatch'

async function pick() {
  const dir = await open({ directory: true })
  if (typeof dir === 'string') path.value = dir
}

async function measure() {
  error.value = null
  try {
    size.value = await files.size(path.value)
  } catch (e) {
    error.value = String(e)
  }
}

async function toggleWatch() {
  if (watching.value) {
    await files.unwatch(WATCH_ID)
    watching.value = false
    return
  }
  await files.watch(WATCH_ID, [path.value], 500, (totals) => {
    live.value = totals
    updates.value++
  })
  watching.value = true
}

onBeforeUnmount(() => {
  if (watching.value) files.unwatch(WATCH_ID)
})
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <div class="max-w-2xl space-y-4">
        <div class="flex gap-2">
          <UInput
            v-model="path"
            class="flex-1"
            placeholder="Folder path"
          />
          <UButton
            label="Browse"
            color="neutral"
            variant="outline"
            @click="pick"
          />
        </div>
        <div class="flex gap-2">
          <UButton
            label="Measure once"
            :disabled="!path"
            @click="measure"
          />
          <UButton
            :label="watching ? 'Stop watching' : 'Watch'"
            color="neutral"
            variant="outline"
            :disabled="!path"
            @click="toggleWatch"
          />
        </div>
        <UAlert
          v-if="error"
          color="error"
          :description="error"
        />
        <p v-if="size">
          Size: {{ formatBytes(size.bytes) }} in {{ size.files }} files
        </p>
        <p v-if="live">
          Live: {{ formatBytes(live.bytes) }} in {{ live.files }} files ({{ updates }} updates)
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
