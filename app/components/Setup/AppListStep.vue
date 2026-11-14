<script setup lang="ts">
import * as appIndex from '~/lib/services/app-index'
import type { AppEntry, AppIndexEvent } from '~/types/steamcmd'

const setup = useSetup()
const selection = useAppSelection()

const running = ref(false)
const error = ref<string | null>(null)
const title = ref('Asking Steam for the app list…')
const done = ref(0)
const total = ref(0)
const recent = ref<AppEntry[]>([])
const log = ref<string[]>([])

const progress = computed(() => total.value ? Math.round(done.value / total.value * 100) : 0)

function onEvent(event: AppIndexEvent) {
  switch (event.type) {
    case 'log':
      log.value = [...log.value.slice(-49), event.line]
      break
    case 'package':
      total.value = event.count
      title.value = `Found ${event.count} apps, getting names`
      break
    case 'app':
      done.value = event.done
      total.value = event.total
      recent.value = [...recent.value.slice(-49), event.entry]
      break
  }
}

async function start() {
  running.value = true
  error.value = null
  done.value = 0
  total.value = 0
  recent.value = []
  log.value = []
  title.value = 'Asking Steam for the app list…'
  try {
    const saved = await appIndex.rebuild(onEvent)
    title.value = `Saved ${saved} apps`
    await selection.refresh()
    await setup.next()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    running.value = false
  }
}

onMounted(start)
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <UIcon
          :name="error ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
          :class="error ? 'text-error' : 'animate-spin text-primary'"
        />
        <span>{{ error ? 'Getting the app list failed' : title }}</span>
      </div>
      <span
        v-if="total"
        class="text-sm text-muted"
      >{{ done }} / {{ total }}</span>
    </div>

    <UProgress
      :model-value="total ? progress : null"
      :max="100"
    />

    <div class="flex max-h-32 flex-col-reverse overflow-y-auto rounded bg-elevated p-2">
      <div
        v-if="!recent.length"
        class="py-4 text-center text-sm text-muted"
      >
        No apps yet…
      </div>
      <div>
        <div
          v-for="entry in recent"
          :key="entry.appId"
          class="flex items-center text-sm"
        >
          <div class="w-20 shrink-0 pr-2 text-right font-mono text-dimmed">
            {{ entry.appId }}
          </div>
          <div class="grow truncate">
            {{ entry.name ?? '(no name)' }}
          </div>
        </div>
      </div>
    </div>

    <template v-if="error">
      <UAlert
        color="error"
        variant="subtle"
        :description="error"
      />
      <pre
        v-if="log.length"
        class="max-h-48 overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap"
      >{{ log.join('\n') }}</pre>
      <div class="flex justify-end">
        <UButton
          icon="i-lucide-rotate-ccw"
          label="Retry"
          :loading="running"
          @click="start"
        />
      </div>
    </template>
  </div>
</template>
