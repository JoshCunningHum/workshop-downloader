//! The Workshop browser: a Steam Community page in a child webview over the Workshop tab's
//! content panel. The frontend keeps it sized to the panel and hides it when leaving the tab.
//!
//! An injected script (`workshop_inject.js`) swaps Steam's Subscribe buttons for "Add to queue"
//! and routes link clicks. Each navigates to a sentinel URL on `wsd.invalid`; the navigation is
//! cancelled here and turned into an event (queue, external) or a load in the browser itself
//! (plain Steam links, whose page-initiated navigation does not reach every platform's webview).
//! The Steam page itself gets no IPC access.

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Runtime, Url, Webview, WebviewUrl};

const LABEL: &str = "workshop";
/// The window the browser sits in, and the webview that gets its events.
const MAIN: &str = "main";
/// Clicks in the injected script navigate here; never a real host (RFC 2606).
const SENTINEL_HOST: &str = "wsd.invalid";
const INJECT: &str = include_str!("workshop_inject.js");

/// Item ids in the download queue and in the library, and the link options, replayed into each
/// page the browser loads.
#[derive(Default)]
pub struct WorkshopState {
    queued: Mutex<Vec<String>>,
    library: Mutex<Library>,
    options: Mutex<Options>,
}

/// How the browser treats links.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    /// Workshop item links that would leave the browser (new windows, off-site) open in it instead.
    open_item_links: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options { open_item_links: true }
    }
}

/// Items already downloaded: at Steam's latest revision, or with a newer one on Steam.
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct Library {
    current: Vec<String>,
    outdated: Vec<String>,
}

#[derive(Clone, Serialize)]
struct AddPayload {
    ids: Vec<String>,
}

#[derive(Clone, Serialize)]
struct LocationPayload {
    url: String,
}

/// What a sentinel URL asks for.
#[derive(Debug, PartialEq)]
enum Request {
    /// Queue these workshop ids (items or collections).
    Add(Vec<String>),
    /// Open an http(s) URL in the system browser.
    Open(String),
    /// Load this http(s) URL in the browser itself (a plain link click, routed through the
    /// app because page-initiated navigation does not reach every platform's webview).
    Nav(String),
}

/// Parses `https://wsd.invalid/add?ids=1,2`, `https://wsd.invalid/open?url=...` and
/// `https://wsd.invalid/nav?url=...`. Other URLs, and malformed sentinels, give `None`.
fn parse_sentinel(url: &Url) -> Option<Request> {
    if url.host_str() != Some(SENTINEL_HOST) {
        return None;
    }
    let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.into_owned());
    match url.path() {
        "/add" => {
            let ids: Vec<String> = param("ids")?
                .split(',')
                .filter(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))
                .map(str::to_owned)
                .collect();
            (!ids.is_empty()).then_some(Request::Add(ids))
        }
        "/nav" => {
            let target = Url::parse(&param("url")?).ok()?;
            matches!(target.scheme(), "http" | "https").then(|| Request::Nav(target.into()))
        }
        "/open" => {
            let target = Url::parse(&param("url")?).ok()?;
            matches!(target.scheme(), "http" | "https").then(|| Request::Open(target.into()))
        }
        _ => None,
    }
}

/// The item page for a link to a workshop item: `steamcommunity.com/{sharedfiles,workshop}/filedetails/?id=…`,
/// `steam://url/CommunityFilePage/…`, or Steam's link filter around either. Other links give `None`.
fn workshop_item_url(url: &Url) -> Option<Url> {
    item_id(url, 0).and_then(|id| Url::parse(&format!("https://steamcommunity.com/sharedfiles/filedetails/?id={id}")).ok())
}

