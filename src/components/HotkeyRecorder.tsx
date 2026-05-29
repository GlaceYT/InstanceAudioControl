import React, { useEffect, useState } from "react";
import { X, Keyboard } from "lucide-react";

const KEY_NAME_MAP: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
};

interface HotkeyRecorderProps {
  sessionName: string;
  actionType: string;
  currentBinding: string;
  onSave: (combo: string) => void;
  onCancel: () => void;
}

export default function HotkeyRecorder({
  sessionName,
  actionType,
  currentBinding,
  onSave,
  onCancel,
}: HotkeyRecorderProps) {
  const [ctrl, setCtrl] = useState<boolean>(false);
  const [alt, setAlt] = useState<boolean>(false);
  const [shift, setShift] = useState<boolean>(false);
  const [key, setKey] = useState<string>("");
  const [isRecording, setIsRecording] = useState<boolean>(true);

  // Parse existing binding on mount
  useEffect(() => {
    if (currentBinding) {
      const parts = currentBinding.split("+");
      setCtrl(parts.includes("Ctrl"));
      setAlt(parts.includes("Alt"));
      setShift(parts.includes("Shift"));
      const mainKey = parts.find((p) => !["Ctrl", "Alt", "Shift"].includes(p)) || "";
      setKey(mainKey);
    }
  }, [currentBinding]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isRecording) return;

      const currentKey = e.key;

      // Handle modifiers
      if (currentKey === "Control") {
        setCtrl(true);
        return;
      }
      if (currentKey === "Alt") {
        setAlt(true);
        return;
      }
      if (currentKey === "Shift") {
        setShift(true);
        return;
      }

      // If Escape and no modifiers are pressed, cancel or clear
      if (currentKey === "Escape" && !ctrl && !alt && !shift) {
        setIsRecording(false);
        setKey("");
        return;
      }

      const displayName = KEY_NAME_MAP[currentKey] || currentKey.toUpperCase();

      if (["CAPSLOCK", "BACKSPACE", "TAB", "ENTER"].includes(displayName)) {
        setKey(displayName);
        setIsRecording(false);
        return;
      }

      setKey(displayName);
      setIsRecording(false);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isRecording) return;
      if (e.key === "Control") setCtrl(false);
      if (e.key === "Alt") setAlt(false);
      if (e.key === "Shift") setShift(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [isRecording, ctrl, alt, shift]);

  const handleSave = () => {
    if (!key) return;

    const combo: string[] = [];
    if (ctrl) combo.push("Ctrl");
    if (alt) combo.push("Alt");
    if (shift) combo.push("Shift");
    combo.push(key);

    onSave(combo.join("+"));
  };

  const handleClear = () => {
    onSave("");
  };

  const getComboString = () => {
    const parts: string[] = [];
    if (ctrl) parts.push("Ctrl");
    if (alt) parts.push("Alt");
    if (shift) parts.push("Shift");
    if (key) parts.push(key);
    return parts.join(" + ");
  };

  return (
    <div
      className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/75"
      onClick={onCancel}
    >
      <div
        className="relative flex w-[420px] flex-col gap-5 rounded-2xl border border-accent-violet/25 bg-[#11111a] p-6 shadow-[0_20px_40px_rgba(0,0,0,0.6)] shadow-accent-violet/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-bold text-text-primary">Configure Hotkey</div>
            <div className="text-xs text-text-secondary">
              Set hotkey to <b>{actionType}</b> volume for <b>{sessionName}</b>
            </div>
          </div>
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-white/5 hover:text-text-primary transition-all duration-200"
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </div>

        <div
          className={`relative flex h-[100px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200 ${isRecording
            ? "border-accent-cyan bg-accent-cyan/5 shadow-[0_0_20px_rgba(0,240,255,0.25)]"
            : "border-accent-cyan/30 bg-accent-cyan/2"
            }`}
          onClick={() => {
            setIsRecording(true);
            setKey("");
          }}
        >
          {getComboString() ? (
            <div className="text-[18px] font-bold text-accent-cyan tracking-wide">
              {getComboString()}
              {isRecording && <span className="animate-pulse">|</span>}
            </div>
          ) : (
            <div className="flex flex-col items-center text-[13px] text-text-muted">
              <Keyboard size={20} className="mb-[6px]" />
              <div>Press any combination (e.g. Ctrl + Alt + Up)</div>
            </div>
          )}
        </div>

        <div className="text-center text-[11px] text-text-muted">
          {isRecording ? "Listening for keys..." : "Click box to re-record"}
        </div>

        <div className="flex justify-end gap-[10px]">
          {currentBinding && (
            <button
              className="mr-auto cursor-pointer rounded-lg border border-red-500/20 bg-red-500/10 px-[18px] py-2.5 text-[13px] font-semibold text-red-500 hover:bg-red-500/20 transition-all duration-200"
              onClick={handleClear}
            >
              Remove
            </button>
          )}
          <button
            className="cursor-pointer rounded-lg border border-white/6 bg-white/4 px-[18px] py-2.5 text-[13px] font-semibold text-text-secondary hover:bg-white/8 hover:text-text-primary transition-all duration-200"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="cursor-pointer rounded-lg bg-gradient-to-r from-accent-cyan to-accent-violet px-[18px] py-2.5 text-[13px] font-semibold text-white shadow-accent-violet/20 hover:-translate-y-[1px] hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] transition-all duration-200"
            onClick={handleSave}
            disabled={!key}
            style={{ opacity: !key ? 0.5 : 1, cursor: !key ? "not-allowed" : "pointer" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
