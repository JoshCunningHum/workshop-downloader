<script setup lang="ts">
import type { LiveJob } from '~/types/jobs'

// Asks for the Steam Guard code a job stopped on, then re-runs it with the code.
defineProps<{ job: LiveJob, appName?: string | null }>()

const jobsStore = useJobs()
const attempt = useAttempt()
const code = ref('')
</script>

<template>
  <UAlert
    color="warning"
    variant="subtle"
    icon="i-lucide-shield-alert"
    :title="`Steam Guard code needed for ${appName ?? `App ${job.appId}`} (${job.itemIds.length} item(s))`"
  >
    <template #description>
      <form
        class="mt-2 flex items-end gap-2"
        @submit.prevent="attempt('Steam Guard', () => jobsStore.submitGuardCode(job, code))"
      >
        <UFormField
          :label="job.guard === 'email' ? 'Code sent by email' : 'Code from the mobile authenticator'"
          class="flex-1"
        >
          <UInput
            v-model="code"
            autocomplete="one-time-code"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Continue"
          :disabled="!code.trim()"
        />
      </form>
    </template>
  </UAlert>
</template>
