<script setup lang="ts">
import { ROUTES } from '~/constants/routes'

const adaptersApi = useAdapters()
const { data: adapters } = useAsyncData('adapters', () => adaptersApi.list())
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <div class="flex items-start gap-3">
        <p class="text-sm text-muted">
          Adapters tell the app where a game's mods folder is, and how to read the installed game version
          and the game versions each workshop item supports.
        </p>
        <UButton
          class="ms-auto shrink-0"
          size="xs"
          :to="ROUTES.newAdapter()"
          icon="i-lucide-plus"
          label="New adapter"
        />
      </div>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UPageCard
          v-for="adapter in adapters"
          :key="adapter.id"
          :to="ROUTES.adapter(adapter.id)"
          :title="adapter.name"
          :description="adapter.appId ? `AppID ${adapter.appId}` : 'Any game'"
        >
          <div class="flex gap-1">
            <UBadge
              v-if="adapter.builtin"
              color="neutral"
              variant="subtle"
            >
              built-in
            </UBadge>
            <UBadge
              color="neutral"
              variant="outline"
            >
              {{ adapter.id }}
            </UBadge>
          </div>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
