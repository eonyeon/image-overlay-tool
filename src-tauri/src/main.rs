#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use image::{DynamicImage, GenericImageView, ImageFormat, Rgba, RgbImage, Rgb};
use imageproc::drawing::{draw_filled_rect_mut, draw_text_mut};
use imageproc::rect::Rect;
use rusttype::{Font, Scale};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::Path;
use tauri::command;
use base64::{Engine as _, engine::general_purpose};

#[derive(Serialize, Deserialize)]
struct ProcessResult {
    success: bool,
    error: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct ImageDimensions {
    width: u32,
    height: u32,
}

#[command]
fn process_image(
    image_path: String,
    output_path: String,
    text: String,
    font_size: f32,
    position_x: f32,
    position_y: f32,
) -> ProcessResult {
    // 먼저 이미지 파일이 손상되었는지 확인
    match image::open(&image_path) {
        Ok(_) => {
            // 이미지가 정상이면 처리 진행
            match process_image_internal(&image_path, &output_path, &text, font_size, position_x, position_y) {
                Ok(_) => ProcessResult {
                    success: true,
                    error: None,
                },
                Err(e) => ProcessResult {
                    success: false,
                    error: Some(e),
                },
            }
        },
        Err(e) => {
            let error_msg = format!("{}", e);
            if error_msg.contains("invalid JPEG") || error_msg.contains("SOI marker") {
                // 손상된 JPEG 파일은 건너뛰기
                eprintln!("주의: 손상된 JPEG 파일 건너뛰기: {}", image_path);
                ProcessResult {
                    success: false,
                    error: Some(format!("손상된 JPEG 파일로 건너뛰었습니다: {}", image_path)),
                }
            } else {
                ProcessResult {
                    success: false,
                    error: Some(format!("이미지 로드 실패: {}", e)),
                }
            }
        }
    }
}

fn process_image_internal(
    image_path: &str,
    output_path: &str,
    text: &str,
    font_size: f32,
    position_x: f32,
    position_y: f32,
) -> Result<(), String> {
    // 입력 값 검증
    if text.is_empty() {
        return Err("텍스트가 비어있습니다.".to_string());
    }
    
    if font_size <= 0.0 || font_size > 200.0 {
        return Err("폰트 크기가 유효하지 않습니다.".to_string());
    }
    
    if position_x < 0.0 || position_y < 0.0 {
        return Err("위치 좌표가 유효하지 않습니다.".to_string());
    }

    // 이미지 로드 (에러 처리 개선)
    let img = match image::open(image_path) {
        Ok(img) => img,
        Err(e) => {
            let error_msg = format!("{}", e);
            if error_msg.contains("invalid JPEG") || error_msg.contains("SOI marker") {
                return Err(format!("손상된 JPEG 파일입니다: {}", image_path));
            } else {
                return Err(format!("이미지 로드 실패: {}", e));
            }
        }
    };
    
    let format = get_image_format(image_path)?;
    
    // 이미지에 텍스트 추가 (경량화된 버전 사용)
    let result = add_text_to_image_simple(img, text, font_size, position_x, position_y)?;
    
    // 출력 파일 경로 생성
    let input_filename = Path::new(image_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "파일명을 가져올 수 없습니다.".to_string())?;
    
    let output_file_path = Path::new(output_path).join(input_filename);
    
    // 출력 디렉토리가 존재하는지 확인
    if let Some(parent) = output_file_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("출력 디렉토리 생성 실패: {}", e))?;
        }
    }
    
    // 결과 저장 (품질 설정 개선)
    match format {
        ImageFormat::Jpeg => {
            let mut output = std::fs::File::create(&output_file_path)
                .map_err(|e| format!("파일 생성 실패: {}", e))?;
            
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 90); // 95% -> 90%로 경량화
            encoder.encode_image(&result)
                .map_err(|e| format!("JPEG 인코딩 실패: {}", e))?;
        },
        _ => {
            result
                .save_with_format(&output_file_path, format)
                .map_err(|e| format!("이미지 저장 실패: {}", e))?;
        }
    }
    
    Ok(())
}

