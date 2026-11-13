<script setup lang="ts">
defineProps<{ title: string, description?: string }>()
</script>

<template>
  <section class="flex flex-col gap-2 border-b border-default py-5 last:border-b-0">
    <div class="flex flex-col gap-0.5">
      <h3 class="text-sm font-medium text-highlighted">
        {{ title }}
      </h3>
      <p
        v-if="description"
        class="max-w-2xl text-xs text-muted"
      >
        {{ description }}
      </p>
    </div>

    <div class="mt-1">
      <slot />
    </div>
  </section>
</template>
