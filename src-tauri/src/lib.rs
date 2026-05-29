mod audio;

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager};

// ============================================================================
// Hotkey & Configuration Structs
// ============================================================================

#[derive(serde::Serialize, serde::Deserialize, Default, Clone, Debug)]
pub struct HotkeyConfig {
    // Map of lowercase application names (e.g., "spotify") to action maps ("inc", "dec", "mute") to combo string ("Ctrl+Alt+Up")
    pub bindings: HashMap<String, HashMap<String, String>>,
}

pub struct AppState {
    pub pinned_name: Mutex<Option<String>>,
    pub pinned_pid: Mutex<Option<u32>>,
    pub hotkeys: Mutex<HotkeyConfig>,
    pub thread_id: Mutex<Option<u32>>,
    pub volume_delta: Mutex<f32>,
}

// ============================================================================
// Deterministic Hotkey Hashing & Parsing Utilities
// ============================================================================

/// Hash application name and action to a safe, deterministic Win32 hotkey ID (>= 100)
fn hash_hotkey_id(app_name: &str, action: &str) -> i32 {
    let combined = format!("{}:{}", app_name.to_lowercase(), action.to_lowercase());
    let mut hash = 5381i32;
    for c in combined.bytes() {
        // Use wrapping math to prevent debug overflow panic
        hash = hash
            .wrapping_shl(5)
            .wrapping_add(hash)
            .wrapping_add(c as i32);
    }
    // Map to safe Win32 user hotkey range (100 to 0x7fff) to avoid overlap with IDs 1, 2, 3
    (hash.abs() % 0x3fff) + 100
}

/// Parse combo string (e.g. "Ctrl+Alt+Up") into (modifiers, vk_code)
fn parse_combo(combo: &str) -> Option<(u32, u32)> {
    if combo.is_empty() {
        return None;
    }

    use windows::Win32::UI::Input::KeyboardAndMouse::{MOD_ALT, MOD_CONTROL, MOD_SHIFT};

    let mut modifiers = 0u32;
    let mut vk = 0u32;

    let parts = combo.split('+');
    for part in parts {
        let part = part.trim();
        match part.to_lowercase().as_str() {
            "ctrl" => modifiers |= MOD_CONTROL.0,
            "alt" => modifiers |= MOD_ALT.0,
            "shift" => modifiers |= MOD_SHIFT.0,

            // Navigation / Special Keys
            "up" => vk = 0x26,        // VK_UP
            "down" => vk = 0x28,      // VK_DOWN
            "left" => vk = 0x25,      // VK_LEFT
            "right" => vk = 0x27,     // VK_RIGHT
            "space" => vk = 0x20,     // VK_SPACE
            "enter" => vk = 0x0D,     // VK_RETURN
            "tab" => vk = 0x09,       // VK_TAB
            "backspace" => vk = 0x08, // VK_BACK
            "capslock" => vk = 0x14,  // VK_CAPITAL

            // F1 - F12
            "f1" => vk = 0x70,
            "f2" => vk = 0x71,
            "f3" => vk = 0x72,
            "f4" => vk = 0x73,
            "f5" => vk = 0x74,
            "f6" => vk = 0x75,
            "f7" => vk = 0x76,
            "f8" => vk = 0x77,
            "f9" => vk = 0x78,
            "f10" => vk = 0x79,
            "f11" => vk = 0x7A,
            "f12" => vk = 0x7B,

            // Extra Navigation
            "pageup" => vk = 0x21,
            "pagedown" => vk = 0x22,
            "end" => vk = 0x23,
            "home" => vk = 0x24,
            "insert" => vk = 0x2D,
            "delete" => vk = 0x2E,

            // Single letters/digits
            other if other.len() == 1 => {
                let c = other.chars().next().unwrap();
                vk = c.to_ascii_uppercase() as u32;
            }
            _ => {}
        }
    }

    if vk == 0 {
        None
    } else {
        Some((modifiers, vk))
    }
}

