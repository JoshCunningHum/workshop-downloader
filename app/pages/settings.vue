<script setup lang="ts">
import { Channel, invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

const { settings, save } = useSettings()
const accountsApi = useAccounts()
const jobsStore = useJobs()
const toast = useToast()

async function attempt(label: string, action: () => Promise<unknown>) {
  try {
    await action()
  } catch (e) {
    toast.add({ title: `${label} failed`, description: e instanceof Error ? e.message : String(e), color: 'error' })
  }
}

// --- library & downloads ---
const pickLibrary = () => attempt('Choosing folder', async () => {
  const dir = await open({ directory: true, defaultPath: settings.value.libraryPath ?? undefined })
  if (typeof dir === 'string') await save('libraryPath', dir)
})

// --- SteamCMD ---
interface SteamCmdStatus { installed: boolean, root: string, concurrency: number }
const { data: steamcmd, refresh: refreshSteamCmd } = useAsyncData('steamcmd', () => invoke<SteamCmdStatus>('steamcmd_status'))
const installLog = ref<string[]>([])
const installing = ref(false)

const install = (reinstall: boolean) => attempt('SteamCMD install', async () => {
  installing.value = true
  installLog.value = []
  const channel = new Channel<string>()
  channel.onmessage = line => installLog.value.push(line)
  try {
    await invoke('steamcmd_install', { reinstall, onLog: channel })
    toast.add({ title: 'SteamCMD is ready', color: 'success' })
  } finally {
    installing.value = false
    await refreshSteamCmd()
  }
})

// --- accounts ---
const { data: accounts, refresh: refreshAccounts } = useAsyncData('accounts', () => accountsApi.list())
const newUser = ref('')
const newPassword = ref('')

const addAccount = () => attempt('Adding account', async () => {
  await accountsApi.add(newUser.value, newPassword.value)
  newUser.value = ''
  newPassword.value = ''
  await refreshAccounts()
  toast.add({ title: 'Account saved', description: 'Select it on a game\'s settings tab. You\'ll be asked for a Steam Guard code on the first download.', color: 'success' })
})

const removeAccount = (id: number) => attempt('Removing account', async () => {
  await accountsApi.remove(id)
  await refreshAccounts()
})
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Settings" />
    </template>

    <template #body>
      <div class="max-w-2xl space-y-8">
        <section class="space-y-4">
          <h2 class="font-semibold">
            Library & downloads
          </h2>
          <UFormField
            label="Library folder"
            description="Snapshots are stored here. Put it on the same drive as your games: junctions only work between local NTFS drives, and same-drive moves are instant."
          >
            <div class="flex gap-2">
              <UInput
                :model-value="settings.libraryPath ?? ''"
                readonly
                class="flex-1"
                placeholder="Not set"
              />
              <UButton
                label="Choose…"
                color="neutral"
                variant="outline"
                @click="pickLibrary"
              />
            </div>
          </UFormField>
          <UFormField
            label="Parallel downloads"
            description="Number of SteamCMD processes running at once."
          >
            <UInputNumber
              :model-value="settings.concurrency"
              :min="1"
              :max="16"
              @update:model-value="attempt('Saving', () => save('concurrency', $event ?? 1))"
            />
          </UFormField>
          <UFormField
            label="Items per SteamCMD process"
            description="Bigger batches log in less often; smaller ones spread across workers better."
          >
            <UInputNumber
              :model-value="settings.batchSize"
              :min="1"
              :max="100"
              @update:model-value="attempt('Saving', () => save('batchSize', $event ?? 1))"
            />
          </UFormField>
          <USwitch
            :model-value="settings.updateCheckEnabled"
            label="Check for updates periodically"
            @update:model-value="attempt('Saving', () => save('updateCheckEnabled', $event))"
          />
          <UFormField
            v-if="settings.updateCheckEnabled"
            label="Check every (minutes)"
            description="Games with auto-update on get their outdated items downloaded."
          >
            <UInputNumber
              :model-value="settings.updateCheckMinutes"
              :min="5"
              @update:model-value="attempt('Saving', () => save('updateCheckMinutes', $event ?? 60))"
            />
          </UFormField>
        </section>

        <section class="space-y-4">
          <h2 class="font-semibold">
            Steam accounts
          </h2>
          <p class="text-sm text-muted">
            Downloads are anonymous unless a game uses an account. Passwords are stored in the
            system keychain (Windows Credential Manager), never in the app database.
          </p>
          <ul
            v-if="accounts?.length"
            class="divide-y divide-default rounded-md border border-default"
          >
            <li
              v-for="account in accounts"
              :key="account.id"
              class="flex items-center gap-3 p-3"
            >
              <span class="font-medium">{{ account.username }}</span>
              <span class="text-xs text-muted">last login {{ formatMs(account.lastLoginOk) }}</span>
              <UButton
                class="ms-auto"
                size="xs"
                color="error"
                variant="outline"
                icon="i-lucide-trash-2"
                @click="removeAccount(account.id)"
              />
            </li>
          </ul>
          <form
            class="flex flex-wrap items-end gap-2"
            @submit.prevent="addAccount"
          >
            <UFormField label="Username">
              <UInput
                v-model="newUser"
                autocomplete="username"
              />
            </UFormField>
            <UFormField label="Password">
              <UInput
                v-model="newPassword"
                type="password"
                autocomplete="current-password"
              />
            </UFormField>
            <UButton
              type="submit"
              label="Add account"
              :disabled="!newUser || !newPassword"
            />
          </form>
        </section>

        <section class="space-y-4">
          <h2 class="font-semibold">
            SteamCMD
          </h2>
          <p class="text-sm">
            <UBadge
              :color="steamcmd?.installed ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ steamcmd?.installed ? 'installed' : 'not installed' }}
            </UBadge>
            <code class="ms-2 text-xs text-muted">{{ steamcmd?.root }}</code>
          </p>
          <p class="text-sm text-muted">
            SteamCMD is downloaded automatically before the first job. Reinstalling deletes it and
            all worker copies (including remembered Steam logins).
          </p>
          <div class="flex gap-2">
            <UButton
              v-if="!steamcmd?.installed"
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
            class="max-h-64 overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap"
          >{{ installLog.join('\n') }}</pre>
        </section>

        <section class="space-y-2">
          <h2 class="font-semibold">
            Diagnostics
          </h2>
          <UButton
            to="/dev/fswatch"
            label="Filesystem watcher test"
            color="neutral"
            variant="outline"
            icon="i-lucide-activity"
          />
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
