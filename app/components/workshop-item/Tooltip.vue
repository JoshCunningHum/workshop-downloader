<script setup lang="ts">
import type { ItemDetails } from '~/types/steam'

// Wraps a workshop item (row, thumbnail, ...) with a detail card that follows the cursor.
// Steam data is fetched on first hover and cached; library data is read each time it opens.
// Holding the lock key (Shift on macOS, Control elsewhere — see useTooltipLock) locks the open
// card: it stops following the cursor, grows, shows the whole description and scrolls, and no
// other card opens meanwhile.
const props = defineProps<{
  itemId: string
  /** Already-fetched Web API details (e.g. a freshly resolved item); skips the fetch. */
  details?: ItemDetails | null
  /** No card (e.g. next to the Workshop browser, which it would open under). */
  disabled?: boolean
}>()

const { remote, loadingRemote, local, load } = useItemDetails(() => props.itemId, props.details)

const id = useId()
const { held, locked } = useTooltipLock()
const isLocked = computed(() => locked.value === id)

const open = ref(false)
/** The pointer is on the item, so the card may stay open when the lock ends. */
const hovering = ref(false)
watch(open, (value) => {
  if (value) load()
})

function onOpenChange(value: boolean) {
  // Locked: only releasing the lock key closes it. Another card locked: this one doesn't open.
  if (isLocked.value || (value && locked.value)) return
  open.value = value
}

// The lock key held while this card is open (or opening) locks it.
watch([held, open], ([down, isOpen]) => {
  if (down && isOpen && !locked.value) locked.value = id
})
// Lock released: back to a normal card, if the pointer is still on the item.
watch(isLocked, (now, before) => {
  if (before && !now) open.value = hovering.value
})

// The tooltip is anchored to a zero-size box at the pointer; floating-ui re-reads it every
// frame (updatePositionStrategy: 'always'), so plain variables are enough.
let x = 0
let y = 0
const reference = {
  getBoundingClientRect: () => ({ x, y, left: x, right: x, top: y, bottom: y, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
}
function follow(event: PointerEvent) {
  if (isLocked.value) return
  x = event.clientX
  y = event.clientY
}

const contentClass = computed(() => [
  'h-auto flex-col items-stretch gap-0 rounded-md p-0 text-default',
  isLocked.value
    ? 'pointer-events-auto w-md ring-2 ring-primary/50'
    : 'pointer-events-none w-80 overflow-hidden'
].join(' '))

const scroller = useTemplateRef<HTMLElement>('scroller')
// The wheel is handled by hand while locked: Control+wheel (the Windows lock key) would zoom
// the page, and Shift+wheel arrives as a horizontal delta on some platforms.
function onWheel(event: WheelEvent) {
  if (!isLocked.value) return
  event.preventDefault()
  scroller.value?.scrollBy({ top: event.deltaY || event.deltaX })
}
</script>

<template>
  <UTooltip
    :open="open"
    :disabled="disabled"
    :reference="reference"
    :delay-duration="0"
    disable-hoverable-content
    :content="{ side: 'right', align: 'start', sideOffset: 16, collisionPadding: 12, updatePositionStrategy: 'always' }"
    :ui="{ content: contentClass }"
    @update:open="onOpenChange"
  >
    <div
      class="min-w-0"
      @pointermove="follow"
      @pointerenter="hovering = true; follow($event)"
      @pointerleave="hovering = false"
    >
      <slot />
    </div>

    <template #content>
      <div
        ref="scroller"
        :class="isLocked ? 'max-h-[min(80vh,40rem)] overflow-y-auto' : ''"
        @wheel="onWheel"
      >
        <WorkshopItemDetailsCard
          :item-id="itemId"
          :remote="remote"
          :loading-remote="loadingRemote"
          :local="local"
          :expanded="isLocked"
        />
      </div>
    </template>
  </UTooltip>
</template>
