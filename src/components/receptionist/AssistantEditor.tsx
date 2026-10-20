import {useState} from "react";
import {useMutation} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {toast} from "sonner";
import {Save,Loader2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Switch} from "@/components/ui/switch";
import {Label} from "@/components/ui/label";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from "@/components/ui/dialog";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {receptionistConfigSchema,type ReceptionistConfig} from "@/lib/receptionist/shared";
import {editAssistant} from "@/lib/receptionist/assistants.functions";

export function AssistantEditor({assistant,onClose,onSaved}:{assistant:{id:string;configuration:unknown};onClose:()=>void;onSaved:()=>Promise<void>}) {
 const [config,setConfig]=useState(()=>receptionistConfigSchema.parse(assistant.configuration));
 const save=useServerFn(editAssistant);
 const mutation=useMutation({mutationFn:()=>save({data:{id:assistant.id,configuration:config}}),onSuccess:async()=>{await onSaved();toast.success("Assistant settings saved");onClose();},onError:(e:Error)=>toast.error(e.message)});
 const update=<K extends keyof ReceptionistConfig>(key:K,value:ReceptionistConfig[K])=>setConfig(c=>({...c,[key]:value}));
 const text=(key:keyof ReceptionistConfig,label:string,long=false)=> <div className="space-y-2" key={key}><Label htmlFor={`assistant-${key}`}>{label}</Label>{long?<Textarea id={`assistant-${key}`} rows={key==="businessInformation"?7:4} value={String(config[key])} onChange={e=>update(key,e.target.value as never)}/>:<Input id={`assistant-${key}`} value={String(config[key])} onChange={e=>update(key,e.target.value as never)}/>}</div>;
 const choice=(key:"model"|"voice"|"greetingMode"|"phoneMode",label:string,options:Array<[string,string]>)=><div className="space-y-2"><Label>{label}</Label><Select value={config[key]||"default"} onValueChange={v=>update(key,(v==="default"?"":v) as never)}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(([value,title])=><SelectItem key={value} value={value}>{title}</SelectItem>)}</SelectContent></Select></div>;
 const toggle=(key:"smsFollowUp"|"retainTranscript",label:string)=><div className="flex items-center justify-between gap-3 border-b py-3"><Label htmlFor={`assistant-${key}`}>{label}</Label><Switch id={`assistant-${key}`} checked={config[key]} onCheckedChange={v=>update(key,v)}/></div>;
 const number=(key:"voiceSpeed"|"appointmentMinutes"|"bufferMinutes",label:string,min:number,max:number,step=1)=><div className="space-y-2"><Label htmlFor={`assistant-${key}`}>{label}</Label><Input id={`assistant-${key}`} type="number" min={min} max={max} step={step} value={config[key]} onChange={e=>update(key,Number(e.target.value))}/></div>;
 return <Dialog open onOpenChange={v=>{if(!v)onClose();}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Edit assistant</DialogTitle></DialogHeader>
 <Tabs defaultValue="agent"><TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="agent">Agent</TabsTrigger><TabsTrigger value="voice">Voice</TabsTrigger><TabsTrigger value="knowledge">Knowledge</TabsTrigger><TabsTrigger value="tools">Calling & booking</TabsTrigger><TabsTrigger value="after">After call</TabsTrigger></TabsList>
 <TabsContent value="agent" className="space-y-4">{text("assistantName","Assistant name")}{text("businessName","Business name")}{choice("greetingMode","Who speaks first",[["assistant_first","Assistant first"],["caller_first","Caller first"],["generated","Generated greeting"]])}{text("greeting","Greeting",true)}{text("agentInstructions","Instructions",true)}<div className="space-y-2"><Label htmlFor="assistant-tags">Tags</Label><Input id="assistant-tags" value={config.tags.join(", ")} onChange={e=>update("tags",e.target.value.split(",").map(v=>v.trim()).filter(Boolean))}/></div></TabsContent>
 <TabsContent value="voice" className="space-y-4">{choice("model","Model",[["default","Platform default"],["moonshotai/Kimi-K2.6","Kimi K2.6"],["moonshotai/Kimi-K2.5","Kimi K2.5"]])}{choice("voice","Voice",[["default","Platform default"],["Telnyx.Ultra.Asher","Asher"],["Telnyx.Ultra.Callie","Callie"],["Telnyx.Ultra.Clara","Clara"]])}{number("voiceSpeed","Speaking speed",0.6,1.5,0.1)}</TabsContent>
 <TabsContent value="knowledge" className="space-y-4">{text("businessInformation","Business information",true)}</TabsContent>
 <TabsContent value="tools" className="space-y-4">{choice("phoneMode","Calling mode",[["forwarding","Missed-call forwarding"],["dedicated","Dedicated line"]])}{text("handoffNumber","Team transfer number")}{text("timezone","Timezone")}<div className="grid grid-cols-2 gap-4">{text("openTime","Opening time")}{text("closeTime","Closing time")}</div><div className="space-y-2"><Label>Opening days</Label><div className="flex flex-wrap gap-2">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,index)=><Button key={day} size="sm" variant={config.weekdays.includes(index)?"secondary":"outline"} aria-pressed={config.weekdays.includes(index)} onClick={()=>update("weekdays",config.weekdays.includes(index)?config.weekdays.filter(d=>d!==index):[...config.weekdays,index])}>{day}</Button>)}</div></div>{text("calendarId","Connected calendar ID")}{text("bookingLink","Booking link")}<div className="grid grid-cols-2 gap-4">{number("appointmentMinutes","Appointment minutes",10,180)}{number("bufferMinutes","Buffer minutes",0,60)}</div></TabsContent>
 <TabsContent value="after" className="space-y-4">{text("notifyEmail","Notification email")}{toggle("smsFollowUp","SMS follow-up")}{text("smsText","Follow-up message",true)}{toggle("retainTranscript","Retain transcript")}</TabsContent>
 </Tabs><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending?<Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}Save settings</Button></DialogFooter></DialogContent></Dialog>;
}