use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

mod venice;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Video {
    pub video_id: String,
    pub title: String,
    pub author: Option<String>,
    pub handle: Option<String>,
    pub length_seconds: Option<i32>,
    pub transcript: Option<String>,
    pub summary: Option<String>,
    pub view_count: Option<i64>,
    pub video_type: Option<String>,
    pub published_at: Option<String>,
    pub date_added: Option<String>,
    pub thumbnail: String,
    pub status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DisplaySettings {
    pub resolution: String,
    pub fullscreen: bool,
    pub theme: String,
    pub video_list_mode: String,
}

pub struct DbPathState(pub Mutex<Option<String>>);

pub struct ConfManager;

impl ConfManager {
    fn get_path(app: &tauri::AppHandle) -> PathBuf {
        app.path().app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("init.conf")
    }

    pub fn read_attr(app: &tauri::AppHandle, key: &str) -> Option<String> {
        let conf_path = Self::get_path(app);
        if !conf_path.exists() { return None; }
        if let Ok(content) = std::fs::read_to_string(conf_path) {
            for line in content.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    if k.trim() == key { return Some(v.trim().to_string()); }
                }
            }
        }
        None
    }
}

fn get_db_path(app: &tauri::AppHandle) -> String {
    let state = app.state::<DbPathState>();
    let mut guard = state.0.lock().unwrap();

    if let Some(ref path) = *guard {
        return path.clone();
    }

    // Determine base directory for Kinesis data depending on OS
    #[cfg(target_os = "windows")]
    let base_dir = {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(&appdata).join("kinesisapp")
    };
    #[cfg(not(target_os = "windows"))]
    let base_dir = {
        // Use XDG spec, fallback to $HOME/.local/share
        let xdg = std::env::var("XDG_DATA_HOME").ok();
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        let dir = xdg.map(PathBuf::from).unwrap_or_else(|| PathBuf::from(home).join(".local/share"));
        dir.join("kinesisapp")
    };

    let kinesis_conf_path = base_dir.join("init.conf");
    let mut db_full_path = base_dir.join("kinesis_data.db");

    // Check init.conf for custom db_path override
    if kinesis_conf_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&kinesis_conf_path) {
            for line in content.lines() {
                if let Some((k, v)) = line.split_once(':') {
                    if k.trim() == "db_path" {
                        let path = PathBuf::from(v.trim());
                        db_full_path = path.join("kinesis_data.db");
                        break;
                    }
                }
            }
        }
    }

    let path_str = db_full_path.to_string_lossy().to_string();
    *guard = Some(path_str.clone());
    path_str
}

fn rust_get_setting(db_path: &str, key: &str) -> Option<String> {
    if let Ok(conn) = Connection::open(db_path) {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?").ok()?;
        stmt.query_row(params![key], |row| row.get::<_, String>(0)).ok()
    } else {
        None
    }
}

fn ensure_db_exists(db_path: &str) -> Result<(), String> {
    let path = PathBuf::from(db_path);
    if !path.exists() {
        return Err(format!("Database not found at: {}", db_path));
    }
    Ok(())
}

