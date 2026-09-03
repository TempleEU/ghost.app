import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useEffect } from "react";
import { useNavigate } from "react-router";

/**
 * Native push notifications for the Capacitor Android/iOS app.
 *
 * - Requests permission and registers the device on first run.
 * - Tapping a notification opens the chat workspace.
 *
 * NOTE: remote delivery requires provider config outside this repo —
 * Firebase Cloud Messaging (Android) and APNs (iOS). Without it the app
 * registers cleanly but no remote pushes arrive. On web, the existing
 * in-app Notification API keeps working unchanged.
 */
export function usePushNotifications() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let active = true;
    let tokenListener: { remove: () => Promise<void> } | undefined;
    let actionListener: { remove: () => Promise<void> } | undefined;

    (async () => {
      try {
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === "prompt") {
          permission = await PushNotifications.requestPermissions();
        }
        if (permission.receive !== "granted") return;

        await PushNotifications.register();

        tokenListener = await PushNotifications.addListener("registration", (token) => {
          // The device token is what the push provider (FCM/APNs) needs.
          // Ship it to your backend here when wiring real delivery.
          console.info("[GhostWeb] push token registered");
          void token;
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
  }, [navigate]);
}