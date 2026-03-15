use tauri::Window;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use reqwest::{Client, Url};
use reqwest::cookie::Jar;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use crate::util::CTokenGenerator;
use crate::storage::{self, HistoryItem};
use crate::api; // Import api module
use anyhow::Result;
use log::info;
use serde_json::json;
use chrono::Local;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TicketInfo {
    pub project_id: String,
    pub project_name: Option<String>,
    pub screen_id: String,
    pub sku_id: String,
    pub count: u32,
    pub buyer_info: serde_json::Value,
    pub deliver_info: serde_json::Value,
    pub cookies: Vec<String>, 
    pub is_hot_project: Option<bool>,
    pub pay_money: Option<u32>,
    pub contact_name: Option<String>,
    pub contact_tel: Option<String>,
}

#[derive(Clone, Serialize)]
struct LogPayload {
    task_id: String,
    message: String,
}

#[derive(Clone, Serialize)]
struct PaymentPayload {
    task_id: String,
    url: String,
}

#[derive(Clone, Serialize)]
struct TaskResultPayload {
    task_id: String,
    success: bool,
    message: String,
}

fn emit_log(window: &Window, task_id: &str, message: &str) {
    let _ = window.emit("log", LogPayload { 
        task_id: task_id.to_string(), 
        message: message.to_string() 
    });
    info!("[{}] {}", task_id, message);
}

