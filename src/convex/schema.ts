import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // GhostChat E2E identity (v1)
      handle: v.optional(v.string()), // public chat handle, e.g. ghost-7f3a9c
      publicKeyJwk: v.optional(v.string()), // ECDH P-256 public key (JSON JWK)

      // Profile settings
      displayName: v.optional(v.string()),
      avatar: v.optional(v.string()), // data URL (resized client-side, <= ~20KB)

      // Message storage: when false, chats are NOT backed up to the cloud
      // (history stays on-device); when true, ciphertext is backed up.
      secureStorage: v.optional(v.boolean()),

      // GhostVPN settings (client-side connection preferences).
      vpnEnabled: v.optional(v.boolean()),
      vpnMode: v.optional(v.string()), // "fastest" | "manual"
      vpnServer: v.optional(v.string()), // manual server id
      vpnPrivateApiUrl: v.optional(v.string()), // optional private VPN API endpoint
      vpnKillSwitch: v.optional(v.boolean()), // block traffic if tunnel drops
      vpnAutoConnect: v.optional(v.boolean()), // auto-connect on app start
      vpnProtocol: v.optional(v.string()), // "wireguard" | "openvpn" | "ikev2"

      // Display & Brightness / App Mode (per-account preferences; local
      // toggles are also mirrored in localStorage for instant boot).
      theme: v.optional(v.string()), // "light" | "dark" | "system"
      appMode: v.optional(v.boolean()), // phone-style app frame on/off

      // GhostVPN Server Hub — Outline management API connection
      vpnServerApiUrl: v.optional(v.string()), // e.g. https://1.2.3.4:port/xxxxx
      vpnServerCertSha256: v.optional(v.string()), // API cert fingerprint
      vpnServerName: v.optional(v.string()),
      vpnServerVerified: v.optional(v.boolean()), // connection test passed

      // Fake GPS Location — spoofing configuration consumed by the native
      // GhostChat companion (mock location on Android, Xcode/CoreLocation
      // simulation on iOS/macOS, geolocation override on Windows browsers).
      fakeGpsEnabled: v.optional(v.boolean()),
      fakeGpsLat: v.optional(v.number()),
      fakeGpsLng: v.optional(v.number()),
      fakeGpsLabel: v.optional(v.string()), // e.g. "Tokyo Station"
      fakeGpsJitter: v.optional(v.number()), // meters of accuracy variance
    }).index("email", ["email"]) // index for the email. do not remove or modify
      .index("handle", ["handle"]),

    // Security alerts: devices currently logged into end-to-end encrypted chats.
    devices: defineTable({
      userId: v.id("users"),
      label: v.string(), // e.g. "Windows · Chrome 126"
      keyFingerprint: v.string(), // SHA-256 of the device's identity public key
      firstSeenAt: v.number(),
      lastSeenAt: v.number(),
      revoked: v.optional(v.boolean()),
    }).index("by_user", ["userId", "lastSeenAt"]),

    // GhostChat v1: conversations with per-member wrapped keys (server never
    // sees plaintext or unwrapped keys).
    conversations: defineTable({
      // Denormalized member snapshots so the client can unwrap without extra joins.
      members: v.array(
        v.object({
          userId: v.id("users"),
          handle: v.string(),
          publicKeyJwk: v.string(),
        }),
      ),
      // One envelope per member: the conversation key wrapped with an ECDH-derived KEK.
      keyEnvelopes: v.array(
        v.object({
          userId: v.id("users"),
          iv: v.string(), // base64
          wrappedKey: v.string(), // base64 AES-GCM ciphertext of the raw conversation key
        }),
      ),
      createdAt: v.number(),
      lastMessageAt: v.optional(v.number()),
    })
      .index("by_member", ["members"])
      .index("by_lastMessage", ["lastMessageAt"]),

    messages: defineTable({
      conversationId: v.id("conversations"),
      senderId: v.id("users"),
      ciphertext: v.string(), // base64 AES-GCM ciphertext (plaintext never reaches server)
      iv: v.string(), // base64 nonce
      createdAt: v.number(),
      // Disappearing messages: epoch ms after which clients hide the message.
      // Enforcement is client-side; server cleanup is lazy.
      expiresAt: v.optional(v.number()),
      // Reply threading: parent message id.
      replyToId: v.optional(v.id("messages")),
      // Reactions: emoji -> list of user ids who reacted.
      reactions: v.optional(v.record(v.string(), v.array(v.id("users")))),
    }).index("by_conversation", ["conversationId", "createdAt"]),

    // Blocking & reporting (privacy & safety controls).
    blocks: defineTable({
      blockerId: v.id("users"),
      blockedId: v.id("users"),
      createdAt: v.number(),
    }).index("by_blocker", ["blockerId"]),

    reports: defineTable({
      reporterId: v.id("users"),
      reportedHandle: v.string(), // handle snapshot; reported user may have no account
      reason: v.string(),
      createdAt: v.number(),
    }).index("by_reporter", ["reporterId"]),

    // GhostVPN access keys (Outline ss://, VLESS, VMess). The key material is
    // the user's own; the server stores it so their devices share the list.
    vpnKeys: defineTable({
      userId: v.id("users"),
      kind: v.string(), // "ss" | "vless" | "vmess"
      name: v.string(),
      host: v.string(),
      port: v.number(),
      method: v.optional(v.string()),
      raw: v.string(), // full original URI for import into native clients
      source: v.optional(v.string()), // "paste" | subscription URL | "outline:<serverId>"
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

    // SMS Gateway devices — phones running an SMS-gateway app that POSTs
    // incoming SMS to GhostChat. One API key per device.
    smsDevices: defineTable({
      userId: v.id("users"),
      label: v.string(), // e.g. "Pixel 8 — bedside phone"
      apiKey: v.string(), // random hex, sent as x-ghostchat-key header
      createdAt: v.number(),
      lastSeenAt: v.optional(v.number()),
      revoked: v.optional(v.boolean()),
    })
      .index("by_user", ["userId", "createdAt"])
      .index("by_apiKey", ["apiKey"]),

    // Ingested SMS messages from gateway devices. Payload matches the
    // react-native-sms-gateway POST body: { msg, timestamp, phoneNumber, sender }
    smsMessages: defineTable({
      deviceId: v.id("smsDevices"),
      userId: v.id("users"),
      sender: v.string(),
      body: v.string(),
      phoneNumber: v.optional(v.string()), // gateway phone's own number
      deviceTimestamp: v.optional(v.number()),
      receivedAt: v.number(),
    }).index("by_user", ["userId", "receivedAt"]),

    // Fake GPS Location — saved favorite spots.
    fakeGpsFavorites: defineTable({
      userId: v.id("users"),
      label: v.string(),
      lat: v.number(),
      lng: v.number(),
      createdAt: v.number(),
    }).index("by_user", ["userId", "createdAt"]),

  },
  {
    schemaValidation: false,
  },
);

export default schema;
