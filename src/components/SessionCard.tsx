import React from "react";
import { Pin, PinOff, Volume2, VolumeX, Keyboard, Heart, Eye, EyeOff, X } from "lucide-react";

export interface AudioSessionInfo {
  pid: number;
  name: string;
  volume: number;
  mute: boolean;
  is_system_sounds: boolean;
  icon: string | null;
}

export interface HotkeyBindings {
  inc?: string;
  dec?: string;
  mute?: string;
}

interface SessionCardProps {
  session: AudioSessionInfo;
  isPinned: boolean;
  bindings?: HotkeyBindings;
  isFavorite?: boolean;
  onFavoriteToggle?: (name: string) => void;
  isHidden?: boolean;
  onHideToggle?: (name: string) => void;
  onVolumeChange: (pid: number, volume: number) => void;
  onMuteToggle: (pid: number, mute: boolean) => void;
  onPinToggle: (pid: number, name: string) => void;
  onConfigureHotkey: (name: string, action: string, currentBinding: string) => void;
  onClearHotkeyDirectly?: (name: string, action: string) => void;
}

const GRADIENTS = [
  "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
  "linear-gradient(135deg, #111827 0%, #030712 100%)",
  "linear-gradient(135deg, #27272a 0%, #09090b 100%)",
  "linear-gradient(135deg, #172554 0%, #020617 100%)",
  "linear-gradient(135deg, #311042 0%, #0f0515 100%)",
];

export function getDeterministicGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

