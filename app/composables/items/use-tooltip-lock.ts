// Holding a modifier over an open item card "locks" it: it stays put, grows, shows the whole
// description and can be scrolled; no other card opens until the modifier is released.
// Chromium on Windows and Linux swaps the wheel axes while Shift is held, which breaks
// scrolling the locked card, so those platforms lock with Control instead.
export const useTooltipLock = createSharedComposable(() => {
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)
  const held = useKeyModifier(isMac ? 'Shift' : 'Control', { initial: false })
  // Switching windows with the modifier down never delivers its keyup.
  useEventListener(window, 'blur', () => held.value = false)

  /** The key the current platform locks with ("Shift" or "Control"). */
  const keyLabel = isMac ? 'Shift' : 'Control'

  /** The card that is locked (its useId), if any. */
  const locked = ref<string | null>(null)
  watch(held, (down) => {
    if (!down) locked.value = null
  })

  return { held, keyLabel, locked }
})
