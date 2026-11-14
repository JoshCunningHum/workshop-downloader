<script setup lang="ts">
import { detectGameVersion, detectItemVersions } from '~/lib/adapters/engine'
import { readFiles } from '~/lib/services/adapters'
import * as items from '~/lib/services/items'
import * as snapshots from '~/lib/services/snapshots'
import * as steam from '~/lib/services/steam'
import type { AdapterDefinition } from '~/types/adapters'

// Runs the (unsaved) rules of an adapter against a downloaded item and an app's install.
const props = defineProps<{ def: AdapterDefinition }>()

const catalog = useCatalog()

const { data: testData } = useAsyncData('adapter-test-data', async () => {
  const apps = await catalog.listApps()
  return { apps, items: await items.listBrief() }
})
const testItemId = ref<string>()
const testAppId = ref<number>()
const itemOptions = computed(() => (testData.value?.items ?? [])
  .filter(i => props.def.appId === null || i.appId === props.def.appId)
  .map(i => ({ label: i.title || i.id, value: i.id })))
const appOptions = computed(() => (testData.value?.apps ?? [])
  .filter(a => props.def.appId === null || a.appId === props.def.appId)
  .map(a => ({ label: a.name ?? String(a.appId), value: a.appId })))

const itemResult = ref<string | null>(null)
const gameResult = ref<string | null>(null)

async function testItem() {
  const item = await catalog.getItem(testItemId.value!)
  if (!item) return
  const latest = await snapshots.latest(item.id)
  const versions = await detectItemVersions(props.def, { tags: item.tags, itemRoot: latest?.path, readFiles })
  itemResult.value = versions.length ? versions.join(', ') : `nothing found${latest ? '' : ' (no snapshot downloaded, only tags were checked)'}`
}

async function testGame() {
  const app = await catalog.getApp(testAppId.value!)
  if (!app) return
  const installed = await steam.installedGame(app.appId).catch(() => null)
  const version = await detectGameVersion(props.def, { tags: [], installPath: app.installPath, buildId: installed?.buildId, readFiles })
  gameResult.value = version ?? `nothing found${app.installPath ? '' : ' (the app has no install folder set)'}`
}
</script>

<template>
  <UCard class="max-w-4xl">
    <template #header>
      <span class="font-semibold">Test</span>
    </template>
    <div class="space-y-3">
      <div class="flex flex-wrap items-end gap-2">
        <UFormField label="Item (uses its newest snapshot)">
          <USelectMenu
            v-model="testItemId"
            :items="itemOptions"
            value-key="value"
            class="w-80"
          />
        </UFormField>
        <UButton
          label="Detect item versions"
          :disabled="!testItemId"
          @click="testItem"
        />
        <span
          v-if="itemResult"
          class="text-sm"
        >→ {{ itemResult }}</span>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <UFormField label="Game">
          <USelectMenu
            v-model="testAppId"
            :items="appOptions"
            value-key="value"
            class="w-80"
          />
        </UFormField>
        <UButton
          label="Detect game version"
          :disabled="!testAppId"
          @click="testGame"
        />
        <span
          v-if="gameResult"
          class="text-sm"
        >→ {{ gameResult }}</span>
      </div>
    </div>
  </UCard>
</template>
