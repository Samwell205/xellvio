// Owner rule: carrier spam-filter refusals (40002) are recorded as message
// failures but must never auto-pause a campaign — campaigns run to completion
// and refusals show in the report instead.
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const routeSrc = readFileSync(resolve(__dirname, "../routes/api.public.dispatch-campaign.ts"), "utf8");

describe("Carrier-refusal pause policy",()=>{
  it("dispatch never pauses a campaign because carriers refused the messages",()=>{
    expect(routeSrc).not.toMatch(/Paused by carrier preflight/);
    expect(routeSrc).not.toMatch(/Paused automatically: the recipient carriers/);
    expect(routeSrc).not.toMatch(/carrierPreflight|carrierSpamBlockRate/);
  });
});
