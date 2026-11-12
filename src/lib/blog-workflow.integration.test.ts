import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, blogDb } from './blog-db-harness';

const ADMIN = '00000000-0000-4000-8000-000000000001';
const EDITOR = '00000000-0000-4000-8000-000000000002';
const WRITER = '00000000-0000-4000-8000-000000000003';
const CUSTOMER = '00000000-0000-4000-8000-000000000004';
let db: PGlite;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0];
const jobs = async () => (await db.query<{ schedule: string }>("SELECT schedule FROM cron.job WHERE jobname='blog-publish-due'")).rows;
const post = (slug: string, extra = '') => db.exec(`INSERT INTO content_posts(slug,title,body,topic${extra ? ',' + extra.split('=')[0] : ''}) VALUES('${slug}','${slug} title','<p>Real body words here</p>','sms-marketing'${extra ? ',' + extra.split('=').slice(1).join('=') : ''})`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeAll(async () => {
  db = await blogDb();
  await db.exec(`INSERT INTO accounts(id,email) VALUES('${ADMIN}','a@x.test'),('${EDITOR}','e@x.test'),('${WRITER}','w@x.test'),('${CUSTOMER}','c@x.test');
    INSERT INTO user_roles(user_id,role) VALUES('${ADMIN}','admin');
    INSERT INTO blog_staff(user_id,role) VALUES('${EDITOR}','editor'),('${WRITER}','writer');`);
}, 60000);
afterAll(() => db?.close());

describe('scheduled publishing', () => {
  it('runs no scheduled job when nothing is scheduled', async () => {
    expect(await jobs()).toEqual([]);
  });

  it('arms one job for the next deadline and does not publish early', async () => {
    await post('future', "status,scheduled_at='scheduled',now()+interval '3 hours'");
    const [job] = await jobs();
    const expected = await one<{ s: string }>("SELECT to_char(date_trunc('minute',now()+interval '3 hours') AT TIME ZONE 'UTC' + interval '1 minute','MI HH24 DD MM')||' *' AS s");
    expect(job.schedule).toBe(expected.s);
    expect((await one<{ n: number }>('SELECT public.blog_publish_due() AS n')).n).toBe(0);
    expect((await one<{ status: string }>("SELECT status FROM content_posts WHERE slug='future'")).status).toBe('scheduled');
  });

  it('treats deadlines given in different time zones as the same instant', async () => {
    await post('tz', "status,scheduled_at='scheduled',(now()+interval '5 hours') AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles' || ' America/Los_Angeles'");
    const r = await one<{ same: boolean }>("SELECT abs(extract(epoch FROM scheduled_at-(now()+interval '5 hours')))<1 AS same FROM content_posts WHERE slug='tz'");
    expect(r.same).toBe(true);
    await db.exec("DELETE FROM content_posts WHERE slug='tz'");
  });

  it('rescheduling replaces the previous deadline and cancelling removes the job', async () => {
    await db.exec("UPDATE content_posts SET scheduled_at=now()+interval '1 hour' WHERE slug='future'");
    expect(await jobs()).toHaveLength(1);
    const expected = await one<{ s: string }>("SELECT to_char(date_trunc('minute',now()+interval '1 hour') AT TIME ZONE 'UTC' + interval '1 minute','MI HH24 DD MM')||' *' AS s");
    expect((await jobs())[0].schedule).toBe(expected.s);
    await db.exec("UPDATE content_posts SET status='draft',scheduled_at=NULL WHERE slug='future'");
    expect(await jobs()).toEqual([]);
    expect((await one<{ n: number }>('SELECT public.blog_publish_due() AS n')).n).toBe(0);
    expect((await one<{ status: string }>("SELECT status FROM content_posts WHERE slug='future'")).status).toBe('draft');
  });

  it('rejects scheduling in the past', async () => {
    await expect(post('past', "status,scheduled_at='scheduled',now()-interval '1 minute'")).rejects.toThrow(/future publishing time/);
  });

  it('publishes at the deadline exactly once and keeps the scheduled time', async () => {
    await post('due', "status,scheduled_at='scheduled',clock_timestamp()+interval '1500 milliseconds'");
    await sleep(1700);
    expect((await one<{ n: number }>('SELECT public.blog_publish_due() AS n')).n).toBe(1);
    expect((await one<{ n: number }>('SELECT public.blog_publish_due() AS n')).n).toBe(0);
    const r = await one<{ status: string; ok: boolean }>("SELECT status, published_at IS NOT NULL AND published_at<=now() AS ok FROM content_posts WHERE slug='due'");
    expect(r).toEqual({ status: 'published', ok: true });
    expect(await jobs()).toEqual([]);
    const pub = await as(db, { role: 'anon' }, () => db.query("SELECT slug FROM content_posts WHERE slug='due'"));
    expect(pub.rows).toHaveLength(1);
  }, 10000);

  it('records the error and retries in five minutes, stopping after five attempts', async () => {
    await db.exec(`CREATE FUNCTION fail_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='published' AND NEW.slug='boom' THEN RAISE EXCEPTION 'storage temporarily unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_boom BEFORE UPDATE ON content_posts FOR EACH ROW EXECUTE FUNCTION fail_boom();`);
    await post('boom', "status,scheduled_at='scheduled',clock_timestamp()+interval '1200 milliseconds'");
    await sleep(1400);
    expect((await one<{ n: number }>('SELECT public.blog_publish_due() AS n')).n).toBe(0);
    const r = await one<{ status: string; publish_attempts: number; publish_error: string; retry: boolean }>("SELECT status,publish_attempts,publish_error,publish_retry_at BETWEEN now()+interval '4 minutes' AND now()+interval '6 minutes' AS retry FROM content_posts WHERE slug='boom'");
    expect(r).toEqual({ status: 'scheduled', publish_attempts: 1, publish_error: 'storage temporarily unavailable', retry: true });
    expect(await jobs()).toHaveLength(1);
    await db.exec("UPDATE content_posts SET publish_attempts=5 WHERE slug='boom'");
    expect(await jobs()).toEqual([]);
    await db.exec("DROP TRIGGER fail_boom ON content_posts; DELETE FROM content_posts WHERE slug='boom'");
  }, 10000);
});

describe('staff permissions enforced in the database', () => {
  it('writer can create and edit an own draft but cannot publish or schedule', async () => {
    await as(db, { uid: WRITER, role: 'authenticated' }, async () => {
      await db.exec(`INSERT INTO content_posts(slug,title,body,created_by) VALUES('writer-draft','Draft','<p>x</p>','${WRITER}')`);
      await db.exec("UPDATE content_posts SET title='Edited draft' WHERE slug='writer-draft'");
      await expect(db.exec("UPDATE content_posts SET status='published' WHERE slug='writer-draft'")).rejects.toThrow();
      await expect(db.exec("UPDATE content_posts SET status='scheduled',scheduled_at=now()+interval '1 day' WHERE slug='writer-draft'")).rejects.toThrow();
      await expect(db.query(`SELECT public.blog_set_staff('${CUSTOMER}','writer')`)).rejects.toThrow();
      await expect(db.query('SELECT public.blog_metrics()')).rejects.toThrow(/Editor access/);
    });
    expect((await one<{ title: string; status: string }>("SELECT title,status FROM content_posts WHERE slug='writer-draft'"))).toEqual({ title: 'Edited draft', status: 'draft' });
  });

  it('writer cannot edit another author’s draft', async () => {
    await post('editor-draft', `created_by='${EDITOR}'`);
    await as(db, { uid: WRITER, role: 'authenticated' }, async () => {
      await db.exec("UPDATE content_posts SET title='hijack' WHERE slug='editor-draft'").catch(() => undefined);
    });
    expect((await one<{ title: string }>("SELECT title FROM content_posts WHERE slug='editor-draft'")).title).toBe('editor-draft title');
  });

  it('editor can publish, schedule and read analytics but cannot manage staff', async () => {
    await as(db, { uid: EDITOR, role: 'authenticated' }, async () => {
      await db.exec("UPDATE content_posts SET status='published' WHERE slug='editor-draft'");
      await db.exec(`INSERT INTO content_posts(slug,title,body,status,scheduled_at,created_by) VALUES('editor-sched','S','<p>x</p>','scheduled',now()+interval '2 days','${EDITOR}')`);
      await db.query('SELECT public.blog_metrics()');
      await expect(db.query(`SELECT public.blog_set_staff('${CUSTOMER}','writer')`)).rejects.toThrow();
    });
    expect((await one<{ status: string }>("SELECT status FROM content_posts WHERE slug='editor-draft'")).status).toBe('published');
  });

  it('super admin can grant and remove staff access', async () => {
    await as(db, { uid: ADMIN, role: 'authenticated' }, () => db.query(`SELECT public.blog_set_staff('${CUSTOMER}','writer')`));
    expect((await one<{ role: string }>(`SELECT role FROM blog_staff WHERE user_id='${CUSTOMER}'`)).role).toBe('writer');
    await as(db, { uid: ADMIN, role: 'authenticated' }, () => db.query(`SELECT public.blog_set_staff('${CUSTOMER}',NULL)`));
    expect(await one(`SELECT role FROM blog_staff WHERE user_id='${CUSTOMER}'`)).toBeUndefined();
  });

  it('regular customer and anonymous visitors cannot reach CMS data or privileged functions', async () => {
    await as(db, { uid: CUSTOMER, role: 'authenticated' }, async () => {
      expect((await db.query("SELECT slug FROM content_posts WHERE status<>'published'")).rows).toEqual([]);
      await expect(db.exec(`INSERT INTO content_posts(slug,title,body,created_by) VALUES('nope','n','<p>n</p>','${CUSTOMER}')`)).rejects.toThrow();
      await expect(db.query('SELECT public.blog_metrics()')).rejects.toThrow();
      await expect(db.query('SELECT public.blog_publish_due()')).rejects.toThrow(/permission denied/);
      await expect(db.query('SELECT public.blog_schedule_next()')).rejects.toThrow(/permission denied/);
      await expect(db.query(`SELECT public.blog_set_staff('${CUSTOMER}','editor')`)).rejects.toThrow();
    });
    await as(db, { role: 'anon' }, async () => {
      expect((await db.query("SELECT slug FROM content_posts WHERE status<>'published'")).rows).toEqual([]);
      await expect(db.query("SELECT public.blog_record_event('editor-draft','blog_view','s','direct')")).rejects.toThrow(/permission denied/);
    });
  });
});

describe('analytics and popular articles', () => {
  it('deduplicates repeat views and ignores unpublished articles', async () => {
    const rec = (slug: string, s: string) => one<{ ok: boolean }>(`SELECT public.blog_record_event('${slug}','blog_view','${s}','direct') AS ok`);
    expect((await rec('editor-draft', 's1')).ok).toBe(true);
    expect((await rec('editor-draft', 's1')).ok).toBe(false);
    expect((await rec('writer-draft', 's1')).ok).toBe(false);
  });

  it('ranks popular articles by unique visitors, published only, excluding internal traffic', async () => {
    await post('second', "status='published'");
    for (const s of ['a', 'b', 'c']) await db.query(`SELECT public.blog_record_event('second','blog_view','${s}','direct')`);
    await db.exec(`INSERT INTO content_events(slug,event_type,session_id,props) SELECT 'editor-draft','blog_view','qa'||g,jsonb_build_object('postId',(SELECT id FROM content_posts WHERE slug='editor-draft'),'internal','true') FROM generate_series(1,10) g`);
    const rows = await as(db, { role: 'anon' }, () => db.query<{ slug: string; visitors: number; words: number }>('SELECT slug,visitors::int AS visitors,words FROM public.blog_popular(4)'));
    expect(rows.rows).toEqual([{ slug: 'second', visitors: 3, words: 4 }, { slug: 'editor-draft', visitors: 1, words: 4 }]);
  });

  it('attributes a registration only when a blog view preceded it within one day in the same session', async () => {
    await db.exec(`INSERT INTO growth_events(event,session_id,created_at) VALUES('signup_completed','a',now()),('signup_completed','nobody',now())`);
    await db.exec(`INSERT INTO content_events(slug,event_type,session_id,created_at) VALUES('second','blog_view','old',now()-interval '3 days'); INSERT INTO growth_events(event,session_id) VALUES('signup_completed','old')`);
    const m = await as(db, { uid: ADMIN, role: 'authenticated' }, () => one<{ r: number }>("SELECT (public.blog_metrics()->>'registrations')::int AS r"));
    expect(m.r).toBe(1);
  });
});