fn item_id(url: &Url, depth: u8) -> Option<String> {
    let digits = |s: &str| (!s.is_empty() && s != "0" && s.bytes().all(|b| b.is_ascii_digit())).then(|| s.to_owned());
    if url.scheme() == "steam" {
        let rest = url.as_str().strip_prefix("steam://url/CommunityFilePage/")?;
        return digits(rest.trim_end_matches('/'));
    }
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let host = url.host_str()?;
    if host != "steamcommunity.com" && !host.ends_with(".steamcommunity.com") {
        return None;
    }
    let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.into_owned());
    let path = url.path().trim_end_matches('/');
    if path == "/linkfilter" {
        let target = Url::parse(&param("u").or_else(|| param("url"))?).ok()?;
        return if depth < 2 { item_id(&target, depth + 1) } else { None };
    }
    if path != "/sharedfiles/filedetails" && path != "/workshop/filedetails" {
        return None;
    }
    digits(&param("id")?)
}

/// Pushes the link options into the page (it checks them for off-site links).
fn sync_options<R: Runtime>(webview: &Webview<R>, options: &Options) {
    let json = serde_json::to_string(options).unwrap_or_else(|_| "{}".into());
    let _ = webview.eval(format!("window.__wsdSetOptions && window.__wsdSetOptions({json})"));
}

fn open_external(url: &str) {
    if let Err(e) = tauri_plugin_opener::open_url(url, None::<&str>) {
        log::warn!("could not open {url}: {e}");
    }
}

/// Bounds in the window's content view for a rect measured in the main page (CSS px).
///
/// The main page can start below the top of the content view: on macOS 26 the view extends
/// under the title bar and WebKit insets the page below it. A child webview is placed in view
/// coordinates, so it is moved down by that inset: the window's inner height minus the page's
/// own `innerHeight` (`viewport_height`). Where there is no inset this is 0.
fn bounds<R: Runtime>(app: &AppHandle<R>, x: f64, y: f64, width: f64, height: f64, viewport_height: f64) -> Rect {
    let top_inset = app
        .get_window(MAIN)
        .and_then(|w| Some(w.inner_size().ok()?.to_logical::<f64>(w.scale_factor().ok()?).height))
        .map(|inner| (inner - viewport_height).max(0.0))
        .unwrap_or(0.0);
    Rect {
        position: LogicalPosition::new(x, y + top_inset).into(),
        size: LogicalSize::new(width.max(1.0), height.max(1.0)).into(),
    }
}

fn parse_url(url: &str) -> Result<Url> {
    let url = Url::parse(url).map_err(|e| Error::msg(format!("invalid URL {url}: {e}")))?;
    if url.scheme() != "https" {
        return Err(Error::msg(format!("{url} is not an https URL")));
    }
    Ok(url)
}

fn webview<R: Runtime>(app: &AppHandle<R>) -> Result<Webview<R>> {
    app.get_webview(LABEL).ok_or_else(|| Error::msg("the workshop browser is not open"))
}

/// Pushes the library state into the page so its buttons show "Downloaded" / "Update".
fn sync_library<R: Runtime>(webview: &Webview<R>, library: &Library) {
    let json = serde_json::to_string(library).unwrap_or_else(|_| "{}".into());
    let _ = webview.eval(format!("window.__wsdSetLibrary && window.__wsdSetLibrary({json})"));
}

/// Pushes the queued ids into the page so its buttons show "In queue".
fn sync_queued<R: Runtime>(webview: &Webview<R>, ids: &[String]) {
    let json = serde_json::to_string(ids).unwrap_or_else(|_| "[]".into());
    let _ = webview.eval(format!("window.__wsdSetQueued && window.__wsdSetQueued({json})"));
}

