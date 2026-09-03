"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

// ---------------------------------------------------------------------------
// Live SMS Delivery — Twilio provider actions (Node runtime).
//
// Keys are pasted in the UI, stored server-side via smsProviderData, and
// validated against Twilio before the config goes live. While enabled,
// phone verification sends real SMS; otherwise it falls back to dev mode.
// ---------------------------------------------------------------------------

/**
 * Save + validate config. Performs a live Twilio API check; on failure the
 * config is saved as disabled (so nothing silently switches to live).
 */
export const saveAndValidate = action({
  args: {
    accountSid: v.string(),
    authToken: v.string(),
    verifyServiceSid: v.string(),
    senderPhoneNumber: v.optional(v.string()),
    enableNow: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const sid = args.accountSid.trim();
    const token = args.authToken.trim();
    const vsid = args.verifyServiceSid.trim();
    const sender = args.senderPhoneNumber?.trim() || undefined;

    if (!/^AC[0-9a-fA-F]{32}$/.test(sid)) {
      throw new Error("Account SID must look like ACxxxxxxxx… (34 chars starting with AC)");
    }
    if (token.length < 16) {
      throw new Error("Auth Token looks too short — copy it from the Twilio Console.");
    }
    if (!/^VA[0-9a-fA-F]{32}$/.test(vsid)) {
      throw new Error("Verify Service SID must start with VA (34 chars).");
    }
    if (sender && !/^\+[0-9]{7,15}$/.test(sender)) {
      throw new Error("Sender number must be E.164, e.g. +15551234567");
    }

    // Live validation: verify credentials by fetching the Verify service.
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    let ok = false;
    let detail = "";
    try {
      const res = await fetch(`https://verify.twilio.com/v2/Services/${vsid}`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        ok = true;
        detail = "Twilio credentials verified.";
      } else if (res.status === 401 || res.status === 404) {
        detail = "Twilio rejected the credentials (401/404). Check SID, token and service SID.";
      } else {
        detail = `Twilio responded HTTP ${res.status}.`;
      }
    } catch (e) {
      detail = `Could not reach Twilio: ${e instanceof Error ? e.message : "network error"}`;
    }

    // Upsert the singleton row. Enabled only if validated AND enableNow.
    const enabled = ok && args.enableNow;
    await ctx.runMutation(internal.smsProviderData.upsert, {
      accountSid: sid,
      authToken: token,
      verifyServiceSid: vsid,
      senderPhoneNumber: sender,
      enabled,
      validatedAt: ok ? Date.now() : undefined,
      updatedBy: userId,
    });

    return { validated: ok, enabled, detail };
  },
});

/**
 * Send a test SMS via Twilio Messages API. Only works when the config has
 * passed validation and a sender number is configured.
 */
export const sendTestSms = action({
  args: { to: v.string() },
  handler: async (ctx, { to }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const row = await ctx.runQuery(internal.smsProviderData.getRaw, {});
    if (row === null) throw new Error("No provider config saved.");
    if (row.validatedAt === undefined) throw new Error("Config not validated yet.");
    if (!row.senderPhoneNumber) {
      throw new Error("Add your Twilio phone number (sender) to send test SMS.");
    }
    if (!/^\+[0-9]{7,15}$/.test(to.trim())) {
      throw new Error("Recipient must be E.164, e.g. +15551234567");
    }

    const auth = Buffer.from(`${row.accountSid}:${row.authToken}`).toString("base64");
    const body = new URLSearchParams({
      To: to.trim(),
      From: row.senderPhoneNumber,
      Body: "GhostChat: Live SMS delivery is working. 🔒",
    });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${row.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Twilio: ${(json.message as string) ?? `HTTP ${res.status}`}`);
    }
    return { sid: (json.sid as string) ?? "", status: (json.status as string) ?? "queued" };
  },
});