// ============================================================================
// Persistent JSON Storage Manager
// ============================================================================

fn get_config_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve AppData directory: {}", e))?;
    let _ = std::fs::create_dir_all(&path);
    path.push("hotkeys_config.json");
    Ok(path)
}

fn load_config(app_handle: &AppHandle) -> HotkeyConfig {
    if let Ok(path) = get_config_path(app_handle) {
        if path.exists() {
            if let Ok(mut file) = File::open(path) {
                let mut contents = String::new();
                if file.read_to_string(&mut contents).is_ok() {
                    if let Ok(config) = serde_json::from_str::<HotkeyConfig>(&contents) {
                        return config;
                    }
                }
            }
        }
    }
    HotkeyConfig::default()
}

fn save_config(app_handle: &AppHandle, config: &HotkeyConfig) -> Result<(), String> {
    let path = get_config_path(app_handle)?;
    let mut file =
        File::create(path).map_err(|e| format!("Failed to create config file: {}", e))?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    file.write_all(json.as_bytes())
        .map_err(|e| format!("Failed to save config data: {}", e))?;
    Ok(())
}

// ============================================================================
// Core Volume & Mute Action Controllers
// ============================================================================

fn adjust_pinned_volume(app_handle: &AppHandle, increase: bool) {
    let state = app_handle.state::<AppState>();
    let pinned_name = match state.pinned_name.lock().unwrap().clone() {
        Some(name) => name,
        None => return,
    };
    let step = *state.volume_delta.lock().unwrap();

    if let Ok(sessions) = audio::get_active_sessions() {
        for s in sessions {
            if s.name.to_lowercase() == pinned_name.to_lowercase() {
                let delta = if increase { step } else { -step };
                let new_vol = (s.volume + delta).clamp(0.0, 1.0);
                if audio::set_volume_by_pid(s.pid, new_vol).is_ok() {
                    let _ = app_handle.emit(
                        "volume-updated",
                        serde_json::json!({
                            "pid": s.pid,
                            "name": s.name,
                            "volume": new_vol,
                            "mute": s.mute
                        }),
                    );
                }
            }
        }
    }
}

fn toggle_pinned_mute(app_handle: &AppHandle) {
    let state = app_handle.state::<AppState>();
    let pinned_name = match state.pinned_name.lock().unwrap().clone() {
        Some(name) => name,
        None => return,
    };

    if let Ok(sessions) = audio::get_active_sessions() {
        for s in sessions {
            if s.name.to_lowercase() == pinned_name.to_lowercase() {
                let new_mute = !s.mute;
                if audio::set_mute_by_pid(s.pid, new_mute).is_ok() {
                    let _ = app_handle.emit(
                        "volume-updated",
                        serde_json::json!({
                            "pid": s.pid,
                            "name": s.name,
                            "volume": s.volume,
                            "mute": new_mute
                        }),
                    );
                }
            }
        }
    }
}

fn adjust_app_volume_by_name(app_handle: &AppHandle, app_name: &str, increase: bool) {
    let state = app_handle.state::<AppState>();
    let step = *state.volume_delta.lock().unwrap();
    if let Ok(sessions) = audio::get_active_sessions() {
        for s in sessions {
            if s.name.to_lowercase() == app_name.to_lowercase() {
                let delta = if increase { step } else { -step };
                let new_vol = (s.volume + delta).clamp(0.0, 1.0);
                if audio::set_volume_by_pid(s.pid, new_vol).is_ok() {
                    let _ = app_handle.emit(
                        "volume-updated",
                        serde_json::json!({
                            "pid": s.pid,
                            "name": s.name,
                            "volume": new_vol,
                            "mute": s.mute
                        }),
                    );
                }
            }
        }
    }
}

