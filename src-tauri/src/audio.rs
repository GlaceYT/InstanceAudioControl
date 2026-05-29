use std::path::Path;
use windows::core::{Interface, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, BOOL};
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW,
    BITMAP, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, AudioSessionStateExpired, IAudioSessionControl2,
    IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};

// ============================================================================
// Data Types
// ============================================================================

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct AudioSessionInfo {
    pub pid: u32,
    pub name: String,
    pub volume: f32,
    pub mute: bool,
    pub is_system_sounds: bool,
    pub icon: Option<String>, // base64 data:image/bmp;base64,... URL
}

struct ProcessInfo {
    name: String,
    exe_path: Option<String>,
}

// ============================================================================
// COM Initialization Helper
// ============================================================================

fn init_com() -> Result<(), String> {
    unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        // S_OK=0 or S_FALSE=1 are acceptable (already initialized)
        // RPC_E_CHANGED_MODE = 0x80010106 is also acceptable
        if hr.is_err() && hr.0 != 0x000401F0 && hr.0 != 0x80010106u32 as i32 {
            return Err(format!("COM Initialization failed: 0x{:08X}", hr.0));
        }
        Ok(())
    }
}

// ============================================================================
// Process Name & Path Resolution
// ============================================================================

fn get_process_info(pid: u32) -> ProcessInfo {
    if pid == 0 {
        return ProcessInfo {
            name: "System Sounds".to_string(),
            exe_path: None,
        };
    }
    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(_) => {
                return ProcessInfo {
                    name: format!("Process ({})", pid),
                    exe_path: None,
                }
            }
        };

        let mut buffer = [0u16; 1024];
        let mut size = buffer.len() as u32;
        let res = QueryFullProcessImageNameW(
            handle,
            windows::Win32::System::Threading::PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(buffer.as_mut_ptr()),
            &mut size,
        );

        let _ = CloseHandle(handle);

        if res.is_ok() && size > 0 {
            let full_path = String::from_utf16_lossy(&buffer[..size as usize]);
            let exe_name = Path::new(&full_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&full_path);

            let clean_name = exe_name.strip_suffix(".exe").unwrap_or(exe_name);
            let display_name = if clean_name.is_empty() {
                exe_name.to_string()
            } else {
                // Capitalize the first letter
                let mut chars = clean_name.chars();
                match chars.next() {
                    None => clean_name.to_string(),
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                }
            };

            ProcessInfo {
                name: display_name,
                exe_path: Some(full_path),
            }
        } else {
            ProcessInfo {
                name: format!("Process ({})", pid),
                exe_path: None,
            }
        }
    }
}

