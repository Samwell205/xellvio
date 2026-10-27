import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { assistantMessageActionIds } from "./assistant-message-actions";

describe("conversation action ownership", () => {
  it("keeps a saved action on its original assistant turn, not subsequent replies", () => {
    const messages = [
      {
        id: "design",
        role: "assistant",
        parts: [{ type: "tool-design_signup_form", output: { id: "form" } }],
      },
      { id: "question", role: "user", parts: [{ type: "text", text: "Have you designed it?" }] },
      {
        id: "answer",
        role: "assistant",
        parts: [{ type: "tool-design_signup_form", output: { id: "form" } }],
      },
    ] as UIMessage[];
    expect(assistantMessageActionIds(messages).get("design")).toEqual(["form"]);
    expect(assistantMessageActionIds(messages).get("answer")).toEqual([]);
  });
  it("attaches inspected upload actions to their own assistant reply only", () => {
    const messages = [
      { id: "upload", role: "user", metadata: { uploadOperationId: "import" }, parts: [] },
      { id: "inspection", role: "assistant", parts: [] },
      { id: "later", role: "assistant", parts: [] },
    ] as UIMessage[];
    expect(assistantMessageActionIds(messages).get("inspection")).toEqual(["import"]);
    expect(assistantMessageActionIds(messages).get("later")).toEqual([]);
  });
  it("does not attach an unrelated action to an ordinary message", () => {
    expect(
      assistantMessageActionIds([
        { id: "hello", role: "assistant", parts: [{ type: "text", text: "Hello" }] },
      ]).get("hello"),
    ).toEqual([]);
  });
});
