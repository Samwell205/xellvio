import { describe, it, expect } from "vitest";
import { emailPlanFor } from "./email-plans";

describe("email plans (Omnisend prices)", () => {
  it("500 contacts: Standard $16 with 6,000 emails", () => {
    const p = emailPlanFor(500);
    expect(p.standard.price).toBe(16);
    expect(p.standard.emails).toBe(6000);
  });
  it("Pro starts at $59 for 2,500 contacts", () => {
    expect(emailPlanFor(250).pro).toMatchObject({ price: 59, contacts: 2500 });
  });
  it("10,000 contacts: Standard $132, Pro $150", () => {
    const p = emailPlanFor(10000);
    expect(p.standard.price).toBe(132);
    expect(p.pro.price).toBe(150);
  });
});
