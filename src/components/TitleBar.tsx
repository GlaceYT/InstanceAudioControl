import React from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import logoImg from "../assets/logo.png";
import { Minus, X } from "lucide-react";
export default function TitleBar() {
  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWebviewWindow();
      await appWindow.minimize();
    } catch (e) {
      console.error("Failed to minimize window:", e);
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWebviewWindow();
      await appWindow.hide(); // Hide window safely to system tray
    } catch (e) {
      console.error("Failed to hide window:", e);
    }
  };

  return (
    <div className="relative z-[100] flex h-12 items-center justify-between border-b border-white/5 bg-[#0d0d12] px-4 select-none">
      {/* Absolute draggable overlay covering everything except control buttons */}
      <div
        className="absolute inset-y-0 left-0 right-[100px] z-[99] cursor-move"
        data-tauri-drag-region
      />

      <div className="pointer-events-none z-[101] flex items-center gap-2 text-xs font-bold tracking-wider text-text-primary">
        <img src={logoImg} alt="" className="h-4.5 w-4.5 object-contain" style={{ pointerEvents: "none" }} />
        <span style={{ pointerEvents: "none" }}>INSTANCE AUDIO CONTROL</span>
      </div>

      <div className="z-[101] flex items-center gap-1">
        <button
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-200"
          onClick={handleMinimize}
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-red-500 hover:text-white transition-all duration-200"
          onClick={handleClose}
          title="Close to System Tray"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
