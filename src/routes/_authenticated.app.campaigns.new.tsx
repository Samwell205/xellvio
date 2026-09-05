import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendTestSms, getTestSendUsage } from "@/lib/sms.functions";
import { getActiveCountryRatesRaw } from "@/lib/public-pricing.functions";
import { createPreviewShortlink } from "@/lib/shortlinks.functions";
import {
  getCampaignAudienceCountryCounts,
  listAudienceContactLists,
} from "@/lib/audience.functions";

import { scanCampaignContent } from "@/lib/content-scanner.functions";
import { calculateSegments } from "@/lib/sms-segments";
import { prepareMmsImage } from "@/lib/mms-image";
import { publicCampaignMediaUrl } from "@/lib/campaign-media";
import { countryFromPhone } from "@/lib/country-from-phone";
import { formatUSD, formatRate } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

import { toast } from "sonner";
import { z } from "zod";
import {
  Megaphone,
  Users,
  MessageSquare,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertTriangle,
  ShieldCheck,
  Smartphone,
  DollarSign,
  Phone,
} from "lucide-react";
import { trackProduct } from "@/lib/growth/track";

// A tracked short link may live on the shared platform domain or on a
// tenant's branded click domain, so match any host with a /r/<code> path.
const TRACKED_SHORT_URL = /^https?:\/\/[a-zA-Z0-9.-]+\/r\/[a-zA-Z0-9]{4,16}$/;

export const Route = createFileRoute("/_authenticated/app/campaigns/new")({
  head: () => ({ meta: [{ title: "New campaign — Xellvio" }] }),
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ id: z.string().uuid().optional() }).parse(s),
  component: NewCampaignPage,
});

const STEPS = ["Audience", "Message", "Schedule", "Test", "Review"] as const;
type StepIdx = 0 | 1 | 2 | 3 | 4;

type State = {
  name: string;
  include: string[];
  exclude: string[];
  profileIds: string[];
  listIds: string[];
  body: string;
  mediaUrl: string;
  sendMode: "now" | "scheduled" | "smart";
  scheduleAt: string;
  smartSkipHours: number;
  testTo: string;
  testSent: boolean;
  excludedCountries: string[];
  trackLinks: boolean;
};

const STOP_LINE = "\nReply STOP to unsubscribe.";

function senderDisplayName(
  sender:
    | {
        sender_kind?: string | null;
        phone_number?: string | null;
        telnyx_messaging_profile_id?: string | null;
      }
    | null
    | undefined,
) {
  if (!sender) return "No verified sender";
  if (sender.phone_number) return sender.phone_number;
  if (sender.sender_kind === "sender_id") return "Alphanumeric Sender ID";
  if (sender.telnyx_messaging_profile_id) return "Messaging Service";
  return sender.sender_kind ?? "Messaging Service";
}

