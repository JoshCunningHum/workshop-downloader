//! Steam Web API calls that need no key. Done in Rust to avoid webview CORS.
//! - ISteamRemoteStorage/GetPublishedFileDetails: item metadata (consumer_app_id, time_updated, ...)
//! - ISteamRemoteStorage/GetCollectionDetails: expands collections into their children
//! - store.steampowered.com/api/appdetails: game names and store metadata (image, description, ...)

use crate::error::{Error, Result};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;
use std::time::Duration;

const DETAILS_URL: &str = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
const COLLECTION_URL: &str = "https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/";
const BATCH: usize = 100;
const MAX_COLLECTION_DEPTH: usize = 3;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("workshop-downloader")
        .build()
        .expect("client builds")
});

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ItemDetails {
    pub id: String,
    /// EResult; 1 = OK. Anything else means the item is missing, private or removed.
    pub result: i64,
    pub app_id: u32,
    pub title: String,
    pub creator: String,
    pub preview_url: Option<String>,
    pub file_size: u64,
    pub time_created: i64,
    pub time_updated: i64,
    pub tags: Vec<String>,
    pub banned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub children: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    pub items: Vec<ItemDetails>,
    pub collections: Vec<Collection>,
}

/// The API returns numbers as strings in some fields and numbers in others; accept both.
fn num(v: &Value) -> Option<i64> {
    match v {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

fn string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

pub fn parse_details(body: &Value) -> Vec<ItemDetails> {
    let Some(list) = body.pointer("/response/publishedfiledetails").and_then(Value::as_array) else {
        return vec![];
    };
    list.iter()
        .map(|d| ItemDetails {
            id: string(&d["publishedfileid"]),
            result: num(&d["result"]).unwrap_or(0),
            app_id: num(&d["consumer_app_id"]).unwrap_or(0) as u32,
            title: string(&d["title"]),
            creator: string(&d["creator"]),
            preview_url: d["preview_url"].as_str().filter(|s| !s.is_empty()).map(str::to_string),
            file_size: num(&d["file_size"]).unwrap_or(0).max(0) as u64,
            time_created: num(&d["time_created"]).unwrap_or(0),
            time_updated: num(&d["time_updated"]).unwrap_or(0),
            tags: d["tags"]
                .as_array()
                .map(|tags| tags.iter().filter_map(|t| t["tag"].as_str().map(str::to_string)).collect())
                .unwrap_or_default(),
            banned: num(&d["banned"]).unwrap_or(0) != 0 || d["banned"].as_bool().unwrap_or(false),
        })
        .collect()
}

/// (collection id, child ids, nested collection ids) for every input that is a collection.
pub fn parse_collections(body: &Value) -> Vec<(String, Vec<String>, Vec<String>)> {
    let Some(list) = body.pointer("/response/collectiondetails").and_then(Value::as_array) else {
        return vec![];
    };
    list.iter()
        .filter_map(|c| {
            let children = c["children"].as_array()?;
            if children.is_empty() {
                return None;
            }
            let (mut items, mut nested) = (vec![], vec![]);
            for child in children {
                let id = string(&child["publishedfileid"]);
                // filetype 2 = a collection inside the collection.
                if num(&child["filetype"]) == Some(2) { nested.push(id) } else { items.push(id) }
            }
            Some((string(&c["publishedfileid"]), items, nested))
        })
        .collect()
}

fn form(count_key: &str, ids: &[String]) -> Vec<(String, String)> {
    let mut form = vec![(count_key.to_string(), ids.len().to_string())];
    form.extend(ids.iter().enumerate().map(|(i, id)| (format!("publishedfileids[{i}]"), id.clone())));
    form
}

async fn post(url: &str, form: &[(String, String)]) -> Result<Value> {
    let response = CLIENT.post(url).form(form).send().await?;
    if !response.status().is_success() {
        return Err(Error::msg(format!("Steam Web API returned {}", response.status())));
    }
    Ok(response.json().await?)
}

pub async fn details(ids: &[String]) -> Result<Vec<ItemDetails>> {
    let mut out = Vec::with_capacity(ids.len());
    for chunk in ids.chunks(BATCH) {
        out.extend(parse_details(&post(DETAILS_URL, &form("itemcount", chunk)).await?));
    }
    Ok(out)
}

pub async fn resolve(ids: Vec<String>) -> Result<Resolved> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut item_ids: Vec<String> = vec![];
    let mut collections = vec![];
    let mut frontier: Vec<String> = ids.into_iter().filter(|id| seen.insert(id.clone())).collect();

    for _ in 0..=MAX_COLLECTION_DEPTH {
        if frontier.is_empty() {
            break;
        }
        let mut found: HashMap<String, (Vec<String>, Vec<String>)> = HashMap::new();
        for chunk in frontier.chunks(BATCH) {
            for (id, items, nested) in parse_collections(&post(COLLECTION_URL, &form("collectioncount", chunk)).await?) {
                found.insert(id, (items, nested));
            }
        }
        let mut next = vec![];
        for id in frontier {
            match found.remove(&id) {
                Some((items, nested)) => {
                    collections.push(Collection { id, children: items.clone() });
                    item_ids.extend(items.into_iter().filter(|c| seen.insert(c.clone())));
                    next.extend(nested.into_iter().filter(|c| seen.insert(c.clone())));
                }
                None => item_ids.push(id),
            }
        }
        frontier = next;
    }

    Ok(Resolved { items: details(&item_ids).await?, collections })
}

/// Store page metadata of an app. Apps without a store page (most dedicated servers/tools) have none.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppDetails {
    pub name: String,
    /// "game", "dlc", "demo", ...
    pub kind: Option<String>,
    pub short_description: Option<String>,
    /// 460x215 banner.
    pub header_image: Option<String>,
    /// 231x87 capsule.
    pub capsule_image: Option<String>,
    pub developers: Vec<String>,
    pub publishers: Vec<String>,
    pub genres: Vec<String>,
    /// As the store shows it, e.g. "17 Oct, 2018".
    pub release_date: Option<String>,
    pub website: Option<String>,
}

