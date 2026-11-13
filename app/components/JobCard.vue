<script setup lang="ts">
import type { LiveJob } from '~/composables/useJobs'

const props = defineProps<{ job: LiveJob, appName?: string | null, titles: Record<string, string> }>()

const jobsStore = useJobs()
const toast = useToast()
const guardCode = ref('')
const showLog = ref(false)
const logEl = useTemplateRef<HTMLElement>('logEl')

const progress = computed(() => jobProgress(props.job))
const running = computed(() => props.job.status === 'running' || props.job.status === 'queued')

const statusColor = computed(() => ({
  queued: 'neutral',
  running: 'primary',
  done: 'success',
  partial: 'warning',
  failed: 'error',
  cancelled: 'neutral',
  needs_guard: 'warning',
  interrupted: 'neutral'
} as const)[props.job.status])

watch(() => props.job.log.length, async () => {
  if (!showLog.value) return
  await nextTick()
  logEl.value?.scrollTo({ top: logEl.value.scrollHeight })
})

async function run(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (e) {
    toast.add({ title: 'Failed', description: e instanceof Error ? e.message : String(e), color: 'error' })
  }
}
</script>

<template>
  <UCard>
    <div class="flex flex-wrap items-center gap-2">
      <UBadge
        :color="statusColor"
        variant="subtle"
      >
        {{ job.status.replace('_', ' ') }}
      </UBadge>
      <NuxtLink
        :to="`/apps/${job.appId}`"
        class="font-medium hover:underline"
      >
        {{ appName ?? `App ${job.appId}` }}
      </NuxtLink>
      <span class="text-sm text-muted">{{ job.itemIds.length }} item(s)</span>
      <span
        v-if="job.slot !== null && running"
        class="text-sm text-muted"
      >· worker {{ job.slot }}</span>
      <div class="ms-auto flex gap-2">
        <UButton
          v-if="running"
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-square"
          label="Cancel"
          @click="run(() => jobsStore.cancel(job.id))"
        />
        <UButton
          v-if="['failed', 'partial', 'interrupted', 'cancelled'].includes(job.status)"
          size="xs"
          color="neutral"
          variant="outline"
          icon="i-lucide-rotate-ccw"
          label="Retry"
          @click="run(() => jobsStore.retry(job))"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="showLog ? 'i-lucide-chevron-up' : 'i-lucide-scroll-text'"
          label="Log"
          @click="showLog = !showLog"
        />
      </div>
    </div>

    <div
      v-if="running || job.status === 'done'"
      class="mt-3"
    >
      <UProgress
        :model-value="progress.total ? Math.round(progress.ratio * 100) : null"
        :max="100"
      />
      <p class="mt-1 text-xs text-muted">
        {{ formatBytes(progress.bytes) }} / {{ formatBytes(progress.total) }}
      </p>
    </div>

    <ul class="mt-3 space-y-1 text-sm">
      <li
        v-for="id in job.itemIds"
        :key="id"
        class="flex items-center gap-2"
      >
        <NuxtLink
          :to="`/items/${id}`"
          class="truncate hover:underline"
        >
          {{ titles[id] || id }}
        </NuxtLink>
        <span
          v-if="job.progress[id]"
          class="text-xs text-muted"
        >{{ formatBytes(job.progress[id]!.bytes) }} / {{ formatBytes(job.progress[id]!.total) }}</span>
        <span
          v-if="job.itemErrors[id]"
          class="text-xs text-error"
        >{{ job.itemErrors[id] }}</span>
      </li>
    </ul>

    <UAlert
      v-if="job.error"
      class="mt-3"
      color="error"
      variant="subtle"
      :description="job.error"
    />

    <form
      v-if="job.guard"
      class="mt-3 flex items-end gap-2"
      @submit.prevent="run(() => jobsStore.submitGuardCode(job, guardCode))"
    >
      <UFormField
        :label="job.guard === 'email' ? 'Steam Guard code (sent by email)' : 'Steam Guard code (mobile authenticator)'"
        class="flex-1"
      >
        <UInput
          v-model="guardCode"
          autocomplete="one-time-code"
          class="w-full"
        />
      </UFormField>
      <UButton
        type="submit"
        label="Continue"
        :disabled="!guardCode.trim()"
      />
    </form>

    <pre
      v-if="showLog"
      ref="logEl"
      class="mt-3 max-h-64 overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap"
    >{{ job.log.join('\n') || 'No output yet.' }}</pre>
  </UCard>
</template>
