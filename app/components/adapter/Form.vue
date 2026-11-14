<script setup lang="ts">
import type { AdapterDefinition } from '~/types/adapters'

// The fields of an adapter and its two rule lists. Read-only for built-in adapters.
defineProps<{ isNew: boolean, builtin: boolean }>()
const def = defineModel<AdapterDefinition>({ required: true })

const appIdText = computed({
  get: () => def.value.appId?.toString() ?? '',
  set: (v: string) => {
    def.value.appId = v.trim() ? Number(v) : null
  }
})
</script>

<template>
  <fieldset
    :disabled="builtin"
    class="grid max-w-3xl gap-4 sm:grid-cols-2"
  >
    <UFormField label="Id">
      <UInput
        v-model="def.id"
        :disabled="!isNew"
        class="w-full"
      />
    </UFormField>
    <UFormField label="Name">
      <UInput
        v-model="def.name"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="AppID"
      description="Empty = usable for any game."
    >
      <UInput
        v-model="appIdText"
        inputmode="numeric"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Mods folder template"
      description="{install} = game install folder, {appId}"
    >
      <UInput
        v-model="def.modsPath"
        placeholder="{install}/Mods"
        class="w-full"
      />
    </UFormField>
    <UFormField
      label="Link name template"
      description="{itemId}, {title}, {appId}"
    >
      <UInput
        v-model="def.linkName"
        placeholder="{itemId}"
        class="w-full"
      />
    </UFormField>
  </fieldset>

  <section class="max-w-4xl space-y-2">
    <h2 class="font-semibold">
      Installed game version
    </h2>
    <AdapterRuleList
      v-model="def.gameVersion"
      target="game"
      :class="{ 'pointer-events-none opacity-75': builtin }"
    />
  </section>

  <section class="max-w-4xl space-y-2">
    <h2 class="font-semibold">
      Game versions an item supports
    </h2>
    <AdapterRuleList
      v-model="def.itemVersions"
      target="item"
      :class="{ 'pointer-events-none opacity-75': builtin }"
    />
  </section>
</template>