#[command]
fn get_image_files(folder_path: String) -> Result<Vec<String>, String> {
    let paths = fs::read_dir(&folder_path).map_err(|e| format!("폴더 읽기 실패: {}", e))?;
    
    let mut image_paths = Vec::new();
    
    for path in paths {
        let path = path.map_err(|e| format!("경로 읽기 실패: {}", e))?.path();
        
        // 파일인지 확인
        if !path.is_file() {
            continue;
        }
        
        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        
        if matches!(extension.to_lowercase().as_str(), "jpg" | "jpeg" | "png" | "bmp" | "gif" | "webp") {
            image_paths.push(path.to_string_lossy().to_string());
        }
    }
    
    Ok(image_paths)
}

#[command]
fn get_image_dimensions(image_path: String) -> Result<ImageDimensions, String> {
    // 이미지 파일 존재 확인
    if !std::path::Path::new(&image_path).exists() {
        return Err("이미지 파일이 존재하지 않습니다.".to_string());
    }
    
    // 여러 번 시도해보기
    match image::open(&image_path) {
        Ok(img) => {
            let (width, height) = img.dimensions();
            
            if width == 0 || height == 0 {
                return Err("이미지 크기가 유효하지 않습니다.".to_string());
            }
            
            Ok(ImageDimensions { width, height })
        },
        Err(e) => {
            // 구체적인 에러 메시지에 따라 처리
            let error_msg = format!("{}", e);
            
            if error_msg.contains("invalid JPEG") || error_msg.contains("SOI marker") {
                // JPEG 파일 손상 - 기본값 반환
                eprintln!("경고: JPEG 파일이 손상되었습니다: {}", image_path);
                Ok(ImageDimensions { width: 400, height: 300 }) // 기본값
            } else if error_msg.contains("Unsupported") {
                Err(format!("지원하지 않는 이미지 형식: {}", image_path))
            } else {
                Err(format!("이미지 로드 실패: {} - {}", image_path, e))
            }
        }
    }
}

#[command]
fn get_image_preview(
    image_path: String,
    text: String,
    font_size: f32,
    position_x: f32,
    position_y: f32,
) -> Result<String, String> {
    // 이미지 로드 (에러 처리 개선)
    let img = match image::open(&image_path) {
        Ok(img) => img,
        Err(e) => {
            let error_msg = format!("{}", e);
            if error_msg.contains("invalid JPEG") || error_msg.contains("SOI marker") {
                return Err(format!("손상된 JPEG 파일입니다: {}", image_path));
            } else {
                return Err(format!("이미지 로드 실패: {}", e));
            }
        }
    };
    
    // 미리보기를 위한 적당한 크기로 리사이즈 (성능 향상)
    let (original_width, original_height) = img.dimensions();
    let max_preview_size = 800; // 미리보기 최대 크기
    
    let preview_img = if original_width > max_preview_size || original_height > max_preview_size {
        let scale_factor = (max_preview_size as f32 / original_width.max(original_height) as f32).min(1.0);
        let new_width = (original_width as f32 * scale_factor) as u32;
        let new_height = (original_height as f32 * scale_factor) as u32;
        
        // 위치와 폰트 크기도 비례하여 조정
        let scaled_x = position_x * scale_factor;
        let scaled_y = position_y * scale_factor;
        let scaled_font_size = font_size * scale_factor;
        
        let resized = img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3);
        add_text_to_image(resized, &text, scaled_font_size, scaled_x, scaled_y)?
    } else {
        // 원본 크기가 충분히 작으면 그대로 사용
        add_text_to_image(img, &text, font_size, position_x, position_y)?
    };
    
    // 이미지를 base64로 인코딩 (PNG 사용으로 품질 유지)
    let mut buffer = Cursor::new(Vec::new());
    preview_img
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| format!("이미지 인코딩 실패: {}", e))?;
    
    let base64_string = general_purpose::STANDARD.encode(buffer.into_inner());
    Ok(format!("data:image/png;base64,{}", base64_string))
}

