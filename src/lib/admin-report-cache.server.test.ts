import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: null as null | { payload: unknown; computed_at: string }, upsert: vi.fn(async () => ({ error: null })) }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row }) }) }), upsert: state.upsert }) } }));
import { cachedReport } from './admin-report-cache.server';
beforeEach(() => { state.row = { payload: { amount: 12 }, computed_at: '2020-01-01T00:00:00Z' }; vi.clearAllMocks(); });
describe('explicit finance recalculation', () => {
  it('returns saved finance totals and their timestamp without a history scan', async () => {
    const compute = vi.fn(async () => ({ amount: 99 }));
    expect(await cachedReport('finance', compute, { allowStale: true })).toEqual({ value: { amount: 12 }, computedAt: '2020-01-01T00:00:00Z', cached: true });
    expect(compute).not.toHaveBeenCalled();
  });
  it('recalculates after explicit refresh even when a saved total exists', async () => {
    const compute = vi.fn(async () => ({ amount: 99 }));
    expect(await cachedReport('finance', compute, { allowStale: true, refresh: true })).toMatchObject({ value: { amount: 99 }, cached: false });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(state.upsert).toHaveBeenCalledTimes(1);
  });
  it('preserves default expiry behavior for other reports', async () => {
    const compute = vi.fn(async () => 44);
    expect(await cachedReport('other', compute)).toMatchObject({ value: 44, cached: false });
    expect(compute).toHaveBeenCalledTimes(1);
  });
  it('computes missing totals rather than pretending zero is real', async () => {
    state.row = null;
    const compute = vi.fn(async () => 71);
    expect(await cachedReport('finance', compute, { allowStale: true })).toMatchObject({ value: 71, cached: false });
    expect(compute).toHaveBeenCalledTimes(1);
  });
});