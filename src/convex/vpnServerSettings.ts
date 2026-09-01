import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Saved GhostVPN Server Hub connection (per user)
// ---------------------------------------------------------------------------

/** Get the saved Outline management API connection, if any. */
export const getServer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null || !user.vpnServerApiUrl) return null;
    return {
      apiUrl: user.vpnServerApiUrl,
      certSha256: user.vpnServerCertSha256 ?? "",
      name: user.vpnServerName ?? "Outline server",
      verified: user.vpnServerVerified ?? false,
    };
  },
});

/** Save (or update) the Outline management API connection after a test. */
export const saveServer = mutation({
  args: {
    apiUrl: v.string(),
    certSha256: v.string(),
    name: v.optional(v.string()),
    verified: v.boolean(),
  },
  handler: async (ctx, { apiUrl, certSha256, name, verified }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    await ctx.db.patch(userId, {
      vpnServerApiUrl: apiUrl,
      vpnServerCertSha256: certSha256,
      vpnServerName: name,
      vpnServerVerified: verified,
    });
  },
});

/** Forget the saved Outline management API connection. */
export const clearServer = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    await ctx.db.patch(userId, {
      vpnServerApiUrl: undefined,
      vpnServerCertSha256: undefined,
      vpnServerName: undefined,
      vpnServerVerified: undefined,
    });
  },
});
