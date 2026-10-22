import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

const root = resolve(import.meta.dirname, '../..');
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) return nextResolve(pathToFileURL(resolve(root,'src',specifier.slice(2)+'.ts')).href,context);
  if(specifier.startsWith('./')&&!specifier.endsWith('.ts')) {
    try {return nextResolve(specifier+'.ts',context);} catch {}
  }
  return nextResolve(specifier,context);
}});
const guards=await import('../../src/lib/carrier-spam-guard.server.ts');
const { checkedResumeCampaign }=await import('../../src/lib/campaign-resume.server.ts');
const { FEEDBACK_TIMEOUT_REASON, SPAM_PAUSE_REASON }=await import('../../src/lib/carrier-spam-guard.ts');

function monitor(overrides={}) {
  return {state:'monitoring',submitted_count:25,outstanding_count:5,finalized_count:20,spam_count:3,
    expected_total:479,waiting_since:null,...overrides};
}

/** Execute actual deliverPending source; replace only imports and its external
 * infrastructure dependencies. No claim/pause/charging policy is mirrored. */
function productionDeliverPending() {
  const source=readFileSync(resolve(root,'src/routes/api.public.dispatch-campaign.ts'),'utf8');
  const start=source.indexOf('async function deliverPending(');
  const end=source.indexOf('\nasync function processCampaign(',start);
  assert.ok(start>=0&&end>start);
  let body=source.slice(start,end)
    .replaceAll('await import("@/lib/carrier-spam-guard.server")','__guards')
    .replaceAll('await import("@/lib/telnyx.server")','__telnyx');
  body=stripTypeScriptTypes(body);
  const globals={DELIVER_CONCURRENCY:12,RUN_BUDGET_MS:30000,EST_SEND_MS:1100,LEASE_SHARDS:12,
    DELIVER_PER_WORKER:12000,DISPATCH_CONNECTIONS:12};
  const deps={
    __guards:guards,__telnyx:{gateThroughputPerSecond:()=>120,gateMaxConcurrency:()=>12},
    ...globals,throttleForSender:()=>({perTick:100,concurrency:12}),
    createStatusSink:()=>({push(){},async drain(){}}),canStartDispatchSend:()=>true,
    finalizeIfComplete:async(db)=>{db.events.push('finalize')},
    runWithConcurrency:async(rows,_n,fn)=>Promise.all(rows.map(fn)),
    sendOneMessage:async(db)=>{db.events.push('provider-call');return {ok:true,shaft:false,debited:0}},
    flagAccountForReview:async()=>{throw Error('unexpected account mutation')},
    markSending:async(db)=>{db.events.push('mark-sending')},
  };
  return new Function(...Object.keys(deps),body+'; return deliverPending;')(...Object.values(deps));
}

function dispatcherDb(options={}) {
  const pending=Array.from({length:options.messages??479},(_,i)=>({id:`m${i+1}`}));
  const db={events:[],claimLimits:[],rowsRead:[],claims:0,async rpc(fn,args){
    db.events.push(fn);
    if(fn!=='spam_gate_claim')throw Error('Ordinary dispatch must not call '+fn);
    db.claimLimits.push(args._limit);db.claims++;
    if(options.claimError)return {data:null,error:{message:'claim unavailable'}};
    if(options.denyAll||(options.denyAfterClaims!=null&&db.claims>options.denyAfterClaims))return {data:[],error:null};
    return {data:pending.splice(0,args._limit),error:null};
  },from(table){
    const api={select(){return api},eq(){return api},in(){return api},update(){throw Error('unexpected prepaid requeue')},
      async maybeSingle(){return table==='campaigns'?{data:{status:options.campaignStatus??'sending'},error:options.liveError?{message:'unknown'}:null}:{data:null,error:null}},
      then(a,b){db.rowsRead.push(table);return Promise.resolve({data:[],count:100,error:null}).then(a,b)}};return api;
  }};return db;
}

for(const name of ['no-final-feedback','healthy-feedback','old-feedback-timeout-marker'])
test(`ordinary dispatch adds no feedback wait or monitor RPC: ${name}`,async()=>{
  const db=dispatcherDb();
  const result=await productionDeliverPending()(db,{id:'c1',account_id:'a1'},{},{perTick:100,concurrency:12,deadlineAt:Date.now()+30000});
  assert.equal(result.sent,100);
  assert.deepEqual(db.claimLimits,[48,48,4]); // original chunk/runtime bounds only
  assert.equal(db.events.filter(x=>x==='provider-call').length,100);
  assert.equal(db.events.filter(x=>x==='spam_gate_claim').length,3);
  assert.ok(!db.events.some(x=>/spam_gate_state|can_send/.test(x)));
});

test('confirmed incident stops the next claim chunk without per-message reads',async()=>{
  const db=dispatcherDb({denyAfterClaims:1});
  const result=await productionDeliverPending()(db,{id:'c1'},{},{perTick:100,concurrency:12});
  assert.equal(result.sent,48);assert.equal(db.claims,2);
  assert.equal(db.events.filter(x=>x==='provider-call').length,48);
});

