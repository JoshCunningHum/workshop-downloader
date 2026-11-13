<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { desc, eq } from 'drizzle-orm'
import { detectGameVersion, detectItemVersions, validateDefinition } from '~/adapters/engine'
import type { AdapterDefinition, FileContent } from '~/adapters/types'
import { snapshots, workshopItems } from '~/db/schema'

const route = useRoute()
const isNew = route.params.id === 'new'

const adaptersApi = useAdapters()
const catalog = useCatalog()
const steam = useSteamApi()
const { db } = useDb()
const toast = useToast()

const builtin = ref(false)
const def = ref<AdapterDefinition>({ id: '', name: '', appId: null, linkName: '{itemId}', gameVersion: [], itemVersions: [] })

const sourceId = isNew ? (route.query.from as string | undefined) : String(route.params.id)
if (sourceId) {
  const row = await adaptersApi.get(sourceId)
  if (row) {
    def.value = structuredClone(toRaw(row.definition))
    builtin.value = !isNew && row.builtin
    if (isNew) {
      def.value.id = `${row.id}-copy`
      def.value.name = `${row.name} (copy)`
    }
  }
}

const errors = computed(() => validateDefinition(def.value))
const json = computed(() => JSON.stringify(def.value, null, 2))
// Comma-separated in the form; stored as a list (omitted when empty).
const manifestText = computed({
  get: () => (def.value.itemManifest ?? []).join(', '),
  set: (text: string) => {
    const globs = text.split(',').map(g => g.trim()).filter(Boolean)
    def.value.itemManifest = globs.length ? globs : undefined
  }
})

const appIdText = computed({
  get: () => def.value.appId?.toString() ?? '',
  set: (v: string) => {
    def.value.appId = v.trim() ? Number(v) : null
  }
})

async function save() {
  try {
    await adaptersApi.save(def.value)
    toast.add({ title: 'Adapter saved', color: 'success' })
    if (isNew) await navigateTo(`/adapters/${def.value.id}`, { replace: true })
  } catch (e) {
    toast.add({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), color: 'error' })
  }
}

async function remove() {
  try {
    await adaptersApi.remove(def.value.id)
    await navigateTo('/adapters')
  } catch (e) {
    toast.add({ title: 'Could not delete', description: e instanceof Error ? e.message : String(e), color: 'error' })
  }
}

// --- test panel: runs the (unsaved) rules against a downloaded item and an app's install ---
const readFiles = (root: string, globs: string[]) => invoke<FileContent[]>('read_files', { root, globs, maxBytes: 256 * 1024 })

const { data: testData } = useAsyncData('adapter-test-data', async () => {
  const apps = await catalog.listApps()
  const items = await db().select({ id: workshopItems.id, title: workshopItems.title, appId: workshopItems.appId }).from(workshopItems).orderBy(workshopItems.title)
  return { apps, items }
})
const testItemId = ref<string>()
const testAppId = ref<number>()
const itemOptions = computed(() => (testData.value?.items ?? [])
  .filter(i => def.value.appId === null || i.appId === def.value.appId)
  .map(i => ({ label: i.title || i.id, value: i.id })))
const appOptions = computed(() => (testData.value?.apps ?? [])
  .filter(a => def.value.appId === null || a.appId === def.value.appId)
  .map(a => ({ label: a.name ?? String(a.appId), value: a.appId })))

const itemResult = ref<string | null>(null)
const gameResult = ref<string | null>(null)

async function testItem() {
  const item = await catalog.getItem(testItemId.value!)
  if (!item) return
  const latest = (await db().select().from(snapshots).where(eq(snapshots.itemId, item.id)).orderBy(desc(snapshots.timeUpdated)).limit(1))[0]
  const versions = await detectItemVersions(def.value, { tags: item.tags, itemRoot: latest?.path, readFiles })
  itemResult.value = versions.length ? versions.join(', ') : `nothing found${latest ? '' : ' (no snapshot downloaded, only tags were checked)'}`
}

async function testGame() {
  const app = await catalog.getApp(testAppId.value!)
  if (!app) return
  const installed = await steam.installedGame(app.appId).catch(() => null)
  const version = await detectGameVersion(def.value, { tags: [], installPath: app.installPath, buildId: installed?.buildId, readFiles })
  gameResult.value = version ?? `nothing found${app.installPath ? '' : ' (the app has no install folder set)'}`
}
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <UAlert
        v-if="builtin"
        color="info"
        variant="subtle"
        description="Built-in adapters are read-only. Duplicate this one to customize it."
      />

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
        <UFormField
          label="Item manifest"
          description="Files every item of this game has, relative to the item folder (comma-separated globs). Used to recognize existing items in the mods folder; empty = only the Steam check."
        >
          <UInput
            v-model="manifestText"
            placeholder="About/About.xml"
            class="w-full"
          />
        </UFormField>
      </fieldset>

      <section class="max-w-4xl space-y-2">
        <h2 class="font-semibold">
          Installed game version
        </h2>
        <RuleListEditor
          v-model="def.gameVersion"
          target="game"
          :class="{ 'pointer-events-none opacity-75': builtin }"
        />
      </section>

      <section class="max-w-4xl space-y-2">
        <h2 class="font-semibold">
          Game versions an item supports
        </h2>
        <RuleListEditor
          v-model="def.itemVersions"
          target="item"
          :class="{ 'pointer-events-none opacity-75': builtin }"
        />
      </section>

      <UAlert
        v-if="errors.length"
        color="warning"
        variant="subtle"
        title="Fix before saving"
      >
        <template #description>
          <ul>
            <li
              v-for="e in errors"
              :key="e"
            >
              {{ e }}
            </li>
          </ul>
        </template>
      </UAlert>

      <div class="flex max-w-4xl flex-wrap gap-2">
        <UButton
          v-if="!builtin"
          icon="i-lucide-save"
          label="Save"
          :disabled="errors.length > 0"
          @click="save"
        />
        <UButton
          v-if="!isNew"
          :to="`/adapters/new?from=${def.id}`"
          icon="i-lucide-copy"
          label="Duplicate"
          color="neutral"
          variant="outline"
        />
        <UButton
          v-if="!isNew && !builtin"
          icon="i-lucide-trash-2"
          label="Delete"
          color="error"
          variant="outline"
          @click="remove"
        />
      </div>

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

      <details class="max-w-4xl">
        <summary class="cursor-pointer text-sm text-muted">
          JSON
        </summary>
        <pre class="mt-2 overflow-auto rounded bg-elevated p-3 text-xs">{{ json }}</pre>
      </details>
    </template>
  </UDashboardPanel>
</template>
