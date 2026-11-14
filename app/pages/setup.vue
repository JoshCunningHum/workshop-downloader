<script setup lang="ts">
import { SetupStatus } from '~/constants/setup'

definePageMeta({ layout: 'blank' })

const setup = useSetup()
const { status } = setup

onMounted(setup.next)
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
    <SetupStepper />
    <UCard class="w-full max-w-xl">
      <div
        v-if="status === SetupStatus.Idle || status === SetupStatus.Finished"
        class="flex items-center justify-center gap-2"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        Loading
      </div>
      <SetupSteamStep v-else-if="status === SetupStatus.Steam" />
      <SetupLibraryStep v-else-if="status === SetupStatus.Library" />
      <SetupSteamCmdStep v-else-if="status === SetupStatus.SteamCmd" />
      <SetupAppListStep v-else-if="status === SetupStatus.AppList" />
    </UCard>
  </div>
</template>
