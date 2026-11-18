<script setup lang="ts">
// Toasts can't show over the native Workshop browser, so on its page the toaster is off
// (see app.vue) and the newest toast shows here in the toolbar instead, for a few seconds.
const { toasts } = useToast()
type Toast = (typeof toasts.value)[number]
const notice = ref<Toast | null>(null)

const { start, stop } = useTimeoutFn(() => notice.value = null, 6000, { immediate: false })

watch(() => toasts.value.length, () => {
  const latest = toasts.value.at(-1)
  if (!latest) return
  notice.value = latest
  toasts.value = []
  stop()
  start()
}, { immediate: true })

const ICONS: Record<string, string> = {
  success: 'i-lucide-circle-check',
  warning: 'i-lucide-triangle-alert',
  error: 'i-lucide-circle-x'
}
const COLORS: Record<string, string> = { success: 'text-success', warning: 'text-warning', error: 'text-error' }
</script>

<template>
  <div
    v-if="notice"
    class="flex min-w-0 items-center gap-2 text-sm"
  >
    <UIcon
      :name="ICONS[notice.color ?? ''] ?? 'i-lucide-info'"
      :class="COLORS[notice.color ?? ''] ?? 'text-info'"
      class="size-4 shrink-0"
    />
    <span
      class="truncate"
      :title="typeof notice.description === 'string' ? notice.description : undefined"
    >{{ notice.title }}</span>
    <UButton
      v-for="action in notice.actions"
      :key="String(action.label)"
      size="xs"
      color="neutral"
      variant="outline"
      v-bind="action"
    />
    <UButton
      size="xs"
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      aria-label="Dismiss"
      @click="notice = null"
    />
  </div>
</template>
