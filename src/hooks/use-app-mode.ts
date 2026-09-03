import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "ghostchat-appmode";
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * App Mode — an on/off switch. When ON, GhostChat renders as a compact
 * phone-style app (one pane at a time, full-width sidebar). When OFF, it
 * uses the full desktop two-pane layout.
 *
 * Until the user flips the switch, App Mode follows the device: it turns on
 * automatically on small screens (phones) and off on large ones. A manual
 * flip sticks and is persisted per device.
 *
 * The state lives in a tiny module store so every consumer (chat layout,
 * settings dialog) stays in sync — toggling the switch in Settings updates
 * the chat layout immediately.
 */

function readStored(): boolean | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch {
    // ignore storage errors (private mode etc.)
  }
  return null; // never manually set → follow the device
}

function isMobileNow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_QUERY).matches
  );
}

let current: boolean = readStored() ?? isMobileNow();
let isAuto: boolean = readStored() === null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, current ? "on" : "off");
  } catch {
    // storage unavailable — in-memory only
  }
}

function setAppModeGlobal(on: boolean) {
  isAuto = false;
  current = on;
  persist();
  emit();
}

function toggleAppModeGlobal() {
  setAppModeGlobal(!current);
}

// While in auto mode, follow screen-size changes (rotation, resize, device).
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const mq = window.matchMedia(MOBILE_QUERY);
  const onChange = (e: MediaQueryListEvent) => {
    if (!isAuto) return;
    current = e.matches;
    emit();
  };
  mq.addEventListener("change", onChange);
}

export function useAppMode() {
  const appMode = useSyncExternalStore(subscribe, () => current, () => current);

  const setAppMode = useCallback((on: boolean) => setAppModeGlobal(on), []);
  const toggleAppMode = useCallback(() => toggleAppModeGlobal(), []);

  return { appMode, setAppMode, toggleAppMode };
}