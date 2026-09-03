import { describe, expect, it } from "vitest";
import { keywordScan } from "./content-scanner";

describe("keywordScan gambling classification", () => {
  it("consistently blocks the reported NCAA betting promotion", () => {
    const result = keywordScan(`Stock Trader to Sports Bettor
Huge ROI on winning games.
1 Free NCAA football winner.
Text YES to 305-771-8685
Reply STOP to unsubscribe.`);

    expect(result).toMatchObject({
      allowed: false,
      category: "gambling",
      confidence: "keyword",
    });
  });

  it.each([
    "NCAA football schedule update: kickoff is at 7 PM. Reply STOP to unsubscribe.",
    "Your football registration is confirmed. Meet the team at the field at 6 PM.",
    "Tonight's basketball game has moved to Court 2. Reply STOP to unsubscribe.",
  ])("allows an ordinary sports notice: %s", (message) => {
    expect(keywordScan(message)).toEqual({ allowed: true, confidence: "none" });
  });
});

describe("keywordScan carrier-risk classification", () => {
  it("holds urgent filing and compliance link language for review", () => {
    const result = keywordScan(
      "COTA SUPPLY LLC: Filing Step Required. Your Compliance Report is still pending. File Now: https://example.com/home Reply STOP to unsubscribe.",
    );

    expect(result).toMatchObject({
      allowed: true,
      category: "phishing",
      confidence: "keyword",
    });
  });

  it("does not flag an ordinary identified business update with a link", () => {
    expect(
      keywordScan("COTA SUPPLY LLC: Your order is ready for pickup. View details: https://example.com Reply STOP to unsubscribe."),
    ).toEqual({ allowed: true, confidence: "none" });
  });
});