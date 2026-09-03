import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";

/**
 * Native push notifications for the Capacitor Android/iOS app.
 *
 * - Requests permission and registers the device on first run.
 * - Ships the FCM/APNs registration token to the server (pushTokens table)
 *   so the backend can deliver notifications (see src/convex/pushSender.ts).
 * - Tapping a notification opens the chat workspace.
 *
 * NOTE: remote delivery requires provider config outside this repo —
 * Firebase Cloud Messaging (Android) and APNs (iOS). Without it the app
 * registers cleanly but no remote pushes arrive. On web, the existing
 * in-app Notification API keeps working unchanged.
 */
export function usePushNotifications() {
  const navigate = useNavigate();
  const saveDeviceToken = useMutation(api.push.saveDeviceToken);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let active = true;
    let tokenListener: { remove: () => Promise<void> } | undefined;
    let actionListener: { remove: () => Promise<void> } | undefined;

    const platform = Capacitor.getPlatform() as "android" | "ios";

    (async () => {
      try {
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === "prompt") {
          permission = await PushNotifications.requestPermissions();
        }
        if (permission.receive !== "granted") return;

        await PushNotifications.register();

        tokenListener = await PushNotifications.addListener("registration", (token) => {
          console.info("[GhostWeb] push token registered");
          // Persist the token so the backend can send this device pushes.
          // Best-effort: not signed in yet -> skipped, the next registration
          // (or app start) picks it up.
          void saveDeviceToken({ token: token.value, platform }).catch(() => {});
        });

        actionListener = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          () => {
            if (active) navigate("/chat");
          },
        );
      } catch {
        // Push is optional — never break the app when it is unavailable.
      }
    })();

    return () => {
      active = false;
      tokenListener?.remove();
      actionListener?.remove();
    };
  }, [navigate, saveDeviceToken]);
}