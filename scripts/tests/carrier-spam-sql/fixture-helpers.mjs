import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function seedCampaign(db,{size=479,createdAt='now()',status='sending',accountId=randomUUID()}={}) {
  const campaignId=randomUUID();
  await db.query(`INSERT INTO accounts(id,email,credit_balance,onboarding_status) VALUES($1,'owner@example.test',1000,'active') ON CONFLICT(id) DO NOTHING`,[accountId]);
  await db.query(`INSERT INTO campaigns(id,account_id,name,status,created_at) VALUES($1,$2,'Synthetic isolated test',$3,${createdAt})`,[campaignId,accountId,status]);
  await db.query(`INSERT INTO country_rates(country_code,country_name,dial_prefix,sell_price,cost_price) SELECT 'US','United States','+1',0.0155,0.01 WHERE NOT EXISTS(SELECT 1 FROM country_rates WHERE country_code='US')`);
  await db.query(`INSERT INTO messages(campaign_id,phone_e164,rendered_body,status,country_code,segments_count,created_at) SELECT $1,'+1555'||lpad(n::text,7,'0'),'Synthetic test content','queued','US',1,now()+n*interval '1 microsecond' FROM generate_series(1,$2::integer) n`,[campaignId,size]);
  return {campaignId,accountId};
}
export async function scalar(db,sql,args=[]) {return Object.values((await db.query(sql,args)).rows[0])[0]}
export async function check(name,run) {await run(); console.log('PASS '+name)}
export {assert,randomUUID};
