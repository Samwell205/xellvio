// Isolated PostgreSQL tests; no live accounts, carrier calls or charges.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE || '/tmp/sms-protection-tests/node_modules/@electric-sql/pglite/dist/index.js').href);
const db=await PGlite.create();
await db.exec(await readFile(new URL('./carrier-spam-sql/fixture-schema.sql',import.meta.url),'utf8'));
await db.exec(`CREATE TABLE public.account_members(account_id uuid,user_id uuid,status text,role text,permissions jsonb); CREATE TABLE public.suppressions(account_id uuid,phone_e164 text); CREATE FUNCTION public.has_account_access(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$; CREATE FUNCTION public.campaign_report_summary(_campaign_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r jsonb; BEGIN WITH m AS (SELECT * FROM messages WHERE campaign_id=_campaign_id) SELECT jsonb_build_object('total', (SELECT count(*) FROM m), 'failed',0) INTO r; RETURN r; END $$;`);
await db.exec(await readFile(new URL('../../supabase/migrations/20260912184057_434b7e18-d177-4022-afdc-5064c9411658.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../drizzle/migrations/0039_sms_smart_sending_protections.sql',import.meta.url),'utf8'));
const account='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
await db.exec(`INSERT INTO accounts(id,credit_balance) VALUES('${account}',100),('${other}',100); INSERT INTO country_rates(country_code,country_name,dial_prefix,sell_price) VALUES('US','United States','+1',0.01);`);
let n=10;
async function campaign(acct=account,mode='inherit') { const id=`00000000-0000-4000-8000-${String(n++).padStart(12,'0')}`; await db.query(`INSERT INTO campaigns(id,account_id,name,status,smart_sending_mode) VALUES($1,$2,'test','sending',$3)`,[id,acct,mode]); return id; }
async function message(c,phone='+14155550123') { const id=`00000000-0000-4000-8000-${String(n++).padStart(12,'0')}`; await db.query(`INSERT INTO messages(id,campaign_id,phone_e164,rendered_body,status,country_code) VALUES($1,$2,$3,'Requested update STOP','queued','US')`,[id,c,phone]); return id; }
async function claim(c) { return (await db.query(`SELECT * FROM claim_campaign_messages($1,24)`,[c])).rows; }
async function row(id) { return (await db.query('SELECT * FROM messages WHERE id=$1',[id])).rows[0]; }
const first=await campaign(); const firstMsg=await message(first); assert.equal((await claim(first)).length,1);
const second=await campaign(); const secondMsg=await message(second); const balanceBefore=(await db.query('SELECT credit_balance FROM accounts WHERE id=$1',[account])).rows[0].credit_balance;
assert.equal((await claim(second)).length,0); assert.equal((await row(secondMsg)).status,'skipped'); assert.equal((await row(secondMsg)).error_code,'recently_messaged'); assert.equal((await row(secondMsg)).charged_at,null); assert.equal((await db.query('SELECT credit_balance FROM accounts WHERE id=$1',[account])).rows[0].credit_balance,balanceBefore);
const separate=await campaign(other); await message(separate); assert.equal((await claim(separate)).length,1);
const off=await campaign(account,'off'); await message(off); assert.equal((await claim(off)).length,1);
await db.query(`UPDATE messages SET status='undelivered',error_code='30006' WHERE id=$1`,[firstMsg]);
const invalid=await campaign(account,'off'); const invalidMsg=await message(invalid); assert.equal((await claim(invalid)).length,0); assert.equal((await row(invalidMsg)).error_code,'invalid_number'); assert.equal((await row(invalidMsg)).charged_at,null);
for(const code of ['30003','40008','40002']) { const c=await campaign(account,'off'); const phone=`+14155550${n.toString().padStart(3,'0')}`; const id=await message(c,phone); await db.query(`UPDATE messages SET status='undelivered',error_code=$1 WHERE id=$2`,[code,id]); assert.equal((await db.query('SELECT count(*)::integer AS n FROM sms_invalid_destinations WHERE phone_e164=$1',[phone])).rows[0].n,0); }
const optout=await campaign(account,'off'); const optMsg=await message(optout,'+14155550999'); await db.query('INSERT INTO suppressions VALUES($1,$2)',[account,'+14155550999']); assert.equal((await claim(optout)).length,0); assert.equal((await row(optMsg)).error_code,'opted_out');
const expired=await campaign(); const expMsg=await message(expired,'+14155550888'); await db.query(`INSERT INTO sms_phone_history VALUES($1,$2,$3,now()-interval '25 hours')`,[account,'+14155550888',firstMsg]); assert.equal((await claim(expired)).length,1);
const summary=(await db.query('SELECT campaign_report_summary($1) AS s',[second])).rows[0].s; assert.equal(summary.skipped_recently_messaged,1);
console.log('Passed: business-wide skipping, atomic uncharged skips, account isolation, campaign off, permanent landlines, transient exclusions, STOP enforcement, expired window and aggregate reports.');
await db.close();