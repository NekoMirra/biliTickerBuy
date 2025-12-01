use reqwest::blocking::Client;
use serde_json::Value;
use std::thread;
use std::time::Duration;
use anyhow::{Result, anyhow};

pub fn generate_qrcode() -> Result<(String, String)> {
    let client = Client::new();
    let url = "https://passport.bilibili.com/x/passport-login/web/qrcode/generate";
    let res: Value = client.get(url)
        .header("User-Agent", "Mozilla/5.0")
        .send()?
        .json()?;

    if res["code"].as_i64().unwrap_or(-1) == 0 {
        let url = res["data"]["url"].as_str().unwrap().to_string();
        let qrcode_key = res["data"]["qrcode_key"].as_str().unwrap().to_string();
        Ok((url, qrcode_key))
    } else {
        Err(anyhow!("Failed to generate QR code"))
    }
}

pub fn poll_login(qrcode_key: &str) -> Result<String> {
    let client = Client::new();
    let url = "https://passport.bilibili.com/x/passport-login/web/qrcode/poll";
    
    for _ in 0..120 {
        let resp = client.get(url)
            .query(&[("qrcode_key", qrcode_key)])
            .header("User-Agent", "Mozilla/5.0")
            .send()?;

        let headers = resp.headers().clone();
        let res_json: Value = resp.json()?;

        if let Some(code) = res_json["data"]["code"].as_i64() {
            if code == 0 {
                // Extract cookies
                let mut cookie_strings = Vec::new();
                for (k, v) in headers.iter() {
                    if k == "set-cookie" {
                        if let Ok(val) = v.to_str() {
                            cookie_strings.push(val.to_string());
                        }
                    }
                }
                // Return cookies as a JSON string or just joined
                // For simplicity, let's return the raw Set-Cookie strings joined by "; " 
                // But actually, we might want to return them as a list to be cleaner.
                // Let's return a JSON string of the cookie list.
                return Ok(serde_json::to_string(&cookie_strings)?);
            } else if code == 86101 || code == 86090 {
                thread::sleep(Duration::from_millis(1000));
                continue;
            } else {
                return Err(anyhow!("Login failed: {}", res_json["data"]["message"]));
            }
        }
        thread::sleep(Duration::from_millis(1000));
    }
    Err(anyhow!("Login timeout"))
}
