import {useState} from "react";
import {useQuery,useQueryClient,useMutation} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {Bot,Plus,Copy,Archive,RotateCcw,Check,Loader2} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Badge} from "@/components/ui/badge";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from "@/components/ui/dialog";
import {Label} from "@/components/ui/label";
import {listAssistants,createAssistant,selectAssistant,archiveAssistant} from "@/lib/receptionist/assistants.functions";

export function AssistantDirectory({isOwner}:{isOwner:boolean}) {
  const list=useServerFn(listAssistants),create=useServerFn(createAssistant),select=useServerFn(selectAssistant),archive=useServerFn(archiveAssistant);
  const qc=useQueryClient();
  const query=useQuery({queryKey:["voice-assistants"],queryFn:()=>list()});
  const [archived,setArchived]=useState(false),[search,setSearch]=useState(""),[open,setOpen]=useState(false),[name,setName]=useState(""),[copyId,setCopyId]=useState<string|undefined>();
  const refresh=async()=>{await Promise.all([qc.invalidateQueries({queryKey:["voice-assistants"]}),qc.invalidateQueries({queryKey:["receptionist"]})]);};
  const add=useMutation({mutationFn:()=>create({data:{name,copyId}}),onSuccess:async()=>{setOpen(false);toast.success("Assistant created");await refresh();},onError:(e:Error)=>toast.error(e.message)});
  const change=useMutation({mutationFn:(id:string)=>select({data:{id}}),onSuccess:async()=>{toast.success("Assistant selected — verify a new test call before activation");await refresh();},onError:(e:Error)=>toast.error(e.message)});
  const remove=useMutation({mutationFn:({id,value}:{id:string;value:boolean})=>archive({data:{id,archived:value}}),onSuccess:refresh,onError:(e:Error)=>toast.error(e.message)});
  const rows=(query.data?.rows??[]).filter(r=>Boolean(r.archived_at)===archived && `${r.name} ${JSON.stringify(r.configuration)}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="space-y-4 border-b pb-7">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">AI Assistants</h2><Button disabled={!isOwner} onClick={()=>{setName("");setCopyId(undefined);setOpen(true);}}><Plus className="size-4"/>Create assistant</Button></div>
    <div className="flex flex-wrap gap-3"><div className="flex gap-1 border-b"><Button variant={!archived?"secondary":"ghost"} onClick={()=>setArchived(false)}>Assistants</Button><Button variant={archived?"secondary":"ghost"} onClick={()=>setArchived(true)}>Archived</Button></div><Input aria-label="Search assistants" placeholder="Search name or tags" className="min-w-0 flex-1" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    {query.isPending?<p className="text-sm text-muted-foreground">Loading assistants…</p>:query.isError?<Button variant="outline" onClick={()=>query.refetch()}>Retry loading assistants</Button>:!rows.length?<div className="flex items-center gap-3 border-y py-7 text-muted-foreground"><Bot className="size-6"/><p>{archived?"No archived assistants":"No assistants yet"}</p></div>:<div className="divide-y">{rows.map(r=>{
      const selected=r.id===query.data?.selectedId;
      const config=r.configuration as Record<string,unknown>;
      return <article key={r.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Bot className="size-4 text-primary"/><h3 className="break-words font-medium">{String(config.assistantName||r.name)}</h3><Badge variant={selected?"default":"secondary"}>{selected?"Selected":r.sync_status.replaceAll("_"," ")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Single prompt · {new Date(r.created_at).toLocaleDateString()}{selected&&query.data?.number?` · ${query.data.number}`:""}</p>{Array.isArray(config.tags)&&config.tags.length>0&&<p className="mt-1 text-xs text-muted-foreground">{config.tags.join(" · ")}</p>}</div><div className="flex gap-2">{!archived&&<><Button variant="outline" size="sm" disabled={!isOwner||selected||query.data?.enabled||change.isPending} onClick={()=>change.mutate(r.id)}>{selected?<Check className="size-4"/>:null}{selected?"Selected":"Select & edit"}</Button><Button variant="ghost" size="icon" title="Copy assistant" aria-label={`Copy ${r.name}`} disabled={!isOwner} onClick={()=>{setName(`${String(config.assistantName||r.name)} copy`.slice(0,120));setCopyId(r.id);setOpen(true);}}><Copy className="size-4"/></Button></>}<Button variant="ghost" size="icon" title={archived?"Restore assistant":"Archive assistant"} aria-label={`${archived?"Restore":"Archive"} ${r.name}`} disabled={!isOwner||selected||remove.isPending} onClick={()=>remove.mutate({id:r.id,value:!archived})}>{archived?<RotateCcw className="size-4"/>:<Archive className="size-4"/>}</Button></div></article>;
    })}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{copyId?"Copy assistant":"Create assistant"}</DialogTitle></DialogHeader><div className="space-y-2"><Label htmlFor="new-assistant-name">Assistant name</Label><Input id="new-assistant-name" maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Sales, customer support, after hours…"/></div><DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cancel</Button><Button disabled={add.isPending||!name.trim()} onClick={()=>add.mutate()}>{add.isPending?<Loader2 className="size-4 animate-spin"/>:<Plus className="size-4"/>}Create</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}