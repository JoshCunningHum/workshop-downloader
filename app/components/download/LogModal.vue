<script setup lang="ts">
import type { LiveJob } from '~/types/jobs'

// The SteamCMD output of one job, following new lines as they arrive.
defineProps<{ appNames: Record<number, string | null> }>()
const job = defineModel<LiveJob | null>({ default: null })

const logEl = useTemplateRef<HTMLElement>('logEl')
watch(() => job.value?.log.length, async () => {
  await nextTick()
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight })
})
</script>

<template>
  <UModal
    :open="!!job"
    title="SteamCMD log"
    :description="job ? `${appNames[job.appId] ?? `App ${job.appId}`} · ${job.itemIds.length} item(s) in this process` : undefined"
    :ui="{ content: 'max-w-3xl' }"
    @update:open="!$event && (job = null)"
  >
    <template #body>
      <pre
        ref="logEl"
        class="max-h-[60vh] overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap"
      >{{ job?.log.join('\n') || 'No output yet.' }}</pre>
      <UAlert
        v-if="job?.error"
        class="mt-3"
        color="error"
        variant="subtle"
        :description="job.error"
      />
    </template>
  </UModal>
</template>
