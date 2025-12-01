use base64::{engine::general_purpose, Engine as _};
use rand::Rng;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct CTokenGenerator {
    ticket_collection_t: u64,
    time_offset: i64,
    stay_time: u64,
    touch_event: u32,
    visibility_change: u32,
    page_unload: u32,
    timer: u32,
    time_difference: u32,
    scroll_x: u32,
    scroll_y: u32,
    inner_width: u32,
    inner_height: u32,
    outer_width: u32,
    outer_height: u32,
    screen_x: u32,
    screen_y: u32,
    screen_width: u32,
    screen_height: u32,
    screen_avail_width: u32,
}

impl CTokenGenerator {
    pub fn new(ticket_collection_t: u64, time_offset: i64, stay_time: u64) -> Self {
        Self {
            ticket_collection_t,
            time_offset,
            stay_time,
            touch_event: 0,
            visibility_change: 0,
            page_unload: 0,
            timer: 0,
            time_difference: 0,
            scroll_x: 0,
            scroll_y: 0,
            inner_width: 0,
            inner_height: 0,
            outer_width: 0,
            outer_height: 0,
            screen_x: 0,
            screen_y: 0,
            screen_width: 0,
            screen_height: 0,
            screen_avail_width: 0,
        }
    }

    pub fn generate_ctoken(&mut self, is_create_v2: bool) -> String {
        let mut rng = rand::thread_rng();
        self.touch_event = 255;
        self.visibility_change = 2;
        self.inner_width = 255;
        self.inner_height = 255;
        self.outer_width = 255;
        self.outer_height = 255;
        self.screen_width = 255;
        self.screen_height = rng.gen_range(1000..3000);
        self.screen_avail_width = rng.gen_range(1..100);

        if is_create_v2 {
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
            self.time_difference = (now + self.time_offset - self.ticket_collection_t as i64) as u32;
            self.timer = (self.time_difference as u64 + self.stay_time) as u32;
            self.page_unload = 25;
        } else {
            self.time_difference = 0;
            self.timer = self.stay_time as u32;
            self.touch_event = rng.gen_range(3..10);
        }

        self.encode()
    }

    fn encode(&self) -> String {
        let mut buffer = vec![0u8; 16];
        let mut current_idx = 0;

        let data_mapping = [
            (0, self.touch_event, 1),
            (1, self.scroll_x, 1),
            (2, self.visibility_change, 1),
            (3, self.scroll_y, 1),
            (4, self.inner_width, 1),
            (5, self.page_unload, 1),
            (6, self.inner_height, 1),
            (7, self.outer_width, 1),
            (8, self.timer, 2),
            (10, self.time_difference, 2),
            (12, self.outer_height, 1),
            (13, self.screen_x, 1),
            (14, self.screen_y, 1),
            (15, self.screen_width, 1),
        ];

        while current_idx < 16 {
            let mut found = false;
            for (idx, val, len) in data_mapping.iter() {
                if *idx == current_idx {
                    if *len == 1 {
                        let value = if *val > 0 { (*val).min(255) } else { *val };
                        buffer[current_idx] = (value & 0xFF) as u8;
                        current_idx += 1;
                    } else if *len == 2 {
                        let value = if *val > 0 { (*val).min(65535) } else { *val };
                        buffer[current_idx] = ((value >> 8) & 0xFF) as u8;
                        buffer[current_idx + 1] = (value & 0xFF) as u8;
                        current_idx += 2;
                    }
                    found = true;
                    break;
                }
            }
            
            if !found {
                let condition_value = if (4 & self.screen_height) != 0 { self.scroll_y } else { self.screen_avail_width };
                buffer[current_idx] = (condition_value & 0xFF) as u8;
                current_idx += 1;
            }
        }

        let mut uint8_data = Vec::new();
        for b in buffer {
            uint8_data.push(b);
            uint8_data.push(0);
        }
        
        general_purpose::STANDARD.encode(&uint8_data)
    }
}
