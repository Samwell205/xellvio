// Optional isolated test dependency; no production credentials or connection.
import {pathToFileURL} from 'node:url';
const modulePath=process.env.PGLITE_MODULE;
let PGlite;
try {
  ({PGlite}=await import(modulePath
    ? (modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath)
    : '@electric-sql/pglite'));
} catch (error) {
  throw new Error('Install optional @electric-sql/pglite@0.5.11 outside the repo and set PGLITE_MODULE; see scripts/tests/carrier-spam-sql/README.md', {cause:error});
}
import {readFile} from 'node:fs/promises';
export async function setup() {
  const db = await PGlite.create();
  await db.exec(await readFile(new URL('./fixture-schema.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('./claim-original.sql',import.meta.url),'utf8'));
  await db.exec(`CREATE TABLE public.suppressed_emails(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,email text,reason text,metadata jsonb,created_at timestamptz DEFAULT now());`);
  await db.exec(await readFile(new URL('./enqueue-original.sql',import.meta.url),'utf8'));
  // Model browser grants from common managed-database defaults. The proposed
  // migration must explicitly revoke them on every new gate table.
  await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated');
  return db;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
 const db = await setup();
 console.log((await db.query('SELECT version()')).rows);
 await db.close();
}
