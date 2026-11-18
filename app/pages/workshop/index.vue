<script setup lang="ts">
import { ROUTES } from '~/constants/routes'

// Workshop: pick a game to browse its Steam Workshop.
const updates = useUpdateChecker()
const { apps } = useGameList()
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <p
        v-if="apps?.length"
        class="text-sm text-muted"
      >
        Pick a game to browse its workshop. Items you add go to the download queue.
      </p>

      <UEmpty
        v-if="!apps?.length"
        icon="i-lucide-store"
        title="No games yet"
        description="Pick a game in the sidebar to browse its workshop."
      />
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <GameCard
          v-for="app in apps"
          :key="app.appId"
          :app="app"
          :outdated="updates.outdated.value[app.appId]?.length ?? 0"
          :to="ROUTES.workshopApp(app.appId)"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
