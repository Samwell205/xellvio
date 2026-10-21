import {describe,it,expect} from "vitest";
import {queuedPersistedIds,canStartDispatchSend,DISPATCH_PLAN_ROWS,DISPATCH_CONNECTIONS} from "./dispatch-reliability";
describe("Dispatch persistence and request budget",()=>{
  it("tracks only persisted queued IDs, never an ignored duplicate or failed row",()=>{
    const ids=queuedPersistedIds([{id:"persisted",status:"queued"},{id:"no-credit",status:"failed"}]);
    expect([...ids]).toEqual(["persisted"]);expect(ids.has("ignored-duplicate")).toBe(false);expect(ids.has("deleted-profile")).toBe(false);
  });
  it("does not begin a new carrier call without time for completion and status writes",()=>{
    expect(canStartDispatchSend(24000,16000)).toBe(true);expect(canStartDispatchSend(24000,16001)).toBe(false);
  });
  it("bounds planning and concurrent outbound work",()=>{
    expect(DISPATCH_PLAN_ROWS).toBe(250);expect(DISPATCH_CONNECTIONS).toBe(6);
  });
});