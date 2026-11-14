<script setup lang="ts">
// A textarea rather than UInput: pasting several lines into a single-line input drops the
// line breaks and glues the ids together.
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ submit: [] }>()

const input = useTemplateRef('input')

defineShortcuts({
  ctrl_k: {
    usingInput: true,
    handler: () => input.value?.textareaRef?.focus()
  }
})

function onEnter(e: KeyboardEvent) {
  if (e.shiftKey) return
  e.preventDefault()
  emit('submit')
}
</script>

<template>
  <UTextarea
    ref="input"
    v-model="model"
    class="w-full"
    icon="i-lucide-link"
    placeholder="Paste workshop items or collections (ids or URLs)"
    :rows="1"
    :maxrows="6"
    autoresize
    @keydown.enter="onEnter"
  >
    <template #trailing>
      <div class="flex items-center">
        <UButton
          v-if="model"
          class="cursor-pointer"
          color="neutral"
          icon="i-lucide-x"
          variant="link"
          aria-label="Clear"
          @click="model = ''"
        />
        <UKbd>Ctrl + K</UKbd>
      </div>
    </template>
  </UTextarea>
</template>
