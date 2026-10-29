import { describe, it, expect } from "vitest";
import { normalizeSendingDomain } from "./email-domain-rules";

describe("normalizeSendingDomain", () => {
  it("strips protocol, www and paths", () => {
    expect(normalizeSendingDomain("https://www.Xellvio.com/pricing")).toBe("xellvio.com");
  });
  it("keeps subdomains", () => expect(normalizeSendingDomain("mail.acme.co.uk")).toBe("mail.acme.co.uk"));
  it("rejects junk", () => {
    expect(normalizeSendingDomain("acme")).toBeNull();
    expect(normalizeSendingDomain("jane@acme.com")).toBeNull();
  });
});
