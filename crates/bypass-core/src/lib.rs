use wasm_bindgen::prelude::*;

const REC709_R: f32 = 0.2126;
const REC709_G: f32 = 0.7152;
const REC709_B: f32 = 0.0722;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct BypassOptions {
    intensity: f32,
    threshold: f32,
    softness: f32,
    headroom: f32,
    color_protection: f32,
}

#[wasm_bindgen]
impl BypassOptions {
    #[wasm_bindgen(constructor)]
    pub fn new(
        intensity: f32,
        threshold: f32,
        softness: f32,
        headroom: f32,
        color_protection: f32,
    ) -> Self {
        Self {
            intensity,
            threshold,
            softness,
            headroom,
            color_protection,
        }
    }
}

#[wasm_bindgen]
pub struct GainMapOutput {
    width: u32,
    height: u32,
    gain_width: u32,
    gain_height: u32,
    base_rgba: Vec<u8>,
    gain_map_luma: Vec<u8>,
    gain_preview_rgba: Vec<u8>,
    hdr_preview_rgba: Vec<u8>,
    mean_gain: f32,
    active_pixels: u32,
}

#[wasm_bindgen]
impl GainMapOutput {
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    #[wasm_bindgen(getter)]
    pub fn gain_width(&self) -> u32 {
        self.gain_width
    }

    #[wasm_bindgen(getter)]
    pub fn gain_height(&self) -> u32 {
        self.gain_height
    }

    #[wasm_bindgen(getter)]
    pub fn mean_gain(&self) -> f32 {
        self.mean_gain
    }

    #[wasm_bindgen(getter)]
    pub fn active_pixels(&self) -> u32 {
        self.active_pixels
    }

    pub fn base_rgba(&self) -> Vec<u8> {
        self.base_rgba.clone()
    }

    pub fn gain_map_luma(&self) -> Vec<u8> {
        self.gain_map_luma.clone()
    }

    pub fn gain_preview_rgba(&self) -> Vec<u8> {
        self.gain_preview_rgba.clone()
    }

    pub fn hdr_preview_rgba(&self) -> Vec<u8> {
        self.hdr_preview_rgba.clone()
    }
}

#[wasm_bindgen]
pub fn generate_gain_map(rgba: &[u8], width: u32, height: u32, options: BypassOptions) -> Result<GainMapOutput, JsValue> {
    let pixels = width as usize * height as usize;
    if rgba.len() != pixels * 4 {
        return Err(JsValue::from_str("RGBA input length does not match width and height."));
    }

    let mut full_gain = vec![0.0f32; pixels];
    let mut hdr_preview = vec![0u8; pixels * 4];
    let mut gain_preview = vec![0u8; pixels * 4];
    let mut active_pixels = 0u32;
    let mut gain_sum = 0.0f32;

    let intensity = clamp(options.intensity, 0.0, 1.0);
    let threshold = clamp(options.threshold, 0.02, 0.98);
    let softness = clamp(options.softness, 0.01, 0.8);
    let headroom = clamp(options.headroom, 1.05, 8.0);
    let color_protection = clamp(options.color_protection, 0.0, 1.0);

    for pixel in 0..pixels {
        let i = pixel * 4;
        let r = srgb_to_linear(rgba[i]);
        let g = srgb_to_linear(rgba[i + 1]);
        let b = srgb_to_linear(rgba[i + 2]);
        let luma = REC709_R * r + REC709_G * g + REC709_B * b;
        let highlight = smoothstep(threshold - softness * 0.5, threshold + softness * 0.5, luma);
        let saturation = saturation_proxy(r, g, b, luma);
        let chroma_guard = 1.0 - color_protection * clamp(saturation * 0.85, 0.0, 1.0);
        let gain = clamp(highlight * intensity * chroma_guard, 0.0, 1.0);
        let boost = 1.0 + gain * (headroom - 1.0);
        full_gain[pixel] = gain;
        gain_sum += gain;
        if gain > 0.01 {
            active_pixels += 1;
        }

        hdr_preview[i] = linear_to_srgb_byte(r * boost);
        hdr_preview[i + 1] = linear_to_srgb_byte(g * boost);
        hdr_preview[i + 2] = linear_to_srgb_byte(b * boost);
        hdr_preview[i + 3] = rgba[i + 3];

        let encoded_gain = rec709_encode_byte(gain);
        gain_preview[i] = encoded_gain;
        gain_preview[i + 1] = encoded_gain;
        gain_preview[i + 2] = encoded_gain;
        gain_preview[i + 3] = 255;
    }

    let gain_width = (width / 4).max(1);
    let gain_height = (height / 4).max(1);
    let gain_map = downsample_gain_map(&full_gain, width as usize, height as usize, gain_width as usize, gain_height as usize);

    Ok(GainMapOutput {
        width,
        height,
        gain_width,
        gain_height,
        base_rgba: rgba.to_vec(),
        gain_map_luma: gain_map,
        gain_preview_rgba: gain_preview,
        hdr_preview_rgba: hdr_preview,
        mean_gain: gain_sum / pixels.max(1) as f32,
        active_pixels,
    })
}

fn downsample_gain_map(source: &[f32], width: usize, height: usize, gain_width: usize, gain_height: usize) -> Vec<u8> {
    let mut data = vec![0u8; gain_width * gain_height];
    for y in 0..gain_height {
        for x in 0..gain_width {
            let mut sum = 0.0f32;
            let mut samples = 0.0f32;
            for oy in 0..4 {
                for ox in 0..4 {
                    let sx = x * 4 + ox;
                    let sy = y * 4 + oy;
                    if sx < width && sy < height {
                        sum += source[sy * width + sx];
                        samples += 1.0;
                    }
                }
            }
            data[y * gain_width + x] = rec709_encode_byte(sum / samples.max(1.0));
        }
    }
    data
}

fn clamp(value: f32, min: f32, max: f32) -> f32 {
    value.max(min).min(max)
}

fn smoothstep(edge0: f32, edge1: f32, value: f32) -> f32 {
    let t = clamp((value - edge0) / (edge1 - edge0).max(1e-6), 0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

fn srgb_to_linear(value: u8) -> f32 {
    let v = value as f32 / 255.0;
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

fn linear_to_srgb_byte(value: f32) -> u8 {
    let v = clamp(value, 0.0, 1.0);
    let encoded = if v <= 0.003_130_8 {
        12.92 * v
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    };
    (clamp(encoded, 0.0, 1.0) * 255.0).round() as u8
}

fn rec709_encode_byte(value: f32) -> u8 {
    let v = clamp(value, 0.0, 1.0);
    let encoded = if v < 0.018 {
        4.5 * v
    } else {
        1.099 * v.powf(0.45) - 0.099
    };
    (clamp(encoded, 0.0, 1.0) * 255.0).round() as u8
}

fn saturation_proxy(r: f32, g: f32, b: f32, luma: f32) -> f32 {
    let max_channel = r.max(g).max(b);
    let min_channel = r.min(g).min(b);
    if luma <= 1e-6 {
        0.0
    } else {
        (max_channel - min_channel) / max_channel.max(1e-6)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bright_pixels_generate_more_gain() {
        let options = BypassOptions::new(0.72, 0.62, 0.24, 3.0, 0.45);
        let dark = vec![64u8; 8 * 8 * 4];
        let bright = vec![252u8; 8 * 8 * 4];
        let dark_map = generate_gain_map(&dark, 8, 8, options).unwrap();
        let bright_map = generate_gain_map(&bright, 8, 8, options).unwrap();
        assert!(bright_map.mean_gain() > dark_map.mean_gain());
    }
}
