import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Phone verification data — status, rate limiting, dev-fallback codes
// ---------------------------------------------------------------------------

/** Verification status for the signed-in user. */
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    return {
      phoneE164: user?.phoneE164 ?? null,
      phoneVerifiedAt: user?.phoneVerifiedAt ?? null,
    };
  },
});

/** Count verification attempts since `since` (rate limiting). */
export const recentAttempts = internalQuery({
  args: { userId: v.id("users"), since: v.number() },
  handler: async (ctx, { userId, since }) => {
    const rows = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.filter((r) => r.createdAt >= since).length;
  },
});

/** Record a verification attempt. */
export const recordAttempt = internalMutation({
  args: { userId: v.id("users"), phoneE164: v.string() },
  handler: async (ctx, { userId, phoneE164 }) => {
    await ctx.db.insert("phoneVerifications", {
      userId,
      phoneE164,
      status: "pending",
      provider: "twilio",
      channel: "sms",
      createdAt: Date.now(),
    });
  },
});

// --- Dev-fallback code storage (in-memory on the user row is fine for dev) --

const DEV_CODE_TTL_MS = 10 * 60 * 1000;

export const setDevCode = internalMutation({
  args: { userId: v.id("users"), code: v.string() },
  handler: async (ctx, { userId, code }) => {
    await ctx.db.patch(userId, {
      // Reuse vpnServerName-free fields: store dev code in a dedicated spot.
      // We keep it simple: stash on the user via phoneE164-agnostic fields.
      // (Dev-only; never set when Twilio is configured.)
      ...({ devOtpCode: code, devOtpAt: Date.now() } as Record<string, unknown>),
    });
  },
});

export const checkDevCode = internalMutation({
  args: { userId: v.id("users"), code: v.string() },
  handler: async (ctx, { userId, code }) => {
    const user = await ctx.db.get(userId);
    if (user === null) return false;
    const stored = (user as unknown as { devOtpCode?: string; devOtpAt?: number }).devOtpCode;
    const at = (user as unknown as { devOtpAt?: number }).devOtpAt ?? 0;
    if (!stored || Date.now() - at > DEV_CODE_TTL_MS) return false;
    return stored === code;
  },
});

/** Mark the user's phone as verified (public mutation used by the action). */
export const markVerified = internalMutation({
  args: { userId: v.id("users"), phoneE164: v.string() },
  handler: async (ctx, { userId, phoneE164 }) => {
    await ctx.db.patch(userId, {
      phoneE164,
      phoneVerifiedAt: Date.now(),
      ...({ devOtpCode: undefined, devOtpAt: undefined } as Record<string, unknown>),
    });
    // Mark the latest pending attempt verified.
    const attempts = await ctx.db
      .query("phoneVerifications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const pending = attempts
      .filter((a) => a.status === "pending")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (pending) {
      await ctx.db.patch(pending._id, { status: "verified", verifiedAt: Date.now() });
    }
  },
});

/** Unlink the verified phone (user-initiated). */
export const unlinkPhone = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    await ctx.db.patch(userId, {
      phoneE164: undefined,
      phoneVerifiedAt: undefined,
    });
  },
});
