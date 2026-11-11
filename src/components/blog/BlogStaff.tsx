import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { blogStaffData, blogSetStaff } from '@/lib/blog.functions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

export function BlogStaff(){
 const [search,setSearch]=useState('');const [pending,setPending]=useState<{userId:string;name:string;role:'editor'|'writer'|null}|null>(null);const [busy,setBusy]=useState(false);
 const fetch=useServerFn(blogStaffData);const save=useServerFn(blogSetStaff);const qc=useQueryClient();
 const q=useQuery({queryKey:['blog-staff',search],queryFn:()=>fetch({data:{search}})});
 return <section className="space-y-5 border-t border-border pt-7"><h2 className="text-xl">Staff access</h2><Input aria-label="Search staff by email" placeholder="Find an existing user by email…" value={search} onChange={e=>setSearch(e.target.value)}/>{q.error&&<p role="alert" className="text-destructive">{q.error.message}</p>}
 <div className="divide-y divide-border">{q.data?.map(user=><div key={user.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.full_name||user.email}</p><p className="break-all text-xs text-muted-foreground">{user.email}</p></div>{user.blogRole==='admin'?<span className="text-sm text-primary">Super Admin</span>:<select className="h-10 rounded-md border border-border bg-background px-3 text-sm" aria-label={`Blog access ${user.email}`} value={user.blogRole||''} onChange={e=>setPending({userId:user.id,name:user.email,role:(e.target.value||null) as 'editor'|'writer'|null})}><option value="">No blog access</option><option value="writer">Writer</option><option value="editor">Editor</option></select>}</div>)}</div>
 <Dialog open={!!pending} onOpenChange={open=>{if(!open)setPending(null);}}><DialogContent><DialogHeader><DialogTitle>Confirm staff access</DialogTitle></DialogHeader><p className="break-all text-sm">{pending?.name} → {pending?.role||'No blog access'}</p><div className="flex justify-end gap-3"><Button variant="outline" onClick={()=>setPending(null)}>Cancel</Button><Button disabled={busy} onClick={async()=>{if(!pending)return;setBusy(true);try{await save({data:{userId:pending.userId,role:pending.role}});await qc.invalidateQueries({queryKey:['blog-staff']});setPending(null);toast.success('Staff access updated');}catch(e){toast.error(e instanceof Error?e.message:'Could not update access');}finally{setBusy(false);}}}>Confirm access</Button></div></DialogContent></Dialog>
 </section>;
}