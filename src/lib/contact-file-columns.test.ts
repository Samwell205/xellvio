import { describe, it, expect } from "vitest";
import { detectContactColumns } from "./contact-file-columns";

describe("contact file column detection", () => {
  it("accepts a 'Phone Number' heading with a space", () => {
    expect(detectContactColumns([["Business Name", "Phone Number"], ["Acme", "4085551234"]])?.phoneIndex).toBe(1);
  });
  it("finds the phone column without a recognised heading", () => {
    const c = detectContactColumns([["Company", "Contact"], ["Acme", "(408) 555-1234"], ["Beta", "+14085550000"]]);
    expect(c).toEqual(expect.objectContaining({ hasHeader: true, phoneIndex: 1 }));
  });
  it("treats a file without headings as data", () => {
    expect(detectContactColumns([["Acme", "4085551234"], ["Beta", "4085550000"]])).toEqual(expect.objectContaining({ hasHeader: false, phoneIndex: 1 }));
  });
  it("returns null when no column holds phone numbers", () => {
    expect(detectContactColumns([["name", "city"], ["Ann", "Paris"]])).toBeNull();
  });
});
