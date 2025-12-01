use reqwest::Client;
use serde_json::Value;
use anyhow::{Result, anyhow};
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use std::net::UdpSocket;
use sntpc;

pub async fn fetch_project_info(id: String) -> Result<Value> {
    let client = Client::new();
    let url = format!("https://show.bilibili.com/api/ticket/project/getV2?version=134&id={}&project_id={}", id, id);
    
    let mut res: Value = client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .send()
        .await?
        .json()
        .await?;

    // Check for linked goods (场贩/周边)
    let link_url = format!("https://show.bilibili.com/api/ticket/linkgoods/list?project_id={}&page_type=0", id);
    // We don't want to fail the whole request if linkgoods fails, so we wrap in a block
    let link_res_result = client.get(&link_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .send()
        .await;

    if let Ok(link_resp) = link_res_result {
        if let Ok(link_res) = link_resp.json::<Value>().await {
             if let Some(list) = link_res["data"]["list"].as_array() {
                if !list.is_empty() {
                    // Ensure screen_list exists in original response
                    if res["data"]["screen_list"].as_array().is_none() {
                         if let Some(data) = res["data"].as_object_mut() {
                             data.insert("screen_list".to_string(), serde_json::json!([]));
                         }
                    }
        
                    for item in list {
                        // Handle id as string or number
                        let link_id_opt = item["id"].as_str().map(|s| s.to_string())
                            .or_else(|| item["id"].as_i64().map(|i| i.to_string()));

                        if let Some(link_id) = link_id_opt {
                             let detail_url = format!("https://show.bilibili.com/api/ticket/linkgoods/detail?link_id={}", link_id);
                             if let Ok(detail_resp) = client.get(&detail_url)
                                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
                                .send()
                                .await 
                             {
                                if let Ok(detail_res) = detail_resp.json::<Value>().await {
                                    if let Some(specs) = detail_res["data"]["specs_list"].as_array() {
                                        if let Some(screen_list) = res["data"]["screen_list"].as_array_mut() {
                                            for spec in specs {
                                                let mut spec_obj = spec.clone();
                                                // Inject project_id and link_id as Python code does
                                                if let Some(obj) = spec_obj.as_object_mut() {
                                                    obj.insert("project_id".to_string(), detail_res["data"]["item_id"].clone());
                                                    obj.insert("link_id".to_string(), serde_json::json!(link_id));
                                                }
                                                screen_list.push(spec_obj);
                                            }
                                        }
                                    }
                                }
                             }
                        }
                    }
                }
            }
        }
    }

    // Apply express_fee logic (Match Python TicketService.py)
    if let Some(data) = res["data"].as_object_mut() {
        let has_eticket = data.get("has_eticket").and_then(|v| v.as_bool()).unwrap_or(false);
        
        if let Some(screen_list) = data.get_mut("screen_list").and_then(|v| v.as_array_mut()) {
            for screen in screen_list {
                let mut express_fee = 0;
                if !has_eticket {
                    if let Some(fee) = screen.get("express_fee").and_then(|v| v.as_i64()) {
                        if fee >= 0 {
                            express_fee = fee;
                        }
                    }
                }
                
                if let Some(ticket_list) = screen.get_mut("ticket_list").and_then(|v| v.as_array_mut()) {
                    for ticket in ticket_list {
                        if let Some(price) = ticket.get("price").and_then(|v| v.as_i64()) {
                            ticket["price"] = serde_json::json!(price + express_fee);
                        }
                    }
                }
            }
        }
    }

    Ok(res)
}

pub async fn fetch_buyers(project_id: String, cookies: Vec<String>) -> Result<Value> {
    let client = Client::new();
    let url = format!("https://show.bilibili.com/api/ticket/buyer/list?is_default&projectId={}", project_id);
    
    let mut req = client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");

    // Add cookies
    let cookie_str = cookies.join("; ");
    req = req.header("Cookie", cookie_str);

    let res: Value = req.send().await?.json().await?;
    Ok(res)
}

pub async fn fetch_user_info(cookies: Vec<String>) -> Result<Value> {
    let client = Client::new();
    let url = "https://api.bilibili.com/x/web-interface/nav";
    
    let mut req = client.get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");

    let cookie_str = cookies.join("; ");
    req = req.header("Cookie", cookie_str);

    let res: Value = req.send().await?.json().await?;
    Ok(res)
}

pub async fn fetch_address_list(cookies: Vec<String>) -> Result<Value> {
    let client = Client::new();
    let url = "https://show.bilibili.com/api/ticket/addr/list";
    
    let mut req = client.get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36");

    let cookie_str = cookies.join("; ");
    req = req.header("Cookie", cookie_str);

    let res: Value = req.send().await?.json().await?;
    Ok(res)
}

pub async fn get_server_time(url_opt: Option<String>) -> Result<i64> {
    let client = Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| anyhow!("Failed to build client: {}", e))?;

    // Default to Bilibili if no URL provided
    let url = url_opt.unwrap_or_else(|| "https://api.bilibili.com/x/report/click/now".to_string());
    
    let res: Value = client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
        .send()
        .await?
        .json()
        .await?;
    
    // 1. Bilibili Format: {"data": {"now": 169...}} (Seconds)
    if let Some(now) = res["data"]["now"].as_i64() {
        return Ok(now * 1000);
    }

    // 2. Taobao Format: {"data": {"t": "169..."}} (Millis String)
    if let Some(t_str) = res["data"]["t"].as_str() {
        if let Ok(t) = t_str.parse::<i64>() {
            return Ok(t);
        }
    }

    // 3. JD Format: {"serverTime": 169...} (Millis)
    if let Some(t) = res["serverTime"].as_i64() {
        return Ok(t);
    }

    // 4. Pinduoduo/Other: {"server_time": 169...} (Seconds or Millis?)
    // Let's assume generic "time" or "timestamp" fields if found
    if let Some(t) = res["time"].as_i64() {
        // Guess if seconds or millis based on magnitude
        // 2023 is ~1.7e9 seconds, ~1.7e12 millis
        if t > 100_000_000_000 {
            return Ok(t);
        } else {
            return Ok(t * 1000);
        }
    }

    Err(anyhow!("Failed to parse server time from response"))
}

pub fn get_local_time() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

pub fn get_ntp_time(server: &str) -> Result<u64> {
    let address = if server.contains(':') {
        server.to_string()
    } else {
        format!("{}:123", server)
    };

    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| anyhow!("UDP Bind Error: {:?}", e))?;
    socket.set_read_timeout(Some(Duration::from_secs(2))).map_err(|e| anyhow!("UDP Timeout Error: {:?}", e))?;

    let result = sntpc::simple_get_time(&address, &socket).map_err(|e| anyhow!("NTP Error: {:?}", e))?;
    
    // sntpc 0.3.5: sec() is a method.
    // Note: We are ignoring nanoseconds for now as we are unsure of the API method name in 0.3.5.
    // TODO: Add nanoseconds precision.
    Ok(result.sec() as u64 * 1000)
}
