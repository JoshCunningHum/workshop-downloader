<script setup lang="ts">
const accountsApi = useAccounts()
const attempt = useAttempt()
const toast = useToast()

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
  <div class="flex flex-col">
    <SettingsSection
      title="Accounts"
      description="Downloads are anonymous unless a game uses an account. Passwords are stored in the system keychain (Windows Credential Manager), never in the app database."
    >
      <ul
        v-if="accounts?.length"
        class="max-w-2xl divide-y divide-default rounded-md border border-default"
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
            :aria-label="`Remove ${account.username}`"
            @click="removeAccount(account.id)"
          />
        </li>
      </ul>
      <p
        v-else
        class="text-sm text-muted"
      >
        No accounts yet.
      </p>
    </SettingsSection>

    <SettingsSection title="Add account">
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
    </SettingsSection>
  </div>
</template>