#[tauri::command]
fn get_all_videos(app: tauri::AppHandle) -> Result<Vec<Video>, String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT video_id, title, author, handle, length_seconds, transcript, summary, 
         view_count, video_type, published_at, date_added 
         FROM videos 
         ORDER BY date_added DESC, rowid DESC"
    ).map_err(|e| e.to_string())?;

    let video_iter = stmt.query_map([], |row| {
        Ok(Video {
            video_id: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "Unknown".to_string()),
            author: row.get(2)?,
            handle: row.get(3)?,
            length_seconds: row.get(4)?,
            transcript: row.get(5)?,
            summary: row.get(6)?,
            view_count: row.get(7)?,
            video_type: row.get(8)?,
            published_at: row.get(9)?,
            date_added: row.get(10)?,
            thumbnail: format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", row.get::<_, String>(0)?),
            status: Some("saved".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut videos = Vec::new();
    for video in video_iter {
        videos.push(video.map_err(|e| e.to_string())?);
    }
    Ok(videos)
}

#[tauri::command]
fn get_video_by_id(app: tauri::AppHandle, video_id: String) -> Result<Option<Video>, String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT video_id, title, author, handle, length_seconds, transcript, summary, 
         view_count, video_type, published_at, date_added 
         FROM videos WHERE video_id = ?"
    ).map_err(|e| e.to_string())?;

    let mut rows = stmt.query(params![video_id]).map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(Video {
            video_id: row.get(0).map_err(|e| e.to_string())?,
            title: row.get::<_, Option<String>>(1).map_err(|e| e.to_string())?
                .unwrap_or_else(|| "Unknown".to_string()),
            author: row.get(2).map_err(|e| e.to_string())?,
            handle: row.get(3).map_err(|e| e.to_string())?,
            length_seconds: row.get(4).map_err(|e| e.to_string())?,
            transcript: row.get(5).map_err(|e| e.to_string())?,
            summary: row.get(6).map_err(|e| e.to_string())?,
            view_count: row.get(7).map_err(|e| e.to_string())?,
            video_type: row.get(8).map_err(|e| e.to_string())?,
            published_at: row.get(9).map_err(|e| e.to_string())?,
            date_added: row.get(10).map_err(|e| e.to_string())?,
            thumbnail: format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", row.get::<_, String>(0).map_err(|e| e.to_string())?),
            status: Some("saved".to_string()),
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn update_transcript(app: tauri::AppHandle, video_id: String, new_transcript: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET transcript = ?1 WHERE video_id = ?2",
        params![new_transcript, video_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn update_summary(app: tauri::AppHandle, video_id: String, new_summary: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE videos SET summary = ?1 WHERE video_id = ?2",
        params![new_summary, video_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_venice_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'venice_api_key'")
        .map_err(|e| e.to_string())?;
    
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(row.get(0).map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}

#[tauri::command]
async fn set_venice_api_key(app: tauri::AppHandle, api_key: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('venice_api_key', ?1)",
        params![api_key],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_display_settings(app: tauri::AppHandle) -> Result<DisplaySettings, String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let get = |key: &str, default: &str| -> String {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?").unwrap();
        stmt.query_row(params![key], |row| row.get::<_, String>(0)).unwrap_or_else(|_| default.to_string())
    };

    Ok(DisplaySettings {
        resolution: get("resolution", "1440x900"),
        fullscreen: get("fullscreen", "false") == "true",
        theme: get("theme", "dark"),
        video_list_mode: get("video_list_mode", "grid"),
    })
}

#[tauri::command]
async fn set_display_settings(app: tauri::AppHandle, settings: DisplaySettings) -> Result<(), String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let set = |key: &str, value: &str| -> Result<(), String> {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        ).map_err(|e| e.to_string())?;
        Ok(())
    };

    set("resolution", &settings.resolution)?;
    set("fullscreen", if settings.fullscreen { "true" } else { "false" })?;
    set("theme", &settings.theme)?;
    set("video_list_mode", &settings.video_list_mode)?;

    Ok(())
}

#[allow(dead_code)]
#[tauri::command]
fn fetch_saved_settings(app: tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let settings_iter = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).map_err(|e| e.to_string())?;

    let mut settings = Vec::new();
    for s in settings_iter {
        settings.push(s.map_err(|e| e.to_string())?);
    }
    Ok(settings)
}

#[tauri::command]
async fn generate_image(app: tauri::AppHandle, prompt: String) -> Result<String, String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let api_key = {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'venice_api_key'")
            .map_err(|e| e.to_string())?;
        
        let api_key: String = stmt.query_row([], |row| row.get(0))
            .map_err(|_| "Venice API key not found in Kinesis database".to_string())?;
        api_key
    };

    venice::generate_image(&api_key, &prompt).await
}

#[derive(Debug, Serialize, Deserialize)]
struct PixabayHit {
    pub id: i64,
    #[serde(rename = "largeImageURL")]
    pub large_image_url: String,
    #[serde(rename = "webformatURL")]
    pub webformat_url: String,
    #[serde(rename = "imageWidth")]
    pub image_width: i64,
    #[serde(rename = "imageHeight")]
    pub image_height: i64,
    pub tags: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct PixabayResponse {
    pub total: i64,
    #[serde(rename = "totalHits")]
    pub total_hits: i64,
    pub hits: Vec<PixabayHit>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PixabayImage {
    pub id: i64,
    pub url: String,
    pub thumbnail: String,
    pub width: i64,
    pub height: i64,
    pub tags: String,
}

#[tauri::command]
async fn set_pixabay_api_key(app: tauri::AppHandle, api_key: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('pixabay_api_key', ?1)",
        params![api_key],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_pixabay_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'pixabay_api_key'")
        .map_err(|e| e.to_string())?;
    
    match stmt.query_row([], |row| row.get::<_, String>(0)) {
        Ok(key) => Ok(Some(key)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
async fn fetch_image_as_data_uri(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch image: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Failed to fetch image: {}", response.status()));
    }
    
    let bytes = response.bytes()
        .await
        .map_err(|e| format!("Failed to read image: {}", e))?;
    
    let mime = guess_mime(&bytes);
    let base64 = base64_encode(&bytes);
    
    Ok(format!("data:{};base64,{}", mime, base64))
}

fn guess_mime(bytes: &[u8]) -> &str {
    if bytes.len() >= 3 {
        if bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
            return "image/jpeg";
        }
        if bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47 {
            return "image/png";
        }
        if bytes[0] == 0x47 && bytes[1] == 0x49 && bytes[2] == 0x46 {
            return "image/gif";
        }
        if bytes[0] == 0x57 && bytes[1] == 0x45 && bytes[2] == 0x42 && bytes[3] == 0x50 {
            return "image/webp";
        }
    }
    "image/jpeg"
}

fn base64_encode(bytes: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;
        
        result.push(CHARS[b0 >> 2] as char);
        result.push(CHARS[((b0 & 0x03) << 4) | (b1 >> 4)] as char);
        
        if chunk.len() > 1 {
            result.push(CHARS[((b1 & 0x0F) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }
        
        if chunk.len() > 2 {
            result.push(CHARS[b2 & 0x3F] as char);
        } else {
            result.push('=');
        }
    }
    
    result
}

#[tauri::command]
async fn upload_to_imgur(image_url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    println!("[Imgur] Uploading image, URL starts with: {}", &image_url[..30.min(image_url.len())]);
    
    let base64_data = if image_url.starts_with("data:") {
        image_url.split(',').nth(1).ok_or("Invalid data URL format")?.to_string()
    } else {
        let response = client.get(&image_url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch image: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Failed to fetch image: {}", response.status()));
        }
        
        let bytes = response.bytes()
            .await
            .map_err(|e| format!("Failed to read image: {}", e))?;
        
        base64_encode(&bytes)
    };
    
    println!("[Imgur] Base64 data length: {}", base64_data.len());
    
    let imgur_client_id = "546c25a59c58ad7";
    
    let upload_response = client.post("https://api.imgur.com/3/image")
        .header("Authorization", format!("Client-ID {}", imgur_client_id))
        .form(&[("image", &base64_data), ("type", &"base64".to_string())])
        .send()
        .await
        .map_err(|e| format!("Imgur upload failed: {}", e))?;
    
    if !upload_response.status().is_success() {
        let status = upload_response.status();
        let error_text = upload_response.text().await.unwrap_or_default();
        println!("[Imgur] Upload failed: {} - {}", status, error_text);
        return Err(format!("Imgur upload failed: {} - {}", status, error_text));
    }
    
    let response_text = upload_response.text().await.unwrap_or_default();
    println!("[Imgur] Response: {}", &response_text[..response_text.len().min(500)]);
    
    #[derive(Deserialize)]
    struct ImgurResponse {
        data: ImgurData,
    }
    
    #[derive(Deserialize)]
    struct ImgurData {
        link: String,
    }
    
    let result: ImgurResponse = serde_json::from_str(&response_text)
        .map_err(|e| format!("Failed to parse Imgur response: {}", e))?;
    
    Ok(result.data.link)
}

#[tauri::command]
async fn search_pixabay(app: tauri::AppHandle, query: String) -> Result<Vec<PixabayImage>, String> {
    let db_path = get_db_path(&app);
    ensure_db_exists(&db_path)?;

    let api_key = {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'pixabay_api_key'")
            .map_err(|e| e.to_string())?;
        
        match stmt.query_row([], |row| row.get::<_, String>(0)) {
            Ok(key) => key,
            Err(_) => return Err("Pixabay API key not set. Please add your API key below.".to_string()),
        }
    };

    let url = format!(
        "https://pixabay.com/api/?key={}&q={}&image_type=photo&per_page=20&safesearch=true",
        api_key,
        urlencoding::encode(&query)
    );
    
    let client = reqwest::Client::new();
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Pixabay API error: {}", response.status()));
    }
    
    let pixabay_response: PixabayResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse: {}", e))?;
    
    let images: Vec<PixabayImage> = pixabay_response.hits.into_iter()
        .map(|hit| PixabayImage {
            id: hit.id,
            url: hit.large_image_url,
            thumbnail: hit.webformat_url,
            width: hit.image_width,
            height: hit.image_height,
            tags: hit.tags,
        })
        .collect();
    
    Ok(images)
}

#[tauri::command]
fn get_app_info() -> serde_json::Value {
    serde_json::json!({ "name": "Photosynthesis", "version": "0.1.0" })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_all_videos,
            get_video_by_id,
            update_transcript,
            update_summary,
            get_venice_api_key,
            set_venice_api_key,
            generate_image,
            set_pixabay_api_key,
            get_pixabay_api_key,
            search_pixabay,
            fetch_image_as_data_uri,
            get_app_info,
            get_display_settings,
            set_display_settings,
            upload_to_imgur,
        ])
        .manage(DbPathState(Mutex::new(None)))
        .setup(|app| {
            let db_path = get_db_path(app.handle());
            println!("Using database: {}", db_path);

            let resolution = rust_get_setting(&db_path, "resolution").unwrap_or_else(|| "1440x900".to_string());
            let fullscreen = rust_get_setting(&db_path, "fullscreen").map(|s| s == "true").unwrap_or(false);

            if let Some(window) = app.get_webview_window("main") {
                let parts: Vec<&str> = resolution.split('x').collect();
                if parts.len() == 2 {
                    if let (Ok(w), Ok(h)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(w, h)));
                    }
                }
                let _ = window.set_fullscreen(fullscreen);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}