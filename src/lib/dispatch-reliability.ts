export const DISPATCH_RUN_MS = 24_000;
export const DISPATCH_PLAN_ROWS = 250;
export const DISPATCH_SEND_RESERVE_MS = 16_000;
export const DISPATCH_CONNECTIONS = 6;
export function queuedPersistedIds(rows: Array<{id:string;status:string}>): Set<string> {
  return new Set(rows.filter(row=>row.status === "queued").map(row=>row.id));
}
export function canStartDispatchSend(deadlineAt:number, now=Date.now()) {
  return deadlineAt-now >= DISPATCH_SEND_RESERVE_MS;
}