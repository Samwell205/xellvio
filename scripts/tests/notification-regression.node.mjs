import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const sourceRoot = resolve(import.meta.dirname, '../..');
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(pathToFileURL(resolve(sourceRoot, 'src', specifier.slice(2) + '.ts')).href, context);
  if (specifier.startsWith('./') && !specifier.endsWith('.ts')) {
    try { return nextResolve(specifier + '.ts', context); } catch {}
  }
  return nextResolve(specifier, context);
}});
const policy = await import('../../src/lib/campaign-incident-email.server.ts');
const { processSpamGateEmailOutbox } = await import('../../src/lib/carrier-spam-guard.server.ts');
const { buildSpamIncidentEmail } = await import('../../src/lib/carrier-spam-guard.ts');

function fixture(options = {}) {
  const payload = { label: policy.INCIDENT_EMAIL_LABEL, incident_outbox_id: 'o1', to: 'owner@example.com',
    message_id: 'spamgate-incident-c1', idempotency_key: 'spamgate-incident-c1' };
  const row = { id: 'o1', campaign_id: 'c1', account_id: 'a1', status: options.status ?? 'pending', payload,
    next_retry_at: null, created_at: 0 };
  const state = { rows: [row], logs: (options.logs ?? []).map(r=>({message_id:'spamgate-incident-c1',...r})), queue: [], rpcCalls: [],
    incident: { campaign_id:'c1', kind: 'spam', paused: true, finalized: 20, spam: 4, submission_state: 'remaining_stopped' },
    account: { id:'a1', email: 'owner@example.com', contact_email: '   ' }, options,
    tokens:new Map(options.existingToken?[['owner@example.com',options.existingToken]]:[]),tokenWrites:0,tokenInsertOptions:[] };
  function query(table) {
    const q = { filters: [], order: null, limit: null, inserted: null, single: false, upsertOptions:null };
    const api = {
      select() { return api; }, eq(k,v) { q.filters.push(r => r[k] === v); return api; },
      in(k,values) { q.filters.push(r => values.includes(r[k])); return api; },
      order(k,{ascending}) { q.order = [k,ascending]; return api; },
      limit(n) { q.limit=n; return api; },
      insert(rows) { q.inserted=Array.isArray(rows)?rows:[rows]; return api; },
      upsert(row,opts) { q.inserted=[row];q.upsertOptions=opts; return api; },
      maybeSingle() { q.single=true; return execute(); },
      single() { q.single=true; return execute(); },
      then(a,b) { return execute().then(a,b); },
    };
    async function execute() {
      if (options.readError === table || (table==='email_unsubscribe_tokens'&&options.tokenReadError&&!q.inserted)) return { data: null, error: {message:'read unavailable'} };
      let rows = table === 'email_send_state' ? [{id:1,batch_size:10,send_delay_ms:0,auth_email_ttl_minutes:15,transactional_email_ttl_minutes:60}] : table === 'campaign_spam_email_outbox' ? state.rows : table === 'email_send_log' ? state.logs :
        table === 'accounts' ? [state.account] : table === 'campaigns' ? [{id:'c1',name:'<Sale>'}] :
        table === 'campaign_spam_incidents' ? [state.incident] :
        table === 'suppressed_emails' ? (options.suppressed ? [{email:'owner@example.com'}] : []) :
        table === 'email_unsubscribe_tokens' ? [...state.tokens].map(([email,token])=>({email,token})) : [];
      if (q.inserted) {
        if (table === 'email_send_log') state.logs.push(...q.inserted);
        if (table === 'email_unsubscribe_tokens') {
          state.tokenInsertOptions.push(q.upsertOptions);
          for(const r of q.inserted) {
            if(!state.tokens.has(r.email)||!q.upsertOptions?.ignoreDuplicates){state.tokens.set(r.email,r.token);state.tokenWrites++;}
          }
        }
        rows=q.inserted;
      }
      rows=rows.filter(r=>q.filters.every(f=>f(r)));
      if (q.order) rows=rows.toSorted((a,b)=>(a[q.order[0]] > b[q.order[0]] ? 1 : -1)*(q.order[1]?1:-1));
      if (q.limit) rows=rows.slice(0,q.limit);
      return {data:q.single?(rows[0]??null):rows,error:null};
    }
    return api;
  }
  const db={state,from:query,async rpc(fn,args) {
    state.rpcCalls.push({fn,args});
    if (fn==='spam_gate_outbox_due') return {data:state.rows.filter(r=>['pending','queued'].includes(r.status)&&(!r.next_retry_at||r.next_retry_at<=Date.now())).slice(0,args._limit),error:null};
    if (fn==='spam_gate_outbox_mark') {
      const r=state.rows.find(r=>r.id===args._outbox_id);
      if (!r||r.status!==args._expected_status||r.status==='sent') return {data:false,error:null};
      if (args._status==='pending'&&r.status!=='pending') return {data:false,error:null};
      r.status=args._status; r.last_error=args._error;
      r.next_retry_at=['pending','queued'].includes(r.status)?Date.now()+args._retry_delay_seconds*1000:null;
      return {data:true,error:null};
    }
    if (fn==='spam_gate_outbox_enqueue') {
      if(options.enqueueFailsBeforeCommit)return {data:null,error:{message:'queue unavailable'}};
      const r=state.rows.find(r=>r.id===args._outbox_id);
      if (r.status!=='pending') return {data:null,error:null};
      state.queue.push(args._payload); r.payload=args._payload; r.status='queued';
      r.next_retry_at=Date.now()+300000;
      return options.lostEnqueueReply?{data:null,error:{message:'response lost after commit'}}:{data:1,error:null};
    }
    throw new Error('Unexpected RPC '+fn);
  }};
  return db;
}

