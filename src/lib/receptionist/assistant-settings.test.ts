import {describe,it,expect} from "vitest";
import {assistantGreeting,receptionistConfigSchema} from "./shared";
describe("Assistant greeting rules",()=>{
  it("waits for the caller when caller-first is chosen",()=>expect(assistantGreeting(receptionistConfigSchema.parse({greetingMode:"caller_first"}))).toBe(""));
  it("uses the documented generated greeting mode",()=>expect(assistantGreeting(receptionistConfigSchema.parse({greetingMode:"generated"}))).toBe("<assistant-speaks-first-with-model-generated-message>"));
  it("discloses AI identity in a fixed greeting",()=>expect(assistantGreeting(receptionistConfigSchema.parse({businessName:"Example",greeting:"Welcome"}))).toContain("I'm the AI assistant for Example."));
  it("keeps independent assistant names",()=>expect(receptionistConfigSchema.parse({assistantName:"Sales"}).assistantName).toBe("Sales"));
});