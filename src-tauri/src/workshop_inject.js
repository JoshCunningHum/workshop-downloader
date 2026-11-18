// Injected into the Workshop browser (see workshop_browser.rs). Replaces Steam's Subscribe
// buttons with "Add to queue"; a click navigates to https://wsd.invalid/add?ids=..., which the
// app cancels and turns into a queue request. Links leaving Steam go to the system browser.
(function () {
  if (window.__wsdInjected) return
  window.__wsdInjected = true
  if (!/(^|\.)steamcommunity\.com$/.test(location.hostname)) return

  const SENTINEL = 'https://wsd.invalid'
  const STEAM_HOST = /(^|\.)(steamcommunity\.com|steampowered\.com)$/
  let queued = new Set()
  // Collections clicked on this page; they expand into items, so they can't be looked up in `queued`.
  const addedCollections = new Set()

  function send(path, params) {
    location.href = `${SENTINEL}/${path}?${new URLSearchParams(params)}`
  }

  function queue(ids) {
    send('add', { ids: ids.join(',') })
  }

  function idFromHref(href) {
    const match = /[?&]id=(\d+)/.exec(href || '')
    return match ? match[1] : null
  }

  // --- Styles -------------------------------------------------------------------------------

  const style = document.createElement('style')
  style.textContent = `
    .wsd-hidden { display: none !important; }
    .wsd-btn { cursor: pointer; }
    .wsd-btn[data-state="queued"], .wsd-btn[data-state="adding"] { opacity: .7; cursor: default; }
    .wsd-tile-host { position: relative; }
    .wsd-tile-btn {
      position: absolute; top: 6px; right: 6px; z-index: 5;
      padding: 3px 8px; border: 0; border-radius: 2px;
      font: 12px "Motiva Sans", Arial, sans-serif; color: #d2efa9;
      background: rgba(75, 106, 33, .92); box-shadow: 0 0 4px rgba(0, 0, 0, .6);
    }
    .wsd-tile-btn:hover { color: #fff; background: rgba(110, 155, 45, .95); }
    .wsd-tile-btn[data-state="queued"] { color: #c6d4df; background: rgba(40, 60, 80, .92); }
  `

  // --- Buttons ------------------------------------------------------------------------------

  const LABELS = {
    item: { idle: 'Add to queue', adding: 'Adding…', queued: 'In queue ✓' },
    tile: { idle: '+ Queue', adding: '…', queued: 'Queued ✓' },
    collection: { idle: 'Add all to queue', adding: 'Adding…', queued: 'All in queue ✓' }
  }

  function setLabel(btn, state) {
    // Only on change: the text update is itself a DOM mutation the observer would see.
    if (btn.dataset.state === state) return
    btn.dataset.state = state
    const text = LABELS[btn.dataset.kind][state]
    const span = btn.querySelector('span') || btn
    span.textContent = text
  }

  /** A button that queues `ids`; `kind` picks the labels, `tag`/`className` the look. */
  function makeButton(kind, ids, tag, className) {
    const btn = document.createElement(tag)
    btn.className = `wsd-btn ${className}`
    btn.dataset.kind = kind
    btn.dataset.ids = ids.join(',')
    if (tag === 'a') btn.innerHTML = '<span></span>'
    if (tag === 'button') btn.type = 'button'
    setLabel(btn, 'idle')
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (btn.dataset.state !== 'idle') return
      if (kind === 'collection') addedCollections.add(btn.dataset.ids)
      setLabel(btn, 'adding')
      queue(ids)
    }, true)
    return btn
  }

  /** Hides a Steam subscribe control and puts our button after it (once). */
  function replace(original, make) {
    if (!original || original.dataset.wsdReplaced) return
    original.dataset.wsdReplaced = '1'
    original.classList.add('wsd-hidden')
    original.insertAdjacentElement('afterend', make())
  }

  // --- Page kinds ---------------------------------------------------------------------------

  function pageId() {
    return idFromHref(location.search)
  }

  function isCollectionPage() {
    return !!document.querySelector('.collectionChildren, [onclick*="SubscribeCollection"]')
  }

  /** An item's own page: the big green Subscribe button. */
  function patchItemPage() {
    const id = pageId()
    if (!id || isCollectionPage()) return
    replace(document.getElementById('SubscribeItemBtn'), () =>
      makeButton('item', [id], 'a', 'btn_green_white_innerfade btn_border_2px btn_medium'))
  }

  /** A collection page: "Subscribe to all", and each item's own subscribe toggle. */
  function patchCollectionPage() {
    const id = pageId()
    if (!id || !isCollectionPage()) return
    for (const all of document.querySelectorAll('[onclick*="SubscribeCollection"]')) {
      if (/Unsubscribe/i.test(all.getAttribute('onclick'))) {
        all.classList.add('wsd-hidden')
        continue
      }
      replace(all, () => makeButton('collection', [id], 'a', 'general_btn subscribe'))
    }
    for (const child of document.querySelectorAll('.collectionItem')) {
      const childId = (child.id || '').replace(/^sharedfile_/, '')
      if (!/^\d+$/.test(childId)) continue
      replace(child.querySelector(`#SubscribeItemBtn${childId}, [onclick*="SubscribeCollectionItem"]`), () =>
        makeButton('item', [childId], 'a', 'general_btn subscribe'))
    }
  }

  /** Item tiles in the browse/search listings and on the workshop home page. */
  function patchTiles() {
    for (const tile of document.querySelectorAll('.workshopItem, .workshopBrowseItem, .browseItem')) {
      if (tile.dataset.wsdTile) continue
      const link = tile.querySelector('a[data-publishedfileid], a[href*="filedetails/?id="]')
      const id = link && (link.dataset.publishedfileid || idFromHref(link.getAttribute('href')))
      if (!id) continue
      tile.dataset.wsdTile = '1'
      // Steam's own hover subscribe toggles on tiles go too.
      for (const own of tile.querySelectorAll('[onclick*="SubscribeItem"], .workshopItemSubscribe')) own.classList.add('wsd-hidden')
      tile.classList.add('wsd-tile-host')
      tile.appendChild(makeButton('tile', [id], 'button', 'wsd-tile-btn'))
    }
  }

  /**
   * Shows each button as queued or not. A button that is "adding" stays so until the app
   * answers (`settle`), so a page update in between doesn't flip it back.
   */
  function refreshStates(settle = false) {
    for (const btn of document.querySelectorAll('.wsd-btn')) {
      const ids = btn.dataset.ids.split(',')
      let done
      if (btn.dataset.kind === 'collection') {
        // Done once clicked, or when every item listed on the page is queued.
        const children = [...document.querySelectorAll('.collectionItem')]
          .map(c => (c.id || '').replace(/^sharedfile_/, ''))
          .filter(id => /^\d+$/.test(id))
        done = addedCollections.has(btn.dataset.ids) || (children.length > 0 && children.every(id => queued.has(id)))
      } else {
        done = ids.every(id => queued.has(id))
      }
      if (done) setLabel(btn, 'queued')
      else if (settle || btn.dataset.state !== 'adding') setLabel(btn, 'idle')
    }
  }

  // --- External links -----------------------------------------------------------------------

  /** Links off Steam (directly or through Steam's link filter) open in the system browser. */
  document.addEventListener('click', (e) => {
    const a = e.target instanceof Element && e.target.closest('a[href]')
    if (!a) return
    let url
    try {
      url = new URL(a.getAttribute('href'), location.href)
    } catch {
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    let target = null
    if (/\/linkfilter\/?$/.test(url.pathname)) target = url.searchParams.get('u') || url.searchParams.get('url')
    else if (!STEAM_HOST.test(url.hostname)) target = url.href
    if (!target) return
    e.preventDefault()
    e.stopPropagation()
    send('open', { url: target })
  }, true)

  // --- Wiring -------------------------------------------------------------------------------

  /** Called by the app with the ids in the download queue. */
  window.__wsdSetQueued = (ids) => {
    queued = new Set(ids)
    refreshStates(true)
  }

  function patch() {
    patchItemPage()
    patchCollectionPage()
    patchTiles()
    refreshStates()
  }

  let scheduled = false
  function schedule() {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      patch()
    })
  }

  function start() {
    document.head.appendChild(style)
    patch()
    // Listings and comments load more content without a page load.
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
