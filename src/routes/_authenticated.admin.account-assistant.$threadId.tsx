import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { getAssistantThread } from "@/lib/account-assistant.functions";
import { AccountAssistant, AssistantThreads } from "@/components/AccountAssistant";
const threadQuery=(id:string)=>queryOptions({queryKey:["assistant-thread",id],queryFn:()=>getAssistantThread({data:{id}})});
export const Route=createFileRoute("/_authenticated/admin/account-assistant/$threadId")({head:()=>({meta:[{title:"Owner assistant conversation — Xellvio"},{name:"description",content:"Review your Xellvio owner account assistant conversation."},{property:"og:title",content:"Owner assistant conversation — Xellvio"},{property:"og:description",content:"Review your account assistant conversation."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary"}]}),loader:({context,params})=>context.queryClient.ensureQueryData(threadQuery(params.threadId)),component:Thread});
function Thread(){const {threadId}=Route.useParams();const {data}=useSuspenseQuery(threadQuery(threadId));return <main className="flex min-h-[75vh] flex-col md:flex-row"><AssistantThreads admin/><AccountAssistant key={threadId} threadId={threadId} initialMessages={data.messages as unknown as UIMessage[]}/></main>;}