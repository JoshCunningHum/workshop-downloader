<script setup lang="ts">
import { readText } from '~/lib/services/clipboard'

// A textarea rather than UInput: pasting several lines into a single-line input drops the
// line breaks and glues the ids together.
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ submit: [] }>()

const input = useTemplateRef('input')

defineShortcuts({
  ctrl_k: {
    usingInput: true,
    handler: () => input.value?.textareaRef?.focus()
  },
  // Ctrl+V (⌘V on macOS) anywhere on the page pastes here and submits. Not while another input
  // has focus (no `usingInput`), so pasting into other fields works as usual.
  meta_v: async () => {
    const text = (await readText()).trim()
    if (!text) return
    model.value = text
    emit('submit')
  }
})

function onEnter(e: KeyboardEvent) {
  if (e.shiftKey) return
  e.preventDefault()
  emit('submit')
}

// Pasting while the input is focused submits too. The paste handler runs before the text is
// inserted, so wait a task for the model to update.
function onPaste() {
  setTimeout(() => emit('submit'))
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
    @paste="onPaste"
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