fn non_empty(v: &Value) -> Option<String> {
    v.as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
}

/// Decodes the HTML entities the store leaves in descriptions (`&quot;`, `&amp;`, ...).
fn decode_entities(text: &str) -> String {
    text.replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(non_empty).collect()).unwrap_or_default()
}

/// Parses an `appdetails` response; None when the store has no data for the app.
pub fn parse_app_details(app_id: u32, body: &Value) -> Option<AppDetails> {
    let entry = &body[app_id.to_string()];
    if entry["success"].as_bool() != Some(true) {
        return None;
    }
    let data = &entry["data"];
    Some(AppDetails {
        name: non_empty(&data["name"])?,
        kind: non_empty(&data["type"]),
        short_description: non_empty(&data["short_description"]).map(|d| decode_entities(&d)),
        header_image: non_empty(&data["header_image"]),
        capsule_image: non_empty(&data["capsule_image"]),
        developers: strings(&data["developers"]),
        publishers: strings(&data["publishers"]),
        genres: data["genres"]
            .as_array()
            .map(|a| a.iter().filter_map(|g| non_empty(&g["description"])).collect())
            .unwrap_or_default(),
        release_date: non_empty(&data["release_date"]["date"]),
        website: non_empty(&data["website"]),
    })
}

pub async fn app_details(app_id: u32) -> Result<Option<AppDetails>> {
    let url = format!("https://store.steampowered.com/api/appdetails?appids={app_id}");
    let body: Value = CLIENT.get(url).send().await?.error_for_status()?.json().await?;
    Ok(parse_app_details(app_id, &body))
}

pub async fn app_name(app_id: u32) -> Result<Option<String>> {
    let url = format!("https://store.steampowered.com/api/appdetails?appids={app_id}&filters=basic");
    let body: Value = CLIENT.get(url).send().await?.json().await?;
    Ok(body[app_id.to_string()]["data"]["name"].as_str().map(str::to_string))
}

#[tauri::command]
pub async fn steam_resolve(ids: Vec<String>) -> Result<Resolved> {
    resolve(ids).await
}

#[tauri::command]
pub async fn steam_item_details(ids: Vec<String>) -> Result<Vec<ItemDetails>> {
    details(&ids).await
}

