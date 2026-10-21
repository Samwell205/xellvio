import { describe, expect, it, vi } from "vitest";
import { readCampaignAccount } from "./campaign-account";

describe("campaign shared balance", () => {
  it("reads the business's $55 rather than the teammate's $0", async () => {
    const accounts = [{ id: "owner", credit_balance: 55 }, { id: "teammate", credit_balance: 0 }];
    const eq = vi.fn((_column: string, id: string) => ({ single: async () => ({ data: accounts.find(a => a.id === id), error: null }) }));
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) };
    const result = await readCampaignAccount(client as unknown as Parameters<typeof readCampaignAccount>[0], "owner");
    expect(eq).toHaveBeenCalledWith("id", "owner");
    expect(result).toEqual({ id: "owner", credit_balance: 55 });
  });
  it("does not turn a failed balance read into zero credit", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error("Unavailable") }) }) }) }) };
    await expect(readCampaignAccount(client as unknown as Parameters<typeof readCampaignAccount>[0], "owner")).rejects.toThrow("Unavailable");
  });
});