function renderPreviewWithLinks(text: string): ReactNode {
  const URL_RE = /(https?:\/\/[^\s<>()\[\]"']+)/gi;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(<span key={`t${i}`}>{text.slice(last, m.index)}</span>);
    nodes.push(
      <a
        key={`a${i}`}
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline break-all"
      >
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(<span key={`t${i}`}>{text.slice(last)}</span>);
  return <>{nodes}</>;
}

function NewCampaignPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/_authenticated/app/campaigns/new" });
  const editingCampaignId = search.id ?? null;
  const [step, setStep] = useState<StepIdx>(0);
  const [campaignId, setCampaignId] = useState<string | null>(editingCampaignId);
  const [s, setS] = useState<State>({
    name: "",
    include: [],
    exclude: [],
    profileIds: [],
    listIds: [],
    body: "",
    mediaUrl: "",
    sendMode: "now",
    scheduleAt: "",
    smartSkipHours: 8,
    testTo: "",
    testSent: false,
    // Link shortening is opt-in: nobody's URLs get rewritten unless the tenant
    // switches it on for this campaign.
    excludedCountries: [],
    trackLinks: false,
  });

  // Load existing draft when editing
  useQuery({
    queryKey: ["campaign-draft", editingCampaignId],
    enabled: !!editingCampaignId,
    queryFn: async () => {
      if (!editingCampaignId) return null;
      const { data } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", editingCampaignId)
        .maybeSingle();
      if (data) {
        const aud: any = data.audience ?? {};
        setS((prev) => ({
          ...prev,
          name: data.name ?? "",
          include: aud.include ?? [],
          exclude: aud.exclude ?? [],
          profileIds: aud.profile_ids ?? [],
          listIds: aud.list_ids ?? [],
          body: (data.message_body ?? "").replace(STOP_LINE, ""),
          mediaUrl: data.media_url ?? "",
          sendMode: (data.send_mode as any) ?? "now",
          scheduleAt: data.schedule_at ? new Date(data.schedule_at).toISOString().slice(0, 16) : "",
          smartSkipHours: data.smart_skip_hours ?? 8,
          excludedCountries: Array.isArray(aud.excluded_countries) ? aud.excluded_countries : [],
          trackLinks: (data as any).track_links === true,
        }));
      }
      return data;
    },
  });

  const segmentsQ = useQuery({
    queryKey: ["segments-pick"],
    queryFn: async () =>
      (await supabase.from("segments").select("id,name,query").order("name")).data ?? [],
  });

  const loadContactLists = useServerFn(listAudienceContactLists);
  const listsQ = useQuery({
    queryKey: ["lists-pick"],
    queryFn: async () => loadContactLists(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const loadRates = useServerFn(getActiveCountryRatesRaw);
  const ratesQ = useQuery({
    queryKey: ["country-rates-active"],
    queryFn: () => loadRates(),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const rates = ratesQ.data ?? [];

  const accountQ = useQuery({
    queryKey: ["account-balance"],
    queryFn: async () =>
      (await supabase.from("accounts").select("id,credit_balance").maybeSingle()).data,
  });

  const senderQ = useQuery({
    queryKey: ["sender-assets-pending"],
    queryFn: async () =>
      (
        await supabase
          .from("sender_assets")
          .select(
            "verification_status,country_code,sender_kind,phone_number,telnyx_messaging_profile_id,friendly_rejection_reason",
          )
      ).data ?? [],
  });
  const senderList = senderQ.data ?? [];
  const hasVerified = senderList.some((x) => x.verification_status === "verified");
  const hasPending = senderList.some(
    (x) => x.verification_status === "submitted" || x.verification_status === "in_review",
  );
  const hasRejected = senderList.some((x) => x.verification_status === "rejected");
  const verifiedSenderSummary = senderList
    .filter((x) => x.verification_status === "verified")
    .map((x) => `${x.country_code}: ${senderDisplayName(x)}`)
    .join(" · ");

  // Map country -> verified sender (auto-routing preview)
  const sendersByCountry = useMemo(() => {
    const m: Record<string, any> = {};
    for (const a of senderList) {
      if (a.verification_status !== "verified") continue;
      if (!m[a.country_code]) m[a.country_code] = a;
    }
    // Verified North American numeric senders can route to both US and Canada.
    // This includes assigned 10DLC local numbers as well as toll-free numbers.
    const nanpNumber = senderList.find(
      (a) =>
        a.verification_status === "verified" &&
        (a.sender_kind === "toll_free" || a.sender_kind === "local") &&
        (a.country_code === "US" || a.country_code === "CA"),
    );
    if (nanpNumber) {
      if (!m["US"]) m["US"] = nanpNumber;
      if (!m["CA"]) m["CA"] = nanpNumber;
    }
    return m;
  }, [senderList]);

  const audience = useMemo(
    () => ({
      include: s.include,
      exclude: s.exclude,
      profile_ids: s.profileIds,
      list_ids: s.listIds,
    }),
    [s.include, s.exclude, s.profileIds, s.listIds],
  );

  const hasAudience = s.include.length > 0 || s.profileIds.length > 0 || s.listIds.length > 0;
  const loadAudienceCounts = useServerFn(getCampaignAudienceCountryCounts);

  // One aggregate round trip: recipients grouped by country. No per-contact
  // download, so picking a 100k-row list resolves instantly.
  const countsQ = useQuery({
    queryKey: ["campaign-audience-counts", audience],
    enabled: hasAudience,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Array<{ country_code: string; recipients: number }>> => {
      return loadAudienceCounts({ data: audience });
    },
  });
  const countryCounts = countsQ.data ?? [];
  const audienceTotal = useMemo(
    () => countryCounts.reduce((a, b) => a + b.recipients, 0),
    [countryCounts],
  );

  const [exportingAudience, setExportingAudience] = useState(false);
  // Export pulls the full recipient list on demand only (paged), so building a
  // campaign never downloads every contact up front.
  const exportEligibleAudience = async () => {
    setExportingAudience(true);
    try {
      const PAGE = 1000;
      const rows: any[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await (supabase.rpc as any)("my_eligible_profile_ids_page", {
          _audience: audience,
          _limit: PAGE,
          _offset: offset,
        });
        if (error) throw error;
        const batch = (data as any[]) ?? [];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      const header = "profile_id,phone_e164,first_name,last_name,country_code\n";
      const body = rows
        .map((a: any) =>
          [
            a.profile_id,
            a.phone_e164,
            (a.first_name ?? "").replace(/[,"\n]/g, " "),
            (a.last_name ?? "").replace(/[,"\n]/g, " "),
            a.country_code ?? "",
          ].join(","),
        )
        .join("\n");
      const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eligible-audience-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not export audience");
    } finally {
      setExportingAudience(false);
    }
  };

  const bodyWithStop = useMemo(
    () => (s.body.toUpperCase().includes("STOP") ? s.body : s.body + STOP_LINE),
    [s.body],
  );
  const callShortlink = useServerFn(createPreviewShortlink);
  const [previewShortUrls, setPreviewShortUrls] = useState<Record<string, string>>({});
  const [previewLinksPending, setPreviewLinksPending] = useState(false);

  // Create real, database-backed short links for the phone preview. The old
  // preview used sample codes such as /r/abcdef1; those looked clickable but
  // could never resolve because no tracking row existed for them.
  useEffect(() => {
    if (!s.trackLinks) {
      setPreviewLinksPending(false);
      return;
    }
    const shortUrlPattern = TRACKED_SHORT_URL;
    const urls = Array.from(
      new Set(bodyWithStop.match(/https?:\/\/[^\s<>()[\]"']+/gi) ?? []),
    ).filter((url) => !shortUrlPattern.test(url) && !previewShortUrls[url]);
    if (urls.length === 0) {
      setPreviewLinksPending(false);
      return;
    }

    let cancelled = false;
    setPreviewLinksPending(true);
    const timer = window.setTimeout(async () => {
      try {
        const created = await Promise.all(
          urls.map(async (url) => {
            const result = await callShortlink({ data: { url, campaignId: campaignId ?? null } });
            return [url, result.shortUrl] as const;
          }),
        );
        if (!cancelled) {
          setPreviewShortUrls((current) => ({ ...current, ...Object.fromEntries(created) }));
        }
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message ?? "Could not create the short-link preview.");
      } finally {
        if (!cancelled) setPreviewLinksPending(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bodyWithStop, campaignId, callShortlink, previewShortUrls, s.trackLinks]);

  // Exactly what the contact receives: every displayed /r/ code is a real
  // redirect that can safely be clicked before the campaign is launched.
  const previewBody = useMemo(() => {
    if (!s.trackLinks) return bodyWithStop;
    return bodyWithStop.replace(/(https?:\/\/[^\s<>()[\]"']+)/gi, (url) => {
      if (TRACKED_SHORT_URL.test(url)) return url;
      return previewShortUrls[url] ?? url;
    });
  }, [bodyWithStop, previewShortUrls, s.trackLinks]);
  const seg = calculateSegments(previewBody);

  // Detect non-GSM-7 characters that force Unicode encoding (70/67-char segments
  // instead of 160/153). Common culprits: • “ ” ‘ ’ — – … and non-breaking space.
  const UNICODE_REPLACEMENTS: Array<[RegExp, string]> = [
    [/[\u2022\u00B7]/g, "-"], // • ·
    [/[\u201C\u201D\u201E\u201F]/g, '"'], // “ ” „ ‟
    [/[\u2018\u2019\u201A\u201B]/g, "'"], // ‘ ’ ‚ ‛
    [/[\u2013\u2014\u2015]/g, "-"], // – — ―
    [/\u2026/g, "..."], // …
    [/\u00A0/g, " "], // non-breaking space
    [/\u200B/g, ""], // zero-width space
  ];
  const unicodeOffenders = useMemo(() => {
    if (seg.encoding !== "Unicode") return [] as string[];
    const found = new Set<string>();
    for (const ch of s.body) {
      if (ch.charCodeAt(0) > 127 && ch !== "€") found.add(ch);
    }
    return Array.from(found);
  }, [s.body, seg.encoding]);
  const canFixUnicode = unicodeOffenders.some((ch) =>
    UNICODE_REPLACEMENTS.some(([re]) => re.test(ch)),
  );
  const fixUnicode = () => {
    let out = s.body;
    for (const [re, rep] of UNICODE_REPLACEMENTS) out = out.replace(re, rep);
    setS({ ...s, body: out });
  };

  const excludedSet = useMemo(() => new Set(s.excludedCountries), [s.excludedCountries]);

  // Per-country breakdown — includes ALL countries; `excluded` flag drives UI + cost skip
  const fullBreakdown = useMemo(() => {
    if (rates.length === 0 || countryCounts.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const c of countryCounts)
      counts[c.country_code] = (counts[c.country_code] ?? 0) + c.recipients;
    const hasMedia = !!s.mediaUrl;
    // MMS (US/CA) = one billable message with an attachment, priced at
    // rate x MMS multiplier — never multiplied by SMS segments. Elsewhere the
    // image falls back to a link, so it is billed as normal SMS segments.
    const mmsCountry = (cc: string) => cc === "US" || cc === "CA";
    return Object.entries(counts)
      .map(([cc, n]) => {
        const r = rates.find((x) => x.country_code === cc);
        const unit = r ? Number(r.sell_price) : 0;
        const isMms = hasMedia && !!r && mmsCountry(cc);
        const mult = isMms ? Number(r!.mms_multiplier) : 1;
        const segments = isMms ? 1 : seg.segments;
        const subtotal = +(n * segments * unit * mult).toFixed(4);
        return {
          country_code: cc,
          country_name: r?.country_name ?? cc,
          recipients: n,
          unit,
          mult,
          segments,
          subtotal,
          priced: !!r,
          excluded: excludedSet.has(cc),
        };
      })
      .sort((a, b) => b.subtotal - a.subtotal);
  }, [countryCounts, rates, seg.segments, s.mediaUrl, excludedSet]);

  // Active rows = countries actually being sent to
  const breakdown = useMemo(() => fullBreakdown.filter((b) => !b.excluded), [fullBreakdown]);
  const activeRecipientCount = breakdown.reduce((a, b) => a + b.recipients, 0);

  const totalCost = +breakdown.reduce((a, b) => a + b.subtotal, 0).toFixed(4);
  const balance = Number(accountQ.data?.credit_balance ?? 0);
  const balanceAfter = +(balance - totalCost).toFixed(4);
  const insufficient = totalCost > balance && activeRecipientCount > 0;

  // Block launch when any (non-excluded) recipient country has no verified sender.
  const missingSenderCountries = useMemo(
    () => breakdown.filter((b) => !sendersByCountry[b.country_code]).map((b) => b.country_code),
    [breakdown, sendersByCountry],
  );
  const hasMissingSender = missingSenderCountries.length > 0 && breakdown.length > 0;

  function toggleCountry(cc: string) {
    setS((prev) => ({
      ...prev,
      excludedCountries: prev.excludedCountries.includes(cc)
        ? prev.excludedCountries.filter((x) => x !== cc)
        : [...prev.excludedCountries, cc],
    }));
  }

  const callTestSend = useServerFn(sendTestSms);
  const callTestUsage = useServerFn(getTestSendUsage);
  const callContentScan = useServerFn(scanCampaignContent);
  const testUsageQ = useQuery({
    queryKey: ["test-send-usage"],
    queryFn: () => callTestUsage(),
    staleTime: 30_000,
  });
  const testUsage = testUsageQ.data ?? { used: 0, limit: 5, remaining: 5, resetsAt: "" };
  const testLimitReached = testUsage.remaining <= 0;
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shorteningLink, setShorteningLink] = useState(false);

  async function shortenMessageUrls(message: string): Promise<string> {
    if (!s.trackLinks) return message;
    const shortUrlPattern = TRACKED_SHORT_URL;
    const urls = message.match(/https?:\/\/[^\s<>()[\]"']+/gi) ?? [];
    const replacements = new Map<string, string>();

    for (const url of Array.from(new Set(urls))) {
      if (shortUrlPattern.test(url)) continue;
      const { shortUrl } = await callShortlink({ data: { url, campaignId: campaignId ?? null } });
      replacements.set(url, shortUrl);
    }

    return message.replace(/https?:\/\/[^\s<>()[\]"']+/gi, (url) => replacements.get(url) ?? url);
  }

  async function addShortLink(url: string, el?: HTMLInputElement | null) {
    let candidate = url;
    if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      new URL(candidate);
    } catch {
      toast.error("That doesn't look like a valid URL");
      return;
    }
    if (!s.trackLinks) {
      setS({ ...s, body: (s.body ? s.body.trimEnd() + " " : "") + candidate });
      if (el) el.value = "";
      return;
    }
    setShorteningLink(true);
    try {
      const { shortUrl } = await callShortlink({
        data: { url: candidate, campaignId: campaignId ?? null },
      });
      setS((prev) => ({ ...prev, body: (prev.body ? prev.body.trimEnd() + " " : "") + shortUrl }));
      if (el) el.value = "";
    } catch (err: any) {
      // Never silently add the original URL while shortening is enabled. That
      // made campaigns look configured for tracking even though the long URL
      // was what recipients ultimately received.
      toast.error(err?.message ?? "Could not shorten this link. Please try again.");
    } finally {
      setShorteningLink(false);
    }
  }
  const testCountry = useMemo(() => countryFromPhone(s.testTo, rates), [s.testTo, rates]);
  const testSender = testCountry ? sendersByCountry[testCountry] : null;

  async function runTestSend() {
    if (!s.testTo) {
      toast.error("Enter a phone number to test");
      return;
    }
    if (testLimitReached) {
      toast.error(`Daily test limit reached (${testUsage.limit}/day).`);
      return;
    }
    setSending(true);
    try {
      const testBody = await shortenMessageUrls(bodyWithStop);
      const res = await callTestSend({
        data: { to: s.testTo, body: testBody, country: testCountry ?? undefined },
      });
      toast.success(`Test sent (sid ${res.sid.slice(0, 10)}…)`);
      setS({ ...s, testSent: true });
      testUsageQ.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Test send failed");
      testUsageQ.refetch();
    } finally {
      setSending(false);
    }
  }

  const canNext = (() => {
    if (step === 0) return s.name.trim().length > 0 && hasAudience;
    if (step === 1) return s.body.trim().length > 0 && !insufficient;
    if (step === 2) return s.sendMode !== "scheduled" || !!s.scheduleAt;
    if (step === 3) return s.testSent || testLimitReached;
    return true;
  })();

  async function persistCampaign(
    targetStatus: "draft" | "queued" | "scheduled" | "blocked_content",
    messageBody = bodyWithStop,
  ): Promise<string | null> {
    if (!s.name.trim()) return null;
    const { data: u } = await supabase.auth.getUser();
    const launching = targetStatus === "queued" || targetStatus === "scheduled";
    // On launch, if the user excluded any country, narrow to explicit profile IDs
    // so the dispatcher only sends to recipients in the kept countries.
    // Country exclusions are applied server-side by eligible_profile_ids, so the
    // audience stays compact (list ids / segment ids) even for huge lists.
    const audiencePayload: any = { ...audience, excluded_countries: s.excludedCountries };
    void launching;
    const payload: any = {
      account_id: u.user!.id,
      name: s.name.trim(),
      audience: audiencePayload,
      message_body: messageBody,
      media_url: s.mediaUrl || null,
      send_mode: s.sendMode,
      schedule_at:
        s.sendMode === "scheduled" && s.scheduleAt ? new Date(s.scheduleAt).toISOString() : null,
      smart_skip_hours: s.smartSkipHours,
      track_links: s.trackLinks,

      sender_map: breakdown.reduce(
        (acc, b) => {
          const sender = sendersByCountry[b.country_code];
          acc[b.country_code] = sender
            ? {
                sender_kind: sender.sender_kind,
                phone_number: sender.phone_number,
                telnyx_messaging_profile_id: sender.telnyx_messaging_profile_id,
              }
            : null;
          return acc;
        },
        {} as Record<string, any>,
      ),
      status: targetStatus,
    };
    if (campaignId) {
      const { error } = await supabase.from("campaigns").update(payload).eq("id", campaignId);
      if (error) throw error;
      return campaignId;
    }
    const { data, error } = await supabase.from("campaigns").insert(payload).select("id").single();
    if (error) throw error;
    setCampaignId(data.id);
    return data.id;
  }

  // Autosave draft after user enters a name. Debounced.
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaved, setAutoSaved] = useState<Date | null>(null);
  useEffect(() => {
    if (!s.name.trim()) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      try {
        const id = await persistCampaign("draft");
        if (id) setAutoSaved(new Date());
      } catch (e) {
        // silent — manual save still available
      }
    }, 1200);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    s.name,
    s.body,
    s.mediaUrl,
    s.sendMode,
    s.scheduleAt,
    s.smartSkipHours,
    s.trackLinks,
    JSON.stringify(audience),
    JSON.stringify(s.excludedCountries),
  ]);

  const [complianceAccepted, setComplianceAccepted] = useState(false);

  async function saveCampaign(launch: boolean) {
    if (launch && insufficient) {
      toast.error(
        `Insufficient balance — top up before launching. Contact support if you need help.`,
      );
      return;
    }
    if (launch && hasMissingSender) {
      toast.error(
        `No verified sender for: ${missingSenderCountries.join(", ")}. Set up SMS or remove those recipients.`,
      );
      return;
    }
    if (launch && !complianceAccepted) {
      toast.error("You must confirm the compliance acknowledgement before launching.");
      return;
    }
    setSaving(true);
    try {
      // Resolve every opted-in tracking URL before scanning and saving. The
      // dispatcher also rewrites URLs as a backstop, but storing the resolved
      // body here makes the review screen and report show exactly what will be
      // sent instead of the tenant's original long URL.
      const outgoingBody =
        launch && s.trackLinks ? await shortenMessageUrls(bodyWithStop) : bodyWithStop;
      // Layer 1+2: Content safety scan before any launch
      if (launch) {
        const scan = await callContentScan({
          data: { messageBody: outgoingBody, mediaUrl: s.mediaUrl || undefined },
        });
        if (!scan.allowed) {
          // Save as blocked so user sees it in their list, then stop
          await persistCampaign("blocked_content", outgoingBody);
          toast.error(`Blocked: ${scan.reason ?? "Content violates platform policy."}`);
          navigate({ to: "/app/campaigns" });
          return;
        }
      }
      const status = !launch ? "draft" : s.sendMode === "now" ? "queued" : "scheduled";
      // Save as draft first, record the per-campaign compliance confirmation,
      // and only then flip to the launch status. Flipping first let a dispatcher
      // tick see a queued campaign with no acceptance row and hold it for review.
      const savedId = await persistCampaign(launch ? "draft" : status, outgoingBody);
      if (launch && savedId) {
        const { acceptCampaignTos } = await import("@/lib/tos.functions");
        await acceptCampaignTos({
          data: { campaignId: savedId, userAgent: navigator.userAgent.slice(0, 500) },
        });
        const { error: statusErr } = await supabase
          .from("campaigns")
          .update({ status })
          .eq("id", savedId);
        if (statusErr) throw statusErr;
      }
      trackProduct(launch ? "campaign_sent" : "campaign_created");
      toast.success(launch ? "Campaign launched" : "Saved as draft");
      navigate({ to: "/app/campaigns" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2">
            <Megaphone className="size-6" />
            {campaignId ? "Edit campaign" : "New campaign"}
          </h1>
          <p className="text-sm text-muted-foreground">
            5-step builder. Drafts autosave as you go.
          </p>
        </div>
        {autoSaved && (
          <div className="text-xs text-muted-foreground flex items-center gap-1 pt-2">
            <CheckCircle2 className="size-3.5 text-success" /> Draft saved{" "}
            {autoSaved.toLocaleTimeString()}
          </div>
        )}
      </div>

      {hasVerified && (
        <Card className="p-4 flex items-center gap-3 border-success/40 bg-success/5">
          <CheckCircle2 className="size-5 text-success" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">Approved sender ready</div>
            <div className="text-muted-foreground">{verifiedSenderSummary}</div>
          </div>
          <Link to="/app/setup-sms">
            <Button size="sm" variant="outline">
              View status
            </Button>
          </Link>
        </Card>
      )}

      {!hasVerified && senderList.length > 0 && (
        <Card
          className={`p-4 flex items-center gap-3 ${hasRejected ? "border-destructive/40 bg-destructive/5" : "border-primary/40 bg-primary/5"}`}
        >
          <ShieldCheck className={`size-5 ${hasRejected ? "text-destructive" : "text-primary"}`} />
          <div className="flex-1 text-sm">
            <div className="font-semibold">
              {hasRejected ? "We need a bit more info" : "Setting up your SMS number"}
            </div>
            <div className="text-muted-foreground">
              {hasRejected
                ? (senderList.find((x) => x.verification_status === "rejected")
                    ?.friendly_rejection_reason ?? "Please update your details.")
                : "Usually 7–10 business days. You can build campaigns now — they'll send the moment your number is ready."}
            </div>
          </div>
          <Link to="/app/setup-sms">
            <Button size="sm" variant={hasRejected ? "default" : "outline"}>
              {hasRejected ? "Fix" : "View status"}
            </Button>
          </Link>
        </Card>
      )}

      <Stepper step={step} />

      {step === 0 && (
        <Card className="p-5 space-y-4">
          <div>
            <Label>Campaign name</Label>
            <Input
              value={s.name}
              onChange={(e) => setS({ ...s, name: e.target.value })}
              placeholder="e.g. Black Friday — US"
            />
          </div>
          <ListPicker
            lists={listsQ.data ?? []}
            selected={s.listIds}
            onChange={(ids) => setS((prev) => ({ ...prev, listIds: ids }))}
          />
          <SegmentPicker
            title="Include segments"
            segments={segmentsQ.data ?? []}
            selected={s.include}
            onChange={(ids) => setS({ ...s, include: ids })}
          />
          <ContactPicker
            selected={s.profileIds}
            onChange={(ids) => setS({ ...s, profileIds: ids })}
          />
          <Card className="p-4 flex items-center justify-between bg-primary/5 border-primary/30">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center">
                <Users className="size-5" />
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wide">
                  Eligible audience
                </div>
                <div className="text-2xl font-extrabold">
                  {!hasAudience ? "—" : countsQ.isFetching ? "…" : audienceTotal.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">
                  subscribed, not on suppression list
                </div>
                {countsQ.isError && (
                  <div className="text-xs text-destructive">
                    Could not read this audience. Please retry.
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {audienceTotal > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exportingAudience}
                  onClick={exportEligibleAudience}
                >
                  <Send className="size-4 mr-1.5 rotate-90" />
                  {exportingAudience ? "Preparing…" : "Export CSV"}
                </Button>
              )}
              {!hasAudience && (
                <span className="text-xs text-muted-foreground">
                  Pick contacts above to see the eligible audience.
                </span>
              )}
            </div>
          </Card>
        </Card>
      )}

      {step === 1 && (
        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="p-5 space-y-4 lg:col-span-2">
            <div>
              <Label>Message body</Label>
              <Textarea
                value={s.body}
                onChange={(e) => setS({ ...s, body: e.target.value })}
                rows={6}
                placeholder="Hi {{first_name}}, our sale starts now…"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>
                  {seg.encoding} · {seg.charCount} chars · {seg.segments} SMS segment
                  {seg.segments !== 1 ? "s" : ""}
                </span>
                <span>
                  Personalization: <code>{"{{first_name}}"}</code> <code>{"{{last_name}}"}</code>{" "}
                  <code>{"{{country}}"}</code> · any custom CSV field:{" "}
                  <code>{"{{your_field}}"}</code>
                </span>
              </div>
              {seg.encoding === "Unicode" && unicodeOffenders.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs">
                  <div className="font-medium text-amber-900 dark:text-amber-200">
                    Unicode characters detected — segments shrink from 160 to 70 chars, so cost goes
                    up.
                  </div>
                  <div className="mt-1 text-amber-800 dark:text-amber-300">
                    Non-GSM characters in your message:{" "}
                    <code className="font-mono">{unicodeOffenders.join(" ")}</code>
                  </div>
                  {canFixUnicode && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={fixUnicode}
                    >
                      Auto-replace with GSM-safe equivalents
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label>Website link (optional)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="https://your-site.com/sale"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const url = (e.target as HTMLInputElement).value.trim();
                      if (!url) return;
                      void addShortLink(url, e.target as HTMLInputElement);
                    }
                  }}
                  id="link-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={shorteningLink}
                  onClick={() => {
                    const el = document.getElementById("link-input") as HTMLInputElement | null;
                    const url = el?.value.trim();
                    if (!url) return;
                    void addShortLink(url, el);
                  }}
                >
                  {shorteningLink ? "Shortening…" : "Add to message"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {s.trackLinks
                  ? "Link shortening is on, so this URL is added as a tracked short link and clicks are counted. Tap it in the phone preview below to test."
                  : "Your URL is added exactly as typed. Turn on link shortening below if you want a short link and click tracking."}
              </p>
            </div>

            <div className="rounded-md border p-3 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label className="cursor-pointer" htmlFor="track-links-toggle">
                  Shorten links &amp; track clicks
                </Label>
                <p className="text-xs text-muted-foreground max-w-md">
                  {s.trackLinks
                    ? "On — every URL in your message is replaced with a tracked short link so clicks are counted. See per-link stats on the report's Links tab."
                    : "Off — your URLs are sent exactly as you typed them. Nothing is shortened and no clicks are tracked."}
                </p>
              </div>
              <Switch
                id="track-links-toggle"
                checked={s.trackLinks}
                onCheckedChange={(v: boolean) => setS((prev) => ({ ...prev, trackLinks: !!v }))}
              />
            </div>

            <div>
              <Label>MMS image (optional)</Label>
              <MmsImagePicker
                mediaUrl={s.mediaUrl}
                onChange={(url) => setS({ ...s, mediaUrl: url })}
              />
              {s.mediaUrl ? (
                <p className="text-xs text-muted-foreground mt-1">
                  MMS multiplier applied per-country (see cost estimate).
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Upload a JPG, PNG, or GIF (max 5 MB) — or paste a public image URL.
                </p>
              )}
              <Input
                className="mt-2"
                value={s.mediaUrl}
                onChange={(e) => setS({ ...s, mediaUrl: e.target.value })}
                placeholder="…or paste a https:// image URL"
              />
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-success/5 border border-success/30 rounded-md p-3">
              <ShieldCheck className="size-4 text-success mt-0.5" />
              <div>
                Opt-out line is auto-appended if missing: <i>"Reply STOP to unsubscribe."</i>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2 flex items-center gap-1">
                <Smartphone className="size-4" /> Phone preview
              </div>
              <div className="mx-auto w-full max-w-[280px] rounded-[2rem] border bg-card p-3 shadow-sm">
                <div className="rounded-2xl bg-muted/40 p-3 min-h-[140px] text-sm whitespace-pre-wrap space-y-2">
                  {s.mediaUrl && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(s.mediaUrl) && (
                    <img
                      src={s.mediaUrl}
                      alt="MMS preview"
                      className="w-full max-h-64 rounded-lg object-cover border"
                    />
                  )}
                  {previewBody ? (
                    renderPreviewWithLinks(previewBody)
                  ) : (
                    <span className="text-muted-foreground">Your message will appear here…</span>
                  )}
                  {previewLinksPending && (
                    <span className="block text-xs text-muted-foreground">
                      Creating verified short link…
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {s.trackLinks
                  ? "Exactly how your contact sees it — every displayed short link is active and verified."
                  : "Exactly how your contact sees it — links are sent as typed."}
              </p>
            </div>
          </Card>

          <div className="space-y-5">
            <SenderRoutingCard
              breakdown={fullBreakdown}
              sendersByCountry={sendersByCountry}
              onToggleCountry={toggleCountry}
            />

            <CostPanel
              insufficient={insufficient}
              balance={balance}
              balanceAfter={balanceAfter}
              totalCost={totalCost}
              breakdown={breakdown}
              audienceCount={activeRecipientCount}
              loading={
                hasAudience &&
                countryCounts.length === 0 &&
                (countsQ.isPending || countsQ.isFetching || ratesQ.isPending)
              }
              error={
                countsQ.isError
                  ? ((countsQ.error as any)?.message ?? "Could not calculate cost")
                  : null
              }
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <Card className="p-5 space-y-4">
          <Label>When to send</Label>
          <RadioGroup
            value={s.sendMode}
            onValueChange={(v) => setS({ ...s, sendMode: v as State["sendMode"] })}
            className="space-y-2"
          >
            {[
              { v: "now", label: "Send now", desc: "Dispatch immediately after launch." },
              { v: "scheduled", label: "Schedule for later", desc: "Pick an exact date and time." },
              {
                v: "smart",
                label: "Smart send time",
                desc: "Skip quiet hours per recipient timezone.",
              },
            ].map((opt) => (
              <label
                key={opt.v}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${s.sendMode === opt.v ? "border-primary bg-primary/5" : ""}`}
              >
                <RadioGroupItem value={opt.v} className="mt-0.5" />
                <div>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </div>
              </label>
            ))}
          </RadioGroup>
          {s.sendMode === "scheduled" && (
            <div>
              <Label>Date and time</Label>
              <Input
                type="datetime-local"
                value={s.scheduleAt}
                onChange={(e) => setS({ ...s, scheduleAt: e.target.value })}
              />
            </div>
          )}
          {s.sendMode === "smart" && (
            <div>
              <Label>Skip hours (quiet window)</Label>
              <Input
                type="number"
                min={0}
                max={12}
                value={s.smartSkipHours}
                onChange={(e) => setS({ ...s, smartSkipHours: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Avoid sending in the recipient's late-night / early-morning hours.
              </p>
            </div>
          )}
        </Card>
      )}

      {step === 3 && (
        <Card className="p-5 space-y-4">
          <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-md p-3 text-sm">
            <AlertTriangle className="size-4 text-warning mt-0.5" />
            <div className="flex-1 flex items-center justify-between gap-3">
              <div>
                {testLimitReached ? (
                  <>Daily test limit reached. You can proceed without another test today.</>
                ) : (
                  <>
                    A test send is <b>required</b> before launch. Large campaigns also start with a
                    25-recipient carrier check before the remaining audience is released.
                  </>
                )}
              </div>
              <span className="text-xs font-medium whitespace-nowrap">
                {testUsage.used}/{testUsage.limit} used today
              </span>
            </div>
          </div>
          <div>
            <Label>Send test to (E.164 phone)</Label>
            {s.testTo && testCountry && (
              <div className="mt-1 mb-2 text-xs rounded-md border bg-muted/30 px-3 py-2 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Test route: {testCountry}</span>
                {testSender ? (
                  <span className="font-mono font-semibold">
                    From {senderDisplayName(testSender)}
                  </span>
                ) : (
                  <span className="text-destructive font-medium">
                    No verified sender for {testCountry}
                  </span>
                )}
              </div>
            )}
            <div className="flex gap-2 mt-1">
              <Input
                value={s.testTo}
                onChange={(e) => setS({ ...s, testTo: e.target.value })}
                placeholder="+15551234567"
              />
              <Button
                onClick={runTestSend}
                disabled={
                  sending || testLimitReached || !s.body.trim() || (!!testCountry && !testSender)
                }
              >
                <Send className="size-4 mr-1.5" />
                {sending ? "Sending…" : testLimitReached ? "Daily limit reached" : "Send test"}
              </Button>
            </div>
            {testCountry && !testSender && (
              <div className="text-xs text-destructive mt-2">
                Add or approve a sender for {testCountry} before sending this test.
              </div>
            )}
            {s.testSent && (
              <div className="text-sm text-success mt-2 flex items-center gap-1">
                <CheckCircle2 className="size-4" /> Test sent. You can proceed.
              </div>
            )}
            {testLimitReached && !s.testSent && (
              <div className="text-xs text-muted-foreground mt-2">
                You've used all {testUsage.limit} test sends for today. The limit resets at 00:00
                UTC — you can continue to schedule or launch without another test.
              </div>
            )}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <ReviewItem label="Name" value={s.name} />
            <ReviewItem
              label="Eligible audience"
              value={
                s.excludedCountries.length > 0
                  ? `${activeRecipientCount} (of ${audienceTotal}; ${s.excludedCountries.length} country skipped)`
                  : String(audienceTotal)
              }
            />
            <ReviewItem label="Send mode" value={s.sendMode} />
            <ReviewItem
              label="Schedule"
              value={s.sendMode === "scheduled" ? new Date(s.scheduleAt).toLocaleString() : "—"}
            />
            <ReviewItem label="Segments / message" value={`${seg.segments} × ${seg.encoding}`} />
            <ReviewItem label="Media" value={s.mediaUrl || "—"} />
            <ReviewItem label="Estimated cost" value={formatUSD(totalCost)} />
            <ReviewItem label="Balance after" value={formatUSD(balanceAfter)} />
          </div>
          {insufficient && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
              <AlertTriangle className="size-4 mt-0.5" />
              <div>
                Insufficient balance.{" "}
                <Link to="/app/billing" className="underline font-medium">
                  Add funds
                </Link>{" "}
                to launch, or contact{" "}
                <a href="/contact" className="underline font-medium">
                  support
                </a>
                .
              </div>
            </div>
          )}
          {hasMissingSender && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
              <AlertTriangle className="size-4 mt-0.5" />
              <div>
                No verified sender for: <b>{missingSenderCountries.join(", ")}</b>. Launch is
                blocked until you{" "}
                <Link to="/app/setup-sms" className="underline font-medium">
                  set up SMS
                </Link>{" "}
                or{" "}
                <Link to="/app/setup-sms" className="underline font-medium">
                  request a number
                </Link>{" "}
                for these countries — or remove those recipients.
              </div>
            </div>
          )}
          <SenderRoutingCard
            breakdown={fullBreakdown}
            sendersByCountry={sendersByCountry}
            onToggleCountry={toggleCountry}
          />
          <div>
            <Label>Final message</Label>
            <Card className="p-3 mt-1 bg-muted/30 whitespace-pre-wrap text-sm">{previewBody}</Card>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="p-4 border-primary/40 bg-primary/5">
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <Checkbox
              checked={complianceAccepted}
              onCheckedChange={(v) => setComplianceAccepted(v === true)}
              className="mt-0.5"
            />
            <span className="leading-snug">
              <strong>Required before launch —</strong> I confirm that every recipient in this
              campaign has opted in to receive SMS from me, that the message content complies with
              the Xellvio Acceptable Use Policy and carrier SHAFT rules, and that I accept full
              liability for any carrier penalties, fines, or number suspensions that arise from this
              send.
            </span>
          </label>
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep((step - 1) as StepIdx)}
        >
          <ChevronLeft className="size-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          {step === 4 ? (
            <>
              <Button variant="outline" onClick={() => saveCampaign(false)} disabled={saving}>
                Save as draft
              </Button>
              <Button
                onClick={() => saveCampaign(true)}
                disabled={saving || insufficient || hasMissingSender || !complianceAccepted}
              >
                {s.sendMode === "now" ? "Launch now" : "Schedule"}
              </Button>
            </>
          ) : (
            <Button onClick={() => setStep((step + 1) as StepIdx)} disabled={!canNext}>
              Next <ChevronRight className="size-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CostPanel({
  insufficient,
  balance,
  balanceAfter,
  totalCost,
  breakdown,
  audienceCount,
  loading,
  error,
}: {
  insufficient: boolean;
  balance: number;
  balanceAfter: number;
  totalCost: number;
  breakdown: Array<{
    country_code: string;
    country_name: string;
    recipients: number;
    unit: number;
    mult: number;
    segments: number;
    subtotal: number;
    priced: boolean;
  }>;
  audienceCount: number;
  loading: boolean;
  error?: string | null;
}) {
  return (
    <Card className="p-5 space-y-4 self-start sticky top-4">
      <div className="flex items-center gap-2">
        <div className="size-9 rounded-lg bg-primary/15 text-primary grid place-items-center">
          <DollarSign className="size-4" />
        </div>
        <div>
          <h3 className="font-semibold leading-tight">Cost estimate</h3>
          <p className="text-xs text-muted-foreground">Live, by recipient country</p>
        </div>
      </div>

      {insufficient && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-md p-3 text-xs text-destructive">
          <AlertTriangle className="size-4 mt-0.5" />
          <div>
            Estimated cost exceeds your balance. Sending will be blocked.{" "}
            <Link to="/app/billing" className="underline font-medium">
              Add funds →
            </Link>{" "}
            or contact{" "}
            <a href="/contact" className="underline font-medium">
              support
            </a>
            .
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="font-extrabold text-lg">{formatUSD(totalCost)}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Balance</div>
          <div className="font-extrabold text-lg">{formatUSD(balance)}</div>
        </div>
        <div className="rounded-md border p-2 col-span-2">
          <div className="text-xs text-muted-foreground">After this send</div>
          <div className={`font-extrabold text-lg ${insufficient ? "text-destructive" : ""}`}>
            {formatUSD(balanceAfter)}
          </div>
        </div>
      </div>

      <div>
        <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">
          By country ({audienceCount} recipients)
        </div>
        {error ? (
          <div className="text-xs text-destructive">{error}</div>
        ) : loading ? (
          <div className="text-xs text-muted-foreground">Calculating…</div>
        ) : breakdown.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Pick an audience in step 1 to see per-country pricing.
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Country</th>
                  <th className="text-right p-2">#</th>
                  <th className="text-right p-2">Rate</th>
                  <th className="text-right p-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((b) => (
                  <tr key={b.country_code} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{b.country_name}</div>
                      {!b.priced && (
                        <Badge variant="destructive" className="text-[10px] mt-0.5">
                          No rate
                        </Badge>
                      )}
                      {b.mult > 1 && (
                        <Badge variant="outline" className="text-[10px] ml-1">
                          ×{b.mult} MMS
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-right">{b.recipients}</td>
                    <td className="p-2 text-right tabular-nums">{formatRate(b.unit)}</td>
                    <td className="p-2 text-right font-medium tabular-nums">
                      {formatUSD(b.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function Stepper({ step }: { step: number }) {
  const icons = [Users, MessageSquare, CalendarClock, Send, CheckCircle2];
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {STEPS.map((label, i) => {
        const Icon = icons[i];
        const active = i === step;
        const done = i < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border ${active ? "bg-primary text-primary-foreground border-primary" : done ? "bg-success/15 text-success border-success/30" : "bg-card border-border text-muted-foreground"}`}
            >
              <Icon className="size-4" />
              {label}
            </div>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function SegmentPicker({
  title,
  segments,
  selected,
  onChange,
}: {
  title: string;
  segments: { id: string; name: string; query: any }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="grid sm:grid-cols-2 gap-2 mt-1">
        {segments.length === 0 && (
          <div className="text-xs text-muted-foreground">No segments available.</div>
        )}
        {segments.map((seg) => {
          const on = selected.includes(seg.id);
          return (
            <label
              key={seg.id}
              className={`flex items-start gap-2 rounded-lg border p-3 cursor-pointer ${on ? "border-primary bg-primary/5" : ""}`}
            >
              <Checkbox
                checked={on}
                onCheckedChange={(v) =>
                  onChange(v ? [...selected, seg.id] : selected.filter((x) => x !== seg.id))
                }
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="font-medium text-sm">{seg.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(seg.query?.country_in ?? []).map((c: string) => (
                    <Badge key={c} variant="outline" className="text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}

function ContactPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const search = q.trim();
  const contactsQ = useQuery({
    queryKey: ["pick-contacts", search],
    enabled: search.length >= 2,
    queryFn: async () => {
      let query = supabase
        .from("profiles")
        .select("id, phone_e164, first_name, last_name, consents(status, channel)")
        .order("created_at", { ascending: false })
        .limit(200);
      query = query.or(
        `phone_e164.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
      );
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((p: any) => {
        const sms = (p.consents ?? []).find((c: any) => c.channel === "sms");
        return { ...p, subscribed: sms?.status === "subscribed" };
      });
    },
  });
  const rows = contactsQ.data ?? [];
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Or pick specific contacts</Label>
        <span className="text-xs text-muted-foreground">{selected.length} selected</span>
      </div>
      <Input
        placeholder="Search by name or phone…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
        {search.length < 2 && (
          <div className="p-3 text-sm text-muted-foreground">
            Type at least 2 characters to find a specific contact.
          </div>
        )}
        {contactsQ.isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
        {search.length >= 2 && !contactsQ.isLoading && rows.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground">
            No contacts match.{" "}
            <Link to="/app/audience" className="text-primary underline">
              Add contacts
            </Link>
            .
          </div>
        )}
        {rows.map((r: any) => (
          <label
            key={r.id}
            className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 ${!r.subscribed ? "opacity-60" : ""}`}
          >
            <Checkbox checked={selected.includes(r.id)} onCheckedChange={() => toggle(r.id)} />
            <div className="flex-1">
              <div className="font-mono text-xs">{r.phone_e164}</div>
              <div className="text-xs text-muted-foreground">
                {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
              </div>
            </div>
            {!r.subscribed && (
              <Badge variant="outline" className="text-xs">
                not subscribed
              </Badge>
            )}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Only subscribed, non-suppressed contacts will receive the message.
      </p>
    </div>
  );
}

function ListPicker({
  lists,
  selected,
  onChange,
}: {
  lists: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }
  return (
    <div>
      <Label>Pick contact lists</Label>
      <div className="grid sm:grid-cols-2 gap-2 mt-1">
        {lists.length === 0 && (
          <div className="text-xs text-muted-foreground">
            No lists yet.{" "}
            <Link to="/app/audience" className="text-primary underline">
              Create a list
            </Link>
            .
          </div>
        )}
        {lists.map((l) => {
          const on = selected.includes(l.id);
          return (
            <label
              key={l.id}
              className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer ${on ? "border-primary bg-primary/5" : ""}`}
            >
              <Checkbox checked={on} onCheckedChange={() => toggle(l.id)} />
              <div className="font-medium text-sm">{l.name}</div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function SenderRoutingCard({
  breakdown,
  sendersByCountry,
  onToggleCountry,
}: {
  breakdown: Array<{
    country_code: string;
    country_name: string;
    recipients: number;
    excluded?: boolean;
  }>;
  sendersByCountry: Record<
    string,
    { sender_kind: string; phone_number: string | null; telnyx_messaging_profile_id: string | null }
  >;
  onToggleCountry?: (cc: string) => void;
}) {
  const excludedCount = breakdown.filter((b) => b.excluded).length;
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div className="size-9 rounded-lg bg-primary/15 text-primary grid place-items-center">
          <Phone className="size-4" />
        </div>
        <div>
          <h3 className="font-semibold leading-tight">Sender routing</h3>
          <p className="text-xs text-muted-foreground">
            {onToggleCountry
              ? "Untick a country to skip it in this campaign"
              : "Auto-selected per recipient country"}
          </p>
        </div>
      </div>
      {breakdown.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          Pick an audience to see which sender will be used.
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                {onToggleCountry && <th className="p-2 w-8"></th>}
                <th className="text-left p-2">Country</th>
                <th className="text-left p-2">Sender</th>
                <th className="text-right p-2">#</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((b) => {
                const sender = sendersByCountry[b.country_code];
                const included = !b.excluded;
                return (
                  <tr key={b.country_code} className={`border-t ${b.excluded ? "opacity-50" : ""}`}>
                    {onToggleCountry && (
                      <td className="p-2 align-middle">
                        <Checkbox
                          checked={included}
                          onCheckedChange={() => onToggleCountry(b.country_code)}
                          aria-label={`Include ${b.country_name}`}
                        />
                      </td>
                    )}
                    <td className={`p-2 font-medium ${b.excluded ? "line-through" : ""}`}>
                      {b.country_name}
                    </td>
                    <td className="p-2">
                      {sender ? (
                        <span className="font-mono text-[11px]">{senderDisplayName(sender)}</span>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">
                          No verified sender
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-right">{b.recipients}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {excludedCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {excludedCount} {excludedCount === 1 ? "country" : "countries"} skipped — those recipients
          won't receive this campaign.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Need a sender for another country?{" "}
        <Link to="/app/setup-sms" className="text-primary underline">
          Set up SMS
        </Link>{" "}
        or{" "}
        <Link to="/app/setup-sms" className="text-primary underline">
          request a number
        </Link>
        .
      </p>
    </Card>
  );
}

function MmsImagePicker({
  mediaUrl,
  onChange,
}: {
  mediaUrl: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    if (!/^image\/(jpeg|jpg|png|gif)$/.test(file.type)) {
      toast.error("Only JPG, PNG, or GIF images are allowed.");
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not signed in");
      // Carriers drop picture attachments that are too large or too wide, which
      // is why some recipients see only the text. Normalise to a carrier-safe
      // JPEG (animated GIFs are left alone so they keep animating).
      const prepared = await prepareMmsImage(file);
      const ext =
        prepared.type === "image/gif" ? "gif" : prepared.type === "image/png" ? "png" : "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("campaign-media").upload(path, prepared, {
        contentType: prepared.type,
        upsert: false,
      });
      if (up.error) throw up.error;
      // Short, token-free, non-expiring delivery URL served by our own route.
      // Signed storage links carry a huge query token and an expiry, and both
      // can make the carrier's media fetch fail (text delivered, image missing).
      onChange(
        publicCampaignMediaUrl(
          `/storage/v1/object/sign/campaign-media/${path}`,
          window.location.origin,
        ),
      );
      toast.success("Image uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }
  const isImg = !!mediaUrl && /\.(jpe?g|png|gif)(\?|$)/i.test(mediaUrl);

  return (
    <div className="mt-1 flex items-start gap-3">
      {isImg && (
        <img src={mediaUrl} alt="MMS preview" className="size-20 rounded-md border object-cover" />
      )}
      <div className="flex-1 flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : mediaUrl ? "Replace image" : "Upload image"}
        </Button>
        {mediaUrl && (
          <Button type="button" variant="ghost" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
