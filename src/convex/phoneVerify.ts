"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import type { GenericActionCtx } from "convex/server";
import { internal } from "./_generated/api";
// Internal helpers (rate limit, dev codes, mark-verified) live in
// phoneVerifyData.ts — this file only holds the Node actions.
const data = internal.phoneVerifyData;

// ---------------------------------------------------------------------------
// Phone verification via Twilio Verify.
//
// Credential resolution order:
//   1. Live SMS config pasted in Settings (smsProvider table, enabled+validated)
//   2. Environment variables (TWILIO_ACCOUNT_SID / AUTH_TOKEN / VERIFY_SERVICE_SID)
//   3. Dev fallback — code returned in-band (no SMS), for testing only
// ---------------------------------------------------------------------------

function envCreds() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (accountSid && authToken && verifyServiceSid) {
    return { accountSid, authToken, verifyServiceSid };
  }
  return null;
}

const MAX_ATTEMPTS_PER_HOUR = 5;

function normalizeE164(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  // Allow +, digits, spaces, dashes, parens; then canonicalize.
  if (!/^[+0-9][0-9\s\-()]{5,20}$/.test(t)) return null;
  const digits = t.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return "+" + digits;
}

async function twilioRequest(
  creds: { accountSid: string; authToken: string; verifyServiceSid: string },
  path: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");
  const res = await fetch(
    `https://verify.twilio.com/v2/Services/${creds.verifyServiceSid}/${path}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.message as string) ?? `HTTP ${res.status}`;
    throw new Error(`Twilio: ${msg}`);
  }
  return json;
}

/** Resolve live credentials: DB config (enabled) → env vars → null. */
async function resolveLive(
  ctx: GenericActionCtx<any>,
): Promise<{ accountSid: string; authToken: string; verifyServiceSid: string } | null> {
  const fromDb = await ctx.runQuery(internal.smsProviderData.resolveCreds, {});
  if (fromDb) return fromDb;
  return envCreds();
}

/** Request an OTP for the given phone number. */
export const startVerification = action({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const e164 = normalizeE164(phone);
    if (e164 === null) {
      throw new Error("Enter a valid phone number in international format, e.g. +46701234567");
    }

    // Rate limit: max attempts per hour per user.
    const recent = await ctx.runQuery(data.recentAttempts, {
      userId,
      since: Date.now() - 60 * 60 * 1000,
    });
    if (recent >= MAX_ATTEMPTS_PER_HOUR) {
      throw new Error("Too many verification attempts. Try again in an hour.");
    }

    await ctx.runMutation(data.recordAttempt, {
      userId,
      phoneE164: e164,
    });

    const creds = await resolveLive(ctx);
    if (!creds) {
      // DEV FALLBACK — no live SMS configured. Return the code in-band so the
      // flow is testable without a Twilio account.
      const devCode = String(Math.floor(100000 + Math.random() * 900000));
      await ctx.runMutation(data.setDevCode, {
        userId,
        code: devCode,
      });
      return {
        mode: "dev-fallback" as const,
        devCode,
        message:
          "DEV MODE: live SMS not configured. Use the code shown — it is NOT sent by SMS.",
      };
    }

    const res = await twilioRequest(creds, "verifications", {
      to: e164,
      channel: "sms",
    });
    return {
      mode: "twilio" as const,
      status: (res.status as string) ?? "pending",
      message: "Verification code sent by SMS.",
    };
  },
});

/** Check the OTP. Marks the phone verified on success. */
export const checkVerification = action({
  args: { phone: v.string(), code: v.string() },
  handler: async (ctx, { phone, code }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    const e164 = normalizeE164(phone);
    if (e164 === null) throw new Error("Invalid phone number");

    const cleanCode = code.replace(/[^0-9]/g, "");
    if (cleanCode.length < 4 || cleanCode.length > 8) {
      throw new Error("Enter the 6-digit code from the SMS.");
    }

    const creds = await resolveLive(ctx);
    if (!creds) {
      const ok = await ctx.runMutation(data.checkDevCode, {
        userId,
        code: cleanCode,
      });
      if (!ok) throw new Error("Wrong code (dev fallback).");
      await ctx.runMutation(data.markVerified, {
        userId,
        phoneE164: e164,
      });
      return { mode: "dev-fallback" as const, verified: true };
    }

    const res = await twilioRequest(creds, "verification-check", {
      to: e164,
      code: cleanCode,
    });
    const approved = res.status === "approved";
    if (approved) {
      await ctx.runMutation(data.markVerified, {
        userId,
        phoneE164: e164,
      });
    }
    return { mode: "twilio" as const, verified: approved };
  },
});
