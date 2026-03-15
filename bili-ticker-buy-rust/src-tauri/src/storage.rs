use serde::{Deserialize, Serialize};
use std::fs;
<<<<<<< HEAD
use std::path::{Path, PathBuf};
=======
use std::path::PathBuf;
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
use anyhow::Result;
use tauri::api::path::app_config_dir;
use tauri::Config;

// 获取通用的存储路径
fn get_storage_path(file_name: &str) -> PathBuf {
    // 这里的 Config::default() 对应 tauri.conf.json 的配置
    // macOS 下通常指向 ~/Library/Application Support/com.nekomirra.bilitickerbuy/
    let mut path = app_config_dir(&Config::default()).unwrap_or_else(|| PathBuf::from("."));
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path.push(file_name);
    path
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub uid: String,
    pub name: String,
    pub face: String,
    pub cookies: Vec<String>,
    #[serde(default)]
    pub level: i32,
    #[serde(default)]
    pub is_vip: bool,
    #[serde(default)]
    pub coins: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HistoryItem {
    pub order_id: String,
    pub project_name: String,
    pub price: u32,
    pub time: String,
    pub pay_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectConfig {
    pub project_id: String,
    pub project_name: String,
    pub screen_id: String,
    pub screen_name: String,
    pub sku_id: String,
    pub sku_name: String,
    pub price: u32,
}

<<<<<<< HEAD
pub fn get_accounts(base_dir: &Path) -> Result<Vec<Account>> {
    let path = base_dir.join("accounts.json");
=======
pub fn get_accounts() -> Result<Vec<Account>> {
    let path = get_storage_path("accounts.json");
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
    if path.exists() {
        let content = fs::read_to_string(path)?;
        let accounts: Vec<Account> = serde_json::from_str(&content).unwrap_or_default();
        Ok(accounts)
    } else {
        Ok(vec![])
    }
}

<<<<<<< HEAD
pub fn save_accounts(base_dir: &Path, accounts: &Vec<Account>) -> Result<()> {
    let path = base_dir.join("accounts.json");
=======
pub fn save_accounts(accounts: &Vec<Account>) -> Result<()> {
    let path = get_storage_path("accounts.json");
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
    let json = serde_json::to_string_pretty(accounts)?;
    fs::write(path, json)?;
    Ok(())
}

<<<<<<< HEAD
pub fn get_history(base_dir: &Path) -> Result<Vec<HistoryItem>> {
    let path = base_dir.join("history.json");
=======
pub fn get_history() -> Result<Vec<HistoryItem>> {
    let path = get_storage_path("history.json");
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
    if path.exists() {
        let content = fs::read_to_string(path)?;
        let history: Vec<HistoryItem> = serde_json::from_str(&content).unwrap_or_default();
        Ok(history)
    } else {
        Ok(vec![])
    }
}

<<<<<<< HEAD
pub fn add_history_item(base_dir: &Path, item: HistoryItem) -> Result<()> {
    let mut history = get_history(base_dir)?;
=======
pub fn add_history_item(item: HistoryItem) -> Result<()> {
    let path = get_storage_path("history.json");
    let mut history = get_history()?;
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
    history.insert(0, item);
    let path = base_dir.join("history.json");
    let json = serde_json::to_string_pretty(&history)?;
    fs::write(path, json)?;
    Ok(())
}

<<<<<<< HEAD
pub fn clear_history(base_dir: &Path) -> Result<()> {
    let path = base_dir.join("history.json");
=======
pub fn clear_history() -> Result<()> {
    let path = get_storage_path("history.json");
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
    fs::write(path, "[]")?;
    Ok(())
}

<<<<<<< HEAD
pub fn get_project_history(base_dir: &Path) -> Result<Vec<ProjectConfig>> {
    let path = base_dir.join("project_history.json");
=======
pub fn get_project_history() -> Result<Vec<ProjectConfig>> {
    let path = get_storage_path("project_history.json");
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
    if path.exists() {
        let content = fs::read_to_string(path)?;
        let history: Vec<ProjectConfig> = serde_json::from_str(&content).unwrap_or_default();
        Ok(history)
    } else {
        Ok(vec![])
    }
}

<<<<<<< HEAD
pub fn add_project_history(base_dir: &Path, item: ProjectConfig) -> Result<()> {
    let mut history = get_project_history(base_dir)?;
=======
pub fn add_project_history(item: ProjectConfig) -> Result<()> {
    let path = get_storage_path("project_history.json");
    let mut history = get_project_history()?;
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
    
    // ... logic remains same ...
    if item.sku_id.is_empty() {
        history.retain(|p| !(p.project_id == item.project_id && p.sku_id.is_empty()));
        let has_specific = history.iter().any(|p| p.project_id == item.project_id && !p.sku_id.is_empty());
        if !has_specific {
            history.insert(0, item);
        }
    } else {
        history.retain(|p| p.sku_id != item.sku_id);
        history.retain(|p| !(p.project_id == item.project_id && p.sku_id.is_empty()));
        history.insert(0, item);
    }

    if history.len() > 100 {
        history.truncate(100);
    }

    let path = base_dir.join("project_history.json");
    let json = serde_json::to_string_pretty(&history)?;
    fs::write(path, json)?;
    Ok(())
}

<<<<<<< HEAD
pub fn remove_project_history_item(base_dir: &Path, project_id: String, sku_id: String) -> Result<()> {
    let mut history = get_project_history(base_dir)?;
=======
pub fn remove_project_history_item(project_id: String, sku_id: String) -> Result<()> {
    let path = get_storage_path("project_history.json");
    let mut history = get_project_history()?;
>>>>>>> da0fb0a8800e9bc5ab4e3dcd333adcfc64bc5213
    history.retain(|p| !(p.project_id == project_id && p.sku_id == sku_id));
    let path = base_dir.join("project_history.json");
    let json = serde_json::to_string_pretty(&history)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn save_cookies(base_dir: &Path, cookies: String) -> Result<()> {
    let path = base_dir.join("cookies.json");
    fs::write(path, cookies)?;
    Ok(())
}

pub fn load_cookies(base_dir: &Path) -> Result<String> {
    let path = base_dir.join("cookies.json");
    if path.exists() {
        Ok(fs::read_to_string(path)?)
    } else {
        Ok("".to_string())
    }
}
