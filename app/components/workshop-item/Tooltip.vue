<script setup lang="ts">
import type { ItemDetails } from '~/types/steam'

// Wraps a workshop item (row, thumbnail, ...) with a detail card that follows the cursor.
// Steam data is fetched on first hover and cached; library data is read each time it opens.
const props = defineProps<{
  itemId: string
  /** Already-fetched Web API details (e.g. a freshly resolved item); skips the fetch. */
  details?: ItemDetails | null
}>()

const { remote, loadingRemote, local, load } = useItemDetails(() => props.itemId, props.details)

const open = ref(false)
watch(open, (value) => {
  if (value) load()
})

// The tooltip is anchored to a zero-size box at the pointer; floating-ui re-reads it every
// frame (updatePositionStrategy: 'always'), so plain variables are enough.
let x = 0
let y = 0
const reference = {
  getBoundingClientRect: () => ({ x, y, left: x, right: x, top: y, bottom: y, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
}
function follow(event: PointerEvent) {
  x = event.clientX
  y = event.clientY
}
</script>

<template>
  <UTooltip
    v-model:open="open"
    :reference="reference"
    :delay-duration="300"
    disable-hoverable-content
    :content="{ side: 'right', align: 'start', sideOffset: 16, collisionPadding: 12, updatePositionStrategy: 'always' }"
    :ui="{ content: 'pointer-events-none h-auto w-80 flex-col items-stretch gap-0 overflow-hidden rounded-md p-0 text-default' }"
  >
    <div
      class="min-w-0"
      @pointermove="follow"
      @pointerenter="follow"
    >
      <slot />
    </div>

    <template #content>
      <WorkshopItemDetailsCard
        :item-id="itemId"
        :remote="remote"
        :loading-remote="loadingRemote"
        :local="local"
      />
    </template>
  </UTooltip>
</template>
