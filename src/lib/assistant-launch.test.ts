import { describe, expect, it } from "vitest";
import { assistantLaunchStep } from "./assistant-launch";

const draft = { requested: true, status: "draft", name: "James", body: "Hello. STOP", hasAudience: true };
describe("assistant campaign send shortcut", () => {
  it("skips repeated setup but retains the test step before final confirmation", () => {
    expect(assistantLaunchStep(draft)).toBe(3);
  });
  it.each(["queued", "sending", "paused", "blocked_content", "cancelled", "completed"])("never shortcuts a %s campaign", status => {
    expect(assistantLaunchStep({ ...draft, status })).toBe(0);
  });
  it.each([{ name: "" }, { body: "" }, { hasAudience: false }, { requested: false }])("retains setup for incomplete or ordinary drafts: %o", change => {
    expect(assistantLaunchStep({ ...draft, ...change })).toBe(0);
  });
});