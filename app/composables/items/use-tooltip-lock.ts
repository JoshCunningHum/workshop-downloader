// Holding Shift over an open item card "locks" it: it stays put, grows, shows the whole
// description and can be scrolled; no other card opens until Shift is released.
// Shared, so every card uses one Shift listener.
export const useTooltipLock = createSharedComposable(() => {
  const shift = useKeyModifier('Shift', { initial: false })
  // Switching windows with Shift down never delivers its keyup.
  useEventListener(window, 'blur', () => shift.value = false)

  /** The card that is locked (its useId), if any. */
  const locked = ref<string | null>(null)
  watch(shift, (held) => {
    if (!held) locked.value = null
  })

  return { shift, locked }
})
