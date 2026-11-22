// Injected into the Workshop browser (see workshop_browser.rs). Replaces Steam's Subscribe
// buttons with "Add to queue"; a click navigates to https://wsd.invalid/add?ids=..., which the
// app cancels and turns into a queue request. Links leaving Steam go to the system browser;
// plain links between Steam pages load through the app (https://wsd.invalid/nav?url=...).
(function () {
  if (window.__wsdInjected) return
  window.__wsdInjected = true
  if (!/(^|\.)steamcommunity\.com$/.test(location.hostname)) return

  const SENTINEL = 'https://wsd.invalid'
  const STEAM_HOST = /(^|\.)(steamcommunity\.com|steampowered\.com)$/
  let queued = new Set()
  // See __wsdSetOptions: workshop item links that would leave the browser open in it instead.
  let openItemLinks = true
  // Items already downloaded: at Steam's latest revision, or with an update on Steam.
  let current = new Set()
  let outdated = new Set()
  // Collections clicked on this page; they expand into items, so they can't be looked up in `queued`.
  const addedCollections = new Set()

  function send(path, params) {
    location.href = `${SENTINEL}/${path}?${new URLSearchParams(params)}`
  }

  function queue(ids) {
    send('add', { ids: ids.join(',') })
  }

  /** The item page for a workshop item link (also through Steam's link filter), or null. */
  function itemPageUrl(href, depth = 0) {
    let url
    try {
      url = new URL(href, location.href)
    } catch {
      return null
    }
    if (url.protocol === 'steam:') {
      const match = /^steam:\/\/url\/CommunityFilePage\/(\d+)/i.exec(url.href)
      return match ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${match[1]}` : null
    }
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)steamcommunity\.com$/.test(url.hostname)) return null
    if (/^\/linkfilter\/?$/.test(url.pathname)) {
      const target = url.searchParams.get('u') || url.searchParams.get('url')
      return target && depth < 2 ? itemPageUrl(target, depth + 1) : null
    }
    if (!/^\/(sharedfiles|workshop)\/filedetails\/?$/.test(url.pathname)) return null
    const id = url.searchParams.get('id')
    return id && /^\d+$/.test(id) && id !== '0' ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}` : null
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
      position: absolute; top: 6px; right: 6px; z-index: 50;
      min-width: 26px; height: 26px; padding: 0 7px; border: 0; border-radius: 3px;
      font: bold 16px/26px "Motiva Sans", Arial, sans-serif; color: #d2efa9;
      background: rgba(75, 106, 33, .95); box-shadow: 0 0 4px rgba(0, 0, 0, .7);
      white-space: nowrap;
    }
    .wsd-tile-btn:hover { color: #fff; background: rgba(110, 155, 45, .98); }
    /* Hovering the tile spells out what "+" does. */
    .wsd-tile-hover:hover .wsd-tile-btn[data-state="idle"]::after { content: " Add to queue"; font-size: 12px; font-weight: normal; }
    .wsd-tile-btn[data-state="queued"] { color: #c6d4df; background: rgba(40, 60, 80, .95); }
    /* A collection row's "+": the tile button's look, laid out in the row instead of over an image. */
    .wsd-tile-btn.wsd-row-btn { position: static; display: inline-block; vertical-align: middle; }
    .wsd-add-all { display: flex; justify-content: flex-end; margin: 12px 0; }
    /* Downloaded at the latest revision: nothing to add. */
    .wsd-btn[data-state="current"] { opacity: .55; cursor: default; filter: grayscale(.6); }
    .wsd-tile-btn[data-state="current"] { color: #c6d4df; background: rgba(40, 60, 80, .95); }
    /* Downloaded, but Steam has a newer revision: blue, and still adds (the update). */
    .wsd-btn[data-state="outdated"] { background: #1a9fff !important; color: #fff !important; }
    .wsd-btn[data-state="outdated"] > span { background: none !important; color: #fff !important; }
    .wsd-tile-btn[data-state="outdated"] { background: rgba(26, 159, 255, .95); }
    .wsd-tile-hover:hover .wsd-tile-btn[data-state="outdated"]::after { content: " Update"; font-size: 12px; font-weight: normal; }
  `

  // --- Buttons ------------------------------------------------------------------------------

  const LABELS = {
    item: { idle: 'Add to queue', adding: 'Adding…', queued: 'In queue ✓', current: 'Downloaded ✓', outdated: 'Update available' },
    tile: { idle: '+', adding: '…', queued: '✓', current: '✓', outdated: '↻' },
    collection: { idle: 'Add all', adding: 'Adding…', queued: 'All in queue ✓' }
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
      // Idle adds; outdated adds the update. Queued, adding and downloaded do nothing.
      if (btn.dataset.state !== 'idle' && btn.dataset.state !== 'outdated') return
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

  /**
   * The collection-wide subscribe buttons. Each item's own button calls SubscribeCollectionItem,
   * which also contains "SubscribeCollection", so those are filtered out.
   */
  function collectionButtons() {
    return [...document.querySelectorAll('[onclick*="SubscribeCollection"]')]
      .filter(el => !/SubscribeCollectionItem/.test(el.getAttribute('onclick')))
  }

  function isCollectionPage() {
    return !!document.querySelector('.collectionChildren') || collectionButtons().length > 0
  }

  /** An item's own page: the big green Subscribe button. */
  function patchItemPage() {
    const id = pageId()
    if (!id || isCollectionPage()) return
    replace(document.getElementById('SubscribeItemBtn'), () =>
      makeButton('item', [id], 'a', 'btn_green_white_innerfade btn_border_2px btn_medium'))
  }

  /**
   * A collection page: "Subscribe to all" becomes "Add all", each item's subscribe toggle a
   * compact "+", and another "Add all" goes below the list.
   */
  function patchCollectionPage() {
    const id = pageId()
    if (!id || !isCollectionPage()) return
    for (const all of collectionButtons()) {
      if (/Unsubscribe/i.test(all.getAttribute('onclick'))) {
        all.classList.add('wsd-hidden')
        continue
      }
      replace(all, () => makeButton('collection', [id], 'a', 'general_btn subscribe'))
    }
    for (const child of document.querySelectorAll('.collectionItem')) {
      const childId = (child.id || '').replace(/^sharedfile_/, '')
      if (!/^\d+$/.test(childId)) continue
      replace(child.querySelector(`#SubscribeItemBtn${childId}, [onclick*="SubscribeCollectionItem"]`), () => {
        const btn = makeButton('tile', [childId], 'button', 'wsd-tile-btn wsd-row-btn')
        btn.title = 'Add to queue'
        return btn
      })
    }
    const list = document.querySelector('.collectionChildren')
    if (list && !list.dataset.wsdAddAll) {
      list.dataset.wsdAddAll = '1'
      const bar = document.createElement('div')
      bar.className = 'wsd-add-all'
      bar.appendChild(makeButton('collection', [id], 'a', 'btn_green_white_innerfade btn_medium'))
      list.insertAdjacentElement('afterend', bar)
    }
  }

  /**
   * Item tiles anywhere (browse grid, workshop home carousels, required items, ...): every
   * preview image that links to an item gets a "+" in its corner. Keyed off the link rather
   * than Steam's tile classes, which differ between pages.
   */
  function patchTiles() {
    const current = pageId()
    for (const link of document.querySelectorAll('a[href*="filedetails/?id="]')) {
      if (link.dataset.wsdTile || !link.querySelector('img')) continue
      link.dataset.wsdTile = '1'
      const id = idFromHref(link.getAttribute('href'))
      // The page's own item has its big button; collection rows have theirs.
      if (!id || id === current || link.closest('.collectionItem')) continue
      // The button goes on the image's box; one per box even if several links share it.
      const host = link.querySelector('img').parentElement
      if (!host || host.dataset.wsdHost) continue
      host.dataset.wsdHost = '1'
      if (getComputedStyle(host).position === 'static') host.classList.add('wsd-tile-host')
      host.classList.add('wsd-tile-hover')
      const btn = makeButton('tile', [id], 'button', 'wsd-tile-btn')
      btn.title = 'Add to queue'
      host.appendChild(btn)
    }
  }

  /**
   * Shows each button as queued or not. A button that is "adding" stays so until the app
   * answers (`settle`), so a page update in between doesn't flip it back.
   */
  function refreshStates(settle = false) {
    for (const btn of document.querySelectorAll('.wsd-btn')) {
      const ids = btn.dataset.ids.split(',')
      if (btn.dataset.kind === 'collection') {
        // Done once clicked, or when every item listed on the page is queued or downloaded.
        const children = [...document.querySelectorAll('.collectionItem')]
          .map(c => (c.id || '').replace(/^sharedfile_/, ''))
          .filter(id => /^\d+$/.test(id))
        const done = addedCollections.has(btn.dataset.ids)
          || (children.length > 0 && children.every(id => queued.has(id) || current.has(id)))
        if (done) setLabel(btn, 'queued')
        else if (settle || btn.dataset.state !== 'adding') setLabel(btn, 'idle')
        continue
      }
      // In queue beats downloaded beats outdated; "adding" holds until the app answers.
      let state = 'idle'
      if (ids.every(id => queued.has(id))) state = 'queued'
      else if (btn.dataset.state === 'adding' && !settle) state = 'adding'
      else if (ids.every(id => current.has(id))) state = 'current'
      else if (ids.some(id => outdated.has(id))) state = 'outdated'
      setLabel(btn, state)
    }
  }

  // --- External links -----------------------------------------------------------------------

  /**
   * Links off Steam (directly or through Steam's link filter) open in the system browser.
   * Plain left clicks on Steam's own pages are loaded through the app (`nav`): webviews
   * don't deliver page-initiated navigation on every platform, but the app's own load
   * (the one "open in new tab" uses) always switches the view. Modified and middle clicks
   * keep their browser behaviour; same-page anchors keep theirs.
   */
  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    const a = e.target instanceof Element && e.target.closest('a[href]')
    if (!a) return
    const raw = a.getAttribute('href') || ''
    if (raw.startsWith('#')) return
    let url
    try {
      url = new URL(raw, location.href)
    } catch {
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    let target = null
    if (/\/linkfilter\/?$/.test(url.pathname)) target = url.searchParams.get('u') || url.searchParams.get('url')
    else if (!STEAM_HOST.test(url.hostname)) target = url.href
    if (target) {
      e.preventDefault()
      e.stopPropagation()
      // A workshop item stays in the browser (when that option is on); anything else leaves.
      const item = openItemLinks && itemPageUrl(target)
      if (item) send('nav', { url: item })
      else send('open', { url: target })
      return
    }
    // Loading the same page again is what Steam's own links do anyway; skip only the no-op.
    if (url.href === location.href) return
    e.preventDefault()
    send('nav', { url: url.href })
  }, true)

  // --- Wiring -------------------------------------------------------------------------------

  /** Called by the app with the link options: `{ openItemLinks: boolean }`. */
  window.__wsdSetOptions = (options) => {
    openItemLinks = options.openItemLinks !== false
  }

  /** Called by the app with the downloaded items: `{ current: [...ids], outdated: [...ids] }`. */
  window.__wsdSetLibrary = (library) => {
    current = new Set(library.current || [])
    outdated = new Set(library.outdated || [])
    refreshStates()
  }

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
