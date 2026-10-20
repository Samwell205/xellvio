import {describe,it,expect,vi} from "vitest";
import {redirectTrackedLink, type ShortLinkDependencies} from "./short-link.server";
const link={url:"https://example.org/offer",message_id:"message",campaign_id:"campaign"};
const deps=():ShortLinkDependencies=>({lookup:vi.fn(async()=>link),record:vi.fn(async()=>{}),unavailable:()=>new Response(null,{status:404})});
describe("Tracked link reliability",()=>{
  it("returns the exact destination while background tracking is still pending",async()=>{
    const d=deps();let finish=()=>{};d.record=vi.fn(()=>new Promise<void>(r=>{finish=r}));
    const pending:Promise<unknown>[]=[];const req=Object.assign(new Request("https://xellvio.com/r/abcd"),{waitUntil:(p:Promise<unknown>)=>pending.push(p)});
    const response=await redirectTrackedLink("abcd",req,d);
    expect(response.status).toBe(302);expect(response.headers.get("Location")).toBe("https://example.org/offer");expect(pending).toHaveLength(1);finish();await pending[0];
  });
  it("does not count HEAD requests as recipient clicks",async()=>{
    const d=deps();expect((await redirectTrackedLink("abcd",new Request("https://xellvio.com/r/abcd",{method:"HEAD"}),d)).status).toBe(302);expect(d.record).not.toHaveBeenCalled();
  });
  it("returns a recoverable failure when destination lookup fails",async()=>{
    const d=deps();d.lookup=async()=>{throw new Error("database unavailable")};expect((await redirectTrackedLink("abcd",new Request("https://xellvio.com/r/abcd"),d)).status).toBe(503);
  });
  it("rejects invalid codes without a message-history scan",async()=>{
    const d=deps();expect((await redirectTrackedLink("bad/code",new Request("https://xellvio.com/r/bad"),d)).status).toBe(404);expect(d.lookup).not.toHaveBeenCalled();
  });
});