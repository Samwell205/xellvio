# Carrier gate SQL runtime tests

Run from the repository root. These tests create fresh, isolated PostgreSQL WASM
instances with synthetic campaigns, reserved `.test` email addresses, fabricated
phone numbers and an ordinary table standing in for the transactional email queue.
They make no database, carrier or email network calls and require no credentials.

PGlite is an optional test dependency, kept out of the app's package and lockfile:

```sh
npm install --prefix /tmp/xellvio-sql-tests --no-save @electric-sql/pglite@0.5.11
PGLITE_MODULE=/tmp/xellvio-sql-tests/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-carrier-spam-sql.mjs
```

An existing PGlite installation can be supplied with `PGLITE_MODULE` as an absolute
module path or file URL. A conventional local installation also resolves without
that variable. The optional first argument selects an alternative proposal SQL
file. Set `CARRIER_SPAM_SQL_REPORT` to an output path to save detailed JSON results;
otherwise the runner only prints results, the tested SQL SHA256 values and limitations.

The fixture's `claim-original.sql` and `enqueue-original.sql` are schema/function
snapshots of the existing RPCs at commit `16c7393`; they contain no production rows.
Do not apply these fixtures to a hosted database. The runner applies the actual
base migration from `drizzle/migrations/0018_campaign_spam_monitor_gate.sql`, then
the current amendment `db-proposals/20261022-remove-carrier-feedback-delays.sql`.
The first argument overrides the amendment path; the historical base remains
unchanged. Tests execute the SQL rather than a JavaScript implementation. Most scenarios move the isolated
rollout cutoff into the past; a dedicated scenario checks its real two-minute
default. Failure injection checks financial and notification rollback behavior.
Small receipt fixtures explicitly request 25-row chunks for convenience; larger
cases verify immediate caller-requested chunks, the original RPC's own maximum,
and absence of carrier-feedback budgets or timeouts. Legacy pauses are preserved
until an explicit checked resume; confirmed repeated spam still stops claims.

PGlite serializes work on one connection. Concurrent-looking `Promise.all` calls
check aggregate accounting and idempotence but do **not** prove multi-session lock
scheduling, deadlock freedom, production throughput or external delivery. Keep
the migration text contracts and TypeScript integration tests alongside this
runtime suite.
