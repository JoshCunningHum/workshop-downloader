<script setup lang="ts">
import * as steamcmd from '~/lib/services/steamcmd'

const attempt = useAttempt()
const toast = useToast()
const jobsStore = useJobs()

const { data: status, refresh: refreshSteamCmd } = useAsyncData('steamcmd', () => steamcmd.status())
const installLog = ref<string[]>([])
const installing = ref(false)

const install = (reinstall: boolean) => attempt('SteamCMD install', async () => {
  installing.value = true
  installLog.value = []
  try {
    await steamcmd.install(reinstall, line => installLog.value.push(line))
    toast.add({ title: 'SteamCMD is ready', color: 'success' })
  } finally {
    installing.value = false
    await refreshSteamCmd()
  }
})
</script>

<template>
  <div class="flex flex-col">
    <SettingsSection
      title="Status"
      description="SteamCMD is downloaded automatically before the first job."
    >
      <p class="text-sm">
        <UBadge
          :color="status?.installed ? 'success' : 'neutral'"
          variant="subtle"
        >
          {{ status?.installed ? 'installed' : 'not installed' }}
        </UBadge>
        <code class="ms-2 text-xs text-muted">{{ status?.root }}</code>
        <OpenFolderButton
          :path="status?.root"
          size="xs"
          variant="ghost"
          class="ms-1"
        />
      </p>
    </SettingsSection>

    <SettingsSection
      title="Install"
      description="Reinstalling deletes SteamCMD and all worker copies (including remembered Steam logins)."
    >
      <div class="flex gap-2">
        <UButton
          v-if="!status?.installed"
          label="Install now"
          :loading="installing"
          @click="install(false)"
        />
        <UButton
          label="Reinstall"
          color="neutral"
          variant="outline"
          :loading="installing"
          :disabled="jobsStore.active.value.length > 0"
          @click="install(true)"
        />
      </div>
      <pre
        v-if="installLog.length"
        class="mt-3 max-h-64 overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap"
      >{{ installLog.join('\n') }}</pre>
    </SettingsSection>
  </div>
</template>
