import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Live SMS provider config — data layer (queries/mutations, V8 runtime).
// The Node actions in smsProvider.ts call these via ctx.runQuery/runMutation.
// ---------------------------------------------------------------------------

/** Read the stored config (any signed-in user; secrets masked). */
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("smsProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row === null) {
      return {
        configured: false as const,
        enabled: false,
        accountSidMasked: null,
        verifyServiceSidMasked: null,
        senderPhoneNumber: null,
        validatedAt: null,
        updatedAt: null,
      };
    }
    const mask = (s: string) =>
      s.length <= 4 ? "••••" : `${s.slice(0, 2)}••••${s.slice(-4)}`;
    return {
      configured: true as const,
      enabled: row.enabled,
      accountSidMasked: mask(row.accountSid),
      verifyServiceSidMasked: mask(row.verifyServiceSid),
      senderPhoneNumber: row.senderPhoneNumber ?? null,
      validatedAt: row.validatedAt ?? null,
      updatedAt: row.updatedAt,
    };
  },
});

/** Toggle live delivery on/off (config must already be validated). */
export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const row = await ctx.db
      .query("smsProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row === null) throw new Error("No provider config saved yet.");
    if (enabled && row.validatedAt === undefined) {
      throw new Error("Config has never passed validation — save with valid keys first.");
    }
    await ctx.db.patch(row._id, { enabled, updatedBy: userId, updatedAt: Date.now() });
  },
});

/** Delete the stored config entirely (keys removed from server). */
export const clearConfig = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const row = await ctx.db
      .query("smsProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row !== null) await ctx.db.delete(row._id);
  },
});

// --- internal helpers for Node actions -------------------------------------

/** Raw credential read — only for server-side actions that send SMS. */
export const getRaw = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("smsProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
  },
});

/** Upsert the singleton config row. */
export const upsert = internalMutation({
  args: {
    accountSid: v.string(),
    authToken: v.string(),
    verifyServiceSid: v.string(),
    senderPhoneNumber: v.optional(v.string()),
    enabled: v.boolean(),
    validatedAt: v.optional(v.number()),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("smsProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row === null) {
      await ctx.db.insert("smsProviderConfig", {
        ...args,
        singleton: true,
        provider: "twilio" as const,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(row._id, { ...args, updatedAt: Date.now() });
    }
  },
});

/**
 * Resolver for phoneVerify: stored DB config first (if enabled+validated),
 * else null → env vars → dev fallback. Returns raw secrets; internal only.
 */
export const resolveCreds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("smsProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row !== null && row.enabled && row.validatedAt !== undefined) {
      return {
        source: "db" as const,
        accountSid: row.accountSid,
        authToken: row.authToken,
        verifyServiceSid: row.verifyServiceSid,
        senderPhoneNumber: row.senderPhoneNumber,
      };
    }
    return null;
  },
});
