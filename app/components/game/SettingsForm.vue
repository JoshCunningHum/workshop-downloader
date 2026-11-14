<script setup lang="ts">
import { AUTO_ADAPTER, LINK_MODES } from '~/constants/games'
import type { GamePage } from '~/composables/games/use-game-page'
import type { AccountRow, AdapterRow, AppRow } from '~/lib/db/schema'
import type { AdapterDefinition } from '~/types/adapters'

// A game's settings: name, folders, link type, adapter, account, retention, auto-update.
// Saving a new mods folder offers to import the item folders already in it.
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
const { form, adapterItems, accountItems, modsFolderPath, browse, detectInstall, save } = useGameSettings({
  app: toRef(props, 'app'),
  adapter: toRef(props, 'adapter'),
  adapters: toRef(props, 'adapters'),
  accounts: toRef(props, 'accounts'),
  run: (label, action) => props.run(label, action),
  onModsFolderChanged: () => {
    importOpen.value = true
  }
})
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
    class="max-w-2xl space-y-4"
    @submit.prevent="save"
  >
    <UFormField label="Name">
      <UInput
        v-model="form.name"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Game install folder"
      description="Used for {install} in adapter templates and game version detection."
    >
      <div class="flex gap-2">
        <UInput
          v-model="form.installPath"
          class="flex-1"
        />
        <OpenFolderButton
          :path="form.installPath"
          size="md"
        />
        <UButton
          color="neutral"
          variant="outline"
          label="Browse"
          @click="browse('installPath')"
        />
        <UButton
          color="neutral"
          variant="outline"
          label="Find in Steam"
          @click="detectInstall"
        />
      </div>
    </UFormField>
    <UFormField
      label="Mods folder"
      :description="`Where links are created. Empty uses the adapter's template${adapter.modsPath ? ` (${adapter.modsPath})` : ''}.`"
    >
      <div class="flex gap-2">
        <UInput
          v-model="form.modsPath"
          class="flex-1"
          :placeholder="adapter.modsPath"
        />
        <OpenFolderButton
          :path="modsFolderPath"
          size="md"
        />
        <UButton
          color="neutral"
          variant="outline"
          label="Browse"
          @click="browse('modsPath')"
        />
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-folder-input"
          label="Import existing…"
          :disabled="form.modsPath !== (app.modsPath ?? '')"
          :title="form.modsPath !== (app.modsPath ?? '') ? 'Save the new folder first' : undefined"
          @click="importOpen = true"
        />
      </div>
    </UFormField>
    <UFormField
      label="Link type"
      description="Windows only; the macOS dev build always uses symlinks."
    >
      <USelect
        v-model="form.linkMode"
        :items="LINK_MODES"
        class="w-72"
      />
    </UFormField>
    <UFormField label="Adapter">
      <USelect
        :model-value="form.adapterId ?? AUTO_ADAPTER"
        :items="adapterItems"
        class="w-72"
        @update:model-value="form.adapterId = $event === AUTO_ADAPTER ? null : $event"
      />
    </UFormField>
    <UFormField
      label="Manual game version"
      description="Overrides the detected version."
    >
      <UInput v-model="form.manualGameVersion" />
    </UFormField>
    <UFormField
      label="Steam account"
      description="Some workshop items need an account that owns the game."
    >
      <USelect
        :model-value="form.accountId ?? 0"
        :items="accountItems"
        class="w-72"
        @update:model-value="form.accountId = $event || null"
      />
    </UFormField>
    <UFormField
      label="Snapshots to keep per item"
      description="Older ones are deleted after a new download. Pinned and active snapshots are always kept. 0 keeps everything."
    >
      <UInputNumber
        v-model="form.retention"
        :min="0"
      />
    </UFormField>
    <USwitch
      v-model="form.autoUpdate"
      label="Download updates automatically when the timed update check finds them"
    />
    <UButton
      type="submit"
      label="Save"
      :loading="busy"
    />
  </form>

  <ModsImportDialog
    v-model:open="importOpen"
    :app="app"
    @imported="emit('imported')"
  />
</template>
