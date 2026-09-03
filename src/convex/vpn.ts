import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// GhostVPN access keys — Outline (ss://), VLESS and VMess
// ---------------------------------------------------------------------------

/** List the signed-in user's saved access keys, newest first. */
export const listKeys = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("vpnKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Add one parsed key. `raw` must be a valid ss://, vless:// or vmess:// URI. */
export const addKey = mutation({
  args: {
    kind: v.string(),
    name: v.string(),
    host: v.string(),
    port: v.number(),
    method: v.optional(v.string()),
    raw: v.string(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, key) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    if (!/^(ss|vless|vmess):\/\//.test(key.raw)) {
      throw new Error("Unsupported key format");
    }

    // Dedupe on identical raw URI.
    const existing = await ctx.db
      .query("vpnKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (existing.some((k) => k.raw === key.raw)) return null;

    return await ctx.db.insert("vpnKeys", {
      userId,
      kind: key.kind,
      name: key.name,
      host: key.host,
      port: key.port,
      method: key.method,
      raw: key.raw,
      source: key.source,
      createdAt: Date.now(),
    });
  },
});

/** Remove a key. */
export const removeKey = mutation({
  args: { keyId: v.id("vpnKeys") },
  handler: async (ctx, { keyId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const key = await ctx.db.get(keyId);
    if (key === null || key.userId !== userId) {
      throw new Error("Key not found");
    }
    await ctx.db.delete(keyId);
  },
});

/**
 * Fetch a subscription URL (server-side, to avoid CORS) and return its body
 * as text for client-side parsing. Subscription bodies are either plaintext
 * key lists or base64-encoded key lists — both handled by parseKeyBlob.
 */
export const fetchSubscription = action({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Invalid URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Only http(s) subscription URLs are supported");
    }

    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "GhostWeb/1.0 (subscription client)" },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Subscription fetch failed: HTTP ${res.status}`);
    }
    const text = await res.text();
    if (text.length > 512 * 1024) {
      throw new Error("Subscription too large (max 512 KB)");
    }
    return text;
  },
});
