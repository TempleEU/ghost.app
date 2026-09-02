import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { httpAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// SMS Gateway — receive SMS from phones running react-native-sms-gateway
// (or any app that POSTs { msg, timestamp, phoneNumber, sender }).
//
// The gateway app is native Android (iOS gives no SMS access); GhostChat is
// the receiver: it authenticates each device by API key, stores the SMS,
// and shows them in the SMS Gateway inbox.
// ---------------------------------------------------------------------------

const MAX_BODY = 64 * 1024;

/** Generate a new gateway device + API key for the signed-in user. */
export const createDevice = mutation({
  args: { label: v.string() },
  handler: async (ctx, { label }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const apiKey =
      "gk_" +
      Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    const deviceId = await ctx.db.insert("smsDevices", {
      userId,
      label: label.trim() || "Gateway device",
      apiKey,
      createdAt: Date.now(),
    });
    return { deviceId, apiKey };
  },
});

/** List the signed-in user's gateway devices, newest first. */
export const listDevices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("smsDevices")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Revoke a gateway device; its key stops working immediately. */
export const revokeDevice = mutation({
  args: { deviceId: v.id("smsDevices") },
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

/** Internal device lookup by API key (from httpAction ctx). */
export const getDeviceByKey = internalQuery({
  args: { apiKey: v.string() },
  handler: async (ctx, { apiKey }) => {
    return await ctx.db
      .query("smsDevices")
      .withIndex("by_apiKey", (q) => q.eq("apiKey", apiKey))
      .unique();
  },
});

/** List ingested SMS, newest first. */
export const listMessages = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("smsMessages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
  },
});

/** Delete one ingested SMS. */
export const deleteMessage = mutation({
  args: { messageId: v.id("smsMessages") },
  handler: async (ctx, { messageId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");
    const msg = await ctx.db.get(messageId);
    if (msg === null || msg.userId !== userId) {
      throw new Error("Message not found");
    }
    await ctx.db.delete(messageId);
  },
});

// ---------------------------------------------------------------------------
// Webhook — the URL the gateway app POSTs to
// ---------------------------------------------------------------------------

/**
 * Ingest endpoint. Auth: `x-ghostchat-key: <apiKey>` header (or ?key= query).
 * Body: the react-native-sms-gateway JSON payload:
 *   { "msg": "...", "timestamp": 1717430000000, "phoneNumber": "+2...", "sender": "Vodafone" }
 */
export const ingest = httpAction(
  async (ctx, request) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const apiKey = request.headers.get("x-ghostchat-key") ?? url.searchParams.get("key") ?? "";
    if (!apiKey) {
      return new Response("Missing x-ghostchat-key header", { status: 401 });
    }

    const device = await ctx.runQuery(internal.smsGateway.getDeviceByKey, { apiKey });
    if (device === null || device.revoked) {
      return new Response("Invalid or revoked API key", { status: 401 });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return new Response("Payload too large", { status: 413 });
    }

    let payload: { msg?: unknown; timestamp?: unknown; phoneNumber?: unknown; sender?: unknown };
    try {
      payload = JSON.parse(raw);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const body = typeof payload.msg === "string" ? payload.msg : "";
    if (!body) {
      return new Response("Missing msg field", { status: 400 });
    }
    const sender = typeof payload.sender === "string" ? payload.sender : "unknown";
    const phoneNumber =
      typeof payload.phoneNumber === "string" ? payload.phoneNumber : undefined;
    const deviceTimestamp =
      typeof payload.timestamp === "number" ? payload.timestamp : undefined;

    await ctx.runMutation(internal.smsGateway.insertMessage, {
      deviceId: device._id,
      userId: device.userId,
      sender,
      body,
      phoneNumber,
      deviceTimestamp,
    });

    await ctx.runMutation(internal.smsGateway.touchDevice, { deviceId: device._id });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
);

/** Internal insert (from httpAction context). */
export const insertMessage = internalMutation({
  args: {
    deviceId: v.id("smsDevices"),
    userId: v.id("users"),
    sender: v.string(),
    body: v.string(),
    phoneNumber: v.optional(v.string()),
    deviceTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("smsMessages", { ...args, receivedAt: Date.now() });
  },
});

/** Internal last-seen refresh (from httpAction context). */
export const touchDevice = internalMutation({
  args: { deviceId: v.id("smsDevices") },
  handler: async (ctx, { deviceId }) => {
    await ctx.db.patch(deviceId, { lastSeenAt: Date.now() });
  },
});