// 경량화된 미리보기 함수 (저장과 동일한 로직)
#[command]
fn get_image_preview_lightweight(
    image_path: String,
    text: String,
    font_size: f32,
    position_x: f32,
    position_y: f32,
) -> Result<String, String> {
    // 이미지 로드 (에러 처리 개선)
    let img = match image::open(&image_path) {
        Ok(img) => img,
        Err(e) => {
            let error_msg = format!("{}", e);
            if error_msg.contains("invalid JPEG") || error_msg.contains("SOI marker") {
                return Err(format!("손상된 JPEG 파일입니다: {}", image_path));
            } else {
                return Err(format!("이미지 로드 실패: {}", e));
            }
        }
    };
    
    // 저장과 동일한 로직으로 텍스트 추가
    let result = add_text_to_image_simple(img, &text, font_size, position_x, position_y)?;
    
    // 미리보기용으로만 크기 조정 (저장 로직과 분리)
    let (original_width, original_height) = result.dimensions();
    let max_preview_size = 600; // 더 작은 미리보기 크기로 성능 향상
    
    let preview_img = if original_width > max_preview_size || original_height > max_preview_size {
        let scale_factor = max_preview_size as f32 / original_width.max(original_height) as f32;
        let new_width = (original_width as f32 * scale_factor) as u32;
        let new_height = (original_height as f32 * scale_factor) as u32;
        result.resize_exact(new_width, new_height, image::imageops::FilterType::Triangle) // 더 빠른 필터
    } else {
        result
    };
    
    // 이미지를 base64로 인코딩 (JPEG로 압축하여 전송 속도 향상)
    let mut buffer = Cursor::new(Vec::new());
    preview_img
        .write_to(&mut buffer, ImageFormat::Jpeg)
        .map_err(|e| format!("이미지 인코딩 실패: {}", e))?;
    
    let base64_string = general_purpose::STANDARD.encode(buffer.into_inner());
    Ok(format!("data:image/jpeg;base64,{}", base64_string))
}

#[command]
fn get_image_thumbnail(image_path: String) -> Result<String, String> {
    // 이미지 파일 존재 확인
    if !std::path::Path::new(&image_path).exists() {
        return Err("이미지 파일이 존재하지 않습니다.".to_string());
    }
    
    match image::open(&image_path) {
        Ok(img) => {
            // 썸네일 크기로 리사이즈 (150x150) - 품질 개선
            let thumbnail = img.resize(150, 150, image::imageops::FilterType::Lanczos3);
            
            // base64로 인코딩
            let mut buffer = Cursor::new(Vec::new());
            thumbnail
                .write_to(&mut buffer, ImageFormat::Png)
                .map_err(|e| format!("인코딩 실패: {}", e))?;
            
            let base64_string = general_purpose::STANDARD.encode(buffer.into_inner());
            Ok(format!("data:image/png;base64,{}", base64_string))
        },
        Err(e) => {
            let error_msg = format!("{}", e);
            
            if error_msg.contains("invalid JPEG") || error_msg.contains("SOI marker") {
                // JPEG 파일 손상 - 대체 썸네일 생성
                eprintln!("경고: 썸네일 생성 실패 (손상된 JPEG): {}", image_path);
                create_placeholder_thumbnail()
            } else {
                Err(format!("썸네일 생성 실패: {} - {}", image_path, e))
            }
        }
    }
}

// 대체 썸네일 생성 (오류 시)
fn create_placeholder_thumbnail() -> Result<String, String> {
    
    // 150x150 회색 사각형 생성
    let mut img = RgbImage::new(150, 150);
    
    // 회색으로 채우기
    for pixel in img.pixels_mut() {
        *pixel = Rgb([200, 200, 200]);
    }
    
    // 가운데에 X 표시 그리기
    for i in 0..150 {
        // 대각선
        if i < 150 && (150 - i - 1) < 150 {
            img.put_pixel(i, i, Rgb([100, 100, 100]));
            img.put_pixel(i, 150 - i - 1, Rgb([100, 100, 100]));
        }
    }
    
    // base64로 인코딩
    let mut buffer = Cursor::new(Vec::new());
    let dynamic_img = image::DynamicImage::ImageRgb8(img);
    dynamic_img
        .write_to(&mut buffer, ImageFormat::Png)
        .map_err(|e| format!("대체 썸네일 인코딩 실패: {}", e))?;
    
    let base64_string = general_purpose::STANDARD.encode(buffer.into_inner());
    Ok(format!("data:image/png;base64,{}", base64_string))
}

