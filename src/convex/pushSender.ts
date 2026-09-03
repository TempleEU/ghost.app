"use node";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

// ---------------------------------------------------------------------------
// End-to-end test push sender (FCM HTTP v1 via firebase-admin).
//
// Requires the Firebase service-account JSON in the FIREBASE_SERVICE_ACCOUNT
// environment variable (Keys tab). It sends one test notification to every
// token this user has registered on their devices, so the whole chain can be
// verified: app registration -> token stored -> server send -> device banner.
//
// iOS note: the Capacitor push plugin registers with APNs directly, so iOS
// tokens only receive FCM-delivered pushes once the Firebase iOS SDK is wired
// into the native app. Android works out of the box with google-services.json.
// ---------------------------------------------------------------------------

let initialized = false;

function ensureAdminApp(): void {
  if (initialized) return;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is not set. Paste the Firebase service-account JSON in the Keys tab, then retry.",
    );
  }
  if (getApps().length === 0) {
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(json) as Record<string, string>;
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON — paste the whole service-account file contents.");
    }
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT is missing fields. It must be the full JSON from Firebase > Project settings > Service accounts > Generate new private key.",
      );
    }
    initializeApp({ credential: cert(parsed) });
  }
  initialized = true;
}

export const sendTestPush = action({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in");

    // Actions can't touch the DB directly — read tokens via a query.
    const tokens = await ctx.runQuery(api.push.listMyPushTokens);

    if (tokens.length === 0) {
      return {
        ok: false as const,
        sent: 0,
        detail:
          "No registered devices yet. Open the native app on Android/iOS (push permission granted) and try again.",
        perToken: [] as { platform: string; ok: boolean; message: string }[],
      };
    }

    try {
      ensureAdminApp();
    } catch (e) {
      return {
        ok: false as const,
        sent: 0,
        detail: e instanceof Error ? e.message : "FCM is not configured",
        perToken: [],
      };
    }

    const messaging = getMessaging();
    const perToken: { platform: string; ok: boolean; message: string }[] = [];
    let sent = 0;

    for (const t of tokens) {
      try {
        await messaging.send({
          token: t.token,
          notification: {
            title: "GhostWeb",
            body: "Test push — notifications are working!",
          },
          data: { url: "/chat" },
        });
        sent += 1;
        perToken.push({ platform: t.platform, ok: true, message: "delivered to FCM" });
      } catch (e) {
        perToken.push({
          platform: t.platform,
          ok: false,
          message: e instanceof Error ? e.message : "send failed",
        });
      }
    }

    const failed = perToken.filter((r) => !r.ok).length;
    return {
      ok: failed === 0,
      sent,
      detail:
        failed === 0
          ? `Sent to ${sent} device${sent === 1 ? "" : "s"} — check your phone.`
          : `Sent ${sent}, ${failed} failed. Unregistered/expired tokens are ignored by FCM (safe to remove the app's push permission and re-register).`,
      perToken,
    };
  },
});