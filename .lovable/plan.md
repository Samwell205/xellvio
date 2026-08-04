# Saimaj MMS 1 — what happened, and the fixes

## What the data actually shows

Campaign `Saimaj MMS 1`, tenant PRINCESS POLLY, 568 recipients, image attached (MMS). Real rows in the database:

| Outcome | Count | Reason |
| --- | --- | --- |
| Delivered | 1 | — |
| Carrier rejected (40008) | 316 | Recipient carrier refused the MMS |
| Invalid number (40012) | 7 | Bad destination |
| Never sent (insufficient credit) | 244 | Wallet ran out mid-plan, so these were never handed to the carrier and were never charged |

So it is not "all 568 failed to send" — 324 were actually sent and 244 never left the platform because the balance ran out.

### Why "812 segments"

Segments were counted twice in two different ways:
- The 244 unsent rows kept the SMS-style estimate of 2 segments each (the message body plus the tracking link crosses the 160-character limit) = 488.
- The 324 rows that reached the carrier were overwritten with the carrier's own part count of 1 each = 324.

488 + 324 = 812. An MMS is a single message with an attachment — it has no SMS segments at all, so this number is meaningless for an MMS campaign and should not be shown as "812".

### Why he was charged $30.13

Price today is calculated as `segments x SMS rate x MMS multiplier` = `2 x $0.0155 x 3 = $0.093` per recipient, charged on the 324 that were sent = $30.13. That is wrong twice over: MMS should be charged once per message (not multiplied by SMS segments), so the correct figure is `$0.0155 x 3 = $0.0465` per MMS = **$15.07** for 324 sent. He was overcharged **$15.06** on this campaign.

### Why almost everything failed at the carrier

Every message went out from one toll-free number (+1 877 537 0375). Error 40008 is the recipient carrier rejecting the message — for a first-time high-volume MMS burst from a single toll-free number with a shortened link, US carriers block nearly all of it. This is a sending-pattern/carrier issue, not a platform bug. It is confirmed by the fact that 1 message did deliver, so the number and media were technically working.

## What I will change

1. **Fix MMS pricing** — MMS is billed once per message (rate x MMS multiplier), never multiplied by SMS segment count. Applied at planning time in the dispatcher and in the tenant's cost preview on the campaign builder so the quote and the charge match.
2. **Correct the segments display** — for MMS campaigns, reports (tenant + admin) show "MMS messages: N" instead of an SMS segment count, so no more misleading 812.
3. **Show the attached image** — the admin campaign report and the tenant campaign report both render the campaign's attached media next to the message body (small thumbnail, click to open full size). Signed media URLs are served through the existing server functions so the image stays access-controlled.
4. **Refund the overcharge** — credit PRINCESS POLLY $15.06 for this campaign with a labelled ledger entry, and check his other MMS campaigns for the same segment-multiplied overcharge and refund those too in one pass.
5. **Guard against silent mid-campaign stops** — when recipients fail with `insufficient_balance`, the report states it plainly ("244 not sent — top up and resend") instead of burying it in the failure list.
6. **MMS deliverability note in the tenant report** — when a campaign shows a high 40008 rate, the report explains that the recipient carriers rejected the MMS and recommends smaller warm-up batches, so tenants stop reading it as a platform failure.

## Technical detail

- `src/routes/api.public.dispatch-campaign.ts`: `planCampaign` cost formula becomes `hasMedia ? unit * mms_multiplier : segs * unit`; `segments_count` for MMS rows stored as 1 and not overwritten with SMS estimates.
- `src/routes/_authenticated.app.campaigns.new.tsx`: same formula for the pre-send estimate.
- `src/lib/reports.functions.ts`, `src/lib/admin-campaigns.functions.ts`, `src/lib/tenant-report-export.functions.ts`: return `media_url` and an MMS-aware segment/message count; CSV/PDF exports follow.
- `src/routes/_authenticated.admin.campaigns.$id.tsx`, `src/routes/_authenticated.app.campaigns.$id.report.tsx`: media thumbnail, MMS message count label, insufficient-credit and carrier-rejection callouts.
- Refund runs as a data operation (credit adjustment + `credit_transactions` entry), not a schema change.
