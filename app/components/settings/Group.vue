<script setup lang="ts">
// A titled card of settings rows (see SettingsRow).
defineProps<{ title: string, icon?: string }>()
</script>

<template>
  <section class="rounded-lg border border-default">
    <h3 class="flex items-center gap-2 border-b border-default px-4 py-2.5 text-sm font-semibold text-highlighted">
      <UIcon
        v-if="icon"
        :name="icon"
        class="size-4 text-muted"
      />
      {{ title }}
    </h3>
    <div class="divide-y divide-default">
      <slot />
    </div>
  </section>
</template>