export default function SessionCard({
  session,
  isPinned,
  bindings,
  isFavorite = false,
  onFavoriteToggle,
  isHidden = false,
  onHideToggle,
  onVolumeChange,
  onMuteToggle,
  onPinToggle,
  onConfigureHotkey,
  onClearHotkeyDirectly,
}: SessionCardProps) {
  const { pid, name, volume, mute, icon } = session;

  const percentVolume = Math.round(volume * 100);
  const avatarGradient = getDeterministicGradient(name);
  const initial = name ? name.charAt(0).toUpperCase() : "?";

  const incBinding = bindings?.inc || "";
  const decBinding = bindings?.dec || "";
  const muteBinding = bindings?.mute || "";

  return (
    <div
      className={`relative flex flex-col gap-3.5 rounded-xl border p-4 overflow-hidden transition-all duration-300 ${
        isPinned
          ? "bg-slate-900/60 border-transparent outline outline-2 outline-accent-cyan outline-offset-0 shadow-[0_0_15px_rgba(0,240,255,0.2)]"
          : "bg-[#0b0b0f]/80 border-white/5 hover:bg-[#121218]/90 hover:border-white/10 hover:shadow-[0_8px_30px_rgb(0,0,0,0.15)]"
      } ${isHidden ? "opacity-55 hover:opacity-100" : ""}`}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
            {icon ? (
              <img src={icon} alt={`${name} icon`} className="h-6 w-6 object-contain" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-sm font-bold text-white"
                style={{ background: avatarGradient }}
              >
                {initial}
              </div>
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <span className="truncate text-sm font-semibold text-text-primary" title={name}>
              {name}
            </span>
            <span className="mt-0.5 font-mono text-[10px] text-text-muted">PID: {pid}</span>
          </div>
        </div>

        <div className="flex gap-1.5">
          {onFavoriteToggle && (
            <button
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-all duration-200 ${
                isFavorite
                  ? "bg-pink-500/15 text-pink-400 border-transparent shadow-[0_0_8px_rgba(244,63,94,0.15)]"
                  : "border-transparent bg-white/3 text-text-secondary hover:bg-white/8 hover:text-pink-400"
              }`}
              onClick={() => onFavoriteToggle(name)}
              title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Heart size={14} className={isFavorite ? "fill-pink-400" : ""} />
            </button>
          )}

          <button
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-all duration-200 ${
              isPinned
                ? "bg-accent-cyan/15 text-accent-cyan border-transparent"
                : "border-transparent bg-white/3 text-text-secondary hover:bg-white/8 hover:text-text-primary"
            }`}
            onClick={() => onPinToggle(pid, name)}
            title={isPinned ? "Unpin application" : "Pin application (Ctrl+Alt Volume Controls)"}
          >
            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>

          <button
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-all duration-200 ${
              mute
                ? "bg-red-500/15 text-red-500 border-transparent"
                : "border-transparent bg-white/3 text-text-secondary hover:bg-white/8 hover:text-text-primary"
            }`}
            onClick={() => onMuteToggle(pid, mute)}
            title={mute ? "Unmute Application" : "Mute Application"}
          >
            {mute ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>

          {onHideToggle && (
            <button
              className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border transition-all duration-200 ${
                isHidden
                  ? "bg-red-500/15 text-red-400 border-transparent"
                  : "border-transparent bg-white/3 text-text-secondary hover:bg-white/8 hover:bg-red-500/10 hover:text-red-400"
              }`}
              onClick={() => onHideToggle(name)}
              title={isHidden ? "Unhide application" : "Hide application"}
            >
              {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Custom Volume Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex flex-1 items-center">
          <input
            type="range"
            min="0"
            max="100"
            value={percentVolume}
            className="custom-range-input"
            onChange={(e) => onVolumeChange(pid, parseFloat(e.target.value) / 100)}
            style={{
              background: `linear-gradient(to right, var(--color-accent-cyan) 0%, var(--color-accent-violet) ${percentVolume}%, rgba(255,255,255,0.08) ${percentVolume}%, rgba(255,255,255,0.08) 100%)`,
            }}
          />
        </div>
        <span className="w-8 text-right font-mono text-xs font-bold text-text-secondary">
          {percentVolume}%
        </span>
      </div>

      {/* 3 Hotkey Configurations Slots */}
      <div>
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-text-muted">
          <Keyboard size={10} />
          <span>INDIVIDUAL HOTKEYS</span>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          <div
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border py-2 px-1.5 transition-all duration-200 ${
              incBinding
                ? "border-accent-cyan/25 bg-accent-cyan/5 hover:border-accent-cyan/40 hover:bg-accent-cyan/8"
                : "border-white/5 bg-black/30 hover:border-white/10 hover:bg-white/5"
            }`}
            onClick={() => onConfigureHotkey(name, "inc", incBinding)}
            title="Configure Volume Up Hotkey"
          >
            {incBinding && onClearHotkeyDirectly && (
              <button
                className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded bg-white/5 text-text-muted hover:bg-red-500/20 hover:text-red-400 transition-all duration-150 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearHotkeyDirectly(name, "inc");
                }}
                title="Clear Volume Up Hotkey"
              >
                <X size={8} />
              </button>
            )}
            <span className="text-[8px] font-extrabold uppercase tracking-wider text-text-muted select-none">Vol +</span>
            <span className={`max-w-full truncate text-[10px] font-mono font-bold text-accent-cyan ${!incBinding ? "text-text-muted italic" : ""}`}>
              {incBinding || "Unbound"}
            </span>
          </div>

          <div
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border py-2 px-1.5 transition-all duration-200 ${
              decBinding
                ? "border-accent-cyan/25 bg-accent-cyan/5 hover:border-accent-cyan/40 hover:bg-accent-cyan/8"
                : "border-white/5 bg-black/30 hover:border-white/10 hover:bg-white/5"
            }`}
            onClick={() => onConfigureHotkey(name, "dec", decBinding)}
            title="Configure Volume Down Hotkey"
          >
            {decBinding && onClearHotkeyDirectly && (
              <button
                className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded bg-white/5 text-text-muted hover:bg-red-500/20 hover:text-red-400 transition-all duration-150 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearHotkeyDirectly(name, "dec");
                }}
                title="Clear Volume Down Hotkey"
              >
                <X size={8} />
              </button>
            )}
            <span className="text-[8px] font-extrabold uppercase tracking-wider text-text-muted select-none">Vol -</span>
            <span className={`max-w-full truncate text-[10px] font-mono font-bold text-accent-cyan ${!decBinding ? "text-text-muted italic" : ""}`}>
              {decBinding || "Unbound"}
            </span>
          </div>

          <div
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border py-2 px-1.5 transition-all duration-200 ${
              muteBinding
                ? "border-accent-cyan/25 bg-accent-cyan/5 hover:border-accent-cyan/40 hover:bg-accent-cyan/8"
                : "border-white/5 bg-black/30 hover:border-white/10 hover:bg-white/5"
            }`}
            onClick={() => onConfigureHotkey(name, "mute", muteBinding)}
            title="Configure Mute Hotkey"
          >
            {muteBinding && onClearHotkeyDirectly && (
              <button
                className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded bg-white/5 text-text-muted hover:bg-red-500/20 hover:text-red-400 transition-all duration-150 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearHotkeyDirectly(name, "mute");
                }}
                title="Clear Mute Hotkey"
              >
                <X size={8} />
              </button>
            )}
            <span className="text-[8px] font-extrabold uppercase tracking-wider text-text-muted select-none">Mute</span>
            <span className={`max-w-full truncate text-[10px] font-mono font-bold text-accent-cyan ${!muteBinding ? "text-text-muted italic" : ""}`}>
              {muteBinding || "Unbound"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
