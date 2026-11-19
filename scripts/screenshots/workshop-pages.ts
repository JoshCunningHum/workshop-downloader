// Stand-in workshop pages for the Workshop browser screenshots, served at the Steam Community URLs
// the app opens (by request interception; nothing is fetched from Steam). They are plain,
// unbranded pages carrying only the hooks `src-tauri/src/workshop_inject.js` looks for: item
// links around preview images, `#SubscribeItemBtn` on an item page, and `.collectionChildren` /
// `.collectionItem` / a `SubscribeCollection(...)` button on a collection page.
import { banner, thumbnail } from './art.ts'
import { COLLECTION, GAMES, itemId, WORKSHOP_NEW, workshopItem } from './demo-data.ts'

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
  body { margin: 0; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #d6dde6; background: #1e2430; }
  a { color: inherit; text-decoration: none; }
  header { display: flex; gap: 16px; align-items: center; padding: 16px 24px; background: #151a23; border-bottom: 1px solid #2c3442; }
  header img { height: 56px; border-radius: 4px; }
  header h1 { margin: 0; font-size: 20px; } header p { margin: 2px 0 0; color: #8b97a8; }
  main { padding: 20px 24px; }
  h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #8b97a8; margin: 8px 0 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .tile .art { border-radius: 6px; overflow: hidden; } .tile img { display: block; width: 100%; aspect-ratio: 1; }
  .tile .name { margin-top: 6px; font-weight: 600; } .tile .by { color: #8b97a8; font-size: 12px; }
  .stars { color: #e3b341; font-size: 12px; }
  .detail { display: flex; gap: 24px; } .detail > img { width: 240px; height: 240px; border-radius: 8px; }
  .detail h1 { margin: 0 0 4px; font-size: 24px; } .muted { color: #8b97a8; }
  .actions { margin: 16px 0; }
  .btn_green_white_innerfade, .general_btn { display: inline-block; padding: 8px 16px; border-radius: 4px; background: #5c7e10; color: #e8f5d0; font-weight: 600; cursor: pointer; }
  .btn_medium { font-size: 15px; }
  .collectionItem { display: flex; gap: 12px; align-items: center; padding: 8px; border-bottom: 1px solid #2c3442; }
  .collectionItem img { width: 56px; height: 56px; border-radius: 4px; } .collectionItem .grow { flex: 1; }
  .subscribe-row { padding: 4px 10px; border-radius: 3px; background: #5c7e10; }
</style></head><body>${body}</body></html>`

const itemUrl = (id: string) => `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`
const esc = (text: string) => text.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
const stars = (id: string) => '★★★★★'.slice(0, 3 + (Number(id) % 3)) + '☆☆'.slice(0, 2 - (Number(id) % 3))

function tile(id: string) {
  const item = workshopItem(id)!
  return `<div class="tile"><a href="${itemUrl(id)}"><div class="art"><img src="${thumbnail(item.title, item.hue)}" alt=""></div></a>
    <a class="name" href="${itemUrl(id)}">${esc(item.title)}</a><div class="by">by ${esc(item.author)} · <span class="stars">${stars(id)}</span></div></div>`
}

function collectionTile() {
  return `<div class="tile"><a href="${itemUrl(COLLECTION.id)}"><div class="art"><img src="${thumbnail(COLLECTION.title, 95)}" alt=""></div></a>
    <a class="name" href="${itemUrl(COLLECTION.id)}">${esc(COLLECTION.title)}</a><div class="by">collection · ${COLLECTION.children.length} items</div></div>`
}

function home(appId: number) {
  const game = GAMES.find(g => g.appId === appId) ?? GAMES[0]!
  const owned = game.items.map((_, i) => itemId(game.appId, i))
  const popular = [WORKSHOP_NEW[0]!.id, owned[1]!, WORKSHOP_NEW[1]!.id, owned[2]!, WORKSHOP_NEW[2]!.id, owned[6]!, WORKSHOP_NEW[3]!.id, owned[0]!]
  const recent = [WORKSHOP_NEW[4]!.id, WORKSHOP_NEW[5]!.id, owned[3]!, owned[4]!]
  return page(`${game.name} Workshop`, `
    <header><img src="${banner(game.name, game.hue)}" alt=""><div><h1>${esc(game.name)} Workshop</h1><p>Community-made content for ${esc(game.name)}</p></div></header>
    <main>
      <h2>Most popular this week</h2><div class="grid">${popular.map(tile).join('')}</div>
      <h2>Collections</h2><div class="grid">${collectionTile()}</div>
      <h2>Recently updated</h2><div class="grid">${recent.map(tile).join('')}</div>
    </main>`)
}

function itemPage(id: string) {
  const item = workshopItem(id)
  if (!item) return page('Not found', '<main>This item does not exist.</main>')
  return page(item.title, `
    <main><div class="detail"><img src="${thumbnail(item.title, item.hue)}" alt="">
      <div><h1>${esc(item.title)}</h1><div class="muted">by ${esc(item.author)} · <span class="stars">${stars(id)}</span> · ${(item.size / 1e6).toFixed(1)} MB</div>
        <div class="actions"><a id="SubscribeItemBtn" class="btn_green_white_innerfade btn_medium" onclick="SubscribeItem()"><span>Subscribe</span></a></div>
        <p>${esc(item.title)} for Starfall Colony. Works with existing saves and plays well with most other mods.</p>
        <ul><li>Compatible with the latest version</li><li>Translations: English, Deutsch, Français</li></ul>
      </div></div></main>`)
}

function collectionPage() {
  const rows = COLLECTION.children.map((id) => {
    const item = workshopItem(id)!
    return `<div class="collectionItem" id="sharedfile_${id}"><a href="${itemUrl(id)}"><img src="${thumbnail(item.title, item.hue)}" alt=""></a>
      <div class="grow"><a href="${itemUrl(id)}"><b>${esc(item.title)}</b></a><div class="muted">by ${esc(item.author)}</div></div>
      <a id="SubscribeItemBtn${id}" class="subscribe-row" onclick="SubscribeCollectionItem('${id}')">Subscribe</a></div>`
  }).join('')
  return page(COLLECTION.title, `
    <main><div class="detail"><img src="${thumbnail(COLLECTION.title, 95)}" alt="">
      <div><h1>${esc(COLLECTION.title)}</h1><div class="muted">collection by ${esc(COLLECTION.author)} · ${COLLECTION.children.length} items</div>
        <p>The mods most colonies start with: farming, pathing, storage and a little help from the medics.</p>
        <div class="actions"><a class="general_btn subscribe" onclick="SubscribeCollection('${COLLECTION.id}')">Subscribe to all</a></div>
      </div></div>
      <h2 style="margin-top:24px">Items in this collection</h2><div class="collectionChildren">${rows}</div></main>`)
}

/** The demo page for a Steam Community URL. */
export function workshopPage(url: URL): string {
  const app = /^\/app\/(\d+)\/workshop/.exec(url.pathname)
  if (app) return home(Number(app[1]))
  const id = url.searchParams.get('id')
  if (id === COLLECTION.id) return collectionPage()
  if (id) return itemPage(id)
  return home(GAMES[0]!.appId)
}
