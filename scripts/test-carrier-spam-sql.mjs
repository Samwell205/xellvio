import {setup} from './tests/carrier-spam-sql/setup.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {seedCampaign,scalar,assert,randomUUID} from './tests/carrier-spam-sql/fixture-helpers.mjs';
import {createHash} from 'node:crypto';
const migrationPath=process.argv[2]||new URL('../db-proposals/20261022-remove-carrier-feedback-delays.sql',import.meta.url);
const baseMigrationSQL=await readFile(new URL('../drizzle/migrations/0018_campaign_spam_monitor_gate.sql',import.meta.url),'utf8');
const migrationSQL=await readFile(migrationPath,'utf8');
const baseMigrationSha256=createHash('sha256').update(baseMigrationSQL).digest('hex');
const migrationSha256=createHash('sha256').update(migrationSQL).digest('hex');
const report=[];
async function run(name,fn,{realCutoff=false}={}){
 const db=await setup();
 try{await db.exec(baseMigrationSQL); await db.exec(migrationSQL); if(!realCutoff&&await scalar(db,`SELECT to_regclass('public.campaign_spam_rollout') IS NOT NULL`))await db.query(`UPDATE campaign_spam_rollout SET activated_at=clock_timestamp()-interval '1 second'`); await fn(db); report.push({name,pass:true});console.log('PASS '+name)}
 catch(e){report.push({name,pass:false,error:e.message,detail:e.detail,where:e.where});console.log('FAIL '+name+': '+e.message)}
 finally{await db.close()}
}
async function enrolled(db,opts){const c=await seedCampaign(db,opts);assert.equal(await scalar(db,'SELECT spam_gate_enroll($1)',[c.campaignId]),true);await db.query('SELECT spam_gate_set_expected_total($1,$2)',[c.campaignId,opts?.size||479]);return c}
async function claim(db,id,n=25){return (await db.query('SELECT * FROM spam_gate_claim($1,$2)',[id,n])).rows}
async function providers(db,id){await db.query(`UPDATE messages SET provider_message_id='pid-'||id::text,status='sent' WHERE campaign_id=$1 AND charged_at IS NOT NULL`,[id]);return (await db.query('SELECT id,provider_message_id FROM messages WHERE campaign_id=$1 AND provider_message_id IS NOT NULL ORDER BY created_at',[id])).rows}
async function receipt(db,c,m,error=null){return scalar(db,'SELECT spam_gate_record_receipt($1,$2,$3,$4,$5,now())',[c,m.id,m.provider_message_id,error,error?'undelivered':'delivered'])}
async function state(db,c){return (await db.query('SELECT * FROM spam_gate_state($1)',[c])).rows[0]}

