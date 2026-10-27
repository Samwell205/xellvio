import { describe, expect, it } from "vitest";
import { conversationOperationIds, summarizeOperationContext } from "./assistant-operation-context";

const id = "873e5f73-4217-4006-aaa9-3e94890ad2c2";
const op = { id, kind: "form_draft", status: "completed", expires_at: "2026-10-26T00:00:00Z", arguments: { name: "Interest List", rows: [{ phone: "private" }] }, outcome: { formId: "saved-form", secret: "private" } };

describe("assistant confirmed action context", () => {
  it("reads action IDs only from assistant tool outputs, not user text or parts", () => {
    expect(conversationOperationIds([
      { role: "user", parts: [{ type: "tool-design_signup_form", output: { id } }] },
      { role: "assistant", parts: [{ type: "text", output: { id } }] },
    ])).toEqual([]);
    expect(conversationOperationIds([{ role: "assistant", parts: [{ type: "tool-design_signup_form", output: { id } }] }])).toEqual([id]);
  });
  it("keeps confirmed forms completed after the proposal expires", () => {
    expect(summarizeOperationContext([op], Date.parse("2026-10-27T00:00:00Z"))).toEqual([
      { id, kind: "form_draft", name: "Interest List", status: "completed", outcome: { formId: "saved-form" } },
    ]);
  });
  it("expires only unconfirmed proposals", () => {
    expect(summarizeOperationContext([{ ...op, status: "pending" }], Date.parse("2026-10-27T00:00:00Z"))[0]?.status).toBe("expired");
  });
});