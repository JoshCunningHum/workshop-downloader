// Update checks: on demand, plus a timer when enabled in Settings. Apps with auto-update on
// get their outdated items (those with item-level auto-update on, and not held) queued for download.
export function useUpdateChecker() {
  const { settings } = useSettings()
  const catalog = useCatalog()
  const jobsStore = useJobs()
  const checking = useState('updates:checking', () => false)
  const lastChecked = useState<number | null>('updates:last', () => null)
  const outdated = useState<Record<number, string[]>>('updates:outdated', () => ({}))

  async function check(appId?: number, { autoQueue = false } = {}) {
    if (checking.value) return
    checking.value = true
    try {
      const items = await catalog.checkUpdates(appId)
      const byApp: Record<number, string[]> = appId === undefined ? {} : { ...outdated.value, [appId]: [] }
      for (const item of items) (byApp[item.appId] ??= []).push(item.id)
      outdated.value = appId === undefined ? byApp : { ...outdated.value, ...byApp }
      lastChecked.value = Date.now()

      if (autoQueue) {
        const busy = jobsStore.busyItemIds.value
        for (const app of await catalog.listApps()) {
          if (!app.autoUpdate) continue
          const ids = items.filter(i => i.appId === app.appId && i.autoUpdate && !i.held && !busy.has(i.id)).map(i => i.id)
          if (ids.length) await jobsStore.enqueue(app.appId, ids)
        }
      }
      return items
    } finally {
      checking.value = false
    }
  }

  /** Call once from the app shell. */
  function startTimer() {
    const { pause, resume } = useIntervalFn(
      () => check(undefined, { autoQueue: true }).catch(e => console.error('update check failed', e)),
      () => Math.max(5, settings.value.updateCheckMinutes) * 60_000,
      { immediate: false }
    )
    watch(() => settings.value.updateCheckEnabled, on => (on ? resume() : pause()), { immediate: true })
  }

  return { check, checking, lastChecked, outdated, startTimer }
}