fn get_image_format(path: &str) -> Result<ImageFormat, String> {
    let extension = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| "파일 확장자를 찾을 수 없습니다.".to_string())?;
    
    match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" => Ok(ImageFormat::Jpeg),
        "png" => Ok(ImageFormat::Png),
        "bmp" => Ok(ImageFormat::Bmp),
        "gif" => Ok(ImageFormat::Gif),
        "webp" => Ok(ImageFormat::WebP),
        _ => Err(format!("지원하지 않는 이미지 형식: {}", extension)),
    }
}

// 기존 텍스트 추가 함수 (성능 우선)
fn add_text_to_image(
    mut img: DynamicImage,
    text: &str,
    font_size: f32,
    position_x: f32,
    position_y: f32,
) -> Result<DynamicImage, String> {
    if text.is_empty() {
        return Err("텍스트가 비어있습니다.".to_string());
    }
    
    let (img_width, img_height) = img.dimensions();
    
    if img_width == 0 || img_height == 0 {
        return Err("이미지 크기가 유효하지 않습니다.".to_string());
    }
    
    // 안전한 폰트 크기 설정 (10px ~ 200px)
    let safe_font_size = font_size.max(10.0).min(200.0);
    
    // 텍스트 크기 추정
    let estimated_text_width = estimate_text_width(text, safe_font_size);
    let estimated_text_height = safe_font_size as u32;
    let padding = 16;
    
    // 한글의 경우 더 큰 패딩 적용
    let safe_padding = if text.chars().any(|c| matches!(c, '가'..='힣')) {
        20 // 한글이 포함된 경우 더 큰 패딩
    } else {
        padding
    };
    
    // 안전한 위치 계산 (한글 고려 경계 체크)
    let safe_x = (position_x as i32)
        .max(safe_padding)
        .min((img_width as i32).saturating_sub((estimated_text_width + safe_padding as u32) as i32));
    let safe_y = (position_y as i32)
        .max(safe_padding)
        .min((img_height as i32).saturating_sub((estimated_text_height + safe_padding as u32) as i32));
    
    // 실제 폰트 렌더링을 시도해보고, 실패하면 대체 방식 사용
    match render_text_with_font(&mut img, text, safe_font_size, safe_x, safe_y) {
        Ok(_) => Ok(img),
        Err(_) => {
            // 폰트 렌더링 실패 시 대체 방식 사용
            eprintln!("경고: 폰트 렌더링 실패, 대체 방식 사용");
            render_text_alternative(&mut img, text, safe_font_size, safe_x, safe_y)?;
            Ok(img)
        }
    }
}

// 경량화된 텍스트 추가 함수 (미리보기와 저장 모두 동일한 로직)
fn add_text_to_image_simple(
    mut img: DynamicImage,
    text: &str,
    font_size: f32,
    position_x: f32,
    position_y: f32,
) -> Result<DynamicImage, String> {
    if text.is_empty() {
        return Err("텍스트가 비어있습니다.".to_string());
    }
    
    let (img_width, img_height) = img.dimensions();
    
    if img_width == 0 || img_height == 0 {
        return Err("이미지 크기가 유효하지 않습니다.".to_string());
    }
    
    // 안전한 폰트 크기 설정 (10px ~ 200px)
    let safe_font_size = font_size.max(10.0).min(200.0);
    
    // 🔧 간소화된 텍스트 크기 추정
    let estimated_text_width = estimate_text_width_precise(text, safe_font_size);
    let estimated_text_height = (safe_font_size * 1.2) as u32;
    let padding = 4; // 고정 패딩
    
    // 🔧 간단한 위치 사용: JavaScript에서 이미 계산된 절대 좌표 사용
    let safe_x = (position_x as i32).max(padding).min((img_width as i32) - (estimated_text_width as i32) - padding);
    let safe_y = (position_y as i32).max(padding).min((img_height as i32) - (estimated_text_height as i32) - padding);
    
    // 깔끔한 폰트 렌더링 시도, 실패하면 깔끔한 대체 방식
    match render_text_simple(&mut img, text, safe_font_size, safe_x, safe_y) {
        Ok(_) => Ok(img),
        Err(_) => {
            eprintln!("폰트 렌더링 실패, 깔끔한 대체 방식 사용");
            render_text_alternative_simple(&mut img, text, safe_font_size, safe_x, safe_y)?;
            Ok(img)
        }
    }
}

