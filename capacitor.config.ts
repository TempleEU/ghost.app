import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor wraps the Vite web build (dist/) into native Android/iOS apps.
// - Web app:      bun run dev            -> http://localhost:5173
// - Native sync:  bun run build && bun run cap:sync
// - Android:      bun run cap:android    (opens Android Studio)
// - iOS:          bun run cap:ios        (opens Xcode, macOS only)
const config: CapacitorConfig = {
  appId: "app.ghost.chat",
  appName: "GhostChat",
  webDir: "dist",
  androidScheme: "https",
  backgroundColor: "#232323",
  ios: {
    contentInset: "always",
  },
};

export default config;