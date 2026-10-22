import { describe, expect, it } from "vitest";
import { ACCOUNT_AREAS, accountEditSchema, canUseAccountArea } from "./account-assistant-catalog";
const id = "11111111-1111-4111-8111-111111111111";
describe("account-wide assistant authorization and changes", () => {
  it.each(ACCOUNT_AREAS)("lets owners access %s", area => {
    expect(canUseAccountArea(area, { isOwner: true, permissions: {} })).toBe(true);
  });
  it("limits an inbox teammate to their granted area", () => {
    const member = { isOwner: false, permissions: { inbox: true } };
    expect(canUseAccountArea("inbox", member)).toBe(true);
    expect(canUseAccountArea("billing", member)).toBe(false);
    expect(canUseAccountArea("settings", member)).toBe(false);
  });
  it("keeps team management owner-only even with a team grant", () => {
    expect(canUseAccountArea("team", { isOwner: false, permissions: { team: true } })).toBe(false);
  });
  it.each(["credit_balance", "sending_suspended_at", "email", "tos_current_version_accepted", "role"])("rejects protected settings field %s", field => {
    expect(accountEditSchema.safeParse({ resource: "settings", id, field, value: "changed" }).success).toBe(false);
  });
  it.each(["active", "live", "queued", "sending"])("never activates a workflow with status %s", value => {
    expect(accountEditSchema.safeParse({ resource: "automation", id, field: "status", value }).success).toBe(false);
  });
  it("allows pausing, renaming and draft campaign content", () => {
    expect(accountEditSchema.parse({ resource: "flow", id, field: "status", value: "paused" }).value).toBe("paused");
    expect(accountEditSchema.parse({ resource: "list", id, field: "name", value: "Customers" }).value).toBe("Customers");
    expect(accountEditSchema.parse({ resource: "campaign", id, field: "message_body", value: "Hello. STOP" }).value).toBe("Hello. STOP");
  });
});