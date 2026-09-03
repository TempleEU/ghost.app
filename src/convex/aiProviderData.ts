import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// AI provider config — data layer (queries/mutations, V8 runtime).
// The Node actions in aiProvider.ts call these via ctx.runQuery/runMutation.
// ---------------------------------------------------------------------------

/** Read the stored config (any signed-in user; API key masked). */
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query("aiProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    const mask = (s: string) =>
      s.length <= 4 ? "••••" : `${s.slice(0, 4)}••••${s.slice(-4)}`;
    if (row === null) {
      return {
        configured: false as const,
        enabled: false,
        preset: null,
        baseUrl: null,
        model: null,
        apiKeyMasked: null,
        keyless: false,
        validatedAt: null,
        updatedAt: null,
      };
    }
    return {
      configured: true as const,
      enabled: row.enabled,
      preset: row.preset,
      baseUrl: row.baseUrl,
      model: row.model,
      apiKeyMasked: row.apiKey ? mask(row.apiKey) : null,
      keyless: row.apiKey === "",
      validatedAt: row.validatedAt ?? null,
      updatedAt: row.updatedAt,
    };
  },
});

/** Toggle AI features on/off (config must already be validated). */
export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const row = await ctx.db
      .query("aiProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row === null) throw new Error("No AI provider config saved yet.");
    if (enabled && row.validatedAt === undefined) {
      throw new Error("Config has never passed validation — save with valid settings first.");
    }
    await ctx.db.patch(row._id, { enabled, updatedBy: userId, updatedAt: Date.now() });
  },
});

/** Delete the stored config entirely (key removed from server). */
export const clearConfig = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const row = await ctx.db
      .query("aiProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row !== null) await ctx.db.delete(row._id);
  },
});

// --- internal helpers for Node actions -------------------------------------

/** Raw credential read — only for server-side AI actions. */
export const getRaw = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("aiProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
  },
});

/** Upsert the singleton config row. */
export const upsert = internalMutation({
  args: {
    preset: v.string(),
    baseUrl: v.string(),
    model: v.string(),
    apiKey: v.string(), // "" = keyless
    enabled: v.boolean(),
    validatedAt: v.optional(v.number()),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("aiProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row === null) {
      await ctx.db.insert("aiProviderConfig", {
        ...args,
        singleton: true,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(row._id, { ...args, updatedAt: Date.now() });
    }
  },
});

/**
 * Resolver for ai.ts actions: enabled + validated config only. Returns raw
 * credentials; internal only.
 */
export const resolveActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("aiProviderConfig")
      .filter((q) => q.eq(q.field("singleton"), true))
      .first();
    if (row === null || !row.enabled || row.validatedAt === undefined) return null;
    return { preset: row.preset, baseUrl: row.baseUrl, model: row.model, apiKey: row.apiKey };
  },
});
