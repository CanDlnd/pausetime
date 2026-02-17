// ============================================
// Windows Sistem Sesi Kontrolü
// ============================================

#[cfg(target_os = "windows")]
mod audio {
    use windows::{
        core::*,
        Win32::Media::Audio::{
            Endpoints::IAudioEndpointVolume,
            eRender, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator,
        },
        Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
    };

    pub fn set_mute(mute: bool) -> Result<()> {
        unsafe {
            // COM başlat
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            // Device enumerator oluştur
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

            // Default audio endpoint al
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;

            // IAudioEndpointVolume interface'ini al
            let endpoint_volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;

            // Mute durumunu ayarla
            endpoint_volume.SetMute(mute, std::ptr::null())?;

            Ok(())
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod audio {
    pub fn set_mute(_mute: bool) -> Result<(), String> {
        // Windows dışı platformlarda işlem yapma
        Ok(())
    }
}

#[tauri::command]
fn set_system_mute(mute: bool) -> Result<(), String> {
    log::info!("set_system_mute called with: {}", mute);
    
    #[cfg(target_os = "windows")]
    {
        audio::set_mute(mute).map_err(|e| e.to_string())
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
fn update_tray_toggle_text(app_handle: tauri::AppHandle, is_disabled: bool) -> Result<(), String> {
    // Tray menüdeki toggle item'ın metnini güncelle
    let text = if is_disabled { "Aktif Et" } else { "Devre Dışı Bırak" };
    
    let state = app_handle.state::<ToggleMenuItemState>();
    if let Ok(guard) = state.0.lock() {
        if let Some(ref item) = *guard {
            let _ = item.set_text(text);
        }
    }
    Ok(())
}

// ============================================
// Tray Menu ve Background Mode
// ============================================

use std::sync::Mutex;
use tauri::{
    Emitter,
    Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    WindowEvent,
};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_autostart::MacosLauncher;

/// Uygulama ayarlarından start_minimized_to_tray değerini oku
fn should_start_minimized() -> bool {
    let appdata = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_default();
    let settings_path = std::path::Path::new(&appdata).join("PauseTime").join("settings.json");

    if let Ok(content) = std::fs::read_to_string(&settings_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            return json.get("start_minimized_to_tray")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
        }
    }
    false
}

// Toggle MenuItem'ı state olarak tutmak için
struct ToggleMenuItemState(Mutex<Option<MenuItem<tauri::Wry>>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Debug modda log plugin
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Toggle item state'ini başlat
            app.manage(ToggleMenuItemState(Mutex::new(None)));

            // Backend sidecar başlat
            match app.shell().sidecar("pausetime-backend") {
                Ok(cmd) => {
                    match cmd.spawn() {
                        Ok((_rx, _child)) => {
                            log::info!("Backend sidecar started successfully");
                        }
                        Err(e) => {
                            log::error!("Failed to spawn backend sidecar: {}", e);
                        }
                    }
                }
                Err(e) => {
                    log::error!("Failed to create backend sidecar command: {}", e);
                }
            }

            // Tray menü oluştur
            let show_item = MenuItem::with_id(app, "show", "Aç", true, None::<&str>)?;
            let toggle_item = MenuItem::with_id(app, "toggle", "Devre Dışı Bırak", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            
            // Toggle item'ı state'e kaydet
            {
                let state = app.state::<ToggleMenuItemState>();
                *state.0.lock().unwrap() = Some(toggle_item.clone());
            }
            
            let menu = Menu::with_items(app, &[&show_item, &toggle_item, &quit_item])?;

            // Tray icon oluştur (256x256 ikon kullan, Windows tray için ideal boyut)
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
                .expect("Failed to load tray icon");
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .menu(&menu)
                .tooltip("PauseTime")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            // Ana pencereyi göster
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "toggle" => {
                            // Frontend'e toggle event gönder
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-toggle", ());
                            }
                        }
                        "quit" => {
                            // Uygulamayı tamamen kapat
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Tray ikonuna tıklanınca pencereyi aç
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Simge durumunda küçültülmüş başlat ayarını kontrol et
            if !should_start_minimized() {
                // Ayar kapalıysa pencereyi göster
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else {
                log::info!("Starting minimized to system tray");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Pencere kapatılınca gizle (uygulamayı kapatma)
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![set_system_mute, update_tray_toggle_text])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