test('lost enqueue response never rewinds committed queued state or enqueues twice',async()=>{
  const db=fixture({lostEnqueueReply:true});
  await processSpamGateEmailOutbox(db);
  assert.equal(db.state.rows[0].status,'queued');
  assert.equal(db.state.queue.length,1);
  db.state.rows[0].next_retry_at=null;
  await processSpamGateEmailOutbox(db);
  assert.equal(db.state.queue.length,1);
});

test('actual sent proof wins over older failed/DLQ logs',async()=>{
  const db=fixture({status:'queued',logs:[{id:'s',status:'sent'},{status:'failed'},{status:'dlq'}]});
  await processSpamGateEmailOutbox(db);
  assert.equal(db.state.rows[0].status,'sent');
});

test('transient failed logs keep queue retryable; advance reconciliation to prevent starvation',async()=>{
  const db=fixture({status:'queued',logs:[{status:'failed'}]});
  await processSpamGateEmailOutbox(db);
  assert.equal(db.state.rows[0].status,'queued');
  assert.ok(db.state.rows[0].next_retry_at>Date.now());
  const next=await processSpamGateEmailOutbox(db);
  assert.equal(next.scanned,0);
});

test('DLQ is a visible terminal manual-review state, not forever queued',async()=>{
  const db=fixture({status:'queued',logs:[{status:'dlq',error_message:'TTL exceeded'}]});
  await processSpamGateEmailOutbox(db);
  assert.equal(db.state.rows[0].status,'failed');
  assert.match(db.state.rows[0].last_error,/manual review/);
});

for (const table of ['campaign_spam_incidents','campaigns','accounts','suppressed_emails','email_unsubscribe_tokens']) {
  test(`${table} lookup failure defers without fabricated email or terminal missing`,async()=>{
    const db=fixture({readError:table});
    await processSpamGateEmailOutbox(db);
    assert.equal(db.state.queue.length,0);
    assert.equal(db.state.rows[0].status,'pending');
    assert.ok(db.state.rows[0].next_retry_at>Date.now());
  });
}

test('blank contact uses real account email; enqueue carries exact outbox identity',async()=>{
  const db=fixture(); await processSpamGateEmailOutbox(db);
  assert.equal(db.state.queue[0].to,'owner@example.com');
  assert.equal(db.state.queue[0].incident_outbox_id,'o1');
});

test('actual consumer suppression added after enqueue blocks send',async()=>{
  const db=fixture({status:'queued',suppressed:true});
  assert.deepEqual(await policy.prepareIncidentEmailSend(db,db.state.rows[0].payload),{send:false,reason:'suppressed'});
  assert.equal(db.state.rows[0].status,'suppressed');
});