// ============================================================================
// Base64 Encoder (zero-dependency)
// ============================================================================

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity(data.len() * 4 / 3 + 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

// ============================================================================
// Icon Extraction from EXE Path → BMP base64 data URL
// ============================================================================

fn extract_icon_base64(exe_path: &str) -> Option<String> {
    unsafe {
        let wide_path: Vec<u16> = exe_path.encode_utf16().chain(std::iter::once(0)).collect();
        let mut shfi: SHFILEINFOW = std::mem::zeroed();

        let result = SHGetFileInfoW(
            PCWSTR(wide_path.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );

        if result == 0 || shfi.hIcon.0.is_null() {
            return None;
        }

        let hicon = shfi.hIcon;

        // Get icon bitmap handles
        let mut icon_info: ICONINFO = std::mem::zeroed();
        if GetIconInfo(hicon, &mut icon_info).is_err() {
            let _ = DestroyIcon(hicon);
            return None;
        }

        // Get bitmap dimensions from the color bitmap
        let mut bm: BITMAP = std::mem::zeroed();
        let obj_result = GetObjectW(
            HGDIOBJ(icon_info.hbmColor.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut std::ffi::c_void),
        );

        if obj_result == 0 || bm.bmWidth == 0 || bm.bmHeight == 0 {
            let _ = DeleteObject(HGDIOBJ(icon_info.hbmColor.0));
            let _ = DeleteObject(HGDIOBJ(icon_info.hbmMask.0));
            let _ = DestroyIcon(hicon);
            return None;
        }

        let width = bm.bmWidth;
        let height = bm.bmHeight;

        // Create a memory device context to extract pixel data
        let hdc = CreateCompatibleDC(None);

        let mut bi: BITMAPINFO = std::mem::zeroed();
        bi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bi.bmiHeader.biWidth = width;
        bi.bmiHeader.biHeight = -height; // negative = top-down row order
        bi.bmiHeader.biPlanes = 1;
        bi.bmiHeader.biBitCount = 32;

        let pixel_count = (width * height * 4) as usize;
        let mut pixels = vec![0u8; pixel_count];

        let lines = GetDIBits(
            hdc,
            icon_info.hbmColor,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut std::ffi::c_void),
            &mut bi,
            DIB_RGB_COLORS,
        );

        // Cleanup GDI resources
        let _ = DeleteDC(hdc);
        let _ = DeleteObject(HGDIOBJ(icon_info.hbmColor.0));
        let _ = DeleteObject(HGDIOBJ(icon_info.hbmMask.0));
        let _ = DestroyIcon(hicon);

        if lines == 0 {
            return None;
        }

        // Construct BMP file in memory
        // Header: 14 (file header) + 40 (DIB header) = 54 bytes, then pixel data
        let row_bytes = (width * 4) as usize;
        let file_size = 54 + pixel_count;

        let mut bmp = Vec::with_capacity(file_size);

        // -- BMP File Header (14 bytes) --
        bmp.extend_from_slice(b"BM");                              // Signature
        bmp.extend_from_slice(&(file_size as u32).to_le_bytes());  // File size
        bmp.extend_from_slice(&[0u8; 4]);                          // Reserved
        bmp.extend_from_slice(&54u32.to_le_bytes());               // Pixel data offset

        // -- DIB Header / BITMAPINFOHEADER (40 bytes) --
        bmp.extend_from_slice(&40u32.to_le_bytes());               // Header size
        bmp.extend_from_slice(&(width as i32).to_le_bytes());      // Width
        bmp.extend_from_slice(&(height as i32).to_le_bytes());     // Height (positive = bottom-up)
        bmp.extend_from_slice(&1u16.to_le_bytes());                // Planes
        bmp.extend_from_slice(&32u16.to_le_bytes());               // Bits per pixel
        bmp.extend_from_slice(&0u32.to_le_bytes());                // Compression (BI_RGB)
        bmp.extend_from_slice(&(pixel_count as u32).to_le_bytes());// Image data size
        bmp.extend_from_slice(&0i32.to_le_bytes());                // X pixels per meter
        bmp.extend_from_slice(&0i32.to_le_bytes());                // Y pixels per meter
        bmp.extend_from_slice(&0u32.to_le_bytes());                // Colors used
        bmp.extend_from_slice(&0u32.to_le_bytes());                // Important colors

        // -- Pixel Data (flip top-down → bottom-up for standard BMP) --
        for y in (0..height as usize).rev() {
            let start = y * row_bytes;
            bmp.extend_from_slice(&pixels[start..start + row_bytes]);
        }

        let b64 = base64_encode(&bmp);
        Some(format!("data:image/bmp;base64,{}", b64))
    }
}

// ============================================================================
// Core Audio Session API
// ============================================================================

/// Enumerate all active audio sessions on the default playback device.
/// Each session maps to a specific process (Chrome, Spotify, Game, etc.)
pub fn get_active_sessions() -> Result<Vec<AudioSessionInfo>, String> {
    let mut sessions_map = std::collections::HashMap::new();

    unsafe {
        init_com()?;

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create MMDeviceEnumerator: {}", e))?;

        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|e| format!("Failed to get default audio endpoint: {}", e))?;

        let session_manager: IAudioSessionManager2 = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("Failed to activate IAudioSessionManager2: {}", e))?;

        let session_enumerator = session_manager
            .GetSessionEnumerator()
            .map_err(|e| format!("Failed to get session enumerator: {}", e))?;

        let count = session_enumerator
            .GetCount()
            .map_err(|e| format!("Failed to get session count: {}", e))?;

        for i in 0..count {
            let session_control = match session_enumerator.GetSession(i) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let session_control2: IAudioSessionControl2 = match session_control.cast() {
                Ok(s) => s,
                Err(_) => continue,
            };

            let state = match session_control2.GetState() {
                Ok(s) => s,
                Err(_) => continue,
            };

            // Skip expired/inactive sessions
            if state == AudioSessionStateExpired {
                continue;
            }

            // CRITICAL FIX: IsSystemSoundsSession() returns HRESULT.
            // S_OK (0) = YES it is a system sounds session
            // S_FALSE (1) = NO it is not
            // .is_ok() returns true for BOTH — we must check .0 == 0
            let is_system = session_control2.IsSystemSoundsSession().0 == 0;

            let pid = if is_system {
                0
            } else {
                match session_control2.GetProcessId() {
                    Ok(0) => continue, // skip zombie sessions with PID 0
                    Ok(p) => p,
                    Err(_) => continue,
                }
            };

            // Skip if we already have this PID (some apps create multiple sessions)
            if sessions_map.contains_key(&pid) {
                continue;
            }

            let simple_volume: ISimpleAudioVolume = match session_control.cast() {
                Ok(v) => v,
                Err(_) => continue,
            };

            let volume = simple_volume.GetMasterVolume().unwrap_or(1.0);
            let mute = simple_volume.GetMute().map(|m| m.as_bool()).unwrap_or(false);

            let info = get_process_info(pid);
            let icon = info.exe_path.as_deref().and_then(extract_icon_base64);

            sessions_map.insert(
                pid,
                AudioSessionInfo {
                    pid,
                    name: info.name,
                    volume,
                    mute,
                    is_system_sounds: is_system,
                    icon,
                },
            );
        }
    }

    let mut sessions: Vec<AudioSessionInfo> = sessions_map.into_values().collect();
    sessions.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(sessions)
}