// 한글 지원 폰트를 사용한 텍스트 렌더링
fn render_text_with_font(
    img: &mut DynamicImage,
    text: &str,
    font_size: f32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    // 개선된 한글 지원 폰트 경로
    let font_paths = vec![
        // macOS 한글 폰트 (우선순위 높음)
        "/System/Library/Fonts/Supplemental/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/AppleGothic.ttf",
        "/Library/Fonts/AppleGothic.ttf",
        
        // macOS 기본 한글 지원 폰트
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/ArialUnicodeMS.ttf",
        "/System/Library/Fonts/PingFang.ttc",
        
        // Windows 한글 폰트
        "C:/Windows/Fonts/malgun.ttf",     // 맑은 고딕
        "C:/Windows/Fonts/batang.ttc",     // 바탕
        "C:/Windows/Fonts/gulim.ttc",      // 굴림
        
        // Linux 한글 폰트
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        
        // 기본 폰트들
        "/System/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
    ];
    
    for font_path in font_paths {
        if let Ok(font_data) = std::fs::read(font_path) {
            if let Some(font) = Font::try_from_vec(font_data) {
                return render_with_font(img, &font, text, font_size, x, y);
            }
        }
    }
    
    Err("한글 지원 폰트를 찾을 수 없습니다.".to_string())
}

// 깔끔한 한글 지원 폰트 렌더링 (효과 최소화)
fn render_text_simple(
    img: &mut DynamicImage,
    text: &str,
    font_size: f32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    // 개선된 한글 지원 폰트 경로 (대체 함수와 동일)
    let font_paths = vec![
        // macOS 한글 폰트 (우선순위 높음)
        "/System/Library/Fonts/Supplemental/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/AppleGothic.ttf",
        "/Library/Fonts/AppleGothic.ttf",
        
        // macOS 기본 한글 지원 폰트
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/ArialUnicodeMS.ttf",
        "/System/Library/Fonts/PingFang.ttc",
        
        // Windows 한글 폰트
        "C:/Windows/Fonts/malgun.ttf",     // 맑은 고딕
        "C:/Windows/Fonts/batang.ttc",     // 바탕
        "C:/Windows/Fonts/gulim.ttc",      // 굴림
        
        // Linux 한글 폰트
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        
        // 기본 폰트들
        "/System/Library/Fonts/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
    ];
    
    for font_path in font_paths {
        if let Ok(font_data) = std::fs::read(font_path) {
            if let Some(font) = Font::try_from_vec(font_data) {
                return render_with_font_simple(img, &font, text, font_size, x, y);
            }
        }
    }
    
    Err("한글 지원 폰트를 찾을 수 없습니다.".to_string())
}

// 폰트를 사용한 실제 렌더링
fn render_with_font(
    img: &mut DynamicImage,
    font: &Font,
    text: &str,
    font_size: f32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let scale = Scale::uniform(font_size);
    let color = Rgba([255u8, 0u8, 0u8, 255u8]); // 빨간색 텍스트
    
    // 배경 그리기
    let text_width = estimate_text_width(text, font_size);
    let text_height = font_size as u32;
    let padding = 8;
    
    let bg_rect = Rect::at(x - padding, y - padding)
        .of_size(text_width + (padding * 2) as u32, text_height + (padding * 2) as u32);
    
    draw_filled_rect_mut(img, bg_rect, Rgba([255u8, 255u8, 255u8, 220u8])); // 흰색 배경
    
    // 텍스트 그리기
    draw_text_mut(img, color, x, y, scale, font, text);
    
    Ok(())
}

