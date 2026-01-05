use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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

pub fn get_accounts() -> Result<Vec<Account>> {
    let path = get_storage_path("accounts.json");
    if path.exists() {
        let content = fs::read_to_string(path)?;
        let accounts: Vec<Account> = serde_json::from_str(&content).unwrap_or_default();
        Ok(accounts)
    } else {
        Ok(vec![])
    }
}

pub fn save_accounts(accounts: &Vec<Account>) -> Result<()> {
    let path = get_storage_path("accounts.json");
    let json = serde_json::to_string_pretty(accounts)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn get_history() -> Result<Vec<HistoryItem>> {
    let path = get_storage_path("history.json");
    if path.exists() {
        let content = fs::read_to_string(path)?;
        let history: Vec<HistoryItem> = serde_json::from_str(&content).unwrap_or_default();
        Ok(history)
    } else {
        Ok(vec![])
    }
}

pub fn add_history_item(item: HistoryItem) -> Result<()> {
    let path = get_storage_path("history.json");
    let mut history = get_history()?;
    history.insert(0, item);
    let json = serde_json::to_string_pretty(&history)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn clear_history() -> Result<()> {
    let path = get_storage_path("history.json");
    fs::write(path, "[]")?;
    Ok(())
}

pub fn get_project_history() -> Result<Vec<ProjectConfig>> {
    let path = get_storage_path("project_history.json");
    if path.exists() {
        let content = fs::read_to_string(path)?;
        let history: Vec<ProjectConfig> = serde_json::from_str(&content).unwrap_or_default();
        Ok(history)
    } else {
        Ok(vec![])
    }
}

pub fn add_project_history(item: ProjectConfig) -> Result<()> {
    let path = get_storage_path("project_history.json");
    let mut history = get_project_history()?;
    
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

    let json = serde_json::to_string_pretty(&history)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn remove_project_history_item(project_id: String, sku_id: String) -> Result<()> {
    let path = get_storage_path("project_history.json");
    let mut history = get_project_history()?;
    history.retain(|p| !(p.project_id == project_id && p.sku_id == sku_id));
    let json = serde_json::to_string_pretty(&history)?;
    fs::write(path, json)?;
    Ok(())
}
