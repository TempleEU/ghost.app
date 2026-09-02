# Ghost.app

> **Private by design. Secure by default.**

**Ghost.app** is a privacy-first encrypted messaging application for the web, designed around client-side cryptography, minimal server knowledge and user-controlled identity.

**Project:** https://github.com/TempleEU/ghost.app

## Platform status

| Platform | Status |
|---|---|
| Web | **Available** |
| Android | In development / integration |
| iOS | In development |
| macOS | In development |
| Windows | In development |
| Linux | In development |

The current Ghost.app implementation is web-based. Broader platform compatibility is being developed progressively.

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

Ghost.app is part of the broader Ghost privacy ecosystem. The Android project is maintained separately as **Ghostly Android**, with cross-platform development continuing toward iOS, macOS, Windows and Linux.

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
