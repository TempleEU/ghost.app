# Ghost.app

> **Private by design. Secure by default.**

**Ghost.app** is a privacy-first encrypted messaging application for the web, designed around client-side cryptography, minimal server knowledge and user-controlled identity.

**Project:** https://github.com/TempleEU/ghost.app

## Platform status

| Platform | Status |
|---|---|
| Web / PWA | **Available** (installable on Android & iOS home screens) |
| Android | **Native app** — Capacitor project in `android/` |
| iOS | **Native app** — Capacitor project in `ios/` |
| macOS | Installable as a PWA today; native packaging next |
| Windows | Installable as a PWA today; native packaging next |
| Linux | Installable as a PWA today; native packaging next |

Ghost.app ships as a web app that is wrapped into native Android and iOS applications with **Capacitor** — one shared codebase (Vite · React · Convex) for every outlet.

## Highlights

- End-to-end encrypted conversations
- AES-256-GCM message encryption
- ECDH P-256 key agreement
- Per-conversation key wrapping
- Real-time message delivery
- Disappearing messages
- Replies and reactions
- Group-ready conversations
- Key fingerprint verification
- Blocking and reporting
- Privacy-focused notifications
- Device/session visibility and remote logout
- Optional encrypted storage controls
- GhostVPN service integration
- Profile and avatar support
- Dark mode

## Security model

Identity keys are generated on the client. Conversation keys are wrapped for individual members, while messages are encrypted before they leave the client.

The project uses WebCrypto for its cryptographic primitives. Security-sensitive functionality should rely on established platform cryptography and reviewed protocols rather than custom cryptographic algorithms.

> **Important:** a user's encryption passphrase is intentionally unrecoverable. Losing it can make locally protected messages inaccessible.

## Technology

| Layer | Technology |
|---|---|
| Frontend | Vite · React · TypeScript · Tailwind CSS |
| UI | shadcn/ui · Lucide · Framer Motion |
| Backend | Convex |
| Authentication | Convex Auth |
| Cryptography | WebCrypto · ECDH P-256 · AES-256-GCM · PBKDF2 |
| Package manager | Bun |

## Development

```bash
bun install
bun dev
```

Useful verification commands:

```bash
bunx tsc -b --noEmit
bunx convex dev --once
```

## Mobile apps (Android & iOS)

The native projects live in `android/` and `ios/` and are generated from the web build with Capacitor:

```bash
bun run build       # build the web app into dist/
bun run cap:sync    # copy dist/ into the native projects
bun run cap:android # open the project in Android Studio -> Run on device/emulator
bun run cap:ios     # open the project in Xcode (macOS only) -> Run
```

Regenerate the app icon / PWA icon set from `public/logo.svg`:

```bash
bun run icons
```

### First-time native setup

- **Android**: install [Android Studio](https://developer.android.com/studio) (SDK + a device/emulator), then run `bun run cap:android`.
- **iOS**: requires macOS + Xcode. The bundle ID is `app.ghost.chat` (change it in `capacitor.config.ts` before store submission).
- **Push notifications**: `@capacitor/push-notifications` is wired in `src/hooks/use-push-notifications.ts` — the native app asks permission, registers, and opens Chat on notification tap. Real delivery needs Firebase Cloud Messaging (Android) and APNs (iOS) config; without it the app registers cleanly but no remote push arrives. The web app keeps using the in-app Notification API.

### Enabling real push delivery

The code and native projects are already configured — only the Firebase/Apple side needs your accounts:

- **Android (FCM)** — the Gradle projects already apply `com.google.gms.google-services` (conditionally, so builds still pass without the file). Go to the [Firebase console](https://console.firebase.google.com) → *Add app* → *Android* with package name `app.ghost.chat`, download `google-services.json`, and drop it into `android/app/`. That's it — the app already requests `POST_NOTIFICATIONS` and registers via FCM.
- **iOS (APNs)** — the Xcode project now has the **Push Notifications capability** (`App.entitlements` with `aps-environment`, wired into both build configs). In Xcode: enable the *Push Notifications* capability if prompted, then in the [Apple Developer portal](https://developer.apple.com/account) create an **APNs Auth Key** (or certificate) and upload it to the Firebase project's *Cloud Messaging* tab. (The Capacitor plugin registers with APNs directly, so iOS tokens only receive FCM-delivered pushes once the Firebase iOS SDK is wired in — Android is fully end-to-end.)
- **Server credentials** — paste the Firebase **service account JSON** (`Firebase console → Project settings → Service accounts → Generate new private key`) into the `FIREBASE_SERVICE_ACCOUNT` env var (Keys tab). The Convex action in `src/convex/pushSender.ts` uses it to send via FCM HTTP v1.
- **Send a test** — in the native app: *Settings → Apps* has a **Send test push** button that delivers to every device registered to your account (tokens are stored via `src/convex/push.ts` when the app registers). Or use the Firebase console's *Cloud Messaging → Send test message* with the device token.
- **On-device storage**: `@capacitor/preferences` backs `src/lib/storage.ts`, so wrapped encryption keys and app settings persist in durable native storage on Android/iOS instead of webview localStorage. Web keeps using localStorage.

### Installable web app (PWA)

`public/manifest.webmanifest` plus the generated PNG icons make the site installable — on Android via Chrome (*Add to Home screen*) and on iOS via Safari (*Share → Add to Home Screen*). Regenerate icons with `bun run icons`.

## Project structure

```text
src/
├── convex/       # Backend schema, chat, settings and auth
├── pages/        # Landing, authentication, chat and dashboard
├── components/   # Application UI and settings
├── lib/          # Client-side cryptography and utilities
└── hooks/        # Application hooks
```

## Ghost ecosystem

Ghost.app is part of the broader Ghost privacy ecosystem. The Android project is maintained separately as **Ghostly Android**, while this repository's Capacitor setup covers Android, iOS and PWA installs from the same codebase.

## Contributing

Security reviews, bug reports, usability improvements and thoughtful pull requests are welcome.

**Repository:** https://github.com/TempleEU/ghost.app

## License

See the repository's license and legal files for the applicable terms.

## Disclaimer

Ghost.app is an independently developed project. Users should independently evaluate the software, implementation and security model before relying on it for sensitive communications.

---

**Ghost.app**  
Private communication. Minimal exposure. Open development.
