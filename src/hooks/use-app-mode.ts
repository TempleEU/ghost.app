import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ghostchat-appmode";

/**
 * App Mode — an on/off switch (not desktop-view-only). When ON, GhostChat
 * renders as a phone-style app frame (compact sidebar, full-height layout).
 * When OFF, it renders the full desktop layout. Persisted per device.
 */
export function useAppMode() {
  const [appMode, setAppModeState] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY) === "on";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, appMode ? "on" : "off");
  }, [appMode]);

  const setAppMode = useCallback((on: boolean) => setAppModeState(on), []);
  const toggleAppMode = useCallback(() => setAppModeState((v) => !v), []);

  return { appMode, setAppMode, toggleAppMode };
}