fn toggle_app_mute_by_name(app_handle: &AppHandle, app_name: &str) {
    if let Ok(sessions) = audio::get_active_sessions() {
        for s in sessions {
            if s.name.to_lowercase() == app_name.to_lowercase() {
                let new_mute = !s.mute;
                if audio::set_mute_by_pid(s.pid, new_mute).is_ok() {
                    let _ = app_handle.emit(
                        "volume-updated",
                        serde_json::json!({
                            "pid": s.pid,
                            "name": s.name,
                            "volume": s.volume,
                            "mute": new_mute
                        }),
                    );
                }
            }
        }
    }
}

// ============================================================================
// Tauri Commands API
// ============================================================================

#[tauri::command]
fn get_audio_sessions() -> Result<Vec<audio::AudioSessionInfo>, String> {
    audio::get_active_sessions()
}

#[tauri::command]
fn set_process_volume(pid: u32, volume: f32) -> Result<(), String> {
    audio::set_volume_by_pid(pid, volume)
}

#[tauri::command]
fn set_process_mute(pid: u32, mute: bool) -> Result<(), String> {
    audio::set_mute_by_pid(pid, mute)
}

#[tauri::command]
fn pin_process(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    name: String,
    pid: u32,
) -> Result<(), String> {
    *state.pinned_name.lock().unwrap() = Some(name.clone());
    *state.pinned_pid.lock().unwrap() = Some(pid);
    let _ = app_handle.emit("pin-changed", Some(name));
    Ok(())
}

#[tauri::command]
fn unpin_process(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    *state.pinned_name.lock().unwrap() = None;
    *state.pinned_pid.lock().unwrap() = None;
    let _ = app_handle.emit("pin-changed", None::<String>);
    Ok(())
}

#[tauri::command]
fn get_pinned_process(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.pinned_name.lock().unwrap().clone())
}

#[tauri::command]
fn get_volume_delta(state: tauri::State<'_, AppState>) -> f32 {
    *state.volume_delta.lock().unwrap()
}

#[tauri::command]
fn set_volume_delta(state: tauri::State<'_, AppState>, delta: f32) {
    *state.volume_delta.lock().unwrap() = delta.clamp(0.01, 0.50);
}

#[tauri::command]
fn get_hotkeys_config(
    state: tauri::State<'_, AppState>,
) -> Result<HashMap<String, HashMap<String, String>>, String> {
    Ok(state.hotkeys.lock().unwrap().bindings.clone())
}

#[tauri::command]
fn set_hotkey_binding(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    name: String,
    action: String,
    combo: String,
) -> Result<(), String> {
    let mut config = state.hotkeys.lock().unwrap().clone();
    let app_key = name.to_lowercase();
    let action_key = action.to_lowercase();

    if combo.is_empty() {
        if let Some(actions) = config.bindings.get_mut(&app_key) {
            actions.remove(&action_key);
            if actions.is_empty() {
                config.bindings.remove(&app_key);
            }
        }
    } else {
        config
            .bindings
            .entry(app_key)
            .or_default()
            .insert(action_key, combo);
    }

    // Save to configuration JSON file
    save_config(&app_handle, &config)?;

    // Commit update to lock state in memory
    *state.hotkeys.lock().unwrap() = config;

    // Send reload signal to background win32 keyboard listening thread
    if let Some(tid) = *state.thread_id.lock().unwrap() {
        unsafe {
            use windows::Win32::Foundation::{LPARAM, WPARAM};
            use windows::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_USER};
            let _ = PostThreadMessageW(tid, WM_USER + 100, WPARAM(0), LPARAM(0));
        }
    }

    Ok(())
}

