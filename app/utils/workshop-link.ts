import { itemPage } from '~/lib/services/workshop-browser'

const COMMUNITY = /(^|\.)steamcommunity\.com$/
const ITEM_PATH = /^\/(sharedfiles|workshop)\/filedetails\/?$/

/**
 * The workshop item id a link points to, or null. Understands item pages on steamcommunity.com
 * (`/sharedfiles/filedetails/?id=…`, `/workshop/filedetails/?id=…`), `steam://url/CommunityFilePage/…`
 * and Steam's link filter wrapping either (`/linkfilter/?u=…` or `?url=…`).
 */
export function workshopItemId(href: string, depth = 0): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol === 'steam:') {
    const match = /^\/\/url\/CommunityFilePage\/(\d+)/i.exec(href.slice('steam:'.length))
    return match ? match[1]! : null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!COMMUNITY.test(url.hostname)) return null
  if (/^\/linkfilter\/?$/.test(url.pathname)) {
    const target = url.searchParams.get('u') ?? url.searchParams.get('url')
    return target && depth < 2 ? workshopItemId(target, depth + 1) : null
  }
  if (!ITEM_PATH.test(url.pathname)) return null
  const id = url.searchParams.get('id')
  return id && /^\d+$/.test(id) && id !== '0' ? id : null
}

/** The item page in the Workshop browser for a workshop item link, or null for other links. */
export function workshopItemUrl(href: string): string | null {
  const id = workshopItemId(href)
  return id ? itemPage(id) : null
}
