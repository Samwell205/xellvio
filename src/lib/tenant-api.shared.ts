import { z } from "zod";

export const API_SCOPES = [
  "messages:send",
  "messages:read",
  "replies:read",
  "webhooks:manage",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export const WEBHOOK_EVENTS = [
  "message.sent",
  "message.delivered",
  "message.delivery_unconfirmed",
  "message.failed",
  "reply.received",
  "contact.opted_out",
  "contact.opted_in",
  "batch.completed",
] as const;

export type TenantWebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const e164Schema = z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Use international E.164 format, for example +14155550123");

export const apiRecipientSchema = z.object({
  phone: e164Schema,
  consent_confirmed: z.literal(true),
});

export const sendMessageSchema = z.object({
  to: e164Schema,
  body: z.string().trim().min(1).max(1600),
  consent_confirmed: z.literal(true),
  sender: z.string().trim().max(40).optional(),
  metadata: z.record(z.string(), z.string().max(500)).optional(),
});

export const sendBulkSchema = z.object({
  name: z.string().trim().min(1).max(120).default("API batch"),
  body: z.string().trim().min(1).max(1600),
  recipients: z.array(apiRecipientSchema).min(1).max(1000),
  sender: z.string().trim().max(40).optional(),
  metadata: z.record(z.string(), z.string().max(500)).optional(),
});

export function safeFailureReason(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.replace(/telnyx/gi, "carrier").slice(0, 500);
}
