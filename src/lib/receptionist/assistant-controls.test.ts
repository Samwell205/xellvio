import {describe,it,expect} from "vitest";
import {assistantEditSchema} from "./assistant-controls";
describe("Separate business assistant settings",()=>{
 it("preserves different instructions and notifications for multiple assistants",()=>{
  const a=assistantEditSchema.parse({id:"11111111-1111-4111-8111-111111111111",configuration:{assistantName:"Sales",agentInstructions:"Capture sales enquiries",notifyEmail:"sales@example.org"}});
  const b=assistantEditSchema.parse({id:"22222222-2222-4222-8222-222222222222",configuration:{assistantName:"Support",agentInstructions:"Take support requests",notifyEmail:"support@example.org"}});
  expect(a.configuration.agentInstructions).toBe("Capture sales enquiries");expect(b.configuration.notifyEmail).toBe("support@example.org");expect(a.configuration.notifyEmail).toBe("sales@example.org");
 });
 it("rejects invalid transfer destinations and unknown voice choices",()=>{
  expect(assistantEditSchema.safeParse({id:"11111111-1111-4111-8111-111111111111",configuration:{handoffNumber:"not-a-number"}}).success).toBe(false);
  expect(assistantEditSchema.safeParse({id:"11111111-1111-4111-8111-111111111111",configuration:{voice:"unknown"}}).success).toBe(false);
 });
});