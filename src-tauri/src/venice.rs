use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct VeniceImageRequest {
    pub model: String,
    pub prompt: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub steps: Option<i32>,
    pub seed: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cfg_scale: Option<f32>,
    pub resolution: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hide_watermark: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safe_mode: Option<bool>,
    pub return_binary: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct VeniceImageResponse {
    pub id: Option<String>,
    pub images: Option<Vec<String>>,
    pub data: Option<Vec<VeniceImageData>>,
}

#[derive(Debug, Deserialize)]
pub struct VeniceImageData {
    pub url: Option<String>,
    #[serde(rename = "b64_json")]
    pub b64_json: Option<String>,
}

pub async fn generate_image(api_key: &str, prompt: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    const MAX_PROMPT_LENGTH: usize = 1500;
    let truncated_prompt = if prompt.len() > MAX_PROMPT_LENGTH {
        &prompt[..MAX_PROMPT_LENGTH]
    } else {
        prompt
    };
    
    println!("[Venice] Generating image with model nano-banana-pro, prompt length: {}", truncated_prompt.len());
    
    let request_body = VeniceImageRequest {
        model: "nano-banana-pro".to_string(),
        prompt: truncated_prompt.to_string(),
        width: Some(1024),
        height: Some(1024),
        steps: Some(25),
        seed: Some(0),
        cfg_scale: Some(7.5),
        resolution: Some("1K".to_string()),
        hide_watermark: Some(true),
        safe_mode: Some(false),
        return_binary: Some(false),
        format: Some("png".to_string()),
    };
    
    let response = client
        .post("https://api.venice.ai/api/v1/image/generate")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| format!("Venice API request failed: {}", e))?;

    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    println!("[Venice] Response status: {}, body: {}", status, error_text);

    if !status.is_success() {
        return Err(format!("Venice API error: {} - {}", status, error_text));
    }

    let result: VeniceImageResponse = serde_json::from_str(&error_text)
        .map_err(|e| format!("Failed to parse Venice image response: {}", e))?;

    // Try new format first (images array)
    if let Some(images) = result.images {
        if let Some(base64_image) = images.into_iter().next() {
            return Ok(format!("data:image/png;base64,{}", base64_image));
        }
    }

    // Try OpenAI-compatible format (data array with b64_json)
    if let Some(data) = result.data {
        if let Some(first) = data.into_iter().next() {
            if let Some(b64) = first.b64_json {
                return Ok(format!("data:image/png;base64,{}", b64));
            }
            if let Some(url) = first.url {
                return Ok(url);
            }
        }
    }

    Err("No image generated".to_string())
}