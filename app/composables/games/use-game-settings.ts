import { open } from '@tauri-apps/plugin-dialog'
import { expandTemplate } from '~/lib/adapters/engine'
import type { AdapterRow, AppRow, AccountRow } from '~/lib/db/schema'
import * as steam from '~/lib/services/steam'
import type { AdapterDefinition } from '~/types/adapters'
import { AUTO_ADAPTER } from '~/constants/games'
import type { GamePage } from './use-game-page'

interface Options {
  app: Ref<AppRow>
  adapter: Ref<AdapterDefinition>
  adapters: Ref<AdapterRow[]>
  accounts: Ref<AccountRow[]>
  /** The page's busy-and-reload wrapper (see useGamePage). */
  run: GamePage['run']
  /** Called when a save set or changed the mods folder (offers to import what's in it). */
  onModsFolderChanged: () => void
}

// The settings form of a game's page. Text inputs edit strings; empty strings are saved back as null.
export function useGameSettings({ app, adapter, adapters, accounts, run, onModsFolderChanged }: Options) {
  const catalog = useCatalog()
  const adapterLookup = useAdapters()
  const library = useLibrary()
  const selection = useAppSelection()
  const toast = useToast()

  type AppForm = AppRow & { name: string, installPath: string, modsPath: string, manualGameVersion: string }
  const form = ref<AppForm | null>(null)
  watch(app, (value) => {
    form.value = { ...value, name: value.name ?? '', installPath: value.installPath ?? '', modsPath: value.modsPath ?? '', manualGameVersion: value.manualGameVersion ?? '' }
  }, { immediate: true })

  const adapterItems = computed(() => [
    { label: `Automatic (${adapter.value.name ?? '—'})`, value: AUTO_ADAPTER },
    ...adapters.value.map(a => ({ label: a.name, value: a.id }))
  ])
  const accountItems = computed(() => [
    { label: 'Anonymous', value: 0 },
    ...accounts.value.map(a => ({ label: a.username, value: a.id }))
  ])

  // The mods folder as typed (template filled in), or the adapter's default when empty.
  const modsFolderPath = computed(() => {
    const template = form.value?.modsPath || adapter.value.modsPath
    return template ? expandTemplate(template, { install: form.value?.installPath || null, appId: app.value.appId }) : null
  })

  async function browse(field: 'installPath' | 'modsPath') {
    const dir = await open({ directory: true, defaultPath: form.value?.[field] || undefined })
    if (typeof dir === 'string' && form.value) form.value[field] = dir
  }

  async function detectInstall() {
    const game = await steam.installedGame(app.value.appId).catch(() => null)
    if (game && form.value) {
      form.value.installPath = game.installPath
      form.value.name ||= game.name
    } else {
      toast.add({ title: 'Not found in your Steam libraries', color: 'warning' })
    }
  }

  async function save() {
    const before = app.value.modsPath ?? null
    await run('Saving', async () => {
      const f = form.value!
      const adapterBefore = await adapterLookup.idFor(app.value)
      await catalog.updateApp(app.value.appId, {
        name: f.name || null,
        installPath: f.installPath || null,
        modsPath: f.modsPath || null,
        linkMode: f.linkMode,
        adapterId: f.adapterId || null,
        accountId: f.accountId || null,
        autoUpdate: f.autoUpdate,
        hidden: f.hidden,
        retention: Math.max(0, Number(f.retention) || 0),
        manualGameVersion: f.manualGameVersion || null
      })
      // Item versions come from the adapter's rules, so a different adapter means re-reading them.
      const adapterAfter = await adapterLookup.idFor({ appId: app.value.appId, adapterId: f.adapterId || null })
      const redetected = adapterAfter !== adapterBefore ? await library.redetectApp(app.value.appId) : 0
      // The sidebar lists games from its own copy; a rename or hide shows there straight away.
      await selection.refresh()
      toast.add({
        title: 'Saved',
        description: redetected ? `Re-detected item versions of ${redetected} snapshot(s) with the new adapter.` : undefined,
        color: 'success'
      })
    })
    // `app` is reloaded by run(); a failed save leaves it unchanged.
    const after = app.value.modsPath ?? null
    if (after && after !== before) onModsFolderChanged()
  }

  return { form, adapterItems, accountItems, modsFolderPath, browse, detectInstall, save }
}