await run('requested chunks submit all479 without waiting for receipts',async db=>{
 const {campaignId,accountId}=await enrolled(db);
 const rows=await Promise.all(Array.from({length:12},()=>claim(db,campaignId,100)));
 assert.equal(rows.flat().length,479);assert.equal(await scalar(db,'SELECT count(*)::integer FROM message_send_attempts'),479);
 assert.equal(Number(await scalar(db,'SELECT SUM(amount) FROM credit_transactions')),7.4245);
 assert.equal(Number(await scalar(db,'SELECT credit_balance FROM accounts WHERE id=$1',[accountId])),992.5755);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
});
await run('20 finals with4 spam atomically pause incident andoutbox',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 assert.equal((await state(db,campaignId)).state,'paused_spam');assert.equal((await claim(db,campaignId)).length,0);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),1);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_email_outbox'),1);
});
await run('healthy feedback adds no250 outstanding limit',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<3?'40002':null);
 assert.equal((await claim(db,campaignId,400)).length,400);assert.equal((await claim(db,campaignId,400)).length,54);
 const s=await state(db,campaignId);assert.equal(s.state,'released');assert.equal(s.submitted_count,479);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
});
await run('missing feedback and historical wait timestamp do not pause later chunks',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);
 await db.query(`UPDATE campaign_spam_monitors SET waiting_since=now()-interval '11 minutes' WHERE campaign_id=$1`,[campaignId]);
 assert.equal((await claim(db,campaignId,400)).length,400);
 assert.equal(await scalar(db,'SELECT status FROM campaigns WHERE id=$1',[campaignId]),'sending');
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
});
await run('pauseorcancelbefore nextchunk preventsnewpaidclaims',async db=>{
 const {campaignId}=await enrolled(db);assert.equal((await claim(db,campaignId,5)).length,5);
 await db.query(`UPDATE campaigns SET status='cancelled' WHERE id=$1`,[campaignId]);
 assert.equal((await claim(db,campaignId,5)).length,0);assert.equal(await scalar(db,'SELECT count(*)::integer FROM message_send_attempts'),5);
});
await run('account sendinghold preventsnewpaidclaims',async db=>{
 const {campaignId,accountId}=await enrolled(db);await db.query('UPDATE accounts SET sending_suspended_at=now() WHERE id=$1',[accountId]);
 assert.equal((await claim(db,campaignId)).length,0);assert.equal(await scalar(db,'SELECT count(*)::integer FROM message_send_attempts'),0);
});
await run('duplicateandoldproviderfacts ignored despite mutablestatusregression',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<3?'40002':null);
 assert.equal(await receipt(db,campaignId,ms[0],'40002'),'duplicate');
 assert.equal(await receipt(db,campaignId,{...ms[0],provider_message_id:'old-id'},'40002'),'stale');
 await db.query(`UPDATE messages SET status='sent',error_code='40002' WHERE campaign_id=$1`,[campaignId]);await db.query(`UPDATE message_send_attempts SET finalized_at=NULL,provider_status='sent' WHERE campaign_id=$1`,[campaignId]);
 const s=await state(db,campaignId);assert.equal(s.finalized_count,20);assert.equal(s.spam_count,3);
});
await run('currentproviderchange excludes supersededfinalfact fromcounts',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i]);
 await db.query('UPDATE messages SET provider_message_id=$1 WHERE id=$2',['replacement-id',ms[0].id]);
 await receipt(db,campaignId,{...ms[0],provider_message_id:'replacement-id'},'40002');
 const s=await state(db,campaignId);assert.equal(s.finalized_count,20);assert.equal(s.spam_count,1);
});
await run('prepaidinterruptedclaim doesnotdoublecountsamepaidattempt',async db=>{
 const {campaignId}=await enrolled(db);assert.equal((await claim(db,campaignId,3)).length,3);
 await db.query(`UPDATE messages SET dispatch_started_at=now()-interval '6 minutes' WHERE campaign_id=$1 AND charged_at IS NOT NULL`,[campaignId]);
 assert.equal((await claim(db,campaignId,3)).length,3);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM message_send_attempts'),3);
 assert.equal((await state(db,campaignId)).submitted_count,3);
});
await run('latefinals forsmall fullysubmittedcampaign notifywithoutclaimingremainderstopped',async db=>{
 const {campaignId}=await enrolled(db,{size:20});assert.equal((await claim(db,campaignId)).length,20);const ms=await providers(db,campaignId);
 await db.query(`UPDATE campaigns SET status='sent' WHERE id=$1`,[campaignId]);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 assert.equal(await scalar(db,'SELECT paused FROM campaign_spam_incidents WHERE campaign_id=$1',[campaignId]),false);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_email_outbox'),1);
});
await run('old untouchedcampaign cannotenroll afterrollout',async db=>{
 const {campaignId}=await seedCampaign(db,{createdAt:`now()-interval '1 year'`});
 assert.equal(await scalar(db,'SELECT spam_gate_enroll($1)',[campaignId]),false);
});
await run('historicalattemptedcampaign neverenrolls orretro-notifies',async db=>{
 const {campaignId}=await seedCampaign(db);await db.query('SELECT * FROM claim_campaign_messages($1,25)',[campaignId]);
 assert.equal(await scalar(db,'SELECT spam_gate_enroll($1)',[campaignId]),false);const ms=await providers(db,campaignId);
 assert.equal(await receipt(db,campaignId,ms[0],'40002'),'unenrolled');assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
});
await run('pause+incident+outboxrollback together ifoutboxinsertfails',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<19;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 await db.exec(`CREATE FUNCTION fail_outbox_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox insert failure'; END $$; CREATE TRIGGER inject_outbox_insert BEFORE INSERT ON campaign_spam_email_outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox_insert();`);
 await assert.rejects(()=>receipt(db,campaignId,ms[19]),/injected outbox/);
 assert.equal(await scalar(db,'SELECT status FROM campaigns WHERE id=$1',[campaignId]),'sending');assert.equal((await state(db,campaignId)).finalized_count,19);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_email_outbox'),0);
});
await run('enqueue+outboxmarkrollback anddurablesingleretry',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 const oid=await scalar(db,'SELECT id FROM campaign_spam_email_outbox');
 await db.exec(`CREATE FUNCTION fail_outbox_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='queued' THEN RAISE EXCEPTION 'injected after queue insert'; END IF; RETURN NEW; END $$; CREATE TRIGGER inject_outbox_update BEFORE UPDATE ON campaign_spam_email_outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox_update();`);
 await assert.rejects(()=>db.query(`SELECT spam_gate_outbox_enqueue($1,'{"test":true}'::jsonb)`,[oid]),/injected after queue/);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM pgmq.test_queue'),0);assert.equal(await scalar(db,'SELECT status FROM campaign_spam_email_outbox'),'pending');
 await db.exec('DROP TRIGGER inject_outbox_update ON campaign_spam_email_outbox');
 const results=await Promise.all(Array.from({length:12},()=>db.query(`SELECT spam_gate_outbox_enqueue($1,'{"test":true}'::jsonb) AS id`,[oid])));
 assert.equal(results.filter(x=>x.rows[0].id!==null).length,1);assert.equal(await scalar(db,'SELECT count(*)::integer FROM pgmq.test_queue'),1);
 assert.equal(await scalar(db,'SELECT status FROM campaign_spam_email_outbox'),'queued');
});
await run('40001and40012 alone donottrigger spampause',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i%2?'40001':'40012');
 assert.equal((await claim(db,campaignId,400)).length,400);assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
});
await run('later badwave beyond1000 retainedfinalfacts stilltriggers',async db=>{
 const {campaignId}=await enrolled(db,{size:1400});
 await db.query(`UPDATE messages SET provider_message_id='pid-'||id::text,status='sent' WHERE campaign_id=$1`,[campaignId]);
 await db.query(`UPDATE campaigns SET status='sent' WHERE id=$1`,[campaignId]);
 await db.query(`UPDATE campaign_spam_monitors SET submitted_count=1400 WHERE campaign_id=$1`,[campaignId]);
 const ms=(await db.query('SELECT id,provider_message_id FROM messages WHERE campaign_id=$1 ORDER BY created_at',[campaignId])).rows;
 for(let i=0;i<1100;i++)await receipt(db,campaignId,ms[i]);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
 for(let i=1100;i<1375;i++)await receipt(db,campaignId,ms[i],'40002');
 assert.equal((await state(db,campaignId)).finalized_count,1375);assert.equal((await state(db,campaignId)).spam_count,275);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),1);
});
await run('staleoutboxerror cannotregressqueued andallowduplicateenqueue',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 const oid=await scalar(db,'SELECT id FROM campaign_spam_email_outbox');
 await db.query(`SELECT spam_gate_outbox_enqueue($1,'{"test":true}'::jsonb)`,[oid]);
 await db.query(`SELECT spam_gate_outbox_mark($1,'pending','pending','stale worker account lookup error',300)`,[oid]);
 await db.query(`SELECT spam_gate_outbox_enqueue($1,'{"test":true}'::jsonb)`,[oid]);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM pgmq.test_queue'),1);
});
await run('claimfailure afterpaidclaim rollsbackdebit ledgerattempts andmessageclaims',async db=>{
 const {campaignId,accountId}=await enrolled(db);
 await db.exec(`CREATE FUNCTION fail_monitor_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.submitted_count>OLD.submitted_count THEN RAISE EXCEPTION 'injected monitor write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER inject_monitor_update BEFORE UPDATE ON campaign_spam_monitors FOR EACH ROW EXECUTE FUNCTION fail_monitor_update();`);
 await assert.rejects(()=>claim(db,campaignId),/injected monitor write failure/);
 assert.equal(Number(await scalar(db,'SELECT credit_balance FROM accounts WHERE id=$1',[accountId])),1000);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM message_send_attempts'),0);assert.equal(await scalar(db,'SELECT count(*)::integer FROM credit_transactions'),0);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM messages WHERE charged_at IS NOT NULL'),0);
});
await run('emptycontactemail fallbacks trimmedaccountemail andsuppressionvisibility',async db=>{
 const {campaignId,accountId}=await enrolled(db);
 await db.query(`UPDATE accounts SET contact_email='  ',email='  fallback@example.test  ' WHERE id=$1`,[accountId]);
 await db.query(`INSERT INTO suppressed_emails(email,reason) VALUES('fallback@example.test','test bounce')`);
 await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 assert.equal(await scalar(db,'SELECT recipient_email FROM campaign_spam_incidents'),'fallback@example.test');
 assert.equal(await scalar(db,'SELECT status FROM campaign_spam_email_outbox'),'suppressed');assert.equal(await scalar(db,'SELECT count(*)::integer FROM pgmq.test_queue'),0);
});
await run('newSQLRPCs andprivatepause are denied totenantroles',async db=>{
 const rows=(await db.query(`SELECT p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS tenant,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('service_role',p.oid,'EXECUTE') AS service FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'spam_gate_%'`)).rows;
 const expected=[...new Set([...(baseMigrationSQL+'\n'+migrationSQL).matchAll(/CREATE(?: OR REPLACE)? FUNCTION public\.(spam_gate_\w+)\(/g)].map(x=>x[1]))].sort();assert.deepEqual(rows.map(x=>x.proname).sort(),expected);for(const r of rows){assert.equal(r.tenant,false,r.proname);assert.equal(r.anon,false,r.proname);assert.equal(r.service,!['spam_gate_do_pause','spam_gate_refresh','spam_gate_invalidate_provider'].includes(r.proname),r.proname)}
});
await run('original prepaid recovery retains unique attempts without new debit',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);
 await db.query(`UPDATE messages SET dispatch_started_at=now()-interval '6 minutes' WHERE campaign_id=$1 AND charged_at IS NOT NULL`,[campaignId]);
 assert.equal((await claim(db,campaignId)).length,25);assert.equal(await scalar(db,'SELECT count(*)::integer FROM message_send_attempts'),25);
 assert.equal((await state(db,campaignId)).submitted_count,25);
});
await run('cancelandmanualpause winbefore20thfinal andcreateno carrierincident',async db=>{
 for(const status of ['cancelled','paused_by_user']){
  const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
  for(let i=0;i<19;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
  await db.query('UPDATE campaigns SET status=$1 WHERE id=$2',[status,campaignId]);await receipt(db,campaignId,ms[19]);
  assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents WHERE campaign_id=$1',[campaignId]),0);
  assert.equal(await scalar(db,'SELECT status FROM campaigns WHERE id=$1',[campaignId]),status);
 }
});
await run('explicit checked legacy timeout resume needs no minimum feedback',async db=>{
 const {campaignId,accountId}=await enrolled(db);await claim(db,campaignId);
 await db.query(`UPDATE campaign_spam_monitors SET state='paused_timeout',waiting_since=now()-interval '11 minutes' WHERE campaign_id=$1`,[campaignId]);
 await db.query(`UPDATE campaigns SET status='paused',paused_reason='Paused: carrier feedback unavailable. Remaining sends stayed stopped.' WHERE id=$1`,[campaignId]);
 assert.equal((await claim(db,campaignId,400)).length,0);
 assert.equal(await scalar(db,`SELECT spam_gate_resume_timeout($1,$2,'','paused')`,[campaignId,accountId]),true);
 assert.equal(await scalar(db,'SELECT status FROM campaigns WHERE id=$1',[campaignId]),'sending');assert.equal((await state(db,campaignId)).state,'released');
 assert.equal((await claim(db,campaignId,400)).length,400);
});
await run('unconfirmed provider results do not throttle the next requested chunk',async db=>{
 const {campaignId}=await enrolled(db,{size:1000});await claim(db,campaignId);
 await db.query(`UPDATE messages SET status='delivery_unconfirmed',provider_message_id='unconfirmed-'||id::text WHERE campaign_id=$1 AND charged_at IS NOT NULL`,[campaignId]);
 assert.equal((await claim(db,campaignId,500)).length,500);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
});
await run('actual2minrolloutdefault excludeslaunchbeforecutoff andallowsaftercutoff',async db=>{
 const seconds=Number(await scalar(db,`SELECT EXTRACT(EPOCH FROM activated_at-clock_timestamp()) FROM campaign_spam_rollout`));assert.ok(seconds>110&&seconds<=121);
 const before=await seedCampaign(db);assert.equal(await scalar(db,'SELECT spam_gate_enroll($1)',[before.campaignId]),false);
 const after=await seedCampaign(db,{createdAt:`(SELECT activated_at+interval '1 second' FROM campaign_spam_rollout)`});assert.equal(await scalar(db,'SELECT spam_gate_enroll($1)',[after.campaignId]),true);
},{realCutoff:true});
await run('rawpaidclaimRPC deniedservice roletoavoidgatebypass',async db=>{
 assert.equal(await scalar(db,`SELECT has_function_privilege('service_role','public.claim_campaign_messages(uuid,integer)','EXECUTE')`),false);
 const {campaignId}=await enrolled(db);await db.exec('SET ROLE service_role');
 await assert.rejects(()=>db.query('SELECT * FROM claim_campaign_messages($1,25)',[campaignId]),/permission denied/);await db.exec('RESET ROLE');
});
await run('durablesentproof winsracingqueuepoller failureandsentismonotonic',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 const oid=await scalar(db,'SELECT id FROM campaign_spam_email_outbox');await db.query(`SELECT spam_gate_outbox_enqueue($1,'{}'::jsonb)`,[oid]);
 await db.query(`INSERT INTO email_send_log(message_id,template_name,recipient_email,status) VALUES($1,'generic','owner@example.test','sent')`,['spamgate-incident-'+campaignId]);
 assert.equal(await scalar(db,`SELECT spam_gate_outbox_mark($1,'queued','failed','poller earlier failure',300)`,[oid]),true);
 assert.equal(await scalar(db,'SELECT status FROM campaign_spam_email_outbox'),'sent');
 assert.equal(await scalar(db,`SELECT spam_gate_outbox_mark($1,'sent','suppressed','latebounce',300)`,[oid]),false);
 assert.equal(await scalar(db,'SELECT status FROM campaign_spam_email_outbox'),'sent');
});
await run('account hold appearingduringpaidclaim rollsbackallwork andreturnsnorows',async db=>{
 for(const monitor of [true,false]){
  const c=monitor?await enrolled(db):await seedCampaign(db,{createdAt:`now()-interval '1 year'`});
  await db.exec(`CREATE FUNCTION inject_hold_during_debit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.credit_balance<OLD.credit_balance THEN NEW.sending_suspended_at=now(); END IF; RETURN NEW; END $$; CREATE TRIGGER inject_hold BEFORE UPDATE OF credit_balance ON accounts FOR EACH ROW EXECUTE FUNCTION inject_hold_during_debit();`);
  assert.equal((await claim(db,c.campaignId)).length,0);
  assert.equal(Number(await scalar(db,'SELECT credit_balance FROM accounts WHERE id=$1',[c.accountId])),1000);
  assert.equal(await scalar(db,'SELECT count(*)::integer FROM message_send_attempts WHERE campaign_id=$1',[c.campaignId]),0);
  assert.equal(await scalar(db,'SELECT count(*)::integer FROM credit_transactions WHERE campaign_id=$1',[c.campaignId]),0);
  assert.equal(await scalar(db,'SELECT count(*)::integer FROM messages WHERE campaign_id=$1 AND charged_at IS NOT NULL',[c.campaignId]),0);
  await db.exec('DROP TRIGGER inject_hold ON accounts; DROP FUNCTION inject_hold_during_debit()');
 }
});
await run('original RPC maximum remains1000 without a new carrier cap',async db=>{
 const {campaignId}=await enrolled(db,{size:1200});
 assert.equal((await claim(db,campaignId,1500)).length,1000);
 assert.equal((await claim(db,campaignId,1500)).length,200);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM message_send_attempts'),1200);
});
await run('ordinary claims never run the full receipt refresh',async db=>{
 const {campaignId}=await enrolled(db,{size:1000});
 await db.exec(`CREATE OR REPLACE FUNCTION public.spam_gate_refresh(_campaign_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RAISE EXCEPTION 'unexpected full receipt refresh'; END $$;`);
 assert.equal((await claim(db,campaignId,500)).length,500);assert.equal((await claim(db,campaignId,500)).length,500);
});
await run('legacy timeout resume missing reason fails closed',async db=>{
 const {campaignId,accountId}=await enrolled(db);
 await db.query(`UPDATE campaign_spam_monitors SET state='paused_timeout' WHERE campaign_id=$1`,[campaignId]);
 await db.query(`UPDATE campaigns SET status='paused',paused_reason=NULL WHERE id=$1`,[campaignId]);
 assert.equal(await scalar(db,`SELECT spam_gate_resume_timeout($1,$2,'','paused')`,[campaignId,accountId]),false);
 assert.equal((await state(db,campaignId)).state,'paused_timeout');assert.equal(await scalar(db,'SELECT status FROM campaigns WHERE id=$1',[campaignId]),'paused');
});
await run('amendment never resumes existing spam or feedback-timeout holds',async db=>{
 for(const hold of ['paused_spam','paused_timeout']){
  const {campaignId}=await enrolled(db);
  await db.query('UPDATE campaign_spam_monitors SET state=$1 WHERE campaign_id=$2',[hold,campaignId]);
  await db.query(`UPDATE campaigns SET status='paused',paused_reason='Existing deliberate hold' WHERE id=$1`,[campaignId]);
  await db.exec(migrationSQL);
  assert.equal(await scalar(db,'SELECT status FROM campaigns WHERE id=$1',[campaignId]),'paused');
  assert.equal((await state(db,campaignId)).state,hold);assert.equal((await claim(db,campaignId,400)).length,0);
 }
});
await run('confirmed spam during manual pause stops a later resumed chunk',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<19;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 await db.query(`UPDATE campaigns SET status='paused_by_user' WHERE id=$1`,[campaignId]);await receipt(db,campaignId,ms[19]);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
 await db.query(`UPDATE campaigns SET status='sending' WHERE id=$1`,[campaignId]);
 assert.equal((await claim(db,campaignId,400)).length,0);assert.equal((await state(db,campaignId)).state,'paused_spam');
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),1);
});
await run('rare retry invalidation corrects superseded spam facts before claim',async db=>{
 const {campaignId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 for(let i=0;i<19;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 await db.query(`UPDATE campaigns SET status='paused_by_user' WHERE id=$1`,[campaignId]);await receipt(db,campaignId,ms[19]);
 await db.query(`UPDATE messages SET provider_message_id='new-retry-id' WHERE id=$1`,[ms[0].id]);
 await db.query(`UPDATE campaigns SET status='sending' WHERE id=$1`,[campaignId]);
 assert.equal((await claim(db,campaignId,400)).length,400);
 const s=await state(db,campaignId);assert.equal(s.finalized_count,19);assert.equal(s.spam_count,3);
 assert.equal(await scalar(db,'SELECT count(*)::integer FROM campaign_spam_incidents'),0);
});
await run('legacy timeout manual resume refuses known spam and active account holds',async db=>{
 const {campaignId,accountId}=await enrolled(db);await claim(db,campaignId);const ms=await providers(db,campaignId);
 await db.query(`UPDATE campaigns SET status='paused',paused_reason='Paused: carrier feedback unavailable. Remaining sends stayed stopped.' WHERE id=$1`,[campaignId]);
 await db.query(`UPDATE campaign_spam_monitors SET state='paused_timeout' WHERE campaign_id=$1`,[campaignId]);
 await db.query('UPDATE accounts SET sending_suspended_at=now() WHERE id=$1',[accountId]);
 assert.equal(await scalar(db,`SELECT spam_gate_resume_timeout($1,$2,'','paused')`,[campaignId,accountId]),false);
 await db.query('UPDATE accounts SET sending_suspended_at=NULL WHERE id=$1',[accountId]);
 for(let i=0;i<20;i++)await receipt(db,campaignId,ms[i],i<4?'40002':null);
 assert.equal(await scalar(db,`SELECT spam_gate_resume_timeout($1,$2,'','paused')`,[campaignId,accountId]),false);
 assert.equal(await scalar(db,'SELECT status FROM campaigns WHERE id=$1',[campaignId]),'paused');
});
const summary={migrationPath:String(migrationPath),baseMigrationSha256,migrationSha256,limitation:'Single-connection PGlite serializes requests; Promise.all workers do NOT prove multi-session lock behavior. pgmq is a transactional table stub, not an external service. No provider/mail/network calls or production database connections. Most synthetic fixtures move cutoff into the past; dedicated cutoff test checks actual default.',results:report};
if(process.env.CARRIER_SPAM_SQL_REPORT)await writeFile(process.env.CARRIER_SPAM_SQL_REPORT,JSON.stringify(summary,null,2));
console.log(JSON.stringify({baseMigrationSha256,migrationSha256,passed:report.filter(x=>x.pass).length,failed:report.filter(x=>!x.pass).length,limitation:summary.limitation}));
process.exitCode=report.some(x=>!x.pass)?1:0;
