import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVerifierVerification, provisionVerifierNumber, submitVerifierVerification } from "./verifier-twilio.server";
import { parseVerifierRegistration } from "./verifier-registration";
import { registration } from "./verifier-registration.test";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function dbMock() {
  const db = { from: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn() };
  db.from.mockReturnValue(db); db.update.mockReturnValue(db); db.eq.mockReturnValue(db); db.insert.mockResolvedValue({ error: null });
  return db;
}
function requestMock(bodies: unknown[]) {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACparent"); vi.stubEnv("TWILIO_AUTH_TOKEN", "fake-parent-token");
  const request = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(bodies.shift()), { status: 200 }));
  vi.stubGlobal("fetch", request); return request;
}
const child = { owner_account_sid: "ACparent", auth_token: "fake-child-token" };
const phone = { sid: "PNone", account_sid: "ACchild" };
const owned = { incoming_phone_numbers: [phone], next_page_uri: null };
const options = () => ({ db: dbMock(), subaccountSid: "ACchild", phoneSid: "PNone", existingVerificationSid: null, payload: parseVerifierRegistration(registration) });
describe("verifier child-account verification", () => {
  it("submits all details in the owning single-number subaccount", async () => {
    const request = requestMock([child, phone, owned, { sid: "HHverify", status: "IN_REVIEW" }]);
    const result = await submitVerifierVerification(options());
    expect(result).toMatchObject({ verificationSid: "HHverify", status: "in_review" });
    const args = request.mock.calls[3] as unknown as [string, RequestInit];
    expect(args[0]).toBe("https://messaging.twilio.com/v1/Tollfree/Verifications");
    expect(new Headers(args[1].headers).get("Authorization")).toBe(`Basic ${Buffer.from("ACchild:fake-child-token").toString("base64")}`);
    const fields = args[1].body as URLSearchParams;
    expect(fields.getAll("UseCaseCategories")).toEqual(["MARKETING"]);
    expect(fields.get("MessageVolume")).toBe("10,000");
    expect(fields.get("DoingBusinessAs")).toBe("Example");
    expect(fields.getAll("OptInKeywords")).toEqual(["START", "YES", "SUBSCRIBE"]);
    expect(fields.get("TollfreePhoneNumberSid")).toBe("PNone");
    expect(fields.get("OptInImageUrls")).toBe(registration.proofOfOptInUrl);
  });
  it("rejects incomplete compliance details before carrier access", async () => {
    const request = requestMock([]);
    await expect(submitVerifierVerification({ ...options(), payload: { ...options().payload, agreeToTos: false } })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it("refuses a subaccount containing multiple numbers", async () => {
    const request = requestMock([child, phone, { incoming_phone_numbers: [phone, { sid: "PNtwo" }] }]);
    await expect(submitVerifierVerification(options())).rejects.toThrow("only this number");
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("refuses mismatched phone ownership", async () => {
    const request = requestMock([child, { ...phone, account_sid: "ACother" }]);
    await expect(submitVerifierVerification(options())).rejects.toThrow("ownership");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("never treats a missing verification identifier as submission success", async () => {
    requestMock([child, phone, owned, { status: "IN_REVIEW" }]);
    await expect(submitVerifierVerification(options())).rejects.toThrow("not confirmed");
  });
  it("refreshes approved verification in its owning account and targets only that verification", async () => {
    const db = dbMock(); const request = requestMock([child, { sid: "HHverify", status: "TWILIO_APPROVED" }]);
    expect(await fetchVerifierVerification(db, "ACchild", "HHverify")).toMatchObject({ status: "verified" });
    expect(request.mock.calls[1]?.[0]).toBe("https://messaging.twilio.com/v1/Tollfree/Verifications/HHverify");
    expect(db.eq).toHaveBeenCalledWith("verification_sid", "HHverify");
  });
  it("creates a different subaccount for each newly provisioned number", async () => {
    const db = dbMock();
    const request = requestMock([
      { sid: "ACone", auth_token: "fake-one" }, { available_phone_numbers: [{ phone_number: "+18005550101" }] }, { sid: "PNone", phone_number: "+18005550101" },
      { sid: "ACtwo", auth_token: "fake-two" }, { available_phone_numbers: [{ phone_number: "+18005550102" }] }, { sid: "PNtwo", phone_number: "+18005550102" },
    ]);
    expect((await provisionVerifierNumber(db, "verifier")).subaccountSid).toBe("ACone");
    expect((await provisionVerifierNumber(db, "verifier")).subaccountSid).toBe("ACtwo");
    expect(request.mock.calls[2]?.[0]).toContain("/Accounts/ACone/IncomingPhoneNumbers.json");
    expect(request.mock.calls[5]?.[0]).toContain("/Accounts/ACtwo/IncomingPhoneNumbers.json");
  });
});