// 🔧 텍스트 박스 문제 해결: 텍스트에 정확히 맞는 배경 박스
fn render_with_font_simple(
    img: &mut DynamicImage,
    font: &Font,
    text: &str,
    font_size: f32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let scale = Scale::uniform(font_size);
    let text_color = Rgba([255u8, 0u8, 0u8, 255u8]); // 빨간색 텍스트
    
    // 🔧 텍스트에 딱 맞는 크기 계산
    let text_width = estimate_text_width_precise(text, font_size);
    let text_height = font_size as u32; // 높이는 폰트 크기와 동일
    let padding = 2; // 적절한 패딩
    
    // 🔧 배경 박스를 텍스트보다 약간 크게
    let bg_width = text_width + (padding * 2);
    let bg_height = text_height + padding;
    
    // 배경 박스 위치 (패딩 고려)
    let bg_x = x - padding as i32;
    let bg_y = y - (padding / 2) as i32;
    
    let bg_rect = Rect::at(bg_x, bg_y).of_size(bg_width, bg_height);
    
    // 깔끔한 흰색 배경
    draw_filled_rect_mut(img, bg_rect, Rgba([255u8, 255u8, 255u8, 245u8])); // 약간 불투명
    
    // 텍스트 그리기
    draw_text_mut(img, text_color, x, y, scale, font, text);
    
    Ok(())
}

// 텍스트 너비 추정
fn estimate_text_width(text: &str, font_size: f32) -> u32 {
    (text.chars().count() as f32 * font_size * 0.6) as u32
}

// 🔧 텍스트 박스 크기 문제 완전 해결: 실제 텍스트에 최적화된 너비 계산
fn estimate_text_width_precise(text: &str, font_size: f32) -> u32 {
    if text.is_empty() {
        return 10; // 최소 너비
    }
    
    let mut total_width = 0.0;
    
    for ch in text.chars() {
        // 🔧 훨씬 더 보수적인 문자 너비 계산 (실제 렌더링에 가깝게)
        let char_width = match ch {
            // 매우 좁은 문자들
            '1' => font_size * 0.2, // 1은 특별히 좁음
            'i' | 'l' | '!' | '|' | 'I' | 'j' | '.' | ',' => font_size * 0.25, // 조금 증가
            't' | 'f' | 'r' | '\'' | '"' => font_size * 0.35, // 조금 증가
            
            // 넓은 문자들 (더 축소)
            'W' | 'M' => font_size * 0.7, // 0.8 -> 0.7
            'w' | 'm' => font_size * 0.65, // 0.75 -> 0.65
            
            // 공백 (더 축소)
            ' ' => font_size * 0.2, // 0.25 -> 0.2
            
            // 한글 완성형 (더 보수적 추정)
            '가'..='힣' => font_size * 0.7, // 0.8 -> 0.7로 더 축소
            
            // 한글 자음/모음 (더 축소)
            'ㄱ'..='ㅎ' => font_size * 0.4, // 0.5 -> 0.4
            'ㅏ'..='ㅣ' => font_size * 0.3, // 0.4 -> 0.3
            'ㅤ'..='ㆎ' => font_size * 0.45, // 0.55 -> 0.45
            
            // 숫자 (더 보수적)
            '0' | '8' => font_size * 0.5, // 0.6 -> 0.5
            '2'..='7' | '9' => font_size * 0.45, // 0.55 -> 0.45
            
            // 영문 대문자 (더 축소)
            'A' | 'H' | 'N' | 'U' | 'V' | 'X' | 'Y' | 'Z' => font_size * 0.55, // 0.65 -> 0.55
            'Q' | 'G' | 'O' | 'D' => font_size * 0.6, // 0.7 -> 0.6
            'B' | 'C' | 'E' | 'F' | 'K' | 'L' | 'P' | 'R' | 'S' | 'T' | 'J' => font_size * 0.5, // 0.6 -> 0.5
            
            // 영문 소문자 (조정)
            'a' | 'c' | 'e' | 'g' | 'o' | 'q' | 's' => font_size * 0.5, // 0.4 -> 0.5로 증가
            'b' | 'd' | 'h' | 'k' | 'n' | 'p' | 'u' | 'v' | 'x' | 'y' | 'z' => font_size * 0.5, // 0.45 -> 0.5로 증가
            
            // 특수문자 (더 축소)
            '-' => font_size * 0.35, // 0.45 -> 0.35 (하이픈은 좁음)
            '_' | '=' | '+' => font_size * 0.4, // 0.45 -> 0.4
            '@' | '%' | '#' | '&' => font_size * 0.6, // 0.7 -> 0.6
            
            // 기타 문자 (더 보수적)
            _ => font_size * 0.45, // 0.55 -> 0.45
        };
        
        total_width += char_width;
        
        // 🔧 문자 간 간격 완전 제거 (텍스트 박스 과도한 확장 방지)
        // 간격을 추가하지 않음
    }
    
    // 🔧 여유 공간 약간 추가 (텍스트가 박스를 벗어나지 않도록)
    let final_width = total_width * 1.1; // 10% 여유 추가
    
    // 최소/최대 제한
    final_width.max(10.0).min(font_size * text.chars().count() as f32 * 0.8) as u32
}

