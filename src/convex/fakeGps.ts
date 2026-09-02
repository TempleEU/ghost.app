import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Fake GPS Location — saved favorite spots
// ---------------------------------------------------------------------------

/** List the signed-in user's favorite locations, newest first. */
export const listFavorites = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("fakeGpsFavorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Save a favorite location (deduped on rounded coordinates). */
export const addFavorite = mutation({
  args: {
    label: v.string(),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, { label, lat, lng }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const existing = await ctx.db
      .query("fakeGpsFavorites")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    // Dedupe on ~11m grid.
    const key = (n: number) => Math.round(n * 100000);
    if (existing.some((f) => key(f.lat) === key(lat) && key(f.lng) === key(lng))) {
      return null;
    }

    return await ctx.db.insert("fakeGpsFavorites", {
      userId,
      label: label.trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      lat,
      lng,
      createdAt: Date.now(),
    });
  },
});

/** Remove a favorite location. */
export const removeFavorite = mutation({
  args: { favoriteId: v.id("fakeGpsFavorites") },
  handler: async (ctx, { favoriteId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const fav = await ctx.db.get(favoriteId);
    if (fav === null || fav.userId !== userId) {
      throw new Error("Favorite not found");
    }
    await ctx.db.delete(favoriteId);
  },
});
