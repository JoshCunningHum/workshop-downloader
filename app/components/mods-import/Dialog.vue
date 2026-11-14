<script setup lang="ts">
import type { AppRow } from '~/lib/db/schema'
import type { ImportCandidate } from '~/types/mods'

const props = defineProps<{ app: AppRow }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()

const mods = useModsImport()
const { settings } = useSettings()

const folder = ref<string | null>(null)
const scanning = ref(false)
const importing = ref(false)
const error = ref<string | null>(null)
const candidates = ref<ImportCandidate[]>([])
const chosen = ref(new Set<string>())
const results = ref<Record<string, string | null>>({})
const done = ref(0)
const total = ref(0)

const ready = computed(() => candidates.value.filter(c => c.status === 'ready'))
const skipped = computed(() => candidates.value.filter(c => c.status !== 'ready'))
const failed = computed(() => Object.values(results.value).filter(Boolean).length)

async function scan() {
  scanning.value = true
  error.value = null
  candidates.value = []
  results.value = {}
  done.value = 0
  try {
    folder.value = await mods.modsFolder(props.app)
    candidates.value = await mods.scan(props.app)
    chosen.value = new Set(ready.value.map(c => c.itemId))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    scanning.value = false
  }
}

function toggle(id: string, on: boolean | 'indeterminate') {
  const next = new Set(chosen.value)
  if (on === true) next.add(id)
  else next.delete(id)
  chosen.value = next
}

async function runImport() {
  const queue = ready.value.filter(c => chosen.value.has(c.itemId))
  importing.value = true
  done.value = 0
  total.value = queue.length
  for (const candidate of queue) {
    try {
      await mods.importOne(props.app, candidate)
      results.value[candidate.itemId] = null
    } catch (e) {
      results.value[candidate.itemId] = e instanceof Error ? e.message : String(e)
    }
    done.value++
  }
  importing.value = false
  emit('imported')
}

const finished = computed(() => Object.keys(results.value).length > 0 && !importing.value)

watch(open, (value) => {
  if (value) scan()
}, { immediate: true })
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import existing items"
    :dismissible="!importing"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div
          v-if="folder"
          class="flex items-center gap-1"
        >
          <code class="truncate text-xs text-muted">{{ folder }}</code>
          <OpenFolderButton
            :path="folder"
            size="xs"
            variant="ghost"
          />
        </div>

        <div
          v-if="scanning"
          class="flex items-center gap-2 text-sm"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="animate-spin"
          />
          Scanning the mods folder and checking items with Steam…
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          :description="error"
        />

        <UAlert
          v-if="!settings.libraryPath"
          color="warning"
          variant="subtle"
          description="Set a library folder in Settings before importing."
        />

        <template v-if="!scanning && !error">
          <p
            v-if="!candidates.length"
            class="text-sm text-muted"
          >
            No workshop item folders (named by item id) were found here.
          </p>

          <template v-if="ready.length">
            <p class="text-sm text-muted">
              Each selected folder moves into the library as a snapshot, and a link takes its place,
              so the game keeps seeing it. Nothing is downloaded.
            </p>
            <ul class="max-h-80 divide-y divide-default overflow-y-auto rounded-md border border-default">
              <li
                v-for="c in ready"
                :key="c.itemId"
                class="flex items-center gap-3 p-2"
              >
                <UCheckbox
                  :model-value="chosen.has(c.itemId)"
                  :disabled="importing || c.itemId in results"
                  @update:model-value="toggle(c.itemId, $event)"
                />
                <WorkshopItemTooltip
                  :item-id="c.itemId"
                  :details="c.details"
                  class="flex flex-1 items-center gap-3"
                >
                  <WorkshopItemThumbnail
                    :src="c.details?.previewUrl"
                    :placeholder="false"
                    class="size-9 rounded"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm">
                      {{ c.details?.title || c.itemId }}
                    </p>
                    <p class="text-xs text-muted">
                      {{ c.itemId }} · {{ formatBytes(c.details?.fileSize ?? 0) }}
                      <template v-if="c.details && c.timeUpdated < c.details.timeUpdated">
                        · older than Steam's latest
                      </template>
                    </p>
                    <p
                      v-if="results[c.itemId]"
                      class="text-xs text-error"
                    >
                      {{ results[c.itemId] }}
                    </p>
                  </div>
                </WorkshopItemTooltip>
                <UIcon
                  v-if="c.itemId in results"
                  :name="results[c.itemId] ? 'i-lucide-circle-x' : 'i-lucide-circle-check'"
                  :class="results[c.itemId] ? 'text-error' : 'text-success'"
                  class="size-5"
                />
              </li>
            </ul>
          </template>

          <details
            v-if="skipped.length"
            class="text-sm"
          >
            <summary class="cursor-pointer text-muted">
              {{ skipped.length }} folder(s) skipped
            </summary>
            <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto">
              <li
                v-for="c in skipped"
                :key="c.itemId"
              >
                <span class="font-mono text-xs">{{ c.itemId }}</span>
                <span
                  v-if="c.details?.title"
                  class="ms-1"
                >{{ c.details.title }}</span>
                <span class="ms-1 text-muted">· {{ c.reason }}</span>
              </li>
            </ul>
          </details>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <span
          v-if="importing || finished"
          class="text-sm text-muted"
        >
          {{ done }} / {{ total }} processed<template v-if="failed">, {{ failed }} failed</template>
        </span>
        <UButton
          class="ms-auto"
          color="neutral"
          variant="ghost"
          :label="finished ? 'Close' : 'Cancel'"
          :disabled="importing"
          @click="open = false"
        />
        <UButton
          v-if="!finished"
          icon="i-lucide-folder-input"
          :label="`Import ${chosen.size}`"
          :loading="importing"
          :disabled="!chosen.size || !settings.libraryPath || scanning"
          @click="runImport"
        />
      </div>
    </template>
  </UModal>
</template>
