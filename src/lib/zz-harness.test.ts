import { it } from 'vitest'; import { blogDb } from '/dev-server/src/lib/blog-db-harness';
it('loads', async()=>{ await blogDb(); }, 60000);
