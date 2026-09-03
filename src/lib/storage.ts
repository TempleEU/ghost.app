import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/**
 * Cross-platform key-value storage.
 *
 * - Native (Android/iOS Capacitor app): @capacitor/preferences — durable
 *   native storage that survives webview data resets.
 * - Web / PWA: localStorage.
 *
 * The API is async so one code path serves both platforms.
 */
const native = Capacitor.isNativePlatform();

export async function storageGet(key: string): Promise<string | null> {
  if (native) {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }
  return localStorage.getItem(key);
}

export async function storageSet(key: string, value: string): Promise<void> {
  if (native) {
    await Preferences.set({ key, value });
    return;
  }
  localStorage.setItem(key, value);
}

export async function storageRemove(key: string): Promise<void> {
  if (native) {
    await Preferences.remove({ key });
    return;
  }
  localStorage.removeItem(key);
}