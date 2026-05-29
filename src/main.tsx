import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Show the window as soon as the JS bundle has initialized, eliminating the white/empty frame on start!
try {
  if (getCurrentWebviewWindow().label !== "hud") {
    getCurrentWebviewWindow().show();
  }
} catch (e) {
  console.error("Failed to show window:", e);
}

// Disable default browser right-click context menu globally
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
