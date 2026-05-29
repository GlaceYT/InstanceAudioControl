# Instance Audio Control

<p align="center">
  <img src="logo_square.png" alt="Instance Audio Control Logo" width="128" height="128" />
</p>

<p align="center">
  <strong>An elegant, industrial-themed desktop volume controller built with Rust, Tauri v2, and React.</strong>
</p>

---

Instance Audio Control is a lightweight, zero-latency utility for Windows that gives you complete control over your active application audio sessions. Featuring a sleek, professional UI, fully customizable individual application keybinds, and a non-intrusive interactive HUD overlay.

## 📸 Previews

### Main Dashboard
![Instance Audio Control Dashboard](demo/home.png)

### Compact Volume HUD Overlay
<img src="demo/hud.png" alt="IAC Volume HUD" width="80" />

## ⚡ Key Features

- **Audio Session Segmentation**: Group active audio streams into customizable sections (Favorites, General, and Hidden) with persistent collapsible grids and live stream count indicators.
- **Global & Per-Application Hotkeys**: Pin any process to use global shortcuts, or assign dedicated keybinds (Volume Up, Volume Down, Mute) for specific applications.
- **Interactive HUD Overlay**: A borderless, click-through HUD overlay that responds dynamically to volume changes. Supports 6 coordinate presets and toggling from both the dashboard and system tray.
- **Granular Step Resolution**: Configure volume increments from 1% to 20% per shortcut interaction.
- **Quick Keybind Clears**: Direct, inline unbind options inside the app cards for quick mapping modifications.
- **System Tray Integration**: Background-friendly footprint that minimizes to the system tray. Context menu shortcuts allow quick muting of pinned apps and toggling HUD visibility.
- **High-Resolution Icon Extraction**: Utilizes Windows Shell API to dynamically resolve and draw high-definition application icons on high-DPI monitors.

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion, Vite
- **Backend**: Rust, Tauri v2, Windows Multimedia Audio (WASAPI), COM, Win32 GDI, Windows Shell APIs

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust toolchain](https://www.rust-lang.org/tools/install) (cargo, rustc)
- Windows 10 or 11 (C++ Build Tools installed)

### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/GlaceYT/InstanceAudioControl.git
   cd InstanceAudioControl
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server (automatically launches the Tauri window):
   ```bash
   npm run tauri dev
   ```

### Building for Production

Compile a production-ready standalone Windows installer (`.msi` / `.exe`):
```bash
npm run tauri build
```

---

## 📄 License

This project is licensed under the MIT License.
