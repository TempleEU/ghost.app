/**
 * GhostVPN Access Key parsing — supports the key formats shared by
 * Outline/Shadowsocks and V2Ray-family repos (github topics vpn-keys,
 * vpn-lifetime, BiuBiu-VPN etc.):
 *
 *   ss://base64(method:password)@host:port/?outline=1#name   (Outline)
 *   ss://base64(method:password@host:port)#name              (legacy)
 *   vless://uuid@host:port?params#name
 *   vmess://base64(json)
 *
 * Nothing here opens a tunnel — browsers cannot. Keys are parsed, validated
 * and stored; the OS-level Outline / v2rayNG / v2rayN client performs the
 * actual connection when the user taps "Open in client".
 */

export type VpnKeyKind = "ss" | "vless" | "vmess";

export type ParsedVpnKey = {
  kind: VpnKeyKind;
  name: string;
  host: string;
  port: number;
  /** Cipher or protocol detail, e.g. "chacha20-ietf-poly1305" or "tcp+vless" */
  method?: string;
  /** The original URI, preserved for import into the native client. */
  raw: string;
};

function b64decode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  // Handle UTF-8 (names/comments are often non-ASCII).
  return decodeURIComponent(
    Array.from(bin)
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join(""),
  );
}

function isHost(s: string): boolean {
  // IPv4, IPv6-in-brackets, or a hostname.
  return /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*)$/.test(s);
}

/** Parse a single access-key URI. Returns null for anything unsupported. */
export function parseVpnKey(raw: string): ParsedVpnKey | null {
  const uri = raw.trim();
  if (!uri) return null;

  // ---- Outline / Shadowsocks ---------------------------------------------
  if (uri.startsWith("ss://")) {
    const hashIdx = uri.indexOf("#");
    const body = hashIdx === -1 ? uri.slice(5) : uri.slice(5, hashIdx);
    const name = hashIdx === -1 ? "" : decodeURIComponent(uri.slice(hashIdx + 1));

    const at = body.lastIndexOf("@");
    if (at !== -1) {
      // ss://base64(method:password)@host:port/?outline=1
      const [credsB64, hostport] = [body.slice(0, at), body.slice(at + 1)];
      const hp = hostport.replace(/\/.*$/, "").replace(/^\[/, "").replace(/\]$/, "");
      const colon = hp.lastIndexOf(":");
      if (colon === -1) return null;
      const host = hp.slice(0, colon);
      const port = parseInt(hp.slice(colon + 1), 10);
      if (!isHost(host) || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
      let method = "";
      try {
        const creds = b64decode(credsB64);
        method = creds.slice(0, creds.indexOf(":"));
      } catch {
        return null;
      }
      return { kind: "ss", name: name || `${host}:${port}`, host, port, method, raw: uri };
    }

    // Legacy: ss://base64(method:password@host:port)
    try {
      const creds = b64decode(body.replace(/\/.*$/, ""));
      const atIdx = creds.lastIndexOf("@");
      if (atIdx === -1) return null;
      const method = creds.slice(0, creds.indexOf(":"));
      const hp = creds.slice(atIdx + 1);
      const colon = hp.lastIndexOf(":");
      const host = hp.slice(0, colon);
      const port = parseInt(hp.slice(colon + 1), 10);
      if (!isHost(host) || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
      return { kind: "ss", name: name || `${host}:${port}`, host, port, method, raw: uri };
    } catch {
      return null;
    }
  }

  // ---- VLESS --------------------------------------------------------------
  if (uri.startsWith("vless://")) {
    try {
      const u = new URL(uri);
      const host = u.hostname;
      const port = parseInt(u.port, 10);
      if (!isHost(host) || !Number.isFinite(port) || port <= 0) return null;
      const name = decodeURIComponent(u.hash.slice(1)) || `${host}:${port}`;
      const method = `${u.searchParams.get("type") ?? "tcp"}+vless`;
      return { kind: "vless", name, host, port, method, raw: uri };
    } catch {
      return null;
    }
  }

  // ---- VMess --------------------------------------------------------------
  if (uri.startsWith("vmess://")) {
    try {
      const json = JSON.parse(b64decode(uri.slice(8))) as {
        add?: string;
        port?: number | string;
        ps?: string;
        net?: string;
      };
      const host = json.add ?? "";
      const port = typeof json.port === "string" ? parseInt(json.port, 10) : json.port ?? 0;
      if (!isHost(host) || !Number.isFinite(port) || port <= 0) return null;
      return {
        kind: "vmess",
        name: json.ps || `${host}:${port}`,
        host,
        port,
        method: `${json.net ?? "tcp"}+vmess`,
        raw: uri,
      };
    } catch {
      return null;
    }
  }

  return null;
}

/** Parse a pasted blob: one key per line, or a base64 subscription body. */
export function parseKeyBlob(text: string): ParsedVpnKey[] {
  const out: ParsedVpnKey[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const key = parseVpnKey(raw);
    if (key && !seen.has(key.raw)) {
      seen.add(key.raw);
      out.push(key);
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith("ss://") || t.startsWith("vless://") || t.startsWith("vmess://")) {
      push(t);
    }
  }

  // No plaintext keys? Try the whole blob as base64 (subscription format).
  if (out.length === 0 && /^[A-Za-z0-9+/=\s]+$/.test(text.trim()) && text.trim().length > 24) {
    try {
      const decoded = b64decode(text.replace(/\s+/g, ""));
      for (const line of decoded.split(/\r?\n/)) {
        const t = line.trim();
        if (t.startsWith("ss://") || t.startsWith("vless://") || t.startsWith("vmess://")) {
          push(t);
        }
      }
    } catch {
      // Not base64 either — give up with an empty list.
    }
  }

  return out;
}

/** Client deep links that open the key in the native VPN client. */
export function clientLink(key: ParsedVpnKey): string {
  if (key.kind === "ss") {
    // Outline client handles ss:// natively on every platform.
    return key.raw;
  }
  // v2rayNG (Android) / v2rayN (Windows) / Shadowrocket (iOS) import schemes.
  return key.raw;
}
