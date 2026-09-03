import { useCallback, useEffect, useState } from "react";
import { storageGet, storageSet } from "@/lib/storage";

const STORAGE_KEY = "ghostchat-appmode";

/**
 * App Mode — an on/off switch (not desktop-view-only). When ON, GhostWeb
 * renders as a phone-style app frame (compact sidebar, full-height layout).
 * When OFF, it renders the full desktop layout. Persisted per device
 * (localStorage on web, Capacitor Preferences in the native apps).
 */
export function useAppMode() {
  const [appMode, setAppModeState] = useState(false);

  useEffect(() => {
    let active = true;
    storageGet(STORAGE_KEY).then((value) => {
      if (active) setAppModeState(value === "on");
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    storageSet(STORAGE_KEY, appMode ? "on" : "off");
  }, [appMode]);

  const setAppMode = useCallback((on: boolean) => setAppModeState(on), []);
  const toggleAppMode = useCallback(() => setAppModeState((v) => !v), []);

  return { appMode, setAppMode, toggleAppMode };
}