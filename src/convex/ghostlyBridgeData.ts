import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Ghostly bridge — data layer (queries/mutations, V8 runtime).
// Node HTTP actions in ghostlyBridge.ts call these via ctx.runQuery/runMutation.
// ---------------------------------------------------------------------------

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** List the signed-in user's paired companion devices. */
export const listDevices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("companionDevices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/**
 * Create a pairing: returns a short-lived 8-char code that the companion
 * app scans/enters. The code is exchanged (server-side) for a deviceKey.
 */
export const createPairing = mutation({
  args: { label: v.string(), platform: v.optional(v.string()) },
  handler: async (ctx, { label, platform }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    // Rate limit: max 5 pending pairings.
    const existing = await ctx.db
      .query("companionDevices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const pending = existing.filter(
      (d) => !d.claimedAt && d.pairingExpiresAt > Date.now() && !d.revoked,
    );
    if (pending.length >= 5) {
      throw new Error("Too many pending pairings — remove an old one first.");
    }

    const pairingCode = randomHex(4).toUpperCase(); // 8 hex chars
    const id = await ctx.db.insert("companionDevices", {
      userId,
      label: label.trim() || "Ghostly device",
      platform,
      pairingCode,
      pairingExpiresAt: Date.now() + 10 * 60 * 1000, // 10 min
    });
    return { deviceId: id, pairingCode, expiresAt: Date.now() + 10 * 60 * 1000 };
  },
});

/** Revoke a companion device. Its deviceKey stops working immediately. */
export const revokeDevice = mutation({
  args: { deviceId: v.id("companionDevices") },
  handler: async (ctx, { deviceId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const device = await ctx.db.get(deviceId);
    if (device === null || device.userId !== userId) {
      throw new Error("Device not found");
    }
    await ctx.db.patch(deviceId, { revoked: true });
  },
});

/** Rename a companion device. */
export const renameDevice = mutation({
  args: { deviceId: v.id("companionDevices"), label: v.string() },
  handler: async (ctx, { deviceId, label }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const device = await ctx.db.get(deviceId);
    if (device === null || device.userId !== userId) {
      throw new Error("Device not found");
    }
    await ctx.db.patch(deviceId, { label: label.trim() || device.label });
  },
});

// --- internal helpers for HTTP actions --------------------------------------

/** Resolve a pairing code to its row (valid, unclaimed, unexpired). */
export const getByPairingCode = internalQuery({
  args: { pairingCode: v.string() },
  handler: async (ctx, { pairingCode }) => {
    const rows = await ctx.db
      .query("companionDevices")
      .filter((q) => q.eq(q.field("pairingCode"), pairingCode.toUpperCase()))
      .collect();
    return rows[0] ?? null;
  },
});

/** Claim a pairing: mint the long-term deviceKey. */
export const claimPairing = internalMutation({
  args: { deviceId: v.id("companionDevices") },
  handler: async (ctx, { deviceId }) => {
    const deviceKey = "gc_" + randomHex(24);
    await ctx.db.patch(deviceId, {
      deviceKey,
      claimedAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    return deviceKey;
  },
});

/** Resolve a deviceKey to its row (claimed, unrevoked). */
export const getByDeviceKey = internalQuery({
  args: { deviceKey: v.string() },
  handler: async (ctx, { deviceKey }) => {
    const rows = await ctx.db
      .query("companionDevices")
      .filter((q) => q.eq(q.field("deviceKey"), deviceKey))
      .collect();
    return rows[0] ?? null;
  },
});

/** Touch last-seen + record keys sync marker. */
export const touchAndMarkSync = internalMutation({
  args: { deviceId: v.id("companionDevices"), markKeysSynced: v.boolean() },
  handler: async (ctx, { deviceId, markKeysSynced }) => {
    const patch: Record<string, unknown> = { lastSeenAt: Date.now() };
    if (markKeysSynced) patch.keysSyncedAt = Date.now();
    await ctx.db.patch(deviceId, patch);
  },
});
