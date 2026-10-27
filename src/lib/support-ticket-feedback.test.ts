import { describe, expect, it } from "vitest";
import { ticketFeedbackSchema } from "./support-tickets.functions";

describe("ticket resolution feedback", () => {
  it("allows closing without feedback", () => {
    expect(ticketFeedbackSchema.parse({}).rating ?? null).toBeNull();
  });

  it.each([1, 2, 3, 4, 5])("accepts a %i-star rating", rating => {
    expect(ticketFeedbackSchema.parse({ rating }).rating).toBe(rating);
  });

  it.each([0, 6, 2.5, -1])("rejects invalid rating %s", rating => {
    expect(ticketFeedbackSchema.safeParse({ rating }).success).toBe(false);
  });

  it("caps feedback text at 2000 characters", () => {
    expect(ticketFeedbackSchema.safeParse({ feedback: "x".repeat(2001) }).success).toBe(false);
    expect(ticketFeedbackSchema.safeParse({ feedback: "x".repeat(2000) }).success).toBe(true);
  });
});