for(const status of ['cancelled','paused','blocked_content','paused_by_user'])
test(`preexisting live ${status} status still stops before claim`,async()=>{
  const db=dispatcherDb({campaignStatus:status});
  const result=await productionDeliverPending()(db,{id:'c1'},{},{perTick:100,concurrency:12});
  assert.equal(result.cancelled,true);assert.equal(db.events.length,0);
});

test('unreadable live campaign status still fails closed before claim',async()=>{
  const db=dispatcherDb({liveError:true});
  const result=await productionDeliverPending()(db,{id:'c1'},{},{perTick:100,concurrency:12});
  assert.equal(result.cancelled,true);assert.equal(db.events.length,0);
});

test('authoritative account/incident refusal does not fall back to direct sending',async()=>{
  const db=dispatcherDb({denyAll:true});
  const result=await productionDeliverPending()(db,{id:'c1'},{},{perTick:100,concurrency:12});
  assert.equal(result.sent,0);assert.deepEqual(db.events,['spam_gate_claim']);
});

test('claim RPC failure does not fall back to bare claim or provider calls',async()=>{
  const db=dispatcherDb({claimError:true});
  const result=await productionDeliverPending()(db,{id:'c1'},{},{perTick:100,concurrency:12});
  assert.equal(result.sent,0);assert.deepEqual(db.events,['spam_gate_claim']);
});

/** Compile the actual server-function source. Only framework imports and the
 * dynamic service import are injected; handler control flow stays intact. */
function noticeHandler(serviceImport) {
  let source=readFileSync(resolve(root,'src/lib/carrier-spam-notice.functions.ts'),'utf8');
  source=source.replace(/^import .*$/gm,'')
    .replace('export const getCampaignCarrierNotice','const getCampaignCarrierNotice')
    .replace('await import("@/integrations/supabase/client.server")','await __serviceImport()');
  source=stripTypeScriptTypes(source);
  const createServerFn=()=>({middleware(){return this},inputValidator(){return this},handler(fn){return fn}});
  return new Function('createServerFn','requireSupabaseAuth','z','__serviceImport',source+';return getCampaignCarrierNotice;')(createServerFn,{}, {},serviceImport);
}
function queryClient(records,errors={},calls=[]) {
  return {from(table){const q={table,selection:null,filters:[]};calls.push(q);
    const api={select(fields){q.selection=fields;return api},eq(k,v){q.filters.push([k,v]);return api},
      async maybeSingle(){return {data:records[table]??null,error:errors[table]??null}}};return api;
  }};
}

for(const [name,record,error,message] of [
  ['unowned',null,null,'Campaign not found.'],
  ['RLS-read-error',null,{message:'SECRET raw backend detail'},'Could not check campaign access.'],
])test(`carrier notice refuses ${name} before service import/read`,async()=>{
  let imports=0;const serviceReads=[];const rlsReads=[];
  const get=noticeHandler(async()=>{imports++;return {supabaseAdmin:queryClient({}, {},serviceReads)}});
  await assert.rejects(get({data:{campaignId:'c1'},context:{supabase:queryClient({campaigns:record},{campaigns:error},rlsReads)}}),e=>e.message===message);
  assert.equal(imports,0);assert.equal(serviceReads.length,0);assert.equal(rlsReads[0].selection,'id');
});

test('carrier notice awaits caller RLS authorization before importing service client',async()=>{
  let finish;let imports=0;const wait=new Promise(resolve=>{finish=resolve});
  const rls={from(){return {select(){return this},eq(){return this},maybeSingle(){return wait}}}};
  const get=noticeHandler(async()=>{imports++;return {supabaseAdmin:queryClient({})}});
  const promise=get({data:{campaignId:'c1'},context:{supabase:rls}});
  await Promise.resolve();assert.equal(imports,0);finish({data:{id:'c1'},error:null});
  assert.equal(await promise,null);assert.equal(imports,1);
});

const incident={kind:'spam',paused:false,finalized:'25',spam:'5',created_at:'2026-10-22T00:00:00Z',
  recipient_email:'PRIVATE@example.com',raw_error:'PRIVATE provider diagnostic',payload:{secret:'PRIVATE'}};
