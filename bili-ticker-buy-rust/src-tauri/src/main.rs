#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod auth;
mod buy;
mod config;
mod util;
mod api;
mod storage;

// use tauri::Manager;
use buy::TicketInfo;
use storage::{Account, HistoryItem, ProjectConfig};

use std::fs;
use std::path::Path;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use uuid::Uuid;

struct AppState {
    tasks: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_cookies(cookies: String) -> Result<(), String> {
    fs::write("cookies.json", cookies).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_cookies() -> Result<String, String> {
    if Path::new("cookies.json").exists() {
        fs::read_to_string("cookies.json").map_err(|e| e.to_string())
    } else {
        Ok("".to_string())
    }
}

#[tauri::command]
fn get_accounts() -> Result<Vec<Account>, String> {
    storage::get_accounts().map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_account(cookies: Vec<String>) -> Result<Account, String> {
    // Fetch user info to get uid, name, face
    let res = api::fetch_user_info(cookies.clone()).await.map_err(|e| e.to_string())?;
    
    if res["code"].as_i64().unwrap_or(-1) != 0 {
        return Err("Invalid cookies".to_string());
    }

    let data = &res["data"];
    
    let level = data["level_info"]["current_level"].as_i64().unwrap_or(0) as i32;
    let is_vip = data["vipStatus"].as_i64().unwrap_or(0) == 1;
    let coins = data["money"].as_f64().unwrap_or(0.0);

    let account = Account {
        uid: data["mid"].to_string(),
        name: data["uname"].as_str().unwrap_or("").to_string(),
        face: data["face"].as_str().unwrap_or("").to_string(),
        cookies,
        level,
        is_vip,
        coins,
    };

    // Load existing accounts
    let mut accounts = storage::get_accounts().map_err(|e| e.to_string())?;
    
    // Remove existing if same uid
    accounts.retain(|a| a.uid != account.uid);
    accounts.push(account.clone());

    // Save
    storage::save_accounts(&accounts).map_err(|e| e.to_string())?;

    Ok(account)
}

#[tauri::command]
fn remove_account(uid: String) -> Result<(), String> {
    let mut accounts = storage::get_accounts().map_err(|e| e.to_string())?;
    accounts.retain(|a| a.uid != uid);
    storage::save_accounts(&accounts).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_history() -> Result<Vec<HistoryItem>, String> {
    storage::get_history().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_history(item: HistoryItem) -> Result<(), String> {
    storage::add_history_item(item).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_history() -> Result<(), String> {
    storage::clear_history().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_project_history() -> Result<Vec<ProjectConfig>, String> {
    storage::get_project_history().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_project_history(item: ProjectConfig) -> Result<(), String> {
    storage::add_project_history(item).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_project_history(project_id: String, sku_id: String) -> Result<(), String> {
    storage::remove_project_history_item(project_id, sku_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_user_info(cookies: Vec<String>) -> Result<serde_json::Value, String> {
    api::fetch_user_info(cookies).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn get_login_qrcode() -> Result<(String, String), String> {
    auth::generate_qrcode().map_err(|e| e.to_string())
}

#[tauri::command]
async fn poll_login_status(qrcode_key: String) -> Result<String, String> {
    let key = qrcode_key.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        auth::poll_login(&key)
    }).await.map_err(|e| e.to_string())?;
    
    res.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_project(id: String) -> Result<serde_json::Value, String> {
    api::fetch_project_info(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_buyer_list(project_id: String, cookies: Vec<String>) -> Result<serde_json::Value, String> {
    api::fetch_buyers(project_id, cookies).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_address_list(cookies: Vec<String>) -> Result<serde_json::Value, String> {
    api::fetch_address_list(cookies).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_time(server_url: Option<String>) -> Result<serde_json::Value, String> {
    let url = server_url.unwrap_or_else(|| "https://api.bilibili.com/x/report/click/now".to_string());
    
    let server_time = if url.starts_with("http") {
        api::get_server_time(Some(url)).await.map_err(|e| e.to_string())?
    } else {
        api::get_ntp_time(&url).map_err(|e| e.to_string())? as i64
    };

    let local_time = api::get_local_time();
    let diff = server_time - local_time;
    
    Ok(serde_json::json!({
        "diff": diff,
        "server": server_time,
        "local": local_time
    }))
}

#[tauri::command]
async fn start_buy(
    state: tauri::State<'_, AppState>,
    window: tauri::Window, 
    ticket_info: String, 
    interval: u64, 
    mode: u32, 
    total_attempts: u32,
    time_start: Option<String>,
    proxy: Option<String>,
    time_offset: Option<f64>,
    buyers: Option<Vec<serde_json::Value>>,
    ntp_server: Option<String>
) -> Result<String, String> {
    // Filter out empty time_start
    let time_start = time_start.filter(|s| !s.trim().is_empty());

    let mut info: TicketInfo = serde_json::from_str(&ticket_info).map_err(|e| e.to_string())?;
    
    // If buyers are provided from UI, override the one in ticket_info
    if let Some(b) = buyers {
        if !b.is_empty() {
            info.buyer_info = serde_json::Value::Array(b.clone());

            // Ensure contact info is present and not empty
            let contact_name_missing = info.contact_name.as_ref().map(|s| s.is_empty()).unwrap_or(true);
            let contact_tel_missing = info.contact_tel.as_ref().map(|s| s.is_empty()).unwrap_or(true);

            if contact_name_missing || contact_tel_missing {
                 if let Some(first) = b.first() {
                     if contact_name_missing {
                         if let Some(name) = first["name"].as_str() {
                             if !name.is_empty() {
                                 info.contact_name = Some(name.to_string());
                             }
                         }
                     }
                     if contact_tel_missing {
                         // Try different fields for phone
                         let tel = first["tel"].as_str()
                             .or(first["mobile"].as_str())
                             .or(first["phone"].as_str());
                         
                         if let Some(t) = tel {
                             if !t.is_empty() && !t.contains('*') {
                                 info.contact_tel = Some(t.to_string());
                             }
                         }
                     }
                 }
            }
        }
    }

    let task_id = Uuid::new_v4().to_string();
    let stop_flag = Arc::new(AtomicBool::new(false));
    
    state.tasks.lock().unwrap().insert(task_id.clone(), stop_flag.clone());

    let task_id_clone = task_id.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = buy::start_buy_task(window, task_id_clone, stop_flag, info, interval, mode, total_attempts, time_start, proxy, time_offset, ntp_server).await {
            println!("Buy task error: {}", e);
        }
    });
    
    Ok(task_id)
}

#[tauri::command]
async fn open_bilibili_home(app: tauri::AppHandle, cookies: Vec<String>) -> Result<(), String> {
    let cookie_script = cookies.iter().map(|c| {
        // Extract key=value from Set-Cookie string (which might contain attributes like HttpOnly)
        let key_val = c.split(';').next().unwrap_or("").trim();
        if !key_val.is_empty() {
            format!("document.cookie = '{} ; domain=.bilibili.com; path=/';", key_val.replace("'", "\\'"))
        } else {
            String::new()
        }
    }).collect::<Vec<_>>().join("\n");
    
    let init_script = format!(
        "
        (function() {{
            // Force links to open in current window (fix target='_blank')
            document.addEventListener('click', (e) => {{
                const target = e.target.closest('a');
                if (target && target.target === '_blank') {{
                    target.target = '_self';
                }}
            }}, true);

            // Override window.open to keep navigation in same window
            window.open = function(url) {{
                if (url) window.location.href = url;
                return window;
            }};

            if (window.location.hostname.includes('bilibili.com')) {{
                // Inject cookies
                {}
                
                // If we are on the login page, redirect to home after a short delay
                if (window.location.pathname.includes('/login')) {{
                    setTimeout(() => {{
                        window.location.href = 'https://www.bilibili.com';
                    }}, 500);
                }}
            }}
        }})();
        ",
        cookie_script
    );

    let label = format!("bili_home_{}", Uuid::new_v4());
    
    // Start at passport login to ensure we are on the correct domain for cookie setting
    tauri::WindowBuilder::new(&app, label, tauri::WindowUrl::External("https://passport.bilibili.com/login".parse().unwrap()))
        .title("Bilibili - 正在跳转...")
        .initialization_script(&init_script)
        .inner_size(1280.0, 800.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn export_cookie(uid: String, path: String) -> Result<(), String> {
    let accounts = storage::get_accounts().map_err(|e| e.to_string())?;
    let account = accounts.iter().find(|a| a.uid == uid).ok_or("Account not found")?;

    let mut cookie_items = Vec::new();
    for c in &account.cookies {
        // c is like "name=value; ..."
        let parts: Vec<&str> = c.split(';').collect();
        if let Some(first) = parts.first() {
            if let Some((name, value)) = first.split_once('=') {
                cookie_items.push(serde_json::json!({
                    "name": name.trim(),
                    "value": value.trim()
                }));
            }
        }
    }

    let json_data = serde_json::json!({
        "_default": {
            "1": {
                "key": "cookie",
                "value": cookie_items
            }
        }
    });

    let content = serde_json::to_string_pretty(&json_data).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn import_cookie(path: String) -> Result<(), String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let items = json["_default"]["1"]["value"].as_array().ok_or("Invalid format: missing _default.1.value")?;
    
    let mut cookies = Vec::new();
    for item in items {
        let name = item["name"].as_str().unwrap_or("");
        let value = item["value"].as_str().unwrap_or("");
        if !name.is_empty() {
            cookies.push(format!("{}={}", name, value));
        }
    }

    if cookies.is_empty() {
        return Err("No cookies found in file".to_string());
    }

    add_account(cookies).await.map(|_| ())
}

#[tauri::command]
fn stop_task(state: tauri::State<'_, AppState>, task_id: String) -> Result<(), String> {
    if let Some(flag) = state.tasks.lock().unwrap().get(&task_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            tasks: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_login_qrcode, 
            poll_login_status, 
            start_buy,
            stop_task,
            fetch_project,
            fetch_buyer_list,
            fetch_address_list,
            sync_time,
            save_cookies,
            load_cookies,
            get_user_info,
            get_accounts,
            add_account,
            remove_account,
            get_history,
            add_history,
            clear_history,
            get_project_history,
            add_project_history,
            remove_project_history,
            open_bilibili_home,
            export_cookie,
            import_cookie
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
