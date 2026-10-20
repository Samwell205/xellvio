import {describe,it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({getUserById:vi.fn(),resolve:vi.fn()}));
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{auth:{admin:{getUserById:mocks.getUserById}}}}));
vi.mock("./acting-account.server",()=>({resolveActingAccount:mocks.resolve}));
import {hasVoicePilotAccess,assertVoicePilotAccess} from "./voice-rollout.server";
describe("Pilot server boundary",()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.getUserById.mockResolvedValue({error:null,data:{user:{email:"samueldurosinmi69@gmail.com",email_confirmed_at:"2026-10-20T16:56:00Z"}}});});
 it("allows Samuel in his own verified tenant account",async()=>{
  expect(await hasVoicePilotAccess("samuel-id","samuel-id")).toBe(true);
 });
 it("does not grant teammates or another account access",async()=>{
  expect(await hasVoicePilotAccess("teammate-id","samuel-id")).toBe(false);
  expect(await hasVoicePilotAccess("samuel-id","other-tenant-id")).toBe(false);
  expect(mocks.getUserById).not.toHaveBeenCalled();
 });
 it("denies the incorrect previous email even when verified",async()=>{
  mocks.getUserById.mockResolvedValue({error:null,data:{user:{email:"samueldurosinmi64@gmail.com",email_confirmed_at:"2026-10-20T16:56:00Z"}}});
  expect(await hasVoicePilotAccess("previous-id","previous-id")).toBe(false);
 });
 it("fails closed when identity lookup fails",async()=>{
  mocks.getUserById.mockResolvedValue({error:new Error("Unavailable"),data:{user:null}});
  await expect(assertVoicePilotAccess("other-id","other-id")).rejects.toThrow("coming soon");
 });
});