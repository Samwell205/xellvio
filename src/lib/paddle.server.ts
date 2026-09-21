/**
 * Paddle server utilities — gateway routing and webhook verification.
 *
 * Server-side Paddle API calls go through the Lovable connector gateway,
 * never directly to Paddle. The gateway handles auth.
 */

export type PaddleEnv = "sandbox" | "live";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/paddle";

function getApiKey(env: PaddleEnv): string {
  const key =
    env === "sandbox"
      ? process.env["PADDLE_SANDBOX_API_KEY"]
      : process.env["PADDLE_LIVE_API_KEY"];
  if (!key) throw new Error(`Paddle ${env} API key not configured`);
  return key;
}

function getWebhookSecret(env: PaddleEnv): string {
  const secret =
    env === "sandbox"
      ? process.env["PAYMENTS_SANDBOX_WEBHOOK_SECRET"]
      : process.env["PAYMENTS_LIVE_WEBHOOK_SECRET"];
  if (!secret) throw new Error(`Paddle ${env} webhook secret not configured`);
  return secret;
}

/** True when any Paddle API key is present (sandbox or live). */
export function isPaddleConfigured(): boolean {
  return !!(process.env["PADDLE_SANDBOX_API_KEY"] || process.env["PADDLE_LIVE_API_KEY"]);
}

/**
 * Route a Paddle API call through the Lovable connector gateway.
 * Returns the raw fetch Response — caller is responsible for parsing.
 */
export async function gatewayFetch(
  env: PaddleEnv,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const apiKey = getApiKey(env);
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

  const cleanPath = path.replace(/^\//, "");
  const separator = cleanPath.includes("?") ? "&" : "?";
  const url = `${GATEWAY_URL}/${cleanPath}${cleanPath.includes("?") ? "" : ""}`;

  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
  });
}

/**
 * Verify a Paddle webhook signature and return the parsed event.
 *
 * Paddle signs webhooks with HMAC-SHA256: the signature header contains
 * `ts=<timestamp>;h1=<hex-hmac>` where the hmac is computed over
 * `<timestamp>:<raw-body>` using the webhook secret.
 */
export async function verifyPaddleWebhook(
  req: Request,
  env: PaddleEnv,
): Promise<any> {
  const signature =
    req.headers.get("paddle-signature") ?? req.headers.get("Paddle-Signature");
  const body = await req.text();
  if (!signature || !body) throw new Error("Missing signature or body");

  const secret = getWebhookSecret(env);

  // Parse ts and h1 from the semicolon-delimited signature header.
  let ts: string | undefined;
  const h1Signatures: string[] = [];
  for (const part of signature.split(";")) {
    const [key, value] = part.split("=", 2);
    if (key === "ts") ts = value;
    if (key === "h1") h1Signatures.push(value);
  }
  if (!ts || h1Signatures.length === 0) throw new Error("Invalid signature format");

  // Reject stale webhooks (5-minute clock skew tolerance).
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (age > 300) throw new Error("Webhook timestamp too old");

  // Compute HMAC-SHA256 of `ts:body` using Web Crypto.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ts}:${body}`),
  );
  const expected = Buffer.from(new Uint8Array(signed)).toString("hex");

  if (!h1Signatures.includes(expected)) throw new Error("Invalid webhook signature");

  return JSON.parse(body);
}
