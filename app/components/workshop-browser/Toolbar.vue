<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { workshopHome } from '~/lib/services/workshop-browser'

// Navigation for the Workshop browser: back/forward/reload/home, where it is, and messages.
const { appId, name, location } = defineProps<{ appId: number, name: string, location: string | null }>()

const browser = useWorkshopBrowser()
const toast = useToast()

async function run(action: () => Promise<void>) {
  try {
    await action()
  } catch (e) {
    toast.add({ title: 'Workshop browser', description: e instanceof Error ? e.message : String(e), color: 'error' })
  }
}

/** The page shown without the scheme, for the address line. */
const address = computed(() => location?.replace(/^https?:\/\//, '') ?? '')
</script>

<template>
  <UDashboardNavbar :title="name">
    <template #leading>
      <div class="flex items-center gap-0.5">
        <UTooltip text="Back">
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="Back"
            @click="run(browser.back)"
          />
        </UTooltip>
        <UTooltip text="Forward">
          <UButton
            icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            aria-label="Forward"
            @click="run(browser.forward)"
          />
        </UTooltip>
        <UTooltip text="Reload">
          <UButton
            icon="i-lucide-rotate-cw"
            color="neutral"
            variant="ghost"
            aria-label="Reload"
            @click="run(browser.reload)"
          />
        </UTooltip>
        <UTooltip text="Workshop home">
          <UButton
            icon="i-lucide-house"
            color="neutral"
            variant="ghost"
            aria-label="Workshop home"
            @click="run(() => browser.navigate(workshopHome(appId)))"
          />
        </UTooltip>
      </div>
    </template>

    <template #right>
      <WorkshopBrowserNotice />
      <span
        class="hidden max-w-80 truncate text-xs text-dimmed lg:inline"
        :title="location ?? undefined"
      >{{ address }}</span>
      <UTooltip text="Open in your browser">
        <UButton
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          aria-label="Open in your browser"
          :disabled="!location"
          @click="location && run(() => openUrl(location))"
        />
      </UTooltip>
    </template>
  </UDashboardNavbar>
</template>