test('actual consumer suppression outage fails closed and unrelated labels do no DB reads',async()=>{
  const db=fixture({status:'queued',readError:'suppressed_emails'});
  await assert.rejects(policy.prepareIncidentEmailSend(db,db.state.rows[0].payload),/unavailable/);
  assert.deepEqual(await policy.prepareIncidentEmailSend({from(){throw Error('must not read')}},{label:'generic'}),{send:true});
});

test('server-owned queued recipient mismatch is refused',async()=>{
  const db=fixture({status:'queued'});
  await assert.rejects(policy.prepareIncidentEmailSend(db,{...db.state.rows[0].payload,to:'other@example.com'}),/does not match/);
});

test('actual send outcome is monotonic and wins over earlier terminal failure',async()=>{
  const db=fixture({status:'failed'});
  await policy.recordIncidentEmailOutcome(db,db.state.rows[0].payload,'sent');
  await policy.recordIncidentEmailOutcome(db,db.state.rows[0].payload,'failed','later DLQ');
  assert.equal(db.state.rows[0].status,'sent');
});

test('copy distinguishes proven all-submitted from stopped/unknown; no unsent-cost promise',()=>{
  const input={campaignId:'c1',campaignName:'<Sale>',stats:{finalized:20,spam:4},paused:false,kind:'spam',baseUrl:'https://xellvio.com'};
  const unknown=buildSpamIncidentEmail(input);
  assert.doesNotMatch(unknown.text,/All messages.*already/);
  assert.match(unknown.html,/&lt;Sale&gt;/);
  const all=buildSpamIncidentEmail({...input,submissionState:'all_submitted'});
  assert.match(all.text,/All messages.*already/);
  const paused=buildSpamIncidentEmail({...input,paused:true,submissionState:'remaining_stopped'});
  assert.doesNotMatch(paused.text,/unsent messages are.*not charged/);
  assert.match(paused.text,/charged or reserved/);
});


// Execute the actual proposed queue handler with only imports/env substituted.
// The handler body and all its branching are production source, not a mirror.
function queueHandler(db, sendMail) {
  let source=readFileSync(resolve(sourceRoot,'src/routes/lovable/email/queue/process.ts'),'utf8');
  source=source.replace(/^import .*$/gm,'').replace('export const Route','const Route').replaceAll('import.meta.env','__env');
  source=stripTypeScriptTypes(source);
  const build=new Function('sendMail','mailerProvider','createClient','createFileRoute','isIncidentEmail',
    'prepareIncidentEmailSend','recordIncidentEmailOutcome','deferIncidentEmail','__env','process',
    source+'; return Route.server.handlers.POST;');
  return build(sendMail,()=> 'resend',()=>db,()=>config=>config,
    policy.isIncidentEmail,policy.prepareIncidentEmailSend,policy.recordIncidentEmailOutcome,policy.deferIncidentEmail,
    {VITE_SUPABASE_URL:'https://local.invalid'},{env:{SUPABASE_SERVICE_ROLE_KEY:'local-test-key'}});
}
async function runQueue(db,{failSend=false}={}) {
  const baseRpc=db.rpc;
  const sent=[];
  db.rpc=async(fn,args)=>{
    if(fn==='read_email_batch')return {data:args.queue_name==='auth_emails'?[]:[{msg_id:42,read_ct:1,enqueued_at:new Date().toISOString(),message:db.state.rows[0].payload}],error:null};
    if(fn==='delete_email'){db.state.deleted=true;return {data:true,error:null};}
    if(fn==='move_to_dlq'){db.state.dlqStateBefore=db.state.rows[0].status;if(db.state.options.dlqCrash)throw Error('cleanup crash');db.state.dlq=true;return {data:1,error:null};}
    return baseRpc(fn,args);
  };
  const handler=queueHandler(db,async payload=>{sent.push(payload);if(failSend)throw Error('503 gateway outage');});
  const response=await handler({request:new Request('https://local.invalid/lovable/email/queue/process',{method:'POST',headers:{Authorization:'Bearer local-test-key'}})});
  return {sent,response};
}

test('actual queue handler rechecks late suppression, deletes stopped item, and sends nothing',async()=>{
  const db=fixture({status:'queued',suppressed:true});
  const {sent}=await runQueue(db);
  assert.equal(sent.length,0);assert.equal(db.state.deleted,true);assert.equal(db.state.rows[0].status,'suppressed');
});

