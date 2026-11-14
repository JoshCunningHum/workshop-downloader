<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import * as appIndex from '~/lib/services/app-index'
import * as steam from '~/lib/services/steam'

const { settings, save } = useSettings()
const attempt = useAttempt()
const toast = useToast()
const jobsStore = useJobs()

const pickSteam = () => attempt('Choosing folder', async () => {
  const dir = await open({ directory: true, defaultPath: settings.value.steamPath ?? undefined })
  if (typeof dir === 'string') await save('steamPath', dir)
})

const detectSteam = () => attempt('Detecting Steam', async () => {
  const root = await steam.rootPath()
  if (!root) throw new Error('Steam was not found automatically')
  await save('steamPath', root)
})

// --- app list (game selector) ---
const selection = useAppSelection()
const { data: appIndexSize, refresh: refreshAppIndexSize } = useAsyncData('steam-app-index-size', () => appIndex.size())
const rebuilding = ref(false)
const rebuildProgress = ref<{ done: number, total: number } | null>(null)
// SteamCMD output and fetched apps, kept after the run until the next one.
const rebuildLog = ref<string[]>([])
const logEl = useTemplateRef('logEl')
const MAX_LOG_LINES = 500

function addLog(line: string) {
  rebuildLog.value.push(line)
  if (rebuildLog.value.length > MAX_LOG_LINES) rebuildLog.value.splice(0, rebuildLog.value.length - MAX_LOG_LINES)
  // Follow the newest line.
  nextTick(() => logEl.value?.scrollTo({ top: logEl.value.scrollHeight }))
}

const rebuildAppIndex = () => attempt('Updating the app list', async () => {
  rebuilding.value = true
  rebuildProgress.value = null
  rebuildLog.value = []
  try {
    const saved = await appIndex.rebuild((event) => {
      switch (event.type) {
        case 'log':
          addLog(event.line)
          break
        case 'package':
          rebuildProgress.value = { done: 0, total: event.count }
          addLog(`[app list] ${event.count} apps in package 17906, fetching names`)
          break
        case 'app':
          rebuildProgress.value = { done: event.done, total: event.total }
          addLog(`[app list] ${event.entry.appId} ${event.entry.name ?? '(no name)'}`)
          break
      }
    })
    addLog(`[app list] saved ${saved} apps`)
    await selection.refresh()
    toast.add({ title: `App list updated (${saved} apps)`, color: 'success' })
  } catch (e) {
    addLog(`[app list] failed: ${e instanceof Error ? e.message : String(e)}`)
    throw e
  } finally {
    rebuilding.value = false
    rebuildProgress.value = null
    await refreshAppIndexSize()
  }
})
</script>

<template>
  <div class="flex flex-col">
    <SettingsSection
      title="Steam folder"
      description="Where Steam is installed."
    >
      <div class="flex max-w-2xl gap-2">
        <UInput
          :model-value="settings.steamPath ?? ''"
          readonly
          class="flex-1"
          placeholder="Not set"
        />
        <OpenFolderButton
          :path="settings.steamPath"
          size="md"
        />
        <UButton
          label="Detect"
          color="neutral"
          variant="outline"
          @click="detectSteam"
        />
        <UButton
          label="Choose…"
          color="neutral"
          variant="outline"
          @click="pickSteam"
        />
      </div>
    </SettingsSection>

    <SettingsSection
      title="App list"
      :description="`Apps whose dedicated servers and tools SteamCMD can download anonymously (Steam package 17906). The game selector searches this list. ${appIndexSize ?? 0} apps stored.`"
    >
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-refresh-cw"
          label="Update app list"
          color="neutral"
          variant="outline"
          :loading="rebuilding"
          :disabled="jobsStore.active.value.length > 0"
          @click="rebuildAppIndex"
        />
        <span
          v-if="rebuildProgress"
          class="text-sm text-muted"
        >{{ rebuildProgress.done }} / {{ rebuildProgress.total }}</span>
      </div>
      <pre
        v-if="rebuildLog.length"
        ref="logEl"
        class="mt-3 max-h-64 overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap"
      >{{ rebuildLog.join('\n') }}</pre>
    </SettingsSection>
  </div>
</template>
