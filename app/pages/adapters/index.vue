<script setup lang="ts">
const adaptersApi = useAdapters()
const { data: adapters } = useAsyncData('adapters', () => adaptersApi.list())
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Adapters">
        <template #right>
          <UButton
            to="/adapters/new"
            icon="i-lucide-plus"
            label="New adapter"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        Adapters tell the app where a game's mods folder is, and how to read the installed game version
        and the game versions each workshop item supports.
      </p>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UPageCard
          v-for="adapter in adapters"
          :key="adapter.id"
          :to="`/adapters/${adapter.id}`"
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