fn create<R: Runtime>(app: &AppHandle<R>, url: Url, rect: Rect) -> Result<Webview<R>> {
    let window = app.get_window(MAIN).ok_or_else(|| Error::msg("main window not found"))?;
    let nav_app = app.clone();
    let load_app = app.clone();
    let window_app = app.clone();
    let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(url))
        .initialization_script(INJECT)
        .on_navigation(move |url| match parse_sentinel(url) {
            Some(Request::Add(ids)) => {
                let _ = nav_app.emit_to(MAIN, "workshop://add", AddPayload { ids });
                false
            }
            Some(Request::Nav(target)) => {
                if let Some(webview) = nav_app.get_webview(LABEL) {
                    let _ = webview.navigate(Url::parse(&target).expect("parse_sentinel checked this"));
                }
                false
            }
            Some(Request::Open(target)) => {
                open_external(&target);
                false
            }
            // A malformed sentinel goes nowhere; everything else (Steam, its iframes) loads.
            None => url.host_str() != Some(SENTINEL_HOST),
        })
        // target=_blank links and window.open: show them in the system browser instead.
        // Workshop item links show in the browser itself when that option is on.
        .on_new_window(move |url, _features| {
            let state = window_app.state::<WorkshopState>();
            let in_place = state.options.lock().unwrap().open_item_links;
            match workshop_item_url(&url) {
                Some(item) if in_place => {
                    if let Some(webview) = window_app.get_webview(LABEL) {
                        let _ = webview.navigate(item);
                    }
                }
                _ if matches!(url.scheme(), "http" | "https") => open_external(url.as_str()),
                _ => {}
            }
            NewWindowResponse::Deny
        })
        .on_page_load(move |webview, payload| {
            // Started drives the loading bar; Finished (the location event) ends it.
            if payload.event() == PageLoadEvent::Started {
                let _ = load_app.emit_to(MAIN, "workshop://loading", LocationPayload { url: payload.url().to_string() });
                return;
            }
            let _ = load_app.emit_to(MAIN, "workshop://location", LocationPayload { url: payload.url().to_string() });
            let state = load_app.state::<WorkshopState>();
            let ids = state.queued.lock().unwrap().clone();
            let library = state.library.lock().unwrap().clone();
            let options = state.options.lock().unwrap().clone();
            sync_options(&webview, &options);
            sync_library(&webview, &library);
            sync_queued(&webview, &ids);
        });
    Ok(window.add_child(builder, rect.position, rect.size)?)
}

/// Shows the browser at the given bounds (CSS px in the main page), creating it on
/// first use. With a `url`, it also goes there; without, it keeps the page it was on.
#[tauri::command]
pub async fn workshop_show<R: Runtime>(
    app: AppHandle<R>,
    url: Option<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_height: f64,
) -> Result<()> {
    let rect = bounds(&app, x, y, width, height, viewport_height);
    if let Some(webview) = app.get_webview(LABEL) {
        webview.set_bounds(rect)?;
        if let Some(url) = url {
            webview.navigate(parse_url(&url)?)?;
        }
        webview.show()?;
        return Ok(());
    }
    let url = url.ok_or_else(|| Error::msg("a URL is needed to open the workshop browser"))?;
    create(&app, parse_url(&url)?, rect)?;
    Ok(())
}

#[tauri::command]
pub async fn workshop_set_bounds<R: Runtime>(
    app: AppHandle<R>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_height: f64,
) -> Result<()> {
    if let Some(webview) = app.get_webview(LABEL) {
        webview.set_bounds(bounds(&app, x, y, width, height, viewport_height))?;
    }
    Ok(())
}

/// Hides the browser; it keeps its page and history for when the tab is opened again.
#[tauri::command]
pub async fn workshop_hide<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    if let Some(webview) = app.get_webview(LABEL) {
        webview.hide()?;
    }
    Ok(())
}

#[tauri::command]
pub async fn workshop_navigate<R: Runtime>(app: AppHandle<R>, url: String) -> Result<()> {
    webview(&app)?.navigate(parse_url(&url)?)?;
    Ok(())
}

#[tauri::command]
pub async fn workshop_back<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    webview(&app)?.eval("history.back()")?;
    Ok(())
}

#[tauri::command]
pub async fn workshop_forward<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    webview(&app)?.eval("history.forward()")?;
    Ok(())
}

#[tauri::command]
pub async fn workshop_reload<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    webview(&app)?.reload()?;
    Ok(())
}

/// Sets how the browser treats links (now and on every page it loads next).
#[tauri::command]
pub async fn workshop_set_options<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, WorkshopState>,
    options: Options,
) -> Result<()> {
    *state.options.lock().unwrap() = options.clone();
    if let Some(webview) = app.get_webview(LABEL) {
        sync_options(&webview, &options);
    }
    Ok(())
}