// ============================================================================
// Core Application Bootstrapper
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        pinned_name: Mutex::new(None),
        pinned_pid: Mutex::new(None),
        hotkeys: Mutex::new(HotkeyConfig::default()),
        thread_id: Mutex::new(None),
        volume_delta: Mutex::new(0.05),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_audio_sessions,
            set_process_volume,
            set_process_mute,
            pin_process,
            unpin_process,
            get_pinned_process,
            get_hotkeys_config,
            set_hotkey_binding,
            get_volume_delta,
            set_volume_delta
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Load saved configuration and store it into our synchronized state
            let loaded_config = load_config(&app_handle);
            {
                let state = app.state::<AppState>();
                *state.hotkeys.lock().unwrap() = loaded_config;
            }

            let app_handle_clone = app_handle.clone();

            // Spawn the low-level Windows Hotkey Listening thread
            std::thread::spawn(move || {
                unsafe {
                    use std::collections::HashSet;
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::System::Threading::GetCurrentThreadId;
                    use windows::Win32::UI::Input::KeyboardAndMouse::{
                        RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_ALT, MOD_CONTROL,
                    };
                    use windows::Win32::UI::WindowsAndMessaging::{
                        GetMessageW, MSG, WM_HOTKEY, WM_USER,
                    };

                    // Cache background thread ID so other threads can post messages to it
                    let tid = GetCurrentThreadId();
                    {
                        let state = app_handle_clone.state::<AppState>();
                        *state.thread_id.lock().unwrap() = Some(tid);
                    }

                    let reload_msg = WM_USER + 100;
                    let mut registered_ids = HashSet::new();

                    // Hotkey registration subroutine
                    let register_all = |registered: &mut HashSet<i32>| {
                        // Unregister previous hotkeys to refresh
                        for id in registered.iter() {
                            let _ = UnregisterHotKey(HWND(std::ptr::null_mut()), *id);
                        }
                        registered.clear();

                        // 1. Static Global Hotkeys (Ctrl + Alt + Up/Down/M for Pinned process)
                        let modifiers = MOD_CONTROL.0 | MOD_ALT.0;
                        let _ = RegisterHotKey(
                            HWND(std::ptr::null_mut()),
                            1,
                            HOT_KEY_MODIFIERS(modifiers),
                            0x26, // VK_UP
                        );
                        let _ = RegisterHotKey(
                            HWND(std::ptr::null_mut()),
                            2,
                            HOT_KEY_MODIFIERS(modifiers),
                            0x28, // VK_DOWN
                        );
                        let _ = RegisterHotKey(
                            HWND(std::ptr::null_mut()),
                            3,
                            HOT_KEY_MODIFIERS(modifiers),
                            0x4D, // VK_M
                        );
                        registered.insert(1);
                        registered.insert(2);
                        registered.insert(3);

                        // 2. Dynamic Per-App Custom Hotkeys
                        let config = app_handle_clone
                            .state::<AppState>()
                            .hotkeys
                            .lock()
                            .unwrap()
                            .clone();
                        for (app_name, actions) in &config.bindings {
                            for (action, combo) in actions {
                                if let Some((mods, vk)) = parse_combo(combo) {
                                    let id = hash_hotkey_id(app_name, action);
                                    let res = RegisterHotKey(
                                        HWND(std::ptr::null_mut()),
                                        id,
                                        HOT_KEY_MODIFIERS(mods),
                                        vk,
                                    );
                                    if res.is_ok() {
                                        registered.insert(id);
                                    }
                                }
                            }
                        }
                    };

                    // Initial registration on thread startup
                    register_all(&mut registered_ids);

                    let mut msg = MSG::default();
                    while GetMessageW(&mut msg, HWND(std::ptr::null_mut()), 0, 0).as_bool() {
                        if msg.message == WM_HOTKEY {
                            let id = msg.wParam.0 as i32;
                            match id {
                                1 => adjust_pinned_volume(&app_handle_clone, true),
                                2 => adjust_pinned_volume(&app_handle_clone, false),
                                3 => toggle_pinned_mute(&app_handle_clone),
                                other_id => {
                                    // Identify corresponding dynamic action from configured bindings
                                    let config = app_handle_clone
                                        .state::<AppState>()
                                        .hotkeys
                                        .lock()
                                        .unwrap()
                                        .clone();
                                    let mut found = false;

                                    for (app_name, actions) in &config.bindings {
                                        for (action, _combo) in actions {
                                            if hash_hotkey_id(app_name, action) == other_id {
                                                match action.as_str() {
                                                    "inc" => adjust_app_volume_by_name(
                                                        &app_handle_clone,
                                                        app_name,
                                                        true,
                                                    ),
                                                    "dec" => adjust_app_volume_by_name(
                                                        &app_handle_clone,
                                                        app_name,
                                                        false,
                                                    ),
                                                    "mute" => toggle_app_mute_by_name(
                                                        &app_handle_clone,
                                                        app_name,
                                                    ),
                                                    _ => {}
                                                }
                                                found = true;
                                                break;
                                            }
                                        }
                                        if found {
                                            break;
                                        }
                                    }
                                }
                            }
                        } else if msg.message == reload_msg {
                            // User updated hotkeys - force unregister & re-register
                            register_all(&mut registered_ids);
                        }
                    }
                }
            });

            // Create System Tray context menu and events
            let open_item = MenuItem::with_id(app, "open", "Open Dashboard", true, None::<&str>)?;
            let toggle_hud_item =
                MenuItem::with_id(app, "toggle_hud", "HUD Overlay: ON", true, None::<&str>)?;
            let mute_pinned_item = MenuItem::with_id(
                app,
                "mute_pinned",
                "Mute Pinned App (None)",
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &toggle_hud_item,
                    &mute_pinned_item,
                    &separator,
                    &quit_item,
                ],
            )?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "toggle_hud" => {
                        let _ = app.emit("toggle-hud-from-tray", ());
                    }
                    "mute_pinned" => {
                        toggle_pinned_mute(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // 1. HUD Toggle listener
            let toggle_hud_item_for_event = toggle_hud_item.clone();
            let _ = app.listen("hud-settings-updated", move |event| {
                #[derive(serde::Deserialize, Clone)]
                struct HudSettingsPayload {
                    enabled: bool,
                }
                if let Ok(payload) = serde_json::from_str::<HudSettingsPayload>(event.payload()) {
                    let label = if payload.enabled {
                        "HUD Overlay: ON"
                    } else {
                        "HUD Overlay: OFF"
                    };
                    let _ = toggle_hud_item_for_event.set_text(label);
                }
            });

            // 2. Pin Changed listener
            let mute_pinned_item_for_pin = mute_pinned_item.clone();
            let _ = app.listen("pin-changed", move |event| {
                let name: Option<String> = serde_json::from_str(event.payload()).unwrap_or(None);
                match name {
                    Some(app_name) => {
                        let mut is_muted = false;
                        if let Ok(sessions) = audio::get_active_sessions() {
                            if let Some(s) = sessions
                                .iter()
                                .find(|s| s.name.to_lowercase() == app_name.to_lowercase())
                            {
                                is_muted = s.mute;
                            }
                        }
                        let label = if is_muted {
                            "Unmute Pinned App"
                        } else {
                            "Mute Pinned App"
                        };
                        let _ = mute_pinned_item_for_pin.set_text(label);
                    }
                    None => {
                        let _ = mute_pinned_item_for_pin.set_text("Mute Pinned App (None)");
                    }
                }
            });

            // 3. Volume Updated listener (for updating mute state of pinned app)
            let mute_pinned_item_for_volume = mute_pinned_item.clone();
            let app_handle_for_volume = app.handle().clone();
            let _ = app.listen("volume-updated", move |event| {
                #[derive(serde::Deserialize, Clone)]
                struct VolumePayload {
                    name: String,
                    mute: bool,
                }
                if let Ok(payload) = serde_json::from_str::<VolumePayload>(event.payload()) {
                    let state = app_handle_for_volume.state::<AppState>();
                    let pinned_opt = state.pinned_name.lock().unwrap().clone();
                    if let Some(pinned) = pinned_opt {
                        if pinned.to_lowercase() == payload.name.to_lowercase() {
                            let label = if payload.mute {
                                "Unmute Pinned App"
                            } else {
                                "Mute Pinned App"
                            };
                            let _ = mute_pinned_item_for_volume.set_text(label);
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
