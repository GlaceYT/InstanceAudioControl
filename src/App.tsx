import React, { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import {
  Volume2,
  VolumeX,
  Pin,
  RefreshCw,
  Search,
  Keyboard,
  Info,
  Sliders,
  Sparkles,
  Heart,
  Eye,
  EyeOff,
  Github,
  Youtube,
  Globe,
  Monitor,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const DiscordIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 127.14 96.36" fill="currentColor">
    <path d="M107.7,8.07A105.15,105.15,0,0,0,77.26,0a77.19,77.19,0,0,0-3.3,6.83A96.67,96.67,0,0,0,53.22,6.83,77.19,77.19,0,0,0,49.88,0,105.15,105.15,0,0,0,19.44,8.07C3.66,31.58-1.86,54.65,1,77.53A105.73,105.73,0,0,0,32,96.36a77.7,77.7,0,0,0,6.63-10.85,68.43,68.43,0,0,1-10.5-5c1-.73,2-1.51,3-2.31A75.12,75.12,0,0,0,96,78.2c1,.8,2,1.58,3,2.31a68.43,68.43,0,0,1-10.5,5,77.7,77.7,0,0,0,6.63,10.85,105.73,105.73,0,0,0,31-18.83C129.86,50.76,123.63,28,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53S36.18,40.36,42.45,40.36,53.83,46,53.83,53,48.72,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.24,60,73.24,53S78.41,40.36,84.69,40.36,96.07,46,96.07,53,91,65.69,84.69,65.69Z" />
  </svg>
);

import TitleBar from "./components/TitleBar";
import SplashScreen from "./components/SplashScreen";
import SessionCard, { AudioSessionInfo, HotkeyBindings, getDeterministicGradient } from "./components/SessionCard";
import HotkeyRecorder from "./components/HotkeyRecorder";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/dpi";

interface VolumeUpdatedPayload {
  pid: number;
  name: string;
  volume: number;
  mute: boolean;
}

interface HudState {
  name: string;
  volume: number;
  mute: boolean;
  icon: string | null;
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [sessions, setSessions] = useState<AudioSessionInfo[]>([]);
  const [pinnedName, setPinnedName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [hotkeys, setHotkeys] = useState<Record<string, HotkeyBindings>>({});
  const [activeHotkey, setActiveHotkey] = useState<{
    name: string;
    action: string;
    currentBinding: string;
  } | null>(null);

  // States for dynamic Volume HUD
  const [hud, setHud] = useState<HudState | null>(null);
  const hudTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [windowLabel, setWindowLabel] = useState<string>(() => {
    try {
      return getCurrentWebviewWindow().label;
    } catch {
      return "main";
    }
  });

  // Ref to always access fresh sessions list inside async event callbacks
  const sessionsRef = useRef<AudioSessionInfo[]>([]);

  // Ref-based dynamic visibility controller to eliminate window redrawing flicker
  const isHudVisibleRef = useRef<boolean>(false);

  // Persistence for favorites and hidden processes
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("favorites") || "[]");
    } catch {
      return [];
    }
  });

  const [hiddenProcesses, setHiddenProcesses] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("hiddenProcesses") || "[]");
    } catch {
      return [];
    }
  });

  const [volumeDelta, setVolumeDeltaState] = useState<number>(5);
  const [hudPosition, setHudPositionState] = useState<string>(() => {
    return localStorage.getItem("hudPosition") || "top-right";
  });
  const [hudEnabled, setHudEnabledState] = useState<boolean>(() => {
    return localStorage.getItem("hudEnabled") !== "false";
  });

  const [favoritesExpanded, setFavoritesExpanded] = useState<boolean>(() => {
    return localStorage.getItem("favoritesExpanded") !== "false";
  });
  const [availableExpanded, setAvailableExpanded] = useState<boolean>(() => {
    return localStorage.getItem("availableExpanded") !== "false";
  });
  const [hiddenExpanded, setHiddenExpanded] = useState<boolean>(() => {
    return localStorage.getItem("hiddenExpanded") === "true";
  });

  const toggleFavoritesExpanded = () => {
    const next = !favoritesExpanded;
    setFavoritesExpanded(next);
    localStorage.setItem("favoritesExpanded", next ? "true" : "false");
  };

  const toggleAvailableExpanded = () => {
    const next = !availableExpanded;
    setAvailableExpanded(next);
    localStorage.setItem("availableExpanded", next ? "true" : "false");
  };

  const toggleHiddenExpanded = () => {
    const next = !hiddenExpanded;
    setHiddenExpanded(next);
    localStorage.setItem("hiddenExpanded", next ? "true" : "false");
  };

  // Load initial volume step delta from backend
  useEffect(() => {
    invoke<number>("get_volume_delta").then((d) => {
      setVolumeDeltaState(Math.round(d * 100));
    }).catch(console.error);
  }, []);

  const handleVolumeDeltaChange = async (val: number) => {
    setVolumeDeltaState(val);
    try {
      await invoke("set_volume_delta", { delta: val / 100 });
    } catch (e) {
      console.error("Failed to update volume step:", e);
    }
  };

  const handleHudPositionChange = (pos: string) => {
    setHudPositionState(pos);
    localStorage.setItem("hudPosition", pos);
    emit("hud-settings-updated").catch(console.error);
  };

  const handleHudEnabledChange = (enabled: boolean) => {
    setHudEnabledState(enabled);
    localStorage.setItem("hudEnabled", enabled ? "true" : "false");
    emit("hud-settings-updated", { enabled }).catch(console.error);
  };

  const handleClearHotkeyDirectly = async (name: string, action: string) => {
    try {
      await invoke("set_hotkey_binding", { name, action, combo: "" });
      await fetchHotkeysConfig();
    } catch (e) {
      console.error("Failed to clear hotkey directly:", e);
    }
  };

  useEffect(() => {
    localStorage.setItem("favorites", JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem("hiddenProcesses", JSON.stringify(hiddenProcesses));
  }, [hiddenProcesses]);

  const handleFavoriteToggle = (name: string) => {
    const norm = name.toLowerCase();
    setFavorites((prev) =>
      prev.includes(norm) ? prev.filter((n) => n !== norm) : [...prev, norm]
    );
  };

  const handleHideToggle = (name: string) => {
    const norm = name.toLowerCase();
    setHiddenProcesses((prev) =>
      prev.includes(norm) ? prev.filter((n) => n !== norm) : [...prev, norm]
    );
  };

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Subroutine to reveal volume HUD
  const triggerVolumeHud = (name: string, volume: number, mute: boolean) => {
    const session = sessionsRef.current.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const icon = session ? session.icon : null;

    setHud({ name, volume, mute, icon });

    if (hudTimerRef.current) {
      clearTimeout(hudTimerRef.current);
    }

    hudTimerRef.current = setTimeout(() => {
      setHud(null);
      // Automatically hide the HUD window itself when the overlay dismisses
      if (getCurrentWebviewWindow().label === "hud") {
        isHudVisibleRef.current = false;
        getCurrentWebviewWindow().hide().catch(console.error);
      }
      hudTimerRef.current = null;
    }, 2500); // Dismiss HUD after 2.5 seconds (at least 2s or 3s)
  };

  // Setup routing label and position for HUD
  useEffect(() => {
    const label = getCurrentWebviewWindow().label;
    setWindowLabel(label);

    if (label === "hud") {
      // Set the HUD window to be click-through (ignores all mouse events so it doesn't block games)
      getCurrentWebviewWindow().setIgnoreCursorEvents(true).catch(console.error);

      // Calculate dynamic monitor position based on presets
      const positionHud = async () => {
        try {
          const pos = localStorage.getItem("hudPosition") || "top-right";
          const enabled = localStorage.getItem("hudEnabled") !== "false";

          if (!enabled) return;

          const { primaryMonitor } = await import("@tauri-apps/api/window");
          const monitor = await primaryMonitor();
          if (monitor) {
            const { width, height } = monitor.size;
            const scale = monitor.scaleFactor;
            const logicalWidth = width / scale;
            const logicalHeight = height / scale;

            let x = logicalWidth * 0.95 - 80;
            let y = logicalHeight * 0.05;

            switch (pos) {
              case "top-left":
                x = logicalWidth * 0.05;
                y = logicalHeight * 0.05;
                break;
              case "top-center":
                x = logicalWidth * 0.5 - 40;
                y = logicalHeight * 0.05;
                break;
              case "top-right":
                x = logicalWidth * 0.95 - 80;
                y = logicalHeight * 0.05;
                break;
              case "bottom-left":
                x = logicalWidth * 0.05;
                y = logicalHeight * 0.95 - 220;
                break;
              case "bottom-center":
                x = logicalWidth * 0.5 - 40;
                y = logicalHeight * 0.95 - 220;
                break;
              case "bottom-right":
                x = logicalWidth * 0.95 - 80;
                y = logicalHeight * 0.95 - 220;
                break;
              default:
                break;
            }

            await getCurrentWebviewWindow().setPosition(new LogicalPosition(Math.round(x), Math.round(y)));
          }
        } catch (e) {
          console.error("Failed to position HUD window:", e);
        }
      };

      positionHud();

      // Listen to dynamic position updates
      const unlistenPromise = listen("hud-settings-updated", () => {
        positionHud();
      });

      return () => {
        unlistenPromise.then((unlisten) => unlisten());
      };
    } else if (label === "main") {
      // Wake up the hud window at boot so its JS executes and listeners bind
      WebviewWindow.getByLabel("hud").then((hudWindow) => {
        if (hudWindow) {
          hudWindow.show().then(() => {
            hudWindow.hide().catch(console.error);
          }).catch(console.error);
        }
      }).catch(console.error);
    }
  }, []);

  // Initial Bootstrap
  useEffect(() => {
    fetchPinnedProcess();
    fetchHotkeysConfig();
    refreshSessions();

    // Emit initial HUD state to sync tray menu
    const initialHudEnabled = localStorage.getItem("hudEnabled") !== "false";
    emit("hud-settings-updated", { enabled: initialHudEnabled }).catch(console.error);

    // Set up polling for active sessions
    const pollInterval = setInterval(() => {
      refreshSessions();
    }, 1200);

    // Listen to real-time events from Rust
    let unsubscribeVolume: (() => void) | null = null;
    let unsubscribeToggleHud: (() => void) | null = null;

    const setupListener = async () => {
      const unlisten = await listen<VolumeUpdatedPayload>("volume-updated", (event) => {
        const payload = event.payload;

        setSessions((prev) =>
          prev.map((s) =>
            s.pid === payload.pid
              ? { ...s, volume: payload.volume, mute: payload.mute }
              : s
          )
        );

        const isHudWindow = getCurrentWebviewWindow().label === "hud";

        if (isHudWindow) {
          const hudEnabledVal = localStorage.getItem("hudEnabled") !== "false";
          if (!hudEnabledVal) return;

          // Show HUD overlay dynamically on top of everything!
          triggerVolumeHud(payload.name, payload.volume, payload.mute);

          // Use the ref visibility check to prevent window redrawing flickers
          if (!isHudVisibleRef.current) {
            isHudVisibleRef.current = true;
            getCurrentWebviewWindow().show().then(() => {
              getCurrentWebviewWindow().setAlwaysOnTop(true).catch(console.error);
            }).catch((err) => {
              console.error("Failed to show HUD window:", err);
              isHudVisibleRef.current = false;
            });
          }
        }
      });
      unsubscribeVolume = unlisten;

      const unlistenToggleHud = await listen("toggle-hud-from-tray", () => {
        const current = localStorage.getItem("hudEnabled") !== "false";
        handleHudEnabledChange(!current);
      });
      unsubscribeToggleHud = unlistenToggleHud;
    };
    setupListener();

    return () => {
      clearInterval(pollInterval);
      if (unsubscribeVolume) unsubscribeVolume();
      if (unsubscribeToggleHud) unsubscribeToggleHud();
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, []);

  const refreshSessions = async () => {
    try {
      const data = await invoke<AudioSessionInfo[]>("get_audio_sessions");
      setSessions(data || []);
    } catch (e) {
      console.error("Failed to fetch audio sessions:", e);
    }
  };

  const fetchPinnedProcess = async () => {
    try {
      const name = await invoke<string | null>("get_pinned_process");
      setPinnedName(name);
    } catch (e) {
      console.error("Failed to fetch pinned process:", e);
    }
  };

  const fetchHotkeysConfig = async () => {
    try {
      const config = await invoke<Record<string, HotkeyBindings>>("get_hotkeys_config");
      setHotkeys(config || {});
    } catch (e) {
      console.error("Failed to fetch hotkeys config:", e);
    }
  };

  const handleVolumeChange = async (pid: number, val: number) => {
    setSessions((prev) =>
      prev.map((s) => (s.pid === pid ? { ...s, volume: val } : s))
    );
    const session = sessions.find((s) => s.pid === pid);
    if (session) {
      triggerVolumeHud(session.name, val, session.mute);

      // Emit the event to all windows so the external HUD overlay receives it
      emit("volume-updated", {
        pid,
        name: session.name,
        volume: val,
        mute: session.mute
      }).catch(console.error);
    }
    try {
      await invoke("set_process_volume", { pid, volume: val });
    } catch (e) {
      console.error("Failed to set process volume:", e);
    }
  };

  const handleMuteToggle = async (pid: number, isMuted: boolean) => {
    const nextMute = !isMuted;
    setSessions((prev) =>
      prev.map((s) => (s.pid === pid ? { ...s, mute: nextMute } : s))
    );
    const session = sessions.find((s) => s.pid === pid);
    if (session) {
      triggerVolumeHud(session.name, session.volume, nextMute);

      // Emit the event to all windows so the external HUD overlay receives it
      emit("volume-updated", {
        pid,
        name: session.name,
        volume: session.volume,
        mute: nextMute
      }).catch(console.error);
    }
    try {
      await invoke("set_process_mute", { pid, mute: nextMute });
    } catch (e) {
      console.error("Failed to set process mute:", e);
    }
  };

  const handlePinToggle = async (pid: number, name: string) => {
    const isCurrentlyPinned = pinnedName && pinnedName.toLowerCase() === name.toLowerCase();
    try {
      if (isCurrentlyPinned) {
        await invoke("unpin_process");
        setPinnedName(null);
      } else {
        await invoke("pin_process", { name, pid });
        setPinnedName(name);
      }
    } catch (e) {
      console.error("Failed to toggle pin state:", e);
    }
  };

  const handleConfigureHotkey = (name: string, action: string, currentBinding: string) => {
    setActiveHotkey({ name, action, currentBinding });
  };

  const handleSaveHotkey = async (combo: string) => {
    if (!activeHotkey) return;
    const { name, action } = activeHotkey;
    try {
      await invoke("set_hotkey_binding", { name, action, combo });
      await fetchHotkeysConfig();
      setActiveHotkey(null);
    } catch (e) {
      console.error("Failed to bind hotkey:", e);
    }
  };

  const filteredSessions = sessions.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const favoritesList = filteredSessions.filter(
    (s) => favorites.includes(s.name.toLowerCase()) && !hiddenProcesses.includes(s.name.toLowerCase())
  );

  const availableList = filteredSessions.filter(
    (s) => !favorites.includes(s.name.toLowerCase()) && !hiddenProcesses.includes(s.name.toLowerCase())
  );

  const hiddenList = filteredSessions.filter(
    (s) => hiddenProcesses.includes(s.name.toLowerCase())
  );

  const pinnedSession = sessions.find(
    (s) => pinnedName && s.name.toLowerCase() === pinnedName.toLowerCase()
  );

  // ==========================================================================
  // HUD Routing Window
  // ==========================================================================
  if (windowLabel === "hud") {
    if (!hud || !hud.name) return null;
    return (
      <div className="relative flex h-[220px] w-[80px] flex-col items-center justify-center bg-transparent overflow-hidden select-none">
        <AnimatePresence>
          {hud && (
            <motion.div
              className="flex h-[220px] w-[80px] flex-col items-center gap-2.5 rounded-none border border-white/10 bg-[#0d0d12]/95 py-2.5 px-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              {/* App Icon or Avatar fallback */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/5 bg-white/5">
                {hud.icon ? (
                  <img src={hud.icon} alt="" className="h-6 w-6 object-contain" />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-[13px] font-bold text-white"
                    style={{ background: getDeterministicGradient(hud.name) }}
                  >
                    {hud.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Vertical Progress Bar - Flat rounded top for clean progress reading */}
              <div className="relative flex h-[110px] w-2.5 shrink-0 items-end justify-center rounded-full bg-white/15 overflow-hidden">
                <motion.div
                  className={`w-full ${hud.mute
                    ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                    : "bg-gradient-to-t from-cyan-400 to-indigo-500 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                    }`}
                  animate={{ height: `${hud.mute ? 0 : hud.volume * 100}%` }}
                  transition={{ type: "spring", stiffness: 220, damping: 22 }}
                />
              </div>

              {/* Muted icon or Volume percentage */}
              <div className="flex flex-col items-center gap-1 w-full min-w-0 shrink-0">
                {hud.mute ? (
                  <VolumeX size={14} className="text-red-500 animate-pulse" />
                ) : (
                  <span className="font-mono text-[11px] font-extrabold text-accent-cyan">
                    {Math.round(hud.volume * 100)}%
                  </span>
                )}
                <span className="truncate max-w-full text-[8px] font-extrabold uppercase tracking-wider text-text-muted text-center leading-none">
                  {hud.name}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==========================================================================
  // Main Dashboard Control Panel
  // ==========================================================================
  return (
    <div className="relative flex h-[900px] w-[1600px] flex-col overflow-hidden rounded-2xl border border-transparent bg-[#0a0a0e] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)]">
      <TitleBar />

      <AnimatePresence>
        {showSplash && (
          <SplashScreen onComplete={() => setShowSplash(false)} />
        )}
      </AnimatePresence>

      <div className="flex h-[calc(100%-48px)] flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="flex w-[320px] flex-col gap-5 border-r border-transparent bg-slate-950/40 p-5 overflow-y-auto">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[1.5px] text-text-muted">Global Controller</div>
            {pinnedSession ? (
              <motion.div
                className="relative flex flex-col gap-3 overflow-hidden rounded-xl bg-slate-950/60 p-4 outline outline-2 outline-accent-cyan shadow-[0_0_15px_rgba(0,240,255,0.25)]"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex items-center gap-[10px]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
                    {pinnedSession.icon ? (
                      <img src={pinnedSession.icon} alt="" className="h-6 w-6 object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[12px] font-bold text-white bg-gradient-to-r from-accent-cyan to-accent-violet">
                        {pinnedSession.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {pinnedSession.name}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--color-accent-cyan)", fontWeight: 600, display: "flex", alignItems: "center", gap: "3px" }}>
                      <Sparkles size={8} fill="var(--color-accent-cyan)" /> PINNED
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-1">
                  <Volume2 size={12} color="var(--color-accent-cyan)" />
                  <div className="relative flex flex-1 items-center">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(pinnedSession.volume * 100)}
                      className="custom-range-input"
                      onChange={(e) => handleVolumeChange(pinnedSession.pid, parseFloat(e.target.value) / 100)}
                      style={{
                        background: `linear-gradient(to right, var(--color-accent-cyan) 0%, var(--color-accent-violet) ${Math.round(pinnedSession.volume * 100)}%, rgba(255,255,255,0.08) ${Math.round(pinnedSession.volume * 100)}%, rgba(255,255,255,0.08) 100%)`
                      }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[11px] font-bold text-text-secondary">{Math.round(pinnedSession.volume * 100)}%</span>
                </div>
              </motion.div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/5 bg-white/[0.01] p-4 text-center">
                <Pin size={16} className="mx-auto mb-1.5 text-text-muted" />
                <div className="text-[12px] font-semibold text-text-secondary">No Pinned App</div>
                <div className="mt-1 text-[10px] text-text-muted leading-relaxed">Pin any application to govern overall sound with keyboard shortcuts.</div>
              </div>
            )}
          </div>

          {/* Dynamic Settings Control Center */}
          <div className="flex flex-col gap-4 border-t border-b border-white/5 py-4">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[1.5px] text-text-muted">
              <Sliders size={11} /> Control Center
            </div>

            {/* Step Increment Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary">
                <span>Volume Step Delta</span>
                <span className="font-mono text-accent-cyan font-bold">±{volumeDelta}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={volumeDelta}
                onChange={(e) => handleVolumeDeltaChange(parseInt(e.target.value))}
                className="custom-range-input"
                style={{
                  background: `linear-gradient(to right, var(--color-accent-cyan) 0%, var(--color-accent-violet) ${((volumeDelta - 1) / 19) * 100}%, rgba(255,255,255,0.08) ${((volumeDelta - 1) / 19) * 100}%, rgba(255,255,255,0.08) 100%)`
                }}
              />
            </div>

            {/* Position Selector */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary">
                <span className="flex items-center gap-1"><Monitor size={11} /> HUD Position</span>
                <button
                  onClick={() => handleHudEnabledChange(!hudEnabled)}
                  className={`px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded tracking-wider border select-none transition-all duration-200 cursor-pointer ${hudEnabled
                    ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                    : "bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20 hover:bg-accent-cyan/20"
                    }`}
                >
                  {hudEnabled ? "Turn Off" : "Turn On"}
                </button>
              </div>
              {hudEnabled && (
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-black/20 border border-white/5">
                  {[
                    { id: "top-left", label: "Top-L" },
                    { id: "top-center", label: "Top-C" },
                    { id: "top-right", label: "Top-R" },
                    { id: "bottom-left", label: "Bot-L" },
                    { id: "bottom-center", label: "Bot-C" },
                    { id: "bottom-right", label: "Bot-R" }
                  ].map((preset) => {
                    const active = hudPosition === preset.id;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handleHudPositionChange(preset.id)}
                        className={`flex h-7 cursor-pointer items-center justify-center rounded border font-mono text-[9px] font-bold select-none transition-all duration-200 ${active
                          ? "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 shadow-[0_0_8px_rgba(0,240,255,0.15)]"
                          : "border-transparent bg-white/2 text-text-muted hover:bg-white/5 hover:text-text-secondary"
                          }`}
                        title={`HUD Position: ${preset.id}`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-4">
            <div>
              <div className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[1.5px] text-text-muted">
                <Info size={11} /> Shortcut Legends
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-transparent bg-black/15 p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Vol Up (Pinned)</span>
                  <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-accent-cyan">Ctrl+Alt+Up</kbd>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Vol Down (Pinned)</span>
                  <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-accent-cyan">Ctrl+Alt+Down</kbd>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">Mute (Pinned)</span>
                  <kbd className="rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-accent-cyan">Ctrl+Alt+M</kbd>
                </div>
              </div>
            </div>

            {/* Social Icons Footer */}
            <div className="pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-wider text-text-muted uppercase">Social Links</span>
              <div className="flex gap-2.5">
                <a
                  href="https://discord.com/invite/xQF9f9yUEM"
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-muted hover:text-[#5865F2] hover:drop-shadow-[0_0_8px_rgba(88,101,242,0.5)] transition-all duration-200"
                  title="Join Discord Community"
                >
                  <DiscordIcon size={13} />
                </a>
                <a
                  href="https://github.com/glaceyt"
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-muted hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all duration-200"
                  title="View on GitHub"
                >
                  <Github size={13} />
                </a>
                <a
                  href="https://glaceyt.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-muted hover:text-accent-cyan hover:drop-shadow-[0_0_8px_rgba(0,240,255,0.4)] transition-all duration-200"
                  title="Visit Website"
                >
                  <Globe size={13} />
                </a>
                <a
                  href="https://youtube.com/@glaceyt"
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-muted hover:text-[#FF0000] hover:drop-shadow-[0_0_8px_rgba(255,0,0,0.5)] transition-all duration-200"
                  title="Watch on YouTube"
                >
                  <Youtube size={13} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right Dashboard Area */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 bg-slate-950/20 border-l border-white/5 rounded-tl-2xl rounded-bl-2xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-white" />
              <h2 className="text-lg font-bold text-white m-0">Audio Desktops</h2>
            </div>

            <div className="flex flex-1 items-center gap-2 max-w-[320px]">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Filter active processes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 w-full rounded-lg border border-transparent bg-white/5 pl-8 pr-2.5 text-xs text-text-primary outline-none focus:bg-white/8 transition-all duration-200"
                />
              </div>

              <button
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-white/3 text-text-secondary hover:bg-white/8 hover:text-text-primary transition-all duration-200"
                onClick={refreshSessions}
                title="Refresh Active Sessions List"
              >
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Cards Grid Sections */}
          <div className="flex flex-col gap-5">
            {/* 1. Favorites Section */}
            {favoritesList.length > 0 && (
              <div
                key="favorites-section"
                className="flex flex-col gap-2.5"
              >
                <div
                  className="flex cursor-pointer items-center justify-between py-1 hover:opacity-80 transition-all select-none"
                  onClick={toggleFavoritesExpanded}
                >
                  <div className="flex items-center gap-2">
                    <Heart size={13} className="fill-pink-500 text-pink-500 animate-pulse" />
                    <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-pink-400">
                      Favorite Applications
                    </span>
                    <span className="text-[9px] font-mono font-bold bg-pink-500/10 px-1.5 py-0.5 rounded text-pink-400">
                      {favoritesList.length}
                    </span>
                  </div>
                  <div className="text-text-muted hover:text-white transition-colors">
                    {favoritesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </div>

                {favoritesExpanded && (
                  <div className="grid grid-cols-2 gap-4">
                    {favoritesList.map((session) => (
                      <motion.div
                        key={session.pid}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                      >
                        <SessionCard
                          session={session}
                          isPinned={pinnedName !== null && session.name.toLowerCase() === pinnedName.toLowerCase()}
                          bindings={hotkeys[session.name.toLowerCase()]}
                          isFavorite={true}
                          onFavoriteToggle={handleFavoriteToggle}
                          isHidden={false}
                          onHideToggle={handleHideToggle}
                          onVolumeChange={handleVolumeChange}
                          onMuteToggle={handleMuteToggle}
                          onPinToggle={handlePinToggle}
                          onConfigureHotkey={handleConfigureHotkey}
                          onClearHotkeyDirectly={handleClearHotkeyDirectly}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}

                {availableList.length > 0 && <div className="border-t border-white/5 my-2"></div>}
              </div>
            )}

            {/* 2. Available / Remaining Section */}
            <div
              key="available-section"
              className="flex flex-col gap-2.5"
            >
              {availableList.length > 0 && (
                <div
                  className="flex cursor-pointer items-center justify-between py-1 hover:opacity-80 transition-all select-none"
                  onClick={toggleAvailableExpanded}
                >
                  <div className="flex items-center gap-2">
                    <Sliders size={13} className="text-text-muted" />
                    <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-text-muted">
                      All Streams
                    </span>
                    <span className="text-[9px] font-mono font-bold bg-white/5 px-1.5 py-0.5 rounded text-text-secondary">
                      {availableList.length}
                    </span>
                  </div>
                  <div className="text-text-muted hover:text-white transition-colors">
                    {availableExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </div>
              )}

              {availableExpanded && (
                availableList.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {availableList.map((session) => (
                      <motion.div
                        key={session.pid}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                      >
                        <SessionCard
                          session={session}
                          isPinned={pinnedName !== null && session.name.toLowerCase() === pinnedName.toLowerCase()}
                          bindings={hotkeys[session.name.toLowerCase()]}
                          isFavorite={false}
                          onFavoriteToggle={handleFavoriteToggle}
                          isHidden={false}
                          onHideToggle={handleHideToggle}
                          onVolumeChange={handleVolumeChange}
                          onMuteToggle={handleMuteToggle}
                          onPinToggle={handlePinToggle}
                          onConfigureHotkey={handleConfigureHotkey}
                          onClearHotkeyDirectly={handleClearHotkeyDirectly}
                        />
                      </motion.div>
                    ))}
                  </div>
                ) : favoritesList.length === 0 ? (
                  <div className="py-12 text-center">
                    <VolumeX size={36} className="mx-auto mb-3 text-text-muted" />
                    <div className="font-semibold text-text-secondary">No active audio processes found</div>
                    <div className="mt-1 text-[11px] text-text-muted">
                      Make sure applications are playing audio in Windows volume mixer to appear.
                    </div>
                  </div>
                ) : null
              )}
            </div>

            {/* 3. Hidden Processes Section */}
            {hiddenList.length > 0 && (
              <div
                key="hidden-section"
                className="flex flex-col gap-2.5"
              >
                <div className="border-t border-white/5 my-2"></div>

                <div
                  className="flex cursor-pointer items-center justify-between py-1 hover:opacity-80 transition-all select-none"
                  onClick={toggleHiddenExpanded}
                >
                  <div className="flex items-center gap-2">
                    <EyeOff size={13} className="text-red-400/80" />
                    <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-red-400/70">
                      Hidden Audio Sessions
                    </span>
                    <span className="text-[9px] font-mono font-bold bg-red-500/5 px-1.5 py-0.5 rounded text-red-400/70">
                      {hiddenList.length}
                    </span>
                  </div>
                  <div className="text-text-muted hover:text-white transition-colors">
                    {hiddenExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </div>

                {hiddenExpanded && (
                  <div className="grid grid-cols-2 gap-4">
                    {hiddenList.map((session) => (
                      <motion.div
                        key={session.pid}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                      >
                        <SessionCard
                          session={session}
                          isPinned={pinnedName !== null && session.name.toLowerCase() === pinnedName.toLowerCase()}
                          bindings={hotkeys[session.name.toLowerCase()]}
                          isFavorite={favorites.includes(session.name.toLowerCase())}
                          onFavoriteToggle={handleFavoriteToggle}
                          isHidden={true}
                          onHideToggle={handleHideToggle}
                          onVolumeChange={handleVolumeChange}
                          onMuteToggle={handleMuteToggle}
                          onPinToggle={handlePinToggle}
                          onConfigureHotkey={handleConfigureHotkey}
                          onClearHotkeyDirectly={handleClearHotkeyDirectly}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {activeHotkey && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <HotkeyRecorder
              sessionName={activeHotkey.name}
              actionType={activeHotkey.action}
              currentBinding={activeHotkey.currentBinding}
              onSave={handleSaveHotkey}
              onCancel={() => setActiveHotkey(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
