import { describe, it, expect } from "vitest";
import { keywordScan } from "./content-scanner";

const blocked = [
  "Earn $5,000 every week without working!",
  "Join our investment program and double your money.",
  "Apply for a payday loan and get cash instantly.",
  "We can erase all your debts immediately.",
  "Buy our premium THC products today.",
  "Join our network and earn money recruiting others.",
  "Congratulations! You've won $10,000. Click here to claim.",
  "Guaranteed credit score increase in 24 hours.",
  "Get paid $500 daily as a secret shopper.",
];
describe("carrier policy examples", () => {
  for (const m of blocked) it(`blocks: ${m}`, () => expect(keywordScan(m).allowed).toBe(false));
  it("allows a normal promo", () => expect(keywordScan("Hi from Bella Salon: 20% off haircuts this week. Reply STOP to opt out.").allowed).toBe(true));
});
