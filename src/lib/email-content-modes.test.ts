import { describe, expect, it } from "vitest";
import { hasEmailContent, renderEmail, renderEmailText, sanitizeEmailHtml } from "./email-campaign-rules";
const base = { from_name: "Shop", preheader: "", postal_address: "1 Main St", blocks: [] };
describe("email content modes", () => {
  it("plain message sends without a design and keeps unsubscribe", () => {
    const d = { ...base, content_mode: "plain" as const, plain_body: "Hi {{first_name}}" };
    expect(renderEmailText(d, "https://u.test/x", "Ann")).toContain("Hi Ann");
    expect(renderEmail(d, "https://u.test/x", "Ann")).toContain('href="https://u.test/x"');
  });
  it("html mode strips scripts and event handlers", () => {
    const out = sanitizeEmailHtml('<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:bad()">x</a>');
    expect(out).not.toMatch(/script|onclick|javascript/i);
  });
  it("html mode adds unsubscribe when tenant HTML has none", () => {
    expect(renderEmail({ ...base, content_mode: "html", html_body: "<p>Hello</p>" }, "https://u.test/z")).toContain("https://u.test/z");
  });
  it("html mode fills the tenant's own unsubscribe placeholder", () => {
    const html = renderEmail({ ...base, content_mode: "html", html_body: '<a href="{{unsubscribe_url}}">Leave</a>' }, "https://u.test/q");
    expect(html).toContain('href="https://u.test/q"'); expect(html.match(/u\.test\/q/g)?.length).toBe(1);
  });
  it("requires content for the chosen mode", () => {
    expect(hasEmailContent({ content_mode: "plain", plain_body: " ", html_body: "", blocks: [] })).toBe(false);
    expect(hasEmailContent({ content_mode: "html", plain_body: "", html_body: "<p>x</p>", blocks: [] })).toBe(true);
  });
});
