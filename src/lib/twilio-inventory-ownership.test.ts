import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE TABLE public.tenant_twilio_lines (
    account_id text PRIMARY KEY,
    subaccount_sid text UNIQUE,
    phone_number text UNIQUE,
    phone_sid text,
    status text NOT NULL
  );`);
  await db.exec(readFileSync(new URL('../../drizzle/migrations/0038_preserve_approved_number_assignment_ownership.sql', import.meta.url), 'utf8'));
}, 30000);
afterAll(() => db.close());

describe('approved inventory ownership', () => {
  it('allows different approved numbers to remain in their existing account', async () => {
    await db.exec(`INSERT INTO tenant_twilio_lines VALUES
      ('business-one', 'ACexisting', '+18663611497', 'PNone', 'active'),
      ('business-two', 'ACexisting', '+18668930588', 'PNtwo', 'active');`);
    const result = await db.query('SELECT count(*)::int AS count FROM tenant_twilio_lines WHERE subaccount_sid = $1', ['ACexisting']);
    expect(result.rows).toEqual([{ count: 2 }]);
  });

  it('allows the selected number to be reassigned after its former owner released it', async () => {
    await db.exec(`INSERT INTO tenant_twilio_lines VALUES
      ('former-owner', 'ACretained', '+18553820888', 'PNreassigned', 'released'),
      ('selected-owner', 'ACretained', '+18553820888', 'PNreassigned', 'active');`);
    const result = await db.query("SELECT account_id FROM tenant_twilio_lines WHERE phone_number = '+18553820888' AND status <> 'released'");
    expect(result.rows).toEqual([{ account_id: 'selected-owner' }]);
  });

  it('rejects assigning an unreleased phone number to another business', async () => {
    await expect(db.exec("INSERT INTO tenant_twilio_lines VALUES ('duplicate-phone', 'ACanother', '+18663611497', 'PNdifferent', 'requested')")).rejects.toThrow(/duplicate key/);
  });

  it('rejects assigning an unreleased number SID to another business', async () => {
    await expect(db.exec("INSERT INTO tenant_twilio_lines VALUES ('duplicate-sid', 'ACanother', '+18664725941', 'PNone', 'active')")).rejects.toThrow(/duplicate key/);
  });
});