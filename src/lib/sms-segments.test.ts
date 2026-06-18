import { describe, it, expect } from "vitest";
import { calculateSegments } from "./sms-segments";

describe("calculateSegments — GSM-7 boundaries", () => {
  it("empty body → 0 segments", () => {
    expect(calculateSegments("")).toEqual({ encoding: "GSM-7", charCount: 0, segments: 0 });
  });

  it("1 char → 1 segment, GSM-7", () => {
    const r = calculateSegments("A");
    expect(r).toEqual({ encoding: "GSM-7", charCount: 1, segments: 1 });
  });

  it("exactly 160 GSM chars = 1 segment", () => {
    const body = "A".repeat(160);
    expect(calculateSegments(body)).toEqual({ encoding: "GSM-7", charCount: 160, segments: 1 });
  });

  it("161 GSM chars = 2 segments (153 per segment)", () => {
    const body = "A".repeat(161);
    expect(calculateSegments(body)).toEqual({ encoding: "GSM-7", charCount: 161, segments: 2 });
  });

  it("exactly 306 GSM chars (2 × 153) = 2 segments", () => {
    const body = "A".repeat(306);
    expect(calculateSegments(body).segments).toBe(2);
  });

  it("307 GSM chars = 3 segments", () => {
    expect(calculateSegments("A".repeat(307)).segments).toBe(3);
  });

  it("459 GSM chars (3 × 153) = 3 segments", () => {
    expect(calculateSegments("A".repeat(459)).segments).toBe(3);
  });

  it("460 GSM chars = 4 segments", () => {
    expect(calculateSegments("A".repeat(460)).segments).toBe(4);
  });
});

describe("calculateSegments — Unicode boundaries", () => {
  it("single emoji → Unicode, 1 segment", () => {
    const r = calculateSegments("👍");
    expect(r.encoding).toBe("Unicode");
    expect(r.segments).toBe(1);
  });

  it("exactly 70 Unicode chars (emoji) = 1 segment", () => {
    const body = "👍" + "a".repeat(69);
    expect(calculateSegments(body)).toMatchObject({ encoding: "Unicode", segments: 1 });
  });

  it("71 Unicode chars = 2 segments (67 per segment)", () => {
    const body = "👍" + "a".repeat(70);
    expect(calculateSegments(body)).toMatchObject({ encoding: "Unicode", segments: 2 });
  });

  it("134 Unicode chars (2 × 67) = 2 segments", () => {
    const body = "ñ".repeat(134);
    expect(calculateSegments(body)).toMatchObject({ encoding: "Unicode", segments: 2 });
  });

  it("135 Unicode chars = 3 segments", () => {
    const body = "ñ".repeat(135);
    expect(calculateSegments(body).segments).toBe(3);
  });

  it("non-Latin (Arabic) flips to Unicode", () => {
    expect(calculateSegments("مرحبا").encoding).toBe("Unicode");
  });

  it("Cyrillic flips to Unicode", () => {
    expect(calculateSegments("Привет").encoding).toBe("Unicode");
  });
});

describe("calculateSegments — encoding detection", () => {
  it("plain ASCII stays GSM-7", () => {
    expect(calculateSegments("Hello, world! 123").encoding).toBe("GSM-7");
  });

  it("Euro sign stays GSM-7 (extension table char)", () => {
    expect(calculateSegments("Price €5").encoding).toBe("GSM-7");
  });

  it("STOP reply text is GSM-7", () => {
    expect(calculateSegments("Reply STOP to unsubscribe.").encoding).toBe("GSM-7");
  });
});
