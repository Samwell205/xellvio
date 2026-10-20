import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const raw = process.env['APP_USER_CONNECTION_KEY_SECRET'];
  if (!raw) throw new Error("Calendar connections are not configured yet.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Calendar encryption configuration is invalid.");
  return key;
}
export async function saveConnection(userId: string, connectionKey: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(connectionKey, "utf8"), cipher.final()]);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections").upsert({ user_id: userId, connector_id: "google_calendar", connection_key_ciphertext: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64"), reconnect_required: false, updated_at: new Date().toISOString() }, { onConflict: "user_id,connector_id" });
  if (error) throw error;
}
export async function loadConnection(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("app_user_connections").select("connection_key_ciphertext,reconnect_required").eq("user_id", userId).eq("connector_id", "google_calendar").maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const bytes = Buffer.from(data.connection_key_ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  return { key: Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"), reconnectRequired: data.reconnect_required };
}