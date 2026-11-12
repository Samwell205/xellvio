# Xellvio blog — operations, analytics and deployment checklist

## Scheduled publishing
- Saving a scheduled article arms one database job for the earliest deadline (no per-minute polling; zero jobs when nothing is scheduled).
- Acceptable delay: an article publishes within 1–2 minutes after its scheduled time; `published_at` keeps the scheduled time.
- Times are stored as absolute instants (UTC); the editor converts the author's local time.
- Rescheduling/cancelling re-arms or removes the job automatically.
- Failures: error saved on the article, retry after 5 minutes, max 5 attempts, then it stays scheduled with the error for staff to fix.
- Duplicate protection: a global advisory lock, row locks (`SKIP LOCKED`) and a status-conditional update.
- Known limitation: if the database is down at the exact armed minute, the job fires next at the same date next year; re-saving any scheduled article re-arms it. Check scheduled articles after any outage.

## Analytics
- Views are deduplicated per browser session per article for 30 minutes; at most 100 events per session per day.
- Internal traffic: any browser that opens the blog admin is marked internal and stops sending blog events. To mark another browser, open any blog URL with `?xv_internal=1` (undo with `?xv_internal=0`). Earlier QA visits remain counted.
- Popular articles: unique visitors over the last 30 days, published public articles only; shown once at least two articles have views.
- Registration attribution: a signup counts when the same browser session viewed a blog article in the 24 hours before signing up. No cross-device tracking; cleared storage or a different device are not attributed.

## Deployment checklist
1. Backup: Cloud keeps automatic backups; note the time before publishing. Blog migrations 0051–0056 are additive (new tables/columns/functions) and already applied.
2. Order: database changes are live already → publish the frontend.
3. Smoke tests after publish: /blog loads; open an article; /sitemap.xml lists it; /admin/blog loads for an admin; a non-staff account is redirected away from /admin/blog; create → preview → publish → unpublish a test article and delete it.
4. Monitoring: watch the blog analytics page, browser errors, and any article with a saved publishing error.
5. Rollback: re-publish the previous version from version history. Database objects can stay (they are unused by older code); unpublish articles if needed.
