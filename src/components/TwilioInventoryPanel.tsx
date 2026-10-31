import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, Unlink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TenantAssignmentPicker } from '@/components/TenantAssignmentPicker';
import { adminListAccountsLite } from '@/lib/admin-verifiers.functions';
import { adminTwilioInventory, adminSyncTwilioInventory, adminAssignTwilioInventory, adminUnassignTwilioInventory } from '@/lib/twilio-inventory.functions';

export function TwilioInventoryPanel() {
  const qc = useQueryClient();
  const list = useServerFn(adminTwilioInventory);
  const sync = useServerFn(adminSyncTwilioInventory);
  const assign = useServerFn(adminAssignTwilioInventory);
  const unassign = useServerFn(adminUnassignTwilioInventory);
  const accountsFn = useServerFn(adminListAccountsLite);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const { data: numbers = [], isPending, error } = useQuery({ queryKey: ['admin-twilio-inventory'], queryFn: () => list(), refetchInterval: 60000 });
  const { data: accounts = [] } = useQuery({ queryKey: ['admin-accounts-lite'], queryFn: () => accountsFn() });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['admin-twilio-inventory'] }); qc.invalidateQueries({ queryKey: ['admin-senders'] }); };
  const syncMut = useMutation({ mutationFn: () => sync(), onSuccess: r => { toast.success(`${r.synced} toll-free numbers checked`); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const assignMut = useMutation({ mutationFn: (data: { account_id: string; phone_number: string }) => assign({ data }), onSuccess: r => { toast.success(r.status === 'active' ? 'Number assigned; verified status retained' : 'Number assigned; approval confirmation pending'); invalidate(); }, onError: (e: Error) => { toast.error(e.message); invalidate(); } });
  const unassignMut = useMutation({ mutationFn: (phone_number: string) => unassign({ data: { phone_number } }), onSuccess: () => { toast.success('Assignment removed; sending and renewals stopped'); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  return <section className="space-y-4 border-y py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Verified toll-free inventory</h2><p className="text-sm text-muted-foreground">{numbers.length} numbers</p></div>
      <Button variant="outline" size="sm" onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
        {syncMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <RefreshCw className="size-4 mr-2" />} Check numbers
      </Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
    {syncMut.error && <p role="alert" className="text-sm text-destructive">{syncMut.error.message}</p>}
    {isPending ? <p className="text-muted-foreground text-sm">Loading numbers…</p> : !numbers.length ? <p className="text-muted-foreground text-sm">No numbers checked yet.</p> : <div className="overflow-x-auto">
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-4">Number</th><th className="py-2 pr-4">Verification</th><th className="py-2 pr-4">Business / ownership</th><th className="py-2">Assignment</th></tr></thead>
        <tbody>{numbers.map((n: any) => <tr key={n.phone_sid} className="border-b align-top">
          <td className="py-3 pr-4 font-mono whitespace-nowrap">{n.phone_number}<div className="font-sans text-xs text-muted-foreground">{new Date(n.synced_at).toLocaleString()}</div></td>
          <td className="py-3 pr-4"><Badge variant={n.verification_status === 'verified' ? 'secondary' : 'outline'}>{n.verification_status === 'verified' ? 'Verified' : 'Approval unconfirmed'}</Badge>{n.last_error && <p className="text-xs text-destructive mt-2 max-w-64 break-words">{n.last_error}</p>}</td>
          <td className="py-3 pr-4"><div>{n.assigned_to?.legal_business_name || n.assigned_to?.email || 'Unassigned'}</div><div className="font-mono text-xs text-muted-foreground break-all">{n.owner_account_sid}</div></td>
          <td className="py-3"><div className="flex flex-wrap gap-2">
            {n.assigned_account_id ? <>
              {n.assignment_state === 'setup_paused' && <Button size="sm" variant="outline" disabled={assignMut.isPending} onClick={() => assignMut.mutate({ account_id: n.assigned_account_id, phone_number: n.phone_number })}>Resume setup</Button>}
              <Button aria-label={`Remove assignment for ${n.phone_number}`} title="Remove assignment" size="icon" variant="ghost" disabled={unassignMut.isPending} onClick={() => { if (confirm(`Remove ${n.phone_number} from this business and stop its sending and renewals?`)) unassignMut.mutate(n.phone_number); }}><Unlink className="size-4" /></Button>
            </> : <>
              <TenantAssignmentPicker accounts={accounts} value={selected[n.phone_sid] ?? ''} onChange={value => setSelected(current => ({ ...current, [n.phone_sid]: value }))} number={n.phone_number} />
              <Button size="sm" disabled={!n.available || n.verification_status !== 'verified' || !selected[n.phone_sid] || assignMut.isPending} onClick={() => { const business = accounts.find(a => a.id === selected[n.phone_sid]); if (confirm(`Assign ${n.phone_number} to ${business?.email || business?.full_name || 'the selected business'}? The number stays in its current account; the existing monthly number fee applies.`)) assignMut.mutate({ account_id: selected[n.phone_sid], phone_number: n.phone_number }); }}>Assign</Button>
            </>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}