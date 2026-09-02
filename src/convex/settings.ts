import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Profile settings (Menu > Settings > Profile)
// ---------------------------------------------------------------------------

/** Update display name and/or avatar (data URL, resized client-side). */
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    avatar: v.optional(v.string()),
  },
  handler: async (ctx, { displayName, avatar }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const patch: Record<string, string> = {};
    if (displayName !== undefined) patch.displayName = displayName;
    if (avatar !== undefined) patch.avatar = avatar;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(userId, patch);
  },
});

/**
 * GhostVPN settings (Menu > Settings > GhostVPN Service).
 */
export const setVpnSettings = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    mode: v.optional(v.string()), // "fastest" | "manual"
    server: v.optional(v.string()), // server id ("auto" for fastest)
    privateApiUrl: v.optional(v.string()), // optional private VPN API endpoint
    killSwitch: v.optional(v.boolean()), // block traffic if tunnel drops
    autoConnect: v.optional(v.boolean()), // auto-connect on app start
    protocol: v.optional(v.string()), // "wireguard" | "openvpn" | "ikev2"
  },
  handler: async (
    ctx,
    { enabled, mode, server, privateApiUrl, killSwitch, autoConnect, protocol },
  ) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const patch: Record<string, unknown> = {};
    if (enabled !== undefined) patch.vpnEnabled = enabled;
    if (mode !== undefined) patch.vpnMode = mode;
    if (server !== undefined) patch.vpnServer = server;
    if (privateApiUrl !== undefined) patch.vpnPrivateApiUrl = privateApiUrl;
    if (killSwitch !== undefined) patch.vpnKillSwitch = killSwitch;
    if (autoConnect !== undefined) patch.vpnAutoConnect = autoConnect;
    if (protocol !== undefined) patch.vpnProtocol = protocol;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(userId, patch);
  },
});

/**
 * Display & Brightness + App Mode (Menu > Settings).
 * These are per-account preferences; the client also mirrors them in
 * localStorage so the correct theme/app frame applies before first paint.
 */
export const setDisplaySettings = mutation({
  args: {
    theme: v.optional(v.string()), // "light" | "dark" | "system"
    appMode: v.optional(v.boolean()),
  },
  handler: async (ctx, { theme, appMode }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const patch: Record<string, unknown> = {};
    if (theme !== undefined) patch.theme = theme;
    if (appMode !== undefined) patch.appMode = appMode;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(userId, patch);
  },
});

/**
 * Fake GPS Location (Menu > Settings > GhostVPN > Fake GPS Location).
 * Stores the spoofing configuration the native GhostChat companion consumes
 * via Android mock location, Xcode/CoreLocation simulation on iOS/macOS, or
 * a geolocation override on Windows browsers.
 */
export const setFakeGps = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    label: v.optional(v.string()),
    jitter: v.optional(v.number()), // meters of accuracy variance
  },
  handler: async (ctx, { enabled, lat, lng, label, jitter }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const patch: Record<string, unknown> = {};
    if (enabled !== undefined) patch.fakeGpsEnabled = enabled;
    if (lat !== undefined) patch.fakeGpsLat = lat;
    if (lng !== undefined) patch.fakeGpsLng = lng;
    if (label !== undefined) patch.fakeGpsLabel = label;
    if (jitter !== undefined) patch.fakeGpsJitter = jitter;
    if (Object.keys(patch).length === 0) return;
    await ctx.db.patch(userId, patch);
  },
});

/**
 * Message storage toggle (Menu > Settings > Privacy & safety > End-to-end
 * encrypted chats > Secure storage). When off, ciphertext history is not
 * backed up to the cloud and stays on-device.
 */
export const setSecureStorage = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    await ctx.db.patch(userId, { secureStorage: enabled });
  },
});

// ---------------------------------------------------------------------------
// Security alerts — device log (Menu > Settings > Privacy & safety >
// End-to-end encrypted chats > Security alerts)
// ---------------------------------------------------------------------------

/** Register/refresh the current device session. Called on identity unlock. */
export const touchDevice = mutation({
  args: {
    label: v.string(),
    keyFingerprint: v.string(),
  },
  handler: async (ctx, { label, keyFingerprint }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const existing = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const match = existing.find(
      (d) => d.keyFingerprint === keyFingerprint && !d.revoked,
    );
    const now = Date.now();
    if (match) {
      await ctx.db.patch(match._id, { lastSeenAt: now });
      return match._id;
    }
    return await ctx.db.insert("devices", {
      userId,
      label,
      keyFingerprint,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  },
});

/** List the current user's devices, newest activity first. */
export const listDevices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return devices
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((d) => ({
        _id: d._id,
        label: d.label,
        keyFingerprint: d.keyFingerprint,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
        revoked: d.revoked ?? false,
      }));
  },
});

/** Log out (revoke) a device. It must re-verify to rejoin. */
export const revokeDevice = mutation({
  args: { deviceId: v.id("devices") },
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
