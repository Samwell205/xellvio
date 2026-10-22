import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { getAssistantCampaignReport } from "@/lib/account-assistant.functions";
import { assistantCampaignStatus } from "@/lib/assistant-campaign-status";

export function AssistantCampaignReport({campaignId,onClose}:{campaignId:string;onClose:()=>void}) {
  const getReport=useServerFn(getAssistantCampaignReport);
  const report=useQuery({queryKey:["assistant-campaign-report",campaignId],queryFn:()=>getReport({data:{campaignId}}),retry:false,refetchInterval:20000});
  const r=report.data;
  return <Message from="assistant"><MessageContent><section aria-label="Campaign delivery report" className="space-y-4 border-y py-5">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{r?.campaign.name??"Campaign"} · Delivery report</h2><div className="flex gap-1"><Button variant="ghost" size="icon" aria-label="Refresh delivery report" disabled={report.isFetching} onClick={()=>void report.refetch()}><RefreshCw/></Button><Button variant="ghost" size="icon" aria-label="Close delivery report" onClick={onClose}><X/></Button></div></div>
    {report.isPending&&<p role="status">Loading delivery results…</p>}{report.error&&<p role="alert" className="text-destructive">{report.error.message}</p>}
    {r&&<><p>{assistantCampaignStatus(r.campaign.status)}</p><dl className="grid grid-cols-2 gap-4 text-sm">{[["Message records",r.counts.total],["Delivered",r.counts.delivered],["Failed",r.counts.failed],["Awaiting delivery receipt",r.counts.awaitingDelivery],["Delivery unconfirmed",r.counts.deliveryUnconfirmed],["Queued / sending",r.counts.queued]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold">{value??"Unavailable"}</dd></div>)}</dl><p className="text-sm text-muted-foreground">Sending complete does not mean every message was delivered. Awaiting receipts are not confirmed deliveries or failures.</p><p className="text-xs text-muted-foreground">Checked {new Date(r.checkedAt).toLocaleTimeString()}. Campaign-attributed replies and opt-outs are unavailable in this summary.</p></>}
  </section></MessageContent></Message>;
}