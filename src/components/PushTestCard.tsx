import { Capacitor } from "@capacitor/core";
import { useAction } from "convex/react";
import { useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

/**
 * Settings > Apps — end-to-end test push sender.
 *
 * Rendered only in the native Capacitor builds (Android/iOS). Sends a test
 * notification through the Convex `pushSender.sendTestPush` action (FCM HTTP
 * v1 via firebase-admin) to every device token registered to this account.
 */
export function PushTestCard() {
  const sendTestPush = useAction(api.pushSender.sendTestPush);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (!Capacitor.isNativePlatform()) return null;

  const handleTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await sendTestPush();
      const perToken = res.perToken
        .map((r) => `${r.platform}: ${r.ok ? "sent" : r.message}`)
        .join(" · ");
      setResult({
        ok: res.ok,
        text: perToken ? `${res.detail} — ${perToken}` : res.detail,
      });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Bell className="size-3.5 text-muted-foreground" /> Native push
        </p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          Sends a test notification to every device registered on this account
          — verifies the full FCM/APNs chain.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy} onClick={handleTest}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Bell className="size-3.5" />}
          Send test push
        </Button>
        {result && (
          <span
            className={`min-w-0 flex-1 text-xs leading-5 ${
              result.ok ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {result.text}
          </span>
        )}
      </div>
    </div>
  );
}