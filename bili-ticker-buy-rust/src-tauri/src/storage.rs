use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use anyhow::{Result, Context};

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

pub fn get_accounts(base_dir: &Path) -> Result<Vec<Account>> {
    let path = base_dir.join("accounts.json");
    if path.exists() {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read accounts file: {:?}", path))?;
        let accounts: Vec<Account> = serde_json::from_str(&content).unwrap_or_default();
        Ok(accounts)
    } else {
        Ok(vec![])
    }
}

pub fn save_accounts(base_dir: &Path, accounts: &Vec<Account>) -> Result<()> {
    let path = base_dir.join("accounts.json");
    let json = serde_json::to_string_pretty(accounts)?;
    fs::write(&path, json)
        .with_context(|| format!("Failed to save accounts file: {:?}", path))?;
    Ok(())
}

pub fn get_history(base_dir: &Path) -> Result<Vec<HistoryItem>> {
    let path = base_dir.join("history.json");
    if path.exists() {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read history file: {:?}", path))?;
        let history: Vec<HistoryItem> = serde_json::from_str(&content).unwrap_or_default();
        Ok(history)
    } else {
        Ok(vec![])
    }
}

pub fn add_history_item(base_dir: &Path, item: HistoryItem) -> Result<()> {
    let mut history = get_history(base_dir)?;
    history.insert(0, item);
    let path = base_dir.join("history.json");
    let json = serde_json::to_string_pretty(&history)?;
    fs::write(&path, json)
        .with_context(|| format!("Failed to save history file: {:?}", path))?;
    Ok(())
}

pub fn clear_history(base_dir: &Path) -> Result<()> {
    let path = base_dir.join("history.json");
    fs::write(&path, "[]")
        .with_context(|| format!("Failed to clear history file: {:?}", path))?;
    Ok(())
}

pub fn get_project_history(base_dir: &Path) -> Result<Vec<ProjectConfig>> {
    let path = base_dir.join("project_history.json");
    if path.exists() {
        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read project history file: {:?}", path))?;
        let history: Vec<ProjectConfig> = serde_json::from_str(&content).unwrap_or_default();
        Ok(history)
    } else {
        Ok(vec![])
    }
}

pub fn add_project_history(base_dir: &Path, item: ProjectConfig) -> Result<()> {
    let mut history = get_project_history(base_dir)?;
    
    if item.sku_id.is_empty() {
        // If adding a generic project entry (no SKU), remove any existing generic entry for same project
        history.retain(|p| !(p.project_id == item.project_id && p.sku_id.is_empty()));
        // Don't add if a specific SKU entry exists? Or just add it? 
        // Logic from original code seemed to be: "If we have a specific one, maybe don't need generic one?"
        // Retaining logic:
        let has_specific = history.iter().any(|p| p.project_id == item.project_id && !p.sku_id.is_empty());
        if !has_specific {
            history.insert(0, item);
        }
    } else {
        // If adding specific SKU
        history.retain(|p| p.sku_id != item.sku_id);
        // Also remove generic entry for this project if exists?
        history.retain(|p| !(p.project_id == item.project_id && p.sku_id.is_empty()));
        history.insert(0, item);
    }

    if history.len() > 100 {
        history.truncate(100);
    }

    let path = base_dir.join("project_history.json");
    let json = serde_json::to_string_pretty(&history)?;
    fs::write(&path, json)
        .with_context(|| format!("Failed to save project history file: {:?}", path))?;
    Ok(())
}

pub fn remove_project_history_item(base_dir: &Path, project_id: String, sku_id: String) -> Result<()> {
    let mut history = get_project_history(base_dir)?;
    history.retain(|p| !(p.project_id == project_id && p.sku_id == sku_id));
    let path = base_dir.join("project_history.json");
    let json = serde_json::to_string_pretty(&history)?;
    fs::write(&path, json)
        .with_context(|| format!("Failed to save project history file: {:?}", path))?;
    Ok(())
}

pub fn save_cookies(base_dir: &Path, cookies: String) -> Result<()> {
    let path = base_dir.join("cookies.json");
    fs::write(&path, cookies)
        .with_context(|| format!("Failed to save cookies file: {:?}", path))?;
    Ok(())
}

pub fn load_cookies(base_dir: &Path) -> Result<String> {
    let path = base_dir.join("cookies.json");
    if path.exists() {
        Ok(fs::read_to_string(&path)?)
    } else {
        Ok("".to_string())
    }
}