/// Sets which items the browser shows as downloaded or outdated (now and on every page it loads next).
#[tauri::command]
pub async fn workshop_set_library<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, WorkshopState>,
    library: Library,
) -> Result<()> {
    *state.library.lock().unwrap() = library.clone();
    if let Some(webview) = app.get_webview(LABEL) {
        sync_library(&webview, &library);
    }
    Ok(())
}

/// Sets the ids shown as "In queue" in the browser (now and on every page it loads next).
#[tauri::command]
pub async fn workshop_set_queued<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, WorkshopState>,
    ids: Vec<String>,
) -> Result<()> {
    *state.queued.lock().unwrap() = ids.clone();
    if let Some(webview) = app.get_webview(LABEL) {
        sync_queued(&webview, &ids);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(url: &str) -> Option<Request> {
        parse_sentinel(&Url::parse(url).unwrap())
    }

    fn item(url: &str) -> Option<String> {
        workshop_item_url(&Url::parse(url).unwrap()).map(String::from)
    }

    #[test]
    fn recognises_workshop_item_links() {
        let page = Some("https://steamcommunity.com/sharedfiles/filedetails/?id=42".to_owned());
        assert_eq!(item("https://steamcommunity.com/sharedfiles/filedetails/?id=42"), page);
        assert_eq!(item("https://steamcommunity.com/workshop/filedetails/?searchtext=&id=42"), page);
        assert_eq!(item("steam://url/CommunityFilePage/42"), page);
        let inner = "https%3A%2F%2Fsteamcommunity.com%2Fsharedfiles%2Ffiledetails%2F%3Fid%3D42";
        assert_eq!(item(&format!("https://steamcommunity.com/linkfilter/?u={inner}")), page);
        assert_eq!(item(&format!("https://steamcommunity.com/linkfilter/?url={inner}")), page);
    }

    #[test]
    fn ignores_other_links() {
        assert_eq!(item("https://steamcommunity.com/app/281990/workshop/"), None);
        assert_eq!(item("https://steamcommunity.com/sharedfiles/filedetails/?id=abc"), None);
        assert_eq!(item("https://steamcommunity.com.evil.com/sharedfiles/filedetails/?id=1"), None);
        assert_eq!(item("https://example.com/sharedfiles/filedetails/?id=1"), None);
        assert_eq!(item("https://steamcommunity.com/linkfilter/?u=https%3A%2F%2Fgithub.com"), None);
    }

    #[test]
    fn reads_add_requests() {
        assert_eq!(parse("https://wsd.invalid/add?ids=1,22"), Some(Request::Add(vec!["1".into(), "22".into()])));
        assert_eq!(parse("https://wsd.invalid/add?ids=1,x,"), Some(Request::Add(vec!["1".into()])));
        assert_eq!(parse("https://wsd.invalid/add?ids="), None);
    }

    #[test]
    fn opens_only_web_urls() {
        assert_eq!(
            parse("https://wsd.invalid/open?url=https%3A%2F%2Fexample.com%2Fa"),
            Some(Request::Open("https://example.com/a".into()))
        );
        assert_eq!(parse("https://wsd.invalid/open?url=file%3A%2F%2F%2Fetc%2Fpasswd"), None);
    }

    #[test]
    fn reads_nav_requests() {
        assert_eq!(
            parse("https://wsd.invalid/nav?url=https%3A%2F%2Fsteamcommunity.com%2Fsharedfiles%2Ffiledetails%2F%3Fid%3D42"),
            Some(Request::Nav("https://steamcommunity.com/sharedfiles/filedetails/?id=42".into()))
        );
        assert_eq!(parse("https://wsd.invalid/nav?url=ftp%3A%2F%2Fexample.com"), None);
        assert_eq!(parse("https://wsd.invalid/nav?url=not+a+url"), None);
    }

    #[test]
    fn ignores_other_hosts() {
        assert_eq!(parse("https://steamcommunity.com/add?ids=1"), None);
    }
}
