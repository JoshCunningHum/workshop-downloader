<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import * as steam from '~/lib/services/steam'

const setup = useSetup()
const { save } = useSettings()
const catalog = useCatalog()
const selection = useAppSelection()

const path = ref('')
const detecting = ref(false)
const scanning = ref(false)
const error = ref<string | null>(null)

async function detect() {
  detecting.value = true
  error.value = null
  try {
    const root = await steam.rootPath()
    if (root) path.value = root
    else error.value = 'Steam was not found automatically. Choose its folder.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    detecting.value = false
  }
}

async function browse() {
  const dir = await open({ directory: true, defaultPath: path.value || undefined })
  if (typeof dir === 'string') path.value = dir
}

async function proceed() {
  if (!path.value) return
  scanning.value = true
  error.value = null
  try {
    await save('steamPath', path.value)
    // Pre-create a row for every installed game so the sidebar selector isn't empty.
    const games = await steam.installedGames()
    await catalog.importInstalledGames(games)
    await selection.refresh()
    await setup.next()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    scanning.value = false
  }
}

onMounted(detect)
</script>

<template>
  <div class="space-y-4">
    <UFormField
      label="Steam folder"
      description="Where Steam is installed. Installed games are added to the game list."
      :error="error ?? undefined"
    >
      <UFieldGroup class="w-full">
        <UInput
          v-model="path"
          icon="i-lucide-folder"
          class="w-full"
          placeholder="Paste a path or choose a folder"
        />
        <OpenFolderButton
          :path="path"
          size="md"
        />
        <UButton
          icon="i-lucide-folder-search"
          color="neutral"
          variant="outline"
          aria-label="Choose folder"
          @click="browse"
        />
      </UFieldGroup>
    </UFormField>

    <div class="flex justify-end gap-2">
      <UButton
        icon="i-lucide-refresh-ccw"
        color="neutral"
        variant="outline"
        :label="detecting ? 'Detecting' : 'Autodetect'"
        :loading="detecting"
        @click="detect"
      />
      <UButton
        label="Continue"
        trailing-icon="i-lucide-chevron-right"
        :loading="scanning"
        :disabled="!path"
        @click="proceed"
      />
    </div>
  </div>
</template>
