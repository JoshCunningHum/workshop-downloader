<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'

const setup = useSetup()
const { settings, save } = useSettings()

const path = ref(settings.value.libraryPath ?? '')
const saving = ref(false)
const error = ref<string | null>(null)

async function browse() {
  const dir = await open({ directory: true, defaultPath: path.value || undefined })
  if (typeof dir === 'string') path.value = dir
}

async function proceed() {
  if (!path.value) return
  saving.value = true
  error.value = null
  try {
    await save('libraryPath', path.value)
    await setup.next()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <UFormField
      label="Library folder"
      description="Snapshots are stored here. Put it on the same drive as your games: junctions only work between local NTFS drives, and same-drive moves are instant."
      :error="error ?? undefined"
    >
      <UFieldGroup class="w-full">
        <UInput
          :model-value="path"
          icon="i-lucide-folder"
          class="w-full"
          placeholder="Not set"
          readonly
        />
        <UButton
          label="Choose…"
          color="neutral"
          variant="outline"
          @click="browse"
        />
      </UFieldGroup>
    </UFormField>

    <div class="flex justify-end">
      <UButton
        label="Continue"
        trailing-icon="i-lucide-chevron-right"
        :loading="saving"
        :disabled="!path"
        @click="proceed"
      />
    </div>
  </div>
</template>