/// Set the volume of a specific process by PID (0.0 to 1.0 range)
pub fn set_volume_by_pid(target_pid: u32, volume: f32) -> Result<(), String> {
    unsafe {
        init_com()?;

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create MMDeviceEnumerator: {}", e))?;

        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|e| format!("Failed to get default audio endpoint: {}", e))?;

        let session_manager: IAudioSessionManager2 = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("Failed to activate IAudioSessionManager2: {}", e))?;

        let session_enumerator = session_manager
            .GetSessionEnumerator()
            .map_err(|e| format!("Failed to get session enumerator: {}", e))?;

        let count = session_enumerator
            .GetCount()
            .map_err(|e| format!("Failed to get session count: {}", e))?;

        for i in 0..count {
            let session_control = match session_enumerator.GetSession(i) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let session_control2: IAudioSessionControl2 = match session_control.cast() {
                Ok(s) => s,
                Err(_) => continue,
            };

            // Same fix: check .0 == 0 for S_OK
            let is_system = session_control2.IsSystemSoundsSession().0 == 0;
            let pid = if is_system {
                0
            } else {
                match session_control2.GetProcessId() {
                    Ok(p) => p,
                    Err(_) => continue,
                }
            };

            if pid == target_pid {
                let simple_volume: ISimpleAudioVolume = match session_control.cast() {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                let clamped_volume = volume.clamp(0.0, 1.0);
                let _ = simple_volume.SetMasterVolume(clamped_volume, std::ptr::null());
            }
        }
    }
    Ok(())
}

/// Set the mute state of a specific process by PID
pub fn set_mute_by_pid(target_pid: u32, mute: bool) -> Result<(), String> {
    unsafe {
        init_com()?;

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("Failed to create MMDeviceEnumerator: {}", e))?;

        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .map_err(|e| format!("Failed to get default audio endpoint: {}", e))?;

        let session_manager: IAudioSessionManager2 = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("Failed to activate IAudioSessionManager2: {}", e))?;

        let session_enumerator = session_manager
            .GetSessionEnumerator()
            .map_err(|e| format!("Failed to get session enumerator: {}", e))?;

        let count = session_enumerator
            .GetCount()
            .map_err(|e| format!("Failed to get session count: {}", e))?;

        for i in 0..count {
            let session_control = match session_enumerator.GetSession(i) {
                Ok(s) => s,
                Err(_) => continue,
            };

            let session_control2: IAudioSessionControl2 = match session_control.cast() {
                Ok(s) => s,
                Err(_) => continue,
            };

            // Same fix: check .0 == 0 for S_OK
            let is_system = session_control2.IsSystemSoundsSession().0 == 0;
            let pid = if is_system {
                0
            } else {
                match session_control2.GetProcessId() {
                    Ok(p) => p,
                    Err(_) => continue,
                }
            };

            if pid == target_pid {
                let simple_volume: ISimpleAudioVolume = match session_control.cast() {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                let _ = simple_volume.SetMute(BOOL::from(mute), std::ptr::null());
            }
        }
    }
    Ok(())
}
