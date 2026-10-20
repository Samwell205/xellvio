import {describe,it,expect} from "vitest";
import {assistantGreeting,receptionistConfigSchema,assistantRuntimeSettings} from "./shared";
describe("Assistant greeting rules",()=>{
  it("waits for the caller when caller-first is chosen",()=>expect(assistantGreeting(receptionistConfigSchema.parse({greetingMode:"caller_first"}))).toBe(""));
  it("uses the documented generated greeting mode",()=>expect(assistantGreeting(receptionistConfigSchema.parse({greetingMode:"generated"}))).toBe("<assistant-speaks-first-with-model-generated-message>"));
  it("discloses AI identity in a fixed greeting",()=>expect(assistantGreeting(receptionistConfigSchema.parse({businessName:"Example",greeting:"Welcome"}))).toContain("I'm the AI assistant for Example."));
  it("keeps independent assistant names",()=>expect(receptionistConfigSchema.parse({assistantName:"Sales"}).assistantName).toBe("Sales"));
});
describe("Advanced assistant settings",()=>{
  it("passes the selected supported model and voice to provisioning",()=>{
    expect(assistantRuntimeSettings(receptionistConfigSchema.parse({model:"moonshotai/Kimi-K2.6",voice:"Telnyx.Ultra.Clara",voiceSpeed:1.2}))).toEqual({model:"moonshotai/Kimi-K2.6",voice_settings:{voice:"Telnyx.Ultra.Clara",voice_speed:1.2}});
  });
  it("preserves managed defaults when no overrides are chosen",()=>expect(assistantRuntimeSettings(receptionistConfigSchema.parse({}))).toEqual({}));
  it("rejects undocumented models and out-of-range voice speeds",()=>{
    expect(receptionistConfigSchema.safeParse({model:"invented"}).success).toBe(false);
    expect(receptionistConfigSchema.safeParse({voiceSpeed:1.6}).success).toBe(false);
  });
});