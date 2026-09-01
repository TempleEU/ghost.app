# GhostChat.app

> **GitHub description:** 🔒 GhostChat — end-to-end encrypted messaging with disappearing messages, GhostVPN, biometric-gated keys and a privacy-first settings suite. Built with React, TypeScript, Tailwind and Convex.

**GhostChat** is a privacy-first encrypted messaging web app. Every message is sealed
on your device with **AES-256-GCM**, keys are derived on-device through **ECDH P-256**,
and the server only ever relays ciphertext and wrapped keys — it cannot read what you
send. Your identity is a **ghost handle** and an on-device keypair: no phone number,
no email required for the chat layer.

## ✨ Features

### Secure messaging
- 🔐 **End-to-end encryption** — AES-256-GCM with ECDH P-256 key agreement, sealed on-device
- 🔑 **Wrapped conversation keys** — each conversation key is sealed separately per member; the server never sees raw keys
- 💬 **Real-time delivery** — reactive subscriptions push messages instantly, no polling
- ⏳ **Disappearing messages** — per-conversation timer (Off / 1h / 24h / 7d), filtered server-side
- ↩️ **Replies & reactions** — quote any message; react with emoji, tally visible to everyone
- 👥 **Group-ready conversations** — try-each-member key unwrap supports DMs and groups

### Privacy & safety
- 🚫 **Blocking & reporting** — block any handle (their conversations are hidden) and report abuse
- 🛡️ **Verify keys** — compare per-contact key fingerprints out-of-band to detect MITM
- 🔔 **Privacy-focused notifications** — only when the tab is hidden, and the body never contains plaintext
- 📵 **Secure storage toggle** — choose whether encrypted history is backed up to the cloud or stays on-device

### Security alerts & devices
- 📱 **Device log** — see every device logged into your encrypted chats, keyed by fingerprint
- 🚪 **Remote logout** — revoke unfamiliar devices from Settings

### GhostVPN Service
- 🌐 **VPN settings** — on/off tunnel toggle with fastest-server auto-selection
- 🌍 **Server browser** — US, Europe, South America and Asia-Pacific endpoints
- 🔌 **Private VPN API** — point GhostVPN at your own WireGuard/OpenVPN manager

### Settings & profile
- 🎨 **Profile with attachable avatar** — display name + 96×96 avatar, stored client-resized
- 🌓 **Dark mode** — on/off/auto, follows your system preference by default

## 🧱 Tech stack

| Layer      | Tech                                      |
| ---------- | ----------------------------------------- |
| Frontend   | Vite · React 19 · TypeScript · Tailwind v4 |
| UI         | shadcn/ui · Lucide icons · Framer Motion   |
| Backend    | Convex (queries, mutations, reactive subs) |
| Auth       | Convex Auth (email OTP, anonymous)         |
| Crypto     | WebCrypto (ECDH P-256, AES-256-GCM, PBKDF2) |

## 🚀 Getting started

```bash
bun install
bun dev            # Vite dev server + Convex dev
```

## 🔐 How the encryption works

1. **Identity** — on first run the app generates an ECDH P-256 keypair. The private key
   is wrapped with PBKDF2 (310,000 iterations) from your passphrase and stored only in
   your browser. The server receives the public key and your handle — nothing else.
2. **Conversations** — the creator generates a random 256-bit conversation key and wraps
   it once per member (ECDH-derived KEK). Members unwrap it with their own private key.
3. **Messages** — every message is sealed with AES-256-GCM using the conversation key.
   The server stores ciphertext, IVs and wrapped keys only.

> ⚠️ Your passphrase is unrecoverable. If you lose it, your messages cannot be
> decrypted on that device — there is no backdoor by design.

## 🗂️ Project structure

```
src/
├── convex/            # Convex backend (schema, chat, settings, auth)
├── pages/             # Landing, Auth, Chat, Dashboard, NotFound
├── components/        # SettingsDialog (profile/storage/security/keys/VPN) + ui/
├── lib/               # crypto.ts — E2E identity, key wrapping, message crypto
└── hooks/             # use-auth, use-mobile
```

## ⚙️ Development notes

- Use **bun** as the package manager.
- All Convex functions live in `src/convex/`; push them with `bunx convex dev`.
- Auth is pre-wired with **email OTP** and **anonymous** providers via Convex Auth
  (`src/convex/auth.ts`). Environment variables `CONVEX_DEPLOYMENT` and
  `VITE_CONVEX_URL` are already configured on the client; the backend has its own
  auth keys (JWKS, JWT_PRIVATE_KEY, SITE_URL).
- Frontend typecheck: `bunx tsc -b --noEmit` · Backend push: `bunx convex dev --once`
