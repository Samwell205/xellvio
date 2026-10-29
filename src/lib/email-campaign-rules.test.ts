import { describe, expect, it } from "vitest";
import { assertEmailQuota, bundleQuote, emailSenderDomain, renderEmail, safeEmailUrl } from "./email-campaign-rules";
describe("email campaign safeguards", () => {
  it("free allows exactly 25 contacts", () => {
    expect(() => assertEmailQuota(25, 1, 0, bundleQuote("free", 25))).not.toThrow();
    expect(() => assertEmailQuota(26, 1, 0, bundleQuote("free", 25))).toThrow();
  });
  it("free reserves at most 50 emails monthly", () => {
    expect(() => assertEmailQuota(25, 1, 49, bundleQuote("free", 25))).not.toThrow();
    expect(() => assertEmailQuota(25, 2, 49, bundleQuote("free", 25))).toThrow();
  });
  it("standard grants 12 times contacts", () => expect(bundleQuote("standard", 500).emails).toBe(6000));
  it("pro has unlimited monthly allowance", () => expect(bundleQuote("pro", 2500).emails).toBeNull());
  it("discount ends after three paid months", () => {
    expect(bundleQuote("standard", 500, 2).charge).toBe(11.2);
    expect(bundleQuote("standard", 500, 3).charge).toBe(16);
  });
  it("requires the exact sender domain", () => expect(emailSenderDomain("owner@other.example")).toBe("other.example"));
  it("blocks executable links", () => expect(safeEmailUrl("javascript:alert(1)")).toBe(""));
  it("escapes personalized recipient content", () => {
    const html = renderEmail({ from_name: "Test", preheader: "", postal_address: "Address", blocks: [{ id: "a", type: "text", text: "Hi {{first_name}}", url: "" }] }, "https://xellvio.com/unsubscribe/test", "<script>");
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
});