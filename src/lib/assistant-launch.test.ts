import { describe, expect, it } from "vitest";
import { assistantLaunchStep, campaignDraftResumeStep } from "./assistant-launch";

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

const saved = { status: "draft", name: "James", body: "Hello. STOP", hasAudience: true, sendMode: "now", scheduleAt: null };
describe("campaign draft resume step", () => {
  it("resumes a complete draft at the test step", () => {
    expect(campaignDraftResumeStep(saved)).toBe(3);
  });
  it("resumes at the first step missing content", () => {
    expect(campaignDraftResumeStep({ ...saved, name: "" })).toBe(0);
    expect(campaignDraftResumeStep({ ...saved, hasAudience: false })).toBe(0);
    expect(campaignDraftResumeStep({ ...saved, body: "" })).toBe(1);
    expect(campaignDraftResumeStep({ ...saved, sendMode: "scheduled" })).toBe(2);
    expect(campaignDraftResumeStep({ ...saved, sendMode: "scheduled", scheduleAt: "2026-10-23T10:00:00Z" })).toBe(3);
  });
  it.each(["queued", "sending", "completed", "cancelled"])("never resumes a %s campaign", status => {
    expect(campaignDraftResumeStep({ ...saved, status })).toBe(0);
  });
});