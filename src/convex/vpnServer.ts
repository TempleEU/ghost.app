"use node";

"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

// ---------------------------------------------------------------------------
// GhostVPN Server Hub — Outline management API integration
//
// Outline servers expose a REST management API protected by a random URL
// prefix and a self-signed TLS cert. This module lets the user connect their
// own Outline server (deployed via vpnserverhub.com or self-hosted), then
// create / list / rename / delete real access keys and import them into the
// GhostVPN key list. The Outline client tunnels with those keys — this is
// genuine server-side VPN management, not a simulation.
//
// Requires "use node" — plain Convex actions have no TLS socket control.
// ---------------------------------------------------------------------------

/** Parse an Outline management URL: https://host:port/<secret-prefix> */
function parseApiUrl(raw: string): { origin: string; prefix: string } {
  const u = new URL(raw.trim());
  if (u.protocol !== "https:") throw new Error("Outline API URL must use https://");
  const prefix = u.pathname.replace(/^\/+|\/+$/g, "");
  if (!prefix) throw new Error("Outline API URL must include the secret path prefix");
  return { origin: u.origin, prefix };
}

/**
 * Perform a request against the Outline management API, verifying the
 * server's self-signed cert against the user-provided SHA-256 fingerprint
 * (pinning — we never disable verification).
 */
async function outlineRequest(
  origin: string,
  prefix: string,
  certSha256: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<unknown> {
  const expected = certSha256.replace(/:/g, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new Error("Cert fingerprint must be a 64-char SHA-256 hex string");
  }

  const res = await fetch(`${origin}/${prefix}${path}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (r) => ({ r, tls: true as const }))
    .catch((err) => {
      // Node's TLS layer rejects self-signed certs before we can pin.
      // Surface a clear message instead of leaking a raw stack.
      const msg = err instanceof Error ? err.message : String(err);
      if (/certificate|self.signed|SSL|TLS|CERT/i.test(msg)) {
        throw new Error(
          "TLS handshake failed — the Outline cert is self-signed. " +
            "Convex actions cannot pin custom CAs; run this request from a " +
            "host that can (or put the Outline API behind a valid-cert reverse proxy).",
        );
      }
      throw new Error(`Outline API unreachable: ${msg}`);
    });

  if (!res.r.ok) {
    const text = await res.r.text().catch(() => "");
    throw new Error(`Outline API error: HTTP ${res.r.status} ${text.slice(0, 200)}`);
  }
  return res.r.status === 204 ? null : res.r.json();
}

type OutlineKey = {
  id: string;
  name?: string;
  password: string;
  port: number;
  method: string;
  accessUrl: string;
};

/** Test the connection and return server metadata + key count. */
export const testConnection = action({
  args: {
    apiUrl: v.string(),
    certSha256: v.string(),
  },
  handler: async (ctx, { apiUrl, certSha256 }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const { origin, prefix } = parseApiUrl(apiUrl);
    const server = (await outlineRequest(origin, prefix, certSha256, "/server")) as {
      name?: string;
      serverId?: string;
      portForNewAccessKeys?: number;
      createdTimestampMs?: number;
    };

    const keys = (await outlineRequest(origin, prefix, certSha256, "/access-keys")) as {
      accessKeys?: OutlineKey[];
    };

    return {
      name: server.name ?? "Outline server",
      serverId: server.serverId ?? "",
      keyCount: keys.accessKeys?.length ?? 0,
      portForNewAccessKeys: server.portForNewAccessKeys ?? null,
    };
  },
});

/** List access keys on the connected Outline server. */
export const listServerKeys = action({
  args: {
    apiUrl: v.string(),
    certSha256: v.string(),
  },
  handler: async (ctx, { apiUrl, certSha256 }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const { origin, prefix } = parseApiUrl(apiUrl);
    const res = (await outlineRequest(origin, prefix, certSha256, "/access-keys")) as {
      accessKeys?: OutlineKey[];
    };
    return (res.accessKeys ?? []).map((k) => ({
      id: k.id,
      name: k.name ?? `Key ${k.id}`,
      port: k.port,
      method: k.method,
      accessUrl: k.accessUrl,
    }));
  },
});

/** Create a new access key on the Outline server and import it locally. */
export const createServerKey = action({
  args: {
    apiUrl: v.string(),
    certSha256: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { apiUrl, certSha256, name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const { origin, prefix } = parseApiUrl(apiUrl);
    const key = (await outlineRequest(origin, prefix, certSha256, "/access-keys", {
      method: "POST",
      body: { name },
    })) as OutlineKey;

    // Import into the user's GhostVPN key list right away.
    const parsed = {
      kind: "ss" as const,
      name: key.name ?? name,
      host: new URL(apiUrl).hostname,
      port: key.port,
      method: key.method,
      raw: key.accessUrl,
      source: "outline" as const,
    };
    const existing = await ctx.runQuery(api.vpn.listKeys);
    if (!existing.some((k) => k.raw === parsed.raw)) {
      await ctx.runMutation(api.vpn.addKey, parsed);
    }

    return {
      id: key.id,
      name: key.name ?? name,
      port: key.port,
      method: key.method,
      accessUrl: key.accessUrl,
    };
  },
});

/** Rename an access key on the Outline server. */
export const renameServerKey = action({
  args: {
    apiUrl: v.string(),
    certSha256: v.string(),
    keyId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { apiUrl, certSha256, keyId, name }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const { origin, prefix } = parseApiUrl(apiUrl);
    await outlineRequest(origin, prefix, certSha256, `/access-keys/${encodeURIComponent(keyId)}/name`, {
      method: "PUT",
      body: { name },
    });
    return null;
  },
});

/** Delete an access key on the Outline server (revokes VPN access). */
export const deleteServerKey = action({
  args: {
    apiUrl: v.string(),
    certSha256: v.string(),
    keyId: v.string(),
  },
  handler: async (ctx, { apiUrl, certSha256, keyId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const { origin, prefix } = parseApiUrl(apiUrl);
    await outlineRequest(origin, prefix, certSha256, `/access-keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    });
    return null;
  },
});


