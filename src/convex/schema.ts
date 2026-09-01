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
    }).index("email", ["email"]) // index for the email. do not remove or modify
      .index("handle", ["handle"]),

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
    }).index("by_conversation", ["conversationId", "createdAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
