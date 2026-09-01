import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register the current user's chat identity (handle + ECDH public key). */
export const registerIdentity = mutation({
  args: {
    handle: v.string(),
    publicKeyJwk: v.string(),
  },
  handler: async (ctx, { handle, publicKeyJwk }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    // Check handle uniqueness.
    const existing = await ctx.db
      .query("users")
      .withIndex("handle", (q) => q.eq("handle", handle))
      .first();
    if (existing !== null && existing._id !== userId) {
      throw new Error(`Handle "${handle}" is already taken`);
    }

    await ctx.db.patch(userId, { handle, publicKeyJwk });
  },
});

/** Generate a unique ghost handle suggestion (client calls before register). */
export const suggestHandle = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const user = await ctx.db.get(userId);
    if (user?.handle) return user.handle;

    // Generate a random suffix and check availability.
    for (let i = 0; i < 10; i++) {
      const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const candidate = `ghost-${suffix}`;
      const taken = await ctx.db
        .query("users")
        .withIndex("handle", (q) => q.eq("handle", candidate))
        .first();
      if (taken === null) return candidate;
    }
    // Extremely unlikely fallback.
    return `ghost-${Date.now().toString(16)}`;
  },
});

/** Look up a user by their chat handle (for starting a new conversation). */
export const findByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("handle", (q) => q.eq("handle", handle))
      .first();
    if (user === null) return null;
    return {
      userId: user._id,
      handle: user.handle,
      publicKeyJwk: user.publicKeyJwk ?? "",
      hasIdentity: user.publicKeyJwk !== undefined && user.publicKeyJwk !== null,
    };
  },
});

/** Get the current user's chat identity (or null if not registered). */
export const myIdentity = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (!user?.handle || !user?.publicKeyJwk) return null;
    return {
      userId: user._id,
      handle: user.handle,
      publicKeyJwk: user.publicKeyJwk,
    };
  },
});

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * Create a conversation. The client generates a random conversation key,
 * wraps it for each member using ECDH, and sends the envelopes here.
 * The server stores only wrapped keys — it cannot decrypt messages.
 */
export const createConversation = mutation({
  args: {
    members: v.array(
      v.object({
        userId: v.id("users"),
        handle: v.string(),
        publicKeyJwk: v.string(),
      }),
    ),
    keyEnvelopes: v.array(
      v.object({
        userId: v.id("users"),
        iv: v.string(),
        wrappedKey: v.string(),
      }),
    ),
  },
  handler: async (ctx, { members, keyEnvelopes }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    // The caller must be a member.
    if (!members.some((m) => m.userId === userId)) {
      throw new Error("Caller must be a member of the conversation");
    }

    const now = Date.now();
    return await ctx.db.insert("conversations", {
      members,
      keyEnvelopes,
      createdAt: now,
      lastMessageAt: now,
    });
  },
});

/** List conversations the current user belongs to, newest activity first. */
export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];

    const all = await ctx.db.query("conversations").collect();
    const mine = all.filter((c) => c.members.some((m) => m.userId === userId));

    // Fetch the latest message for each conversation.
    const results = await Promise.all(
      mine.map(async (c) => {
        const latest = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", c._id),
          )
          .order("desc")
          .first();

        return {
          _id: c._id,
          members: c.members,
          keyEnvelopes: c.keyEnvelopes,
          createdAt: c.createdAt,
          lastMessageAt: c.lastMessageAt ?? c.createdAt,
          latestMessage: latest
            ? {
                ciphertext: latest.ciphertext,
                iv: latest.iv,
                senderId: latest.senderId,
                createdAt: latest.createdAt,
              }
            : null,
        };
      }),
    );

    results.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    return results;
  },
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Send an encrypted message. The server stores only ciphertext. */
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    ciphertext: v.string(),
    iv: v.string(),
    // Disappearing messages: optional epoch-ms expiry.
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, ciphertext, iv, expiresAt }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const conv = await ctx.db.get(conversationId);
    if (conv === null) throw new Error("Conversation not found");
    if (!conv.members.some((m) => m.userId === userId)) {
      throw new Error("Not a member of this conversation");
    }

    const now = Date.now();
    await ctx.db.insert("messages", {
      conversationId,
      senderId: userId,
      ciphertext,
      iv,
      createdAt: now,
      expiresAt,
    });
    await ctx.db.patch(conversationId, { lastMessageAt: now });
  },
});

/** Subscribe to messages in a conversation, oldest first. */
export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const conv = await ctx.db.get(conversationId);
    if (conv === null) return [];
    if (!conv.members.some((m) => m.userId === userId)) {
      throw new Error("Not a member of this conversation");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("asc")
      .collect();

    const now = Date.now();
    return messages
      .filter((m) => m.expiresAt === undefined || m.expiresAt > now)
      .map((m) => ({
        _id: m._id,
        senderId: m.senderId,
        ciphertext: m.ciphertext,
        iv: m.iv,
        createdAt: m.createdAt,
        expiresAt: m.expiresAt,
      }));
  },
});