test('actual queue handler defers suppression outage without consuming mail retry budget',async()=>{
  const db=fixture({status:'queued',readError:'suppressed_emails'});
  const {sent}=await runQueue(db);
  assert.equal(sent.length,0);assert.equal(db.state.deleted,undefined);
  assert.equal(db.state.logs.filter(r=>r.status==='failed').length,0);
  assert.equal(db.state.rows[0].status,'queued');
});

test('actual queue handler records actual successful send and removes item',async()=>{
  const db=fixture({status:'queued'});const {sent}=await runQueue(db);
  assert.equal(sent.length,1);assert.equal(db.state.rows[0].status,'sent');assert.equal(db.state.deleted,true);
});

test('actual queue provider failure keeps retryable queued state and item',async()=>{
  const db=fixture({status:'queued'});const {sent}=await runQueue(db,{failSend:true});
  assert.equal(sent.length,1);assert.equal(db.state.rows[0].status,'queued');assert.equal(db.state.deleted,undefined);
  assert.equal(db.state.logs.filter(r=>r.status==='failed').length,1);
});

test('actual queue TTL/DLQ records visible manual-review failure without sending',async()=>{
  const db=fixture({status:'queued'});db.state.rows[0].payload.queued_at=new Date(Date.now()-2*3600000).toISOString();
  const {sent}=await runQueue(db);assert.equal(sent.length,0);assert.equal(db.state.dlq,true);
  assert.equal(db.state.rows[0].status,'failed');assert.match(db.state.rows[0].last_error,/manual review/);
});

test('actual queue generic label preserves previous pipeline and skips incident/suppression reads',async()=>{
  const db=fixture({status:'queued',readError:'suppressed_emails'});db.state.rows[0].payload.label='generic';
  const {sent}=await runQueue(db);assert.equal(sent.length,1);assert.equal(db.state.deleted,true);
  assert.equal(db.state.rows[0].status,'queued');
});


test('repeated and concurrent incident builds preserve an existing unsubscribe token',async()=>{
  const db=fixture({enqueueFailsBeforeCommit:true,existingToken:'known-stable-token'});
  await processSpamGateEmailOutbox(db);db.state.rows[0].next_retry_at=null;
  await processSpamGateEmailOutbox(db);db.state.rows[0].next_retry_at=null;
  await Promise.all(Array.from({length:12},()=>processSpamGateEmailOutbox(db)));
  assert.equal(db.state.tokens.get('owner@example.com'),'known-stable-token');
  assert.equal(db.state.tokenWrites,0);
  assert.ok(db.state.tokenInsertOptions.length>1);
  assert.ok(db.state.tokenInsertOptions.every(o=>o.onConflict==='email'&&o.ignoreDuplicates===true));
});

test('concurrent first-time incident builds create one stable unsubscribe token',async()=>{
  const db=fixture({enqueueFailsBeforeCommit:true});
  await Promise.all(Array.from({length:12},()=>processSpamGateEmailOutbox(db)));
  const token=db.state.tokens.get('owner@example.com');assert.equal(db.state.tokenWrites,1);
  db.state.rows[0].next_retry_at=null;await processSpamGateEmailOutbox(db);
  assert.equal(db.state.tokens.get('owner@example.com'),token);assert.equal(db.state.tokenWrites,1);
});

test('actual queue policy exhaustion is durable before cleanup; cleanup crash cannot strand queued state',async()=>{
  const db=fixture({status:'queued',dlqCrash:true});
  db.state.rows[0].payload.queued_at=new Date(Date.now()-2*3600000).toISOString();
  await assert.rejects(runQueue(db),/cleanup crash/);
  assert.equal(db.state.dlqStateBefore,'failed');assert.equal(db.state.rows[0].status,'failed');
  assert.match(db.state.rows[0].last_error,/manual review/);
  assert.match(db.state.rows[0].last_error,/recipient delivery is not confirmed/);
});


test('stored unsubscribe-token read outage defers without replacing existing token',async()=>{
  const db=fixture({existingToken:'keep-this-link-valid',tokenReadError:true});
  await processSpamGateEmailOutbox(db);
  assert.equal(db.state.queue.length,0);assert.equal(db.state.rows[0].status,'pending');
  assert.equal(db.state.tokens.get('owner@example.com'),'keep-this-link-valid');assert.equal(db.state.tokenWrites,0);
});