test('carrier notice is available for sent campaigns and returns aggregate/status only',async()=>{
  const reads=[];const get=noticeHandler(async()=>({supabaseAdmin:queryClient({campaign_spam_incidents:incident,campaign_spam_email_outbox:{status:'sent',recipient_email:'PRIVATE',payload:{secret:'PRIVATE'}}},{},reads)}));
  const result=await get({data:{campaignId:'c1'},context:{supabase:queryClient({campaigns:{id:'c1',status:'sent'}})}});
  assert.deepEqual(result,{kind:'spam',paused:false,finalized:25,spam:5,createdAt:incident.created_at,emailStatus:'sent'});
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.deepEqual(reads.map(q=>q.selection),['kind,paused,finalized,spam,created_at','status']);
});
test('carrier notice outbox read error gives unavailable without leaking raw error',async()=>{
  const get=noticeHandler(async()=>({supabaseAdmin:queryClient({campaign_spam_incidents:incident},{campaign_spam_email_outbox:{message:'PRIVATE mail error'}})}));
  const result=await get({data:{campaignId:'c1'},context:{supabase:queryClient({campaigns:{id:'c1'}})}});
  assert.equal(result.emailStatus,'unavailable');assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('carrier notice incident read error is generic and never proceeds to outbox read',async()=>{
  const reads=[];const get=noticeHandler(async()=>({supabaseAdmin:queryClient({},{campaign_spam_incidents:{message:'PRIVATE'}},reads)}));
  await assert.rejects(get({data:{campaignId:'c1'},context:{supabase:queryClient({campaigns:{id:'c1'}})}}),e=>e.message==='Carrier notice could not be loaded.');
  assert.deepEqual(reads.map(q=>q.table),['campaign_spam_incidents']);
});
test('carrier notice absent incident returns null without reading email outbox',async()=>{
  const reads=[];const get=noticeHandler(async()=>({supabaseAdmin:queryClient({}, {},reads)}));
  assert.equal(await get({data:{campaignId:'c1'},context:{supabase:queryClient({campaigns:{id:'c1'}})}}),null);
  assert.deepEqual(reads.map(q=>q.table),['campaign_spam_incidents']);
});

function resumeDb(options={}) {
  const state={rpcCalls:[],directUpdates:0,accountReads:0,screenCalls:0};
  const live={id:'c1',account_id:'a1',status:'paused',name:'Business',message_body:'Exact body',paused_reason:options.reason??FEEDBACK_TIMEOUT_REASON};
  return {state,from(table){const api={select(){return api},eq(){return api},update(){state.directUpdates++;return api},
    async maybeSingle(){if(table==='campaigns')return {data:live,error:null};state.accountReads++;return {data:{id:'a1',onboarding_status:'active',sending_suspended_at:null},error:null}}};return api;
  },async rpc(fn,args){state.rpcCalls.push({fn,args});
    if(fn==='spam_gate_state')return {data:[monitor({state:'paused_timeout',finalized_count:options.feedbackFinalized??20})],error:null};
    if(fn==='spam_gate_resume_timeout')return options.atomicResponse??{data:true,error:null};
    throw Error('Unexpected RPC '+fn);
  }};
}
for(const [name,atomicResponse] of [
  ['late bad receipt',{data:false,error:null}],['RPC unavailable',{data:null,error:{message:'PRIVATE'}}],['no affirmative success',{data:null,error:null}],
])test(`checked timeout resume refuses ${name} after fresh screening`,async()=>{
  const db=resumeDb({atomicResponse});const result=await checkedResumeCampaign(db,{campaignId:'c1',expectedAccountId:'a1'},async()=>{db.state.screenCalls++;return {action:'passed'}});
  assert.equal(result.ok,false);assert.equal(result.code,'changed');assert.equal(db.state.screenCalls,1);
  assert.equal(db.state.accountReads,2);assert.equal(db.state.directUpdates,0);
  assert.deepEqual(db.state.rpcCalls.at(-1),{fn:'spam_gate_resume_timeout',args:{_campaign_id:'c1',_account_id:'a1',_body:'Exact body',_status:'paused'}});
});
test('checked timeout resume succeeds only after screen plus affirmative atomic RPC',async()=>{
  const db=resumeDb();const result=await checkedResumeCampaign(db,{campaignId:'c1',expectedAccountId:'a1'},async()=>({action:'passed'}));
  assert.equal(result.ok,true);assert.equal(db.state.directUpdates,0);assert.equal(db.state.rpcCalls.at(-1).fn,'spam_gate_resume_timeout');
});
test('fresh screening refusal prevents any timeout-resume RPC',async()=>{
  const db=resumeDb();const result=await checkedResumeCampaign(db,{campaignId:'c1',expectedAccountId:'a1'},async()=>({action:'blocked',blockedReasons:['test reason']}));
  assert.equal(result.ok,false);assert.equal(result.code,'screen_blocked');
  assert.equal(db.state.rpcCalls.filter(c=>c.fn==='spam_gate_resume_timeout').length,0);assert.equal(db.state.directUpdates,0);
});
test('active spam hold never screens or invokes timeout-resume RPC',async()=>{
  const db=resumeDb({reason:SPAM_PAUSE_REASON});const result=await checkedResumeCampaign(db,{campaignId:'c1',expectedAccountId:'a1'},async()=>{throw Error('must not screen')});
  assert.equal(result.ok,false);assert.equal(result.code,'carrier_spam_hold');assert.equal(db.state.rpcCalls.length,0);
});


test('explicit screened legacy-timeout resume does not wait for twenty final receipts',async()=>{
  const db=resumeDb({feedbackFinalized:9});
  let screens=0;
  const result=await checkedResumeCampaign(db,{campaignId:'c1',expectedAccountId:'a1'},async()=>{screens++;return {action:'passed'}});
  assert.equal(result.ok,true);assert.equal(screens,1);
  assert.equal(db.state.rpcCalls.at(-1).fn,'spam_gate_resume_timeout');
});
