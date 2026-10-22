import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { getAssistantThread } from "@/lib/account-assistant.functions";
import { AccountAssistant, AssistantThreads } from "@/components/AccountAssistant";
const threadQuery=(id:string)=>queryOptions({queryKey:["assistant-thread",id],queryFn:()=>getAssistantThread({data:{id}})});
export const Route=createFileRoute("/_authenticated/app/assistant/$threadId")({head:()=>({meta:[{title:"Assistant conversation — Xellvio"},{name:"description",content:"Talk to your Xellvio assistant and review account actions."},{property:"og:title",content:"Assistant conversation — Xellvio"},{property:"og:description",content:"Talk to your business assistant and review actions."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),loader:({context,params})=>context.queryClient.ensureQueryData(threadQuery(params.threadId)),component:Thread});
function Thread(){const {threadId}=Route.useParams();const {data}=useSuspenseQuery(threadQuery(threadId));return <main className="assistant-workspace flex min-h-[75vh] flex-col md:flex-row"><AssistantThreads/><AccountAssistant key={threadId} threadId={threadId} initialMessages={data.messages as unknown as UIMessage[]}/></main>;}
