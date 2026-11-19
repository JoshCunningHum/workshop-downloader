<script setup lang="ts">
import { AUTO_ADAPTER, LINK_MODES } from '~/constants/games'
import type { GamePage } from '~/composables/games/use-game-page'
import type { AccountRow, AdapterRow, AppRow } from '~/lib/db/schema'
import type { AdapterDefinition } from '~/types/adapters'

// A game's settings in groups: General, Folders, Versions, Downloads. Changes are kept in a form
// until saved from the bar that appears at the bottom; saving a new mods folder offers to import
// the item folders already in it.
const props = defineProps<{
  app: AppRow
  adapter: AdapterDefinition
  adapters: AdapterRow[]
  accounts: AccountRow[]
  busy: boolean
  run: GamePage['run']
}>()
const emit = defineEmits<{ back: [], imported: [] }>()

const importOpen = ref(false)
const { form, dirty, adapterItems, accountItems, modsFolderPath, browse, detectInstall, save, discard } = useGameSettings({
  app: toRef(props, 'app'),
  adapter: toRef(props, 'adapter'),
  adapters: toRef(props, 'adapters'),
  accounts: toRef(props, 'accounts'),
  run: (label, action) => props.run(label, action),
  onModsFolderChanged: () => {
    importOpen.value = true
  }
})

/** The mods folder field differs from what's saved (import works on the saved folder). */
const modsUnsaved = computed(() => form.value?.modsPath !== (props.app.modsPath ?? ''))
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      size="sm"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      aria-label="Back to items"
      @click="emit('back')"
    />
    <h2 class="font-semibold">
      Settings
    </h2>
  </div>

  <form
    v-if="form"
    class="max-w-4xl space-y-4"
    @submit.prevent="save"
  >
    <SettingsGroup
      title="General"
      icon="i-lucide-gamepad-2"
    >
      <SettingsRow
        label="Name"
        for="game-name"
      >
        <UInput
          id="game-name"
          v-model="form.name"
          :placeholder="app.store?.name ?? `App ${app.appId}`"
          class="w-full"
        />
      </SettingsRow>
      <SettingsRow
        label="Hide from the sidebar"
        description="Left out of the sidebar's game list and picker. It stays on the Games page under Show hidden."
      >
        <USwitch v-model="form.hidden" />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup
      title="Folders"
      icon="i-lucide-folder"
    >
      <SettingsRow
        label="Game install folder"
        description="Used for {install} in adapter templates and for detecting the game version."
      >
        <UInput
          v-model="form.installPath"
          placeholder="Not set"
          class="min-w-0 flex-1"
          :ui="{ trailing: 'pe-1' }"
        >
          <template #trailing>
            <OpenFolderButton
              :path="form.installPath"
              size="xs"
              variant="ghost"
            />
            <UTooltip text="Choose a folder">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis"
                aria-label="Choose a folder"
                @click="browse('installPath')"
              />
            </UTooltip>
          </template>
        </UInput>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-scan-search"
          label="Find in Steam"
          @click="detectInstall"
        />
      </SettingsRow>
      <SettingsRow
        label="Mods folder"
        :description="`Where item links are created. Empty uses the adapter's${adapter.modsPath ? ` (${adapter.modsPath})` : ' default'}.`"
      >
        <UInput
          v-model="form.modsPath"
          :placeholder="adapter.modsPath || 'Not set'"
          class="min-w-0 flex-1"
          :ui="{ trailing: 'pe-1' }"
        >
          <template #trailing>
            <OpenFolderButton
              :path="modsFolderPath"
              size="xs"
              variant="ghost"
            />
            <UTooltip text="Choose a folder">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-ellipsis"
                aria-label="Choose a folder"
                @click="browse('modsPath')"
              />
            </UTooltip>
          </template>
        </UInput>
        <UTooltip :text="modsUnsaved ? 'Save the new folder first' : 'Move item folders already there into the library'">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-folder-input"
            label="Import…"
            :disabled="modsUnsaved"
            @click="importOpen = true"
          />
        </UTooltip>
      </SettingsRow>
      <SettingsRow
        label="Link type"
        description="Windows only; the macOS dev build always uses symlinks."
      >
        <USelect
          v-model="form.linkMode"
          :items="LINK_MODES"
          class="w-full max-w-72"
        />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup
      title="Versions"
      icon="i-lucide-puzzle"
    >
      <SettingsRow
        label="Adapter"
        description="Reads the game's version and the versions each item supports."
      >
        <USelect
          :model-value="form.adapterId ?? AUTO_ADAPTER"
          :items="adapterItems"
          class="w-full max-w-72"
          @update:model-value="form.adapterId = $event === AUTO_ADAPTER ? null : $event"
        />
      </SettingsRow>
      <SettingsRow
        label="Game version"
        description="Leave empty to use the detected version; fill in to override it."
        for="game-version"
      >
        <UInput
          id="game-version"
          v-model="form.manualGameVersion"
          :placeholder="`Detected: ${app.detectedGameVersion ?? 'unknown'}`"
          class="w-full max-w-72"
        />
      </SettingsRow>
    </SettingsGroup>

    <SettingsGroup
      title="Downloads"
      icon="i-lucide-download"
    >
      <SettingsRow
        label="Steam account"
        description="Some workshop items need an account that owns the game."
      >
        <USelect
          :model-value="form.accountId ?? 0"
          :items="accountItems"
          class="w-full max-w-72"
          @update:model-value="form.accountId = $event || null"
        />
      </SettingsRow>
      <SettingsRow
        label="Snapshots kept per item"
        description="Older ones are deleted after a new download; pinned and active ones are always kept. 0 keeps everything."
      >
        <UInputNumber
          v-model="form.retention"
          :min="0"
          class="w-36"
        />
      </SettingsRow>
      <SettingsRow
        label="Download updates automatically"
        description="When the timed update check (Settings) finds updates, queue them for this game."
      >
        <USwitch v-model="form.autoUpdate" />
      </SettingsRow>
    </SettingsGroup>

    <!-- Only while something is unsaved; sticks to the bottom of the panel as it scrolls. -->
    <Transition
      enter-from-class="translate-y-2 opacity-0"
      leave-to-class="translate-y-2 opacity-0"
      enter-active-class="transition duration-150"
      leave-active-class="transition duration-150"
    >
      <div
        v-if="dirty"
        class="sticky bottom-4 z-10 flex items-center gap-2 rounded-lg border border-default bg-elevated px-4 py-2.5 shadow-lg"
      >
        <UIcon
          name="i-lucide-circle-dot"
          class="size-4 text-warning"
        />
        <span class="text-sm">Unsaved changes</span>
        <UButton
          class="ms-auto"
          color="neutral"
          variant="ghost"
          label="Discard"
          :disabled="busy"
          @click="discard"
        />
        <UButton
          type="submit"
          label="Save"
          :loading="busy"
        />
      </div>
    </Transition>
  </form>

  <ModsImportDialog
    v-model:open="importOpen"
    :app="app"
    @imported="emit('imported')"
  />
</template>