// 대체 텍스트 렌더링 (폰트 실패 시)
fn render_text_alternative(
    img: &mut DynamicImage,
    text: &str,
    font_size: f32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let text_width = estimate_text_width(text, font_size);
    let text_height = font_size as u32;
    let padding = 8;
    
    // 배경 박스 (흰색)
    let bg_rect = Rect::at(x - padding, y - padding)
        .of_size(text_width + (padding * 2) as u32, text_height + (padding * 2) as u32);
    
    draw_filled_rect_mut(img, bg_rect, Rgba([255u8, 255u8, 255u8, 220u8])); // 흰새 배경
    
    // 텍스트 영역 기본 채우기 (빨간색)
    let text_rect = Rect::at(x, y).of_size(text_width, text_height);
    draw_filled_rect_mut(img, text_rect, Rgba([255u8, 200u8, 200u8, 255u8])); // 연한 빨간색 기본 영역
    
    // 텍스트 내용을 나타내는 실제 문자들을 간단한 사각형으로 표현
    let char_size = (font_size * 0.7) as u32;
    let chars: Vec<char> = text.chars().take(20).collect(); // 최대 20자
    
    for (i, ch) in chars.iter().enumerate() {
        let char_x = x + (i as u32 * (char_size + 2)) as i32;
        if char_x + char_size as i32 > x + text_width as i32 {
            break;
        }
        
        let char_y = y + ((text_height - char_size) / 2) as i32;
        
        if char_x >= 0 && char_y >= 0 {
            let char_rect = Rect::at(char_x, char_y).of_size(char_size, char_size);
            
            // 개선된 문자 종류별 색상 (한글 세분화)
            let color = match ch {
                'a'..='z' | 'A'..='Z' => Rgba([200u8, 0u8, 0u8, 255u8]), // 진한 빨간색 - 영문
                '0'..='9' => Rgba([255u8, 100u8, 100u8, 255u8]), // 밝은 빨간색 - 숫자
                '가'..='힣' => Rgba([180u8, 0u8, 50u8, 255u8]), // 어두운 빨간색 - 한글 완성형
                'ㄱ'..='ㅎ' => Rgba([160u8, 20u8, 60u8, 255u8]), // 한글 자음
                'ㅏ'..='ㅣ' => Rgba([170u8, 10u8, 50u8, 255u8]), // 한글 모음
                'ㅤ'..='ㆎ' => Rgba([175u8, 15u8, 45u8, 255u8]), // 한글 확장
                '.' | ',' | '!' | '?' | ';' | ':' => Rgba([255u8, 50u8, 50u8, 255u8]), // 밝은 빨간색 - 문장부호
                ' ' => continue, // 공백은 건너뛰기
                _ => Rgba([120u8, 0u8, 0u8, 255u8]), // 어두운 빨간색 - 기타
            };
            
            draw_filled_rect_mut(img, char_rect, color);
        }
    }
    
    Ok(())
}