pub async fn start_buy_task(
    window: Window, 
    task_id: String,
    stop_flag: Arc<AtomicBool>,
    mut info: TicketInfo, 
    interval: u64, 
    mode: u32, 
    total_attempts: u32,
    time_start: Option<String>,
    proxy: Option<String>,
    time_offset: Option<f64>,
    ntp_server: Option<String>,
    base_dir: std::path::PathBuf
) -> Result<()> {
    emit_log(&window, &task_id, "Starting buy task...");
    
    if let Some(ts) = &time_start {
        emit_log(&window, &task_id, &format!("Scheduled start time: {}", ts));
        
        // Parse start time
        // Try different formats
        let target_time = if let Ok(t) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S") {
            Some(t.and_local_timezone(Local).unwrap())
        } else if let Ok(t) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S") {
            Some(t.and_local_timezone(Local).unwrap())
        } else {
            None
        };

        if let Some(target) = target_time {
            let initial_offset = time_offset.unwrap_or(0.0) as i64;
            let current_offset = Arc::new(AtomicI64::new(initial_offset));
            let offset_clone = current_offset.clone();
            let stop_flag_clone = stop_flag.clone();
            let ntp_server_clone = ntp_server.clone();
            let task_id_clone = task_id.clone();
            let window_clone = window.clone(); // Tauri windows are cheap to clone (handle)

            // Spawn background sync task
            tokio::spawn(async move {
                let sync_interval = Duration::from_secs(10);
                loop {
                    if stop_flag_clone.load(Ordering::Relaxed) { break; }
                    sleep(sync_interval).await;
                    
                    let url = ntp_server_clone.clone().unwrap_or_else(|| "https://api.bilibili.com/x/report/click/now".to_string());
                    let sync_result = if url.starts_with("http") {
                        api::get_server_time(Some(url.clone())).await
                    } else {
                        api::get_ntp_time(&url).map(|t| t as i64)
                    };

                    match sync_result {
                        Ok(server_time) => {
                            let local_time = api::get_local_time();
                            let new_offset = server_time - local_time;
                            offset_clone.store(new_offset, Ordering::Relaxed);
                            // Log occasionally or just debug? Keeping it quiet to avoid log spam, or use debug!
                        },
                        Err(e) => {
                             emit_log(&window_clone, &task_id_clone, &format!("Background sync failed: {}", e));
                        }
                    }
                }
            });
            
            emit_log(&window, &task_id, &format!("Waiting until: {} (Initial Offset: {}ms)", target.format("%Y-%m-%d %H:%M:%S%.3f"), initial_offset));

            loop {
                if stop_flag.load(Ordering::Relaxed) {
                    emit_log(&window, &task_id, "Task stopped by user while waiting.");
                    return Ok(());
                }

                let now = Local::now();
                let offset_val = current_offset.load(Ordering::Relaxed);
                let target_with_offset = target - chrono::Duration::milliseconds(offset_val);
                
                let diff = target_with_offset - now;
                let remaining_ms = diff.num_milliseconds();
                
                if remaining_ms <= 0 {
                    break;
                }

                // Adaptive sleep strategy for high precision
                if remaining_ms > 5000 {
                    sleep(Duration::from_secs(1)).await;
                } else if remaining_ms > 1000 {
                    sleep(Duration::from_millis(100)).await;
                } else if remaining_ms > 50 {
                    sleep(Duration::from_millis(10)).await;
                } else {
                    // Spin wait for the last 50ms for maximum precision
                    std::hint::spin_loop();
                }
            }
            emit_log(&window, &task_id, "Time reached! Starting execution...");
        } else {
             emit_log(&window, &task_id, "Invalid time format. Starting immediately.");
        }
    }

    if let Some(p) = &proxy {
        emit_log(&window, &task_id, &format!("Using proxy: {}", p));
    }
    if let Some(to) = time_offset {
        emit_log(&window, &task_id, &format!("Time offset: {}ms", to));
    }

    let jar = Arc::new(Jar::default());
    let url = "https://show.bilibili.com".parse::<Url>().unwrap();
    
    // Parse cookies
    for cookie_str in &info.cookies {
        for part in cookie_str.split(';') {
             jar.add_cookie_str(part.trim(), &url);
        }
    }

    let client = Client::builder()
        .cookie_provider(jar)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0")
        .timeout(Duration::from_secs(10))
        .build()?;

    let is_hot = info.is_hot_project.unwrap_or(false);
    let mut ctoken_gen = CTokenGenerator::new(
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs(),
        0,
        rand::random::<u64>() % 8000 + 2000
    );

    let mut token_payload = json!({
        "count": info.count,
        "screen_id": info.screen_id,
        "order_type": 1,
        "project_id": info.project_id,
        "sku_id": info.sku_id,
        "token": "",
        "newRisk": true,
    });

    let mut left_time = total_attempts as i32;
    let mut is_running = true;

    // Generate static device ID for this task
    let device_id = format!("{:x}", md5::compute(format!("{}{}", task_id, rand::random::<u64>())));

    while is_running {
        if stop_flag.load(Ordering::Relaxed) {
            emit_log(&window, &task_id, "Task stopped by user.");
            break;
        }

        emit_log(&window, &task_id, "1) Preparing order...");
        
        if is_hot {
            token_payload["token"] = json!(ctoken_gen.generate_ctoken(false));
        }

        let prepare_url = format!("https://show.bilibili.com/api/ticket/order/prepare?project_id={}", info.project_id);
        let res = client.post(&prepare_url)
            .json(&token_payload)
            .send()
            .await?;
        
        let res_json: serde_json::Value = res.json().await?;
        emit_log(&window, &task_id, &format!("Prepare result: {:?}", res_json));

        if res_json["errno"].as_i64().unwrap_or(-1) != 0 && res_json["code"].as_i64().unwrap_or(-1) != 0 {
             emit_log(&window, &task_id, &format!("Prepare failed: {:?}", res_json));
             sleep(Duration::from_millis(interval)).await;
             continue;
        }

        let token = res_json["data"]["token"].as_str().unwrap_or("").to_string();
        let ptoken = res_json["data"]["ptoken"].as_str().unwrap_or("").to_string();
        
        emit_log(&window, &task_id, "2) Creating order...");
        
        // Prepare create payload
        let now_ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_millis() as u64;
        let click_origin = now_ms - rand::random::<u64>() % 2000 - 1000; // 1-3 seconds ago

        let mut create_payload = json!({
            "project_id": info.project_id,
            "screen_id": info.screen_id,
            "sku_id": info.sku_id,
            "count": info.count,
            "order_type": 1,
            "buyer_info": info.buyer_info.to_string(),
            "deliver_info": info.deliver_info.to_string(),
            "token": token,
            "again": 1,
            "timestamp": now_ms,
            "deviceId": device_id,
            "requestSource": "neul-next",
            "newRisk": true,
            "clickPosition": {
                "x": rand::random::<u64>() % 500 + 100,
                "y": rand::random::<u64>() % 1000 + 500,
                "origin": click_origin,
                "now": now_ms
            }
        });

        if let Some(pay_money) = info.pay_money {
            create_payload["pay_money"] = json!(pay_money);
        }

        // Add contact info
        if let Some(name) = &info.contact_name {
             create_payload["contact_name"] = json!(name);
             create_payload["buyer"] = json!(name);
        }
        if let Some(tel) = &info.contact_tel {
             if !tel.contains('*') {
                 create_payload["contact_tel"] = json!(tel);
                 create_payload["tel"] = json!(tel);
             }
        }

        // Debug log for payload details
        emit_log(&window, &task_id, &format!("Payload - Count: {}, Buyers: {}", create_payload["count"], create_payload["buyer_info"]));
        emit_log(&window, &task_id, &format!("Contact Info - Name: {:?}, Tel: {:?}", create_payload.get("contact_name"), create_payload.get("contact_tel")));

        let mut success = false;
        
        // Use user-provided total_attempts, default to 60 if 0 passed accidentally
        let max_attempts = if total_attempts > 0 { total_attempts } else { 60 };

        for attempt in 1..=max_attempts {
            if !is_running { break; }
            if stop_flag.load(Ordering::Relaxed) {
                emit_log(&window, &task_id, "Task stopped by user.");
                is_running = false;
                break;
            }
            
            let mut create_url = format!("https://show.bilibili.com/api/ticket/order/createV2?project_id={}", info.project_id);
            
            if is_hot {
                create_payload["ctoken"] = json!(ctoken_gen.generate_ctoken(true));
                create_payload["ptoken"] = json!(ptoken);
                create_payload["orderCreateUrl"] = json!("https://show.bilibili.com/api/ticket/order/createV2");
                create_url.push_str(&format!("&ptoken={}", ptoken));
            }

            let start = Instant::now();
            let res = client.post(&create_url)
                .json(&create_payload)
                .send()
                .await;

            match res {
                Ok(r) => {
                    let r_json: serde_json::Value = r.json().await.unwrap_or(json!({}));
                    let errno = r_json["errno"].as_i64().or(r_json["code"].as_i64()).unwrap_or(-1);
                    
                    emit_log(&window, &task_id, &format!("[Attempt {}/60] Code: {} | Msg: {}", attempt, errno, r_json["msg"]));

                    if errno == 0 || errno == 100048 || errno == 100079 {
                        emit_log(&window, &task_id, "Order created successfully!");
                        success = true;
                        
                        if errno == 0 {
                             let order_id = if let Some(s) = r_json["data"]["orderId"].as_str() {
                                 s.to_string()
                             } else if let Some(n) = r_json["data"]["orderId"].as_i64() {
                                 n.to_string()
                             } else {
                                 "".to_string()
                             };

                             emit_log(&window, &task_id, &format!("Order ID: {}", order_id));
                             
                             if !order_id.is_empty() {
                                 let mut pay_url_str = "".to_string();
                                 let pay_url_api = format!("https://show.bilibili.com/api/ticket/order/getPayParam?order_id={}", order_id);
                                 
                                 if let Ok(pay_res) = client.get(&pay_url_api).send().await {
                                     if let Ok(pay_json) = pay_res.json::<serde_json::Value>().await {
                                         if let Some(code_url) = pay_json["data"]["code_url"].as_str() {
                                             pay_url_str = code_url.to_string();
                                             let _ = window.emit("payment_qrcode", PaymentPayload {
                                                 task_id: task_id.clone(),
                                                 url: code_url.to_string()
                                             });
                                         } else {
                                             emit_log(&window, &task_id, &format!("Failed to get payment URL: {:?}", pay_json));
                                         }
                                     }
                                 }

                                 // Save to history regardless of payment URL
                                 let history_item = HistoryItem {
                                     order_id: order_id.to_string(),
                                     project_name: info.project_name.clone().unwrap_or(info.project_id.clone()),
                                     price: info.pay_money.unwrap_or(0),
                                     time: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                                     pay_url: pay_url_str,
                                 };
                                 let _ = storage::add_history_item(&base_dir, history_item);
                             } else {
                                 emit_log(&window, &task_id, &format!("Failed to extract Order ID from: {:?}", r_json));
                             }
                        }
                        
                        let _ = window.emit("task_result", TaskResultPayload {
                            task_id: task_id.clone(),
                            success: true,
                            message: format!("抢票成功！订单号: {}", r_json["data"]["orderId"])
                        });
                        break;
                    }

                    if errno == 100034 {
                        // Price changed
                        if let Some(new_price) = r_json["data"]["pay_money"].as_u64() {
                            emit_log(&window, &task_id, &format!("Price updated to: {}", new_price));
                            info.pay_money = Some(new_price as u32);
                            create_payload["pay_money"] = json!(new_price);
                        }
                    }
                    
                    if errno == 100051 {
                        // Token expired
                        break;
                    }
                },
                Err(e) => {
                    emit_log(&window, &task_id, &format!("[Attempt {}/{}] Request error: {}", attempt, max_attempts, e));
                }
            }

            // Precise sleep
            let elapsed = start.elapsed();
            let interval_duration = Duration::from_millis(interval);
            if elapsed < interval_duration {
                let remaining = interval_duration - elapsed;
                if remaining.as_secs_f64() > 0.02 {
                    sleep(remaining - Duration::from_millis(10)).await;
                }
                while start.elapsed() < interval_duration {
                    std::hint::spin_loop();
                }
            }
        }

        if success {
            is_running = false;
        } else {
            emit_log(&window, &task_id, "Retry attempts exhausted or token expired. Restarting loop...");
            if mode == 1 {
                left_time -= 1;
                if left_time <= 0 {
                    is_running = false;
                    emit_log(&window, &task_id, "Total attempts reached. Stopping.");
                    let _ = window.emit("task_result", TaskResultPayload {
                        task_id: task_id.clone(),
                        success: false,
                        message: "达到最大尝试次数，任务停止".to_string()
                    });
                }
            }
        }
    }

    Ok(())
}
