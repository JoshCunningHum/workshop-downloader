<script setup lang="ts">
import { ROUTES } from '~/constants/routes'

// Paste workshop links or ids, resolve them, pick items per game and queue downloads.
const emit = defineEmits<{ queued: [] }>()

const { settings } = useSettings()
const {
  input, ids, invalid, resolving, queuing, resolved, skipDownloaded, latest, appNames, excluded,
  groups, problems, isCurrent, downloadCount, resolve, toggle, queue
} = useWorkshopResolve(() => emit('queued'))

const openSettings = [{ label: 'Open settings', to: ROUTES.settings }]
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-start gap-2">
      <WorkshopLinkInput
        v-model="input"
        class="flex-1"
        @submit="resolve"
      />
      <UButton
        icon="i-lucide-search"
        :label="`Resolve${ids.length ? ` ${ids.length}` : ''}`"
        :loading="resolving"
        :disabled="!ids.length"
        @click="resolve"
      />
    </div>

    <UAlert
      v-if="invalid"
      color="warning"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="No workshop ids found"
      description="Paste workshop item or collection ids, steamcommunity.com links, or steam:// links."
    />

    <UAlert
      v-if="!settings.libraryPath"
      color="warning"
      variant="subtle"
      title="No library folder yet"
      description="Choose where snapshots are stored before downloading."
      :actions="openSettings"
    />

    <template v-if="resolved">
      <div class="flex flex-wrap items-center gap-3">
        <USwitch
          v-model="skipDownloaded"
          label="Skip items whose latest revision is already downloaded"
        />
        <span
          v-if="resolved.collections.length"
          class="text-sm text-muted"
        >
          Expanded {{ resolved.collections.length }} collection(s).
        </span>
      </div>

      <WorkshopLinkResolvedGroup
        v-for="group in groups"
        :key="group.appId"
        :group="group"
        :app-name="appNames[group.appId]"
        :excluded="excluded"
        :latest="latest"
        :is-current="isCurrent"
        :download-count="downloadCount(group.items)"
        :queuing="queuing"
        :can-download="!!settings.libraryPath"
        @download="queue([group.appId])"
        @toggle="toggle"
      />

      <div
        v-if="groups.length > 1"
        class="flex justify-end"
      >
        <UButton
          icon="i-lucide-download"
          label="Download all groups"
          :loading="queuing"
          :disabled="!settings.libraryPath"
          @click="queue(groups.map(g => g.appId))"
        />
      </div>

      <UAlert
        v-if="problems.length"
        color="warning"
        variant="subtle"
        title="Not downloadable"
      >
        <template #description>
          <ul>
            <li
              v-for="item in problems"
              :key="item.id"
            >
              {{ item.id }}: {{ item.result === 9 ? 'not found (removed or private)' : `Steam result ${item.result}` }}
            </li>
          </ul>
        </template>
      </UAlert>
    </template>
  </section>
</template>