// 🔧 텍스트 박스 문제 해결: 대체 렌더링도 정확한 크기로
fn render_text_alternative_simple(
    img: &mut DynamicImage,
    text: &str,
    font_size: f32,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let text_width = estimate_text_width_precise(text, font_size);
    let text_height = font_size as u32;
    let padding = 2; // 적절한 패딩
    
    // 🔧 텍스트보다 약간 큰 배경 박스
    let bg_rect = Rect::at(x - padding, y - (padding / 2))
        .of_size(text_width + (padding * 2) as u32, text_height + padding as u32);
    
    draw_filled_rect_mut(img, bg_rect, Rgba([255u8, 255u8, 255u8, 240u8])); // 약간 투명한 배경
    
    // 🔧 문자별 렌더링도 더 정확하게
    let chars: Vec<char> = text.chars().collect();
    let mut current_x = x;
    
    for ch in chars.iter() {
        // 🔧 개선된 너비 계산 함수와 일치시킴
        let char_width = match ch {
            'i' | 'l' | '1' | '!' | '|' | 'I' | 'j' => (font_size * 0.3) as u32,
            't' | 'f' | 'r' => (font_size * 0.4) as u32,
            'W' | 'M' => (font_size * 0.8) as u32,
            'w' | 'm' => (font_size * 0.75) as u32,
            ' ' => (font_size * 0.25) as u32,
            '가'..='힣' => (font_size * 0.8) as u32, // 한글 완성형
            'ㄱ'..='ㅎ' => (font_size * 0.5) as u32, // 자음
            'ㅏ'..='ㅣ' => (font_size * 0.4) as u32, // 모음
            'ㅤ'..='ㆎ' => (font_size * 0.55) as u32, // 한글 확장
            '0' | '8' => (font_size * 0.6) as u32,
            '2'..='7' | '9' => (font_size * 0.55) as u32,
            'A'..='Z' => (font_size * 0.65) as u32,
            'a'..='z' => (font_size * 0.55) as u32,
            _ => (font_size * 0.55) as u32,
        };
        
        if *ch != ' ' && current_x + char_width as i32 <= x + text_width as i32 {
            let char_height = (font_size * 0.8) as u32; // 높이 축소
            let char_y = y + ((text_height - char_height) / 2) as i32;
            
            let char_rect = Rect::at(current_x, char_y).of_size(char_width, char_height);
            
            // 깔끔한 색상 (일관성 유지)
            let color = match ch {
                'a'..='z' | 'A'..='Z' => Rgba([220u8, 0u8, 0u8, 255u8]),
                '0'..='9' => Rgba([200u8, 50u8, 50u8, 255u8]),
                '가'..='힣' => Rgba([180u8, 0u8, 30u8, 255u8]),
                'ㄱ'..='ㅎ' => Rgba([170u8, 10u8, 40u8, 255u8]),
                'ㅏ'..='ㅣ' => Rgba([175u8, 5u8, 35u8, 255u8]),
                'ㅤ'..='ㆎ' => Rgba([172u8, 8u8, 37u8, 255u8]),
                _ => Rgba([160u8, 20u8, 20u8, 255u8]),
            };
            
            draw_filled_rect_mut(img, char_rect, color);
        }
        
        current_x += char_width as i32; // 간격 최소화
    }
    
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            process_image,
            get_image_files,
            get_image_dimensions,
            get_image_preview,
            get_image_preview_lightweight,
            get_image_thumbnail
        ])
        .run(tauri::generate_context!())
        .expect("오류: Tauri 애플리케이션을 실행하는 중 오류가 발생했습니다.");
}