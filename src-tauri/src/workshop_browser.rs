//! The Workshop browser: a Steam Community page in a child webview over the Workshop tab's
//! content panel. The frontend keeps it sized to the panel and hides it when leaving the tab.
//!
//! An injected script (`workshop_inject.js`) swaps Steam's Subscribe buttons for "Add to queue".
//! A click navigates to a sentinel URL on `wsd.invalid`; the navigation is cancelled here and
//! turned into an event for the main webview. The Steam page itself gets no IPC access.

use crate::error::{Error, Result};
use serde::Serialize;
use std::sync::Mutex;
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Runtime, Url, Webview, WebviewUrl};

const LABEL: &str = "workshop";
/// The window the browser sits in, and the webview that gets its events.
const MAIN: &str = "main";
/// Clicks in the injected script navigate here; never a real host (RFC 2606).
const SENTINEL_HOST: &str = "wsd.invalid";
const INJECT: &str = include_str!("workshop_inject.js");

/// Item ids in the download queue, replayed into each page the browser loads.
#[derive(Default)]
pub struct WorkshopState {
    queued: Mutex<Vec<String>>,
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
}

/// Parses `https://wsd.invalid/add?ids=1,2` and `https://wsd.invalid/open?url=...`.
/// Other URLs, and malformed sentinels, give `None`.
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
        "/open" => {
            let target = Url::parse(&param("url")?).ok()?;
            matches!(target.scheme(), "http" | "https").then(|| Request::Open(target.into()))
        }
        _ => None,
    }
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

/// Pushes the queued ids into the page so its buttons show "In queue".
fn sync_queued<R: Runtime>(webview: &Webview<R>, ids: &[String]) {
    let json = serde_json::to_string(ids).unwrap_or_else(|_| "[]".into());
    let _ = webview.eval(format!("window.__wsdSetQueued && window.__wsdSetQueued({json})"));
}

fn create<R: Runtime>(app: &AppHandle<R>, url: Url, rect: Rect) -> Result<Webview<R>> {
    let window = app.get_window(MAIN).ok_or_else(|| Error::msg("main window not found"))?;
    let nav_app = app.clone();
    let load_app = app.clone();
    let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(url))
        .initialization_script(INJECT)
        .on_navigation(move |url| match parse_sentinel(url) {
            Some(Request::Add(ids)) => {
                let _ = nav_app.emit_to(MAIN, "workshop://add", AddPayload { ids });
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
        .on_new_window(|url, _features| {
            if matches!(url.scheme(), "http" | "https") {
                open_external(url.as_str());
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
    fn ignores_other_hosts() {
        assert_eq!(parse("https://steamcommunity.com/add?ids=1"), None);
    }
}