/// Store metadata for one app; None when the store has no page for it.
#[tauri::command]
pub async fn steam_app_details(app_id: u32) -> Result<Option<AppDetails>> {
    app_details(app_id).await
}

/// Names for app ids; ids the store doesn't know (or network errors) are left out.
#[tauri::command]
pub async fn steam_app_names(app_ids: Vec<u32>) -> HashMap<u32, String> {
    let mut names = HashMap::new();
    for app_id in app_ids {
        match app_name(app_id).await {
            Ok(Some(name)) => {
                names.insert(app_id, name);
            }
            Ok(None) => {}
            Err(e) => log::warn!("app name lookup for {app_id} failed: {e}"),
        }
    }
    names
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_store_app_details() {
        let body = json!({ "294100": { "success": true, "data": {
            "type": "game", "name": "RimWorld", "short_description": "A sci-fi colony sim. ",
            "header_image": "https://cdn.example/294100/header.jpg", "capsule_image": "",
            "developers": ["Ludeon Studios"], "publishers": ["Ludeon Studios", ""],
            "genres": [{ "id": "28", "description": "Simulation" }, { "id": "2", "description": "Strategy" }],
            "release_date": { "coming_soon": false, "date": "17 Oct, 2018" }, "website": null
        }}});
        assert_eq!(parse_app_details(294100, &body), Some(AppDetails {
            name: "RimWorld".into(),
            kind: Some("game".into()),
            short_description: Some("A sci-fi colony sim.".into()),
            header_image: Some("https://cdn.example/294100/header.jpg".into()),
            capsule_image: None,
            developers: vec!["Ludeon Studios".into()],
            publishers: vec!["Ludeon Studios".into()],
            genres: vec!["Simulation".into(), "Strategy".into()],
            release_date: Some("17 Oct, 2018".into()),
            website: None,
        }));
    }

    #[test]
    fn decodes_description_entities() {
        assert_eq!(decode_entities("&quot;Hi&quot; &amp; it&#39;s &lt;3"), "\"Hi\" & it's <3");
        assert_eq!(decode_entities("&amp;quot;"), "&quot;", "decoded once, not twice");
    }

    #[test]
    fn store_without_data_gives_none() {
        assert_eq!(parse_app_details(90, &json!({ "90": { "success": false } })), None);
        assert_eq!(parse_app_details(90, &json!({})), None);
    }

    #[test]
    fn parses_details_with_mixed_number_types() {
        let body = json!({ "response": { "result": 1, "resultcount": 2, "publishedfiledetails": [
            { "publishedfileid": "123", "result": 1, "creator": "7656", "consumer_app_id": 294100,
              "file_size": "2048", "preview_url": "https://img/x.jpg", "title": "Mod", "time_created": 1,
              "time_updated": 1700000000, "banned": 0, "tags": [{ "tag": "Mod" }, { "tag": "1.5" }] },
            { "publishedfileid": "999", "result": 9 }
        ]}});
        let items = parse_details(&body);
        assert_eq!(items[0].app_id, 294100);
        assert_eq!(items[0].file_size, 2048);
        assert_eq!(items[0].time_updated, 1700000000);
        assert_eq!(items[0].tags, vec!["Mod", "1.5"]);
        assert_eq!((items[1].id.as_str(), items[1].result, items[1].app_id), ("999", 9, 0));
    }

    #[test]
    fn parses_collections_and_skips_non_collections() {
        let body = json!({ "response": { "collectiondetails": [
            { "publishedfileid": "1", "result": 1, "children": [
                { "publishedfileid": "10", "sortorder": 1, "filetype": 0 },
                { "publishedfileid": "20", "sortorder": 2, "filetype": 2 }
            ]},
            { "publishedfileid": "2", "result": 1 },
            { "publishedfileid": "3", "result": 1, "children": [] }
        ]}});
        assert_eq!(parse_collections(&body), vec![("1".to_string(), vec!["10".to_string()], vec!["20".to_string()])]);
    }

    #[test]
    fn builds_indexed_form() {
        assert_eq!(
            form("itemcount", &["5".into(), "6".into()]),
            vec![
                ("itemcount".into(), "2".into()),
                ("publishedfileids[0]".into(), "5".into()),
                ("publishedfileids[1]".into(), "6".into())
            ]
        );
    }
}
