import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordVerifierDevice } from "@/lib/verifier-kyc.functions";

async function fingerprint() {
  const parts = [
    navigator.userAgent, navigator.language, navigator.platform,
    screen.width, screen.height, screen.colorDepth, window.devicePixelRatio,
    Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.hardwareConcurrency,
  ].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts));
  return Array.from(new Uint8Array(buf)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function useDeviceSignal() {
  const record = useServerFn(recordVerifierDevice);
  useEffect(() => {
    let id = localStorage.getItem("xv_device_id");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("xv_device_id", id); }
    const deviceId = id;
    fingerprint().then((fp) => record({ data: { device_id: deviceId, fingerprint: fp } })).catch(() => null);
  }, []);
}
