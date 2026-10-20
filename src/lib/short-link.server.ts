export type TrackedLink = { url: string; message_id: string | null; campaign_id: string | null };
export type ShortLinkDependencies = {
  lookup: (code: string, signal: AbortSignal) => Promise<TrackedLink | null>;
  record: (code: string, link: TrackedLink, request: Request, signal: AbortSignal) => Promise<void>;
  unavailable: () => Response;
};

/** Only the indexed destination read blocks a recipient's redirect. */
export async function redirectTrackedLink(code: string, request: Request, dependencies: ShortLinkDependencies): Promise<Response> {
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return dependencies.unavailable();
  let link: TrackedLink | null;
  try { link = await dependencies.lookup(code, AbortSignal.timeout(4000)); }
  catch { return new Response("Link temporarily unavailable. Please try again.", {status:503,headers:{"Retry-After":"5","Cache-Control":"no-store"}}); }
  if (!link || !/^https?:\/\//i.test(link.url)) return dependencies.unavailable();
  if (request.method !== "HEAD") {
    const work = dependencies.record(code, link, request, AbortSignal.timeout(5000)).catch(error => console.error("[shortlink] click tracking failed", error instanceof Error ? error.message : "unknown"));
    const waitUntil = (request as Request & {waitUntil?: (work: Promise<unknown>) => void}).waitUntil;
    // Our server entry attaches execution-context waitUntil when available. Adapters without it retain
    // counting by awaiting bounded work, never by detaching an unowned promise.
    if (waitUntil) waitUntil(work);
    else await work;
  }
  return new Response(null,{status:302,headers:{Location:link.url,"Cache-Control":"no-store"}});
}