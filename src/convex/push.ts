import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Push registration tokens.
//
// The native app (Capacitor) registers with FCM/APNs and hands the token here
// so the server can deliver remote notifications (see pushSender.ts for the
// actual send). Tokens are upserted per device token — re-registrations just
// refresh the owner + last-seen timestamp.
// ---------------------------------------------------------------------------

export const saveDeviceToken = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("android"), v.literal("ios"), v.literal("web")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { saved: false as const, reason: "not-signed-in" as const };

    const token = args.token.trim();
    if (token.length < 20) {
      return { saved: false as const, reason: "invalid-token" as const };
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (existing) {
      if (existing.userId !== userId || existing.platform !== args.platform) {
        await ctx.db.patch(existing._id, {
          userId,
          platform: args.platform,
          lastSeenAt: now,
        });
      } else {
        await ctx.db.patch(existing._id, { lastSeenAt: now });
      }
      return { saved: true as const, reason: "updated" as const };
    }

    await ctx.db.insert("pushTokens", {
      userId,
      platform: args.platform,
      token,
      registeredAt: now,
      lastSeenAt: now,
    });
    return { saved: true as const, reason: "registered" as const };
  },
});

/**
 * Tokens registered by the current user, newest first. Actions (which cannot
 * touch the DB directly) read this via ctx.runQuery.
 */
export const listMyPushTokens = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});