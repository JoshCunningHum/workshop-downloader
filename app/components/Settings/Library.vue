<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'

const { settings, save } = useSettings()
const attempt = useAttempt()

const pickLibrary = () => attempt('Choosing folder', async () => {
  const dir = await open({ directory: true, defaultPath: settings.value.libraryPath ?? undefined })
  if (typeof dir === 'string') await save('libraryPath', dir)
})
</script>

<template>
  <div class="flex flex-col">
    <SettingsSection
      title="Library folder"
      description="Snapshots are stored here. Put it on the same drive as your games: junctions only work between local NTFS drives, and same-drive moves are instant."
    >
      <div class="flex max-w-2xl gap-2">
        <UInput
          :model-value="settings.libraryPath ?? ''"
          readonly
          class="flex-1"
          placeholder="Not set"
        />
        <UButton
          label="Choose…"
          color="neutral"
          variant="outline"
          @click="pickLibrary"
        />
      </div>
    </SettingsSection>

    <SettingsSection
      title="Parallel downloads"
      description="Number of SteamCMD processes running at once. Also how many run in parallel when updating the Steam app list."
    >
      <UInputNumber
        :model-value="settings.concurrency"
        :min="1"
        :max="16"
        @update:model-value="attempt('Saving', () => save('concurrency', $event ?? 1))"
      />
    </SettingsSection>

    <SettingsSection
      title="Items per SteamCMD process"
      description="Bigger batches log in less often; smaller ones spread across workers better."
    >
      <UInputNumber
        :model-value="settings.batchSize"
        :min="1"
        :max="100"
        @update:model-value="attempt('Saving', () => save('batchSize', $event ?? 1))"
      />
    </SettingsSection>

    <SettingsSection
      title="Update checks"
      description="Games with auto-update on get their outdated items downloaded."
    >
      <div class="flex flex-wrap items-center gap-4">
        <USwitch
          :model-value="settings.updateCheckEnabled"
          label="Check for updates periodically"
          @update:model-value="attempt('Saving', () => save('updateCheckEnabled', $event))"
        />
        <UFormField
          v-if="settings.updateCheckEnabled"
          label="Every (minutes)"
          orientation="horizontal"
        >
          <UInputNumber
            :model-value="settings.updateCheckMinutes"
            :min="5"
            @update:model-value="attempt('Saving', () => save('updateCheckMinutes', $event ?? 60))"
          />
        </UFormField>
      </div>
    </SettingsSection>
  </div>
</template>
