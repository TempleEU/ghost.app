"use node";

import { v } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Ghostly bridge — HTTP API for the native companion app (Ghostly.android or
// any GhostChat client). Endpoints:
//
//   POST /api/ghostly/claim   { pairingCode }            → { deviceKey }
//   GET  /api/ghostly/sync    ?key=<deviceKey>&since=ts  → VPN keys + settings snapshot
//   POST /api/ghostly/ack     { deviceKey, keysSyncedAt }→ { ok }
//
// The deviceKey is the bearer credential; pairing codes are short-lived and
// single-use. Revoked devices are rejected everywhere.
// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** Exchange a pairing code for a long-term deviceKey. */
export const claim = httpAction(
  async (ctx, request) => {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let payload: { pairingCode?: unknown };
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const pairingCode = typeof payload.pairingCode === "string" ? payload.pairingCode.trim() : "";
    if (!/^[A-F0-9]{8}$/.test(pairingCode.toUpperCase())) {
      return json({ error: "pairingCode must be 8 hex chars" }, 400);
    }

    const device = await ctx.runQuery(internal.ghostlyBridgeData.getByPairingCode, {
      pairingCode,
    });
    if (device === null || device.revoked) {
      return json({ error: "Unknown pairing code" }, 404);
    }
    if (device.claimedAt) {
      return json({ error: "Pairing code already used" }, 409);
    }
    if (device.pairingExpiresAt < Date.now()) {
      return json({ error: "Pairing code expired — create a new one" }, 410);
    }

    const deviceKey = await ctx.runMutation(internal.ghostlyBridgeData.claimPairing, {
      deviceId: device._id,
    });
    return json({ deviceKey, label: device.label });
  },
);

/**
 * Sync endpoint: pulls VPN access keys (and a settings snapshot) for the
 * companion device. `since` (epoch ms) returns only keys newer than that —
 * devices ack their sync time so polling is incremental.
 */
export const sync = httpAction(
  async (ctx, request) => {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const url = new URL(request.url);
    const deviceKey = url.searchParams.get("key") ?? "";
    const since = Number(url.searchParams.get("since") ?? "0") || 0;
    if (!deviceKey.startsWith("gc_")) {
      return json({ error: "Missing or malformed key" }, 401);
    }

    const device = await ctx.runQuery(internal.ghostlyBridgeData.getByDeviceKey, { deviceKey });
    if (device === null || device.revoked || !device.claimedAt) {
      return json({ error: "Invalid or revoked device" }, 401);
    }

    const keys = await ctx.runQuery(internal.ghostlyBridgeData.listKeysInternal, {
      userId: device.userId,
      since,
    });
    const settings = await ctx.runQuery(internal.ghostlyBridgeData.settingsInternal, {
      userId: device.userId,
    });

    await ctx.runMutation(internal.ghostlyBridgeData.touchAndMarkSync, {
      deviceId: device._id,
      markKeysSynced: false,
    });

    return json({
      device: { label: device.label, platform: device.platform ?? null },
      serverTime: Date.now(),
      settings,
      vpnKeys: keys,
    });
  },
);

/** Ack: device confirms it stored the keys (marks keysSyncedAt). */
export const ack = httpAction(
  async (ctx, request) => {
    if (request.method === "OPTIONS") return preflight();
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    let payload: { deviceKey?: unknown; keysSyncedAt?: unknown };
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const deviceKey = typeof payload.deviceKey === "string" ? payload.deviceKey : "";
    const keysSyncedAt = typeof payload.keysSyncedAt === "number" ? payload.keysSyncedAt : null;
    if (!deviceKey.startsWith("gc_")) {
      return json({ error: "Missing or malformed key" }, 401);
    }

    const device = await ctx.runQuery(internal.ghostlyBridgeData.getByDeviceKey, { deviceKey });
    if (device === null || device.revoked) {
      return json({ error: "Invalid or revoked device" }, 401);
    }

    await ctx.runMutation(internal.ghostlyBridgeData.touchAndMarkSync, {
      deviceId: device._id,
      markKeysSynced: keysSyncedAt !== null,
    });
    return json({ ok: true });
  },
);
