import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  sendTestPush,
} from "@/lib/admin-push.functions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function EnableNotificationsButton() {
  const getKey = useServerFn(getVapidPublicKey);
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(removePushSubscription);
  const test = useServerFn(sendTestPush);

  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined"
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        setSubscribed(!!existing);
      } catch (e) {
        console.error("[push] sw register failed", e);
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Notifications permission denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await getKey();
      if (!key) throw new Error("Push not configured on server");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
      });
      const raw = sub.toJSON() as any;
      await save({
        data: {
          endpoint: sub.endpoint,
          p256dh: raw.keys.p256dh,
          auth: raw.keys.auth,
          user_agent: navigator.userAgent,
        },
      });
      setSubscribed(true);
      toast.success("Notifications enabled");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await remove({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notifications disabled");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not disable");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    try {
      await test({});
      toast.success("Test notification sent");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  if (!supported) {
    return (
      <div className="text-xs text-muted-foreground">
        Push notifications aren't supported in this browser. Install the site as an app on your phone (Add to Home Screen) and open it from the icon.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {subscribed ? (
        <>
          <Button size="sm" variant="outline" onClick={disable} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <BellOff className="size-4" />}
            <span className="ml-2">Disable notifications</span>
          </Button>
          <Button size="sm" variant="secondary" onClick={sendTest}>Send test</Button>
        </>
      ) : (
        <Button size="sm" onClick={enable} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
          <span className="ml-2">Enable push notifications</span>
        </Button>
      )}
    </div>
  );
}
