<script setup lang="ts">
import { Channel, invoke } from '@tauri-apps/api/core'

const setup = useSetup()

const log = ref<string[]>([])
const installing = ref(false)
const error = ref<string | null>(null)

async function install() {
  installing.value = true
  error.value = null
  log.value = []
  const channel = new Channel<string>()
  channel.onmessage = line => log.value.push(line)
  try {
    await invoke('steamcmd_install', { reinstall: false, onLog: channel })
    await setup.next()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    installing.value = false
  }
}

// Same as the Settings page: downloads SteamCMD from Valve and runs its first update.
onMounted(install)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <UIcon
        :name="error ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
        :class="error ? 'text-error' : 'animate-spin text-primary'"
      />
      <span v-if="error">SteamCMD install failed</span>
      <span v-else>Installing SteamCMD…</span>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :description="error"
    />

    <pre
      v-if="log.length"
      class="max-h-64 overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap"
    >{{ log.join('\n') }}</pre>

    <div
      v-if="error"
      class="flex justify-end"
    >
      <UButton
        icon="i-lucide-rotate-ccw"
        label="Retry"
        :loading="installing"
        @click="install"
      />
    </div>
  </div>
</template>
