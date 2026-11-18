import type { MaybeRefOrGetter, Ref } from 'vue'
import { ROUTES } from '~/constants/routes'
import * as browser from '~/lib/services/workshop-browser'

// The Workshop browser is a native webview drawn over the page, so HTML can't appear on top
// of it. Overlays that open over it (the sidebar game picker) suspend it while they're open.
export function useWorkshopBrowser() {
  /** How many workshop frames are mounted (a route change can briefly mount two). */
  const frames = useState('workshop:frames', () => 0)
  /** How many overlays currently need the browser out of the way. */
  const suspended = useState('workshop:suspended', () => 0)
  /** The page the browser last finished loading. */
  const location = useState<string | null>('workshop:location', () => null)
  /** A page is loading (between its start and its finish). */
  const loading = useState('workshop:loading', () => false)
  /**
   * A page to open instead of the game's workshop home the next time a frame shows that game.
   * Tied to the game, so a frame of another game (one still mounted during a route change)
   * doesn't take it.
   */
  const pending = useState<{ appId: number, url: string } | null>('workshop:pending', () => null)

  const suspend = () => suspended.value++
  const resume = () => suspended.value = Math.max(0, suspended.value - 1)

  return {
    frames,
    suspended,
    location,
    loading,
    pending,
    suspend,
    resume,
    back: browser.back,
    forward: browser.forward,
    reload: browser.reload,
    navigate: browser.navigate
  }
}

/**
 * Keeps the browser over `el` while the calling component is mounted: shown at its bounds,
 * hidden on unmount. Opens the game's workshop home when `appId` differs from the game it
 * last showed; otherwise it stays on the page it was on. Handles its "Add to queue" clicks.
 */
export function useWorkshopFrame(el: Ref<HTMLElement | null>, appId: MaybeRefOrGetter<number>) {
  const { frames, suspended, location, loading, pending } = useWorkshopBrowser()
  const { settings } = useSettings()
  const queue = useDownloadQueue()
  const toast = useToast()
  const library = useWorkshopLibrary(appId)
  /** The game whose workshop the browser was last sent to. */
  const shownApp = useState<number | null>('workshop:app', () => null)
  const error = ref<string | null>(null)

  const { x, y, width, height } = useElementBounding(el)
  const visible = computed(() => frames.value > 0 && !suspended.value && width.value > 0 && height.value > 0)

  async function apply() {
    if (!visible.value) return browser.hide()
    const id = toValue(appId)
    // A link opened from elsewhere in the app goes first; else the home of a newly shown game.
    const target = pending.value?.appId === id ? pending.value : null
    const url = target?.url ?? (shownApp.value !== id ? browser.workshopHome(id) : undefined)
    await browser.show({ x: x.value, y: y.value, width: width.value, height: height.value }, url)
    shownApp.value = id
    // Only once the browser is there: a failed attempt keeps it for the retry.
    if (target && pending.value === target) pending.value = null
  }

  // One call at a time: the first `show` creates the webview, and a second one racing it
  // would try to create it again. Changes made meanwhile are applied once it finishes.
  let running = false
  let dirty = false
  async function sync() {
    if (running) {
      dirty = true
      return
    }
    running = true
    try {
      do {
        dirty = false
        await apply()
      } while (dirty)
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      running = false
    }
  }

  const queuedIds = () => queue.entries.value.map(e => e.details.id)

  async function onAdd(ids: string[]) {
    const added = await queue.add(ids.join(' '))
    if (added) {
      toast.add({
        title: `Added ${added} item(s) to the queue`,
        color: 'success',
        actions: [{ label: 'View queue', onClick: () => navigateTo(ROUTES.home) }]
      })
    }
    // Settles the clicked button, also when nothing could be queued.
    await browser.setQueued(queuedIds()).catch(() => {})
  }

  watch([visible, x, y, width, height, () => toValue(appId), pending], sync)
  watch(() => settings.value.openItemLinksInWorkshop, (openItemLinks) => {
    browser.setOptions({ openItemLinks }).catch(() => {})
  })
  watch(() => queuedIds().join(','), () => {
    browser.setQueued(queuedIds()).catch(() => {})
  })

  const unlisten: Array<() => void> = []
  let mounted = false
  onMounted(async () => {
    mounted = true
    frames.value++
    const offs = [
      await browser.onAdd(onAdd),
      await browser.onLoading(() => loading.value = true),
      await browser.onLocation((url) => {
        location.value = url
        loading.value = false
      })
    ]
    // Unmounted while subscribing: drop the listeners straight away.
    if (!mounted) return offs.forEach(off => off())
    unlisten.push(...offs)
    await browser.setQueued(queuedIds()).catch(() => {})
    await browser.setOptions({ openItemLinks: settings.value.openItemLinksInWorkshop }).catch(() => {})
    library.refresh()
    sync()
  })
  onBeforeUnmount(() => {
    mounted = false
    frames.value--
    for (const off of unlisten.splice(0)) off()
    sync()
  })

  return { error, location, loading, retry: sync }
}
