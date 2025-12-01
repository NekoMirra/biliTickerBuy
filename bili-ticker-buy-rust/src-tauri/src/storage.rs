use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use anyhow::Result;

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
    if Path::new("accounts.json").exists() {
        let content = fs::read_to_string("accounts.json")?;
        let accounts: Vec<Account> = serde_json::from_str(&content).unwrap_or_default();
        Ok(accounts)
    } else {
        Ok(vec![])
    }
}

pub fn save_accounts(accounts: &Vec<Account>) -> Result<()> {
    let json = serde_json::to_string_pretty(accounts)?;
    fs::write("accounts.json", json)?;
    Ok(())
}

pub fn get_history() -> Result<Vec<HistoryItem>> {
    if Path::new("history.json").exists() {
        let content = fs::read_to_string("history.json")?;
        let history: Vec<HistoryItem> = serde_json::from_str(&content).unwrap_or_default();
        Ok(history)
    } else {
        Ok(vec![])
    }
}

pub fn add_history_item(item: HistoryItem) -> Result<()> {
    let mut history = get_history()?;
    history.insert(0, item);
    let json = serde_json::to_string_pretty(&history)?;
    fs::write("history.json", json)?;
    Ok(())
}

pub fn clear_history() -> Result<()> {
    fs::write("history.json", "[]")?;
    Ok(())
}

pub fn get_project_history() -> Result<Vec<ProjectConfig>> {
    if Path::new("project_history.json").exists() {
        let content = fs::read_to_string("project_history.json")?;
        let history: Vec<ProjectConfig> = serde_json::from_str(&content).unwrap_or_default();
        Ok(history)
    } else {
        Ok(vec![])
    }
}

pub fn add_project_history(item: ProjectConfig) -> Result<()> {
    let mut history = get_project_history()?;
    
    if item.sku_id.is_empty() {
        // Adding a generic project (viewed but not configured)
        // Remove any existing generic entry for THIS project
        history.retain(|p| !(p.project_id == item.project_id && p.sku_id.is_empty()));
        
        // Check if there are any specific entries for this project
        let has_specific = history.iter().any(|p| p.project_id == item.project_id && !p.sku_id.is_empty());
        
        // If no specific entries, insert this generic one at the top
        if !has_specific {
            history.insert(0, item);
        }
    } else {
        // Adding a specific configuration
        // Remove exactly this config if it exists
        history.retain(|p| p.sku_id != item.sku_id);
        
        // Remove any generic entry for this project (since we now have a specific one)
        history.retain(|p| !(p.project_id == item.project_id && p.sku_id.is_empty()));
        
        history.insert(0, item);
    }

    // Limit history size
    if history.len() > 100 {
        history.truncate(100);
    }

    let json = serde_json::to_string_pretty(&history)?;
    fs::write("project_history.json", json)?;
    Ok(())
}

pub fn remove_project_history_item(project_id: String, sku_id: String) -> Result<()> {
    let mut history = get_project_history()?;
    history.retain(|p| !(p.project_id == project_id && p.sku_id == sku_id));
    let json = serde_json::to_string_pretty(&history)?;
    fs::write("project_history.json", json)?;
    Ok(())
}
