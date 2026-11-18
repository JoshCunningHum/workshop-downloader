import { openUrl } from '@tauri-apps/plugin-opener'
import { ROUTES } from '~/constants/routes'
import * as items from '~/lib/services/items'
import * as steam from '~/lib/services/steam'

// Links clicked in the app (item card descriptions, ...): workshop item pages open in the
// Workshop browser on that item's game when the setting is on; everything else, and items whose
// game can't be found, open in the system browser.
export function useItemLinks() {
  const { settings } = useSettings()
  const { pending, navigate } = useWorkshopBrowser()
  const route = useRoute()

  /** The game an item belongs to: from the library, else from the Steam Web API. */
  async function appOf(itemId: string): Promise<number | null> {
    const known = await items.get(itemId)
    if (known) return known.appId
    const [details] = await steam.itemDetails([itemId]).catch(() => [])
    return details?.result === 1 && details.appId ? details.appId : null
  }

  async function open(href: string) {
    const id = settings.value.openItemLinksInWorkshop ? workshopItemId(href) : null
    const appId = id ? await appOf(id) : null
    if (!id || !appId) return openUrl(href).catch(() => {})

    const page = workshopItemUrl(href)!
    if (route.path === ROUTES.workshopApp(appId)) return navigate(page).catch(() => {})
    pending.value = { appId, url: page }
    await navigateTo(ROUTES.workshopApp(appId))
  }

  return { open }
}
