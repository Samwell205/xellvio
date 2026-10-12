# Support tickets

Replace long single email threads with proper support tickets that open, get discussed, send reminders and close automatically.

## What tenants and visitors get
- **Opening a ticket:** from the public Contact page, or a new **Support** page in the tenant dashboard. Each ticket gets a number (e.g. #1042).
- **Auto-reply email right away:** "Thanks for contacting Xellvio Support — your ticket #1042 is open. We'll reply within one business day." It includes a private link to the ticket.
- **Replying, two ways:**
  1. On the ticket page (private link for visitors, or Support page for signed-in tenants).
  2. By replying to the email; the reply is added to the same ticket.
- **Closed tickets are locked.** The page shows "This ticket is closed — open a new ticket." Emailing a closed ticket starts a new ticket and links back to the old one.

## What you get (Admin → Support → Tickets)
- An inbox with tabs: Open, Waiting on customer, Closed. Each ticket shows the tenant's account when it can be matched by email.
- Open a ticket, read the full conversation and reply. The customer gets an email and can see the reply on the ticket page.
- A **Draft with copilot** button writes a reply using that tenant's real account details. You edit it, then click Send. Nothing is sent automatically.
- Buttons to close, reopen and add internal notes that the customer never sees.
- The existing Contact inbox becomes this ticket inbox. Old contact messages are imported as tickets.

## Automatic follow-up
- **24 hours** after your reply with no answer, the customer gets an email: "We're still waiting to hear from you. If we don't hear back, we'll close this ticket."
- **72 hours** after your reply with no answer, the ticket closes and the customer gets an email saying so.
- When the customer replies, the clock resets.

## Needs from you
- **Reply-by-email** needs an inbox that receives replies, for example support@xellvio.com, connected to the email service you already use to send. I'll walk you through the setup when we get there. Until then, customers reply on the ticket page.

## Technical details
- New tables: `support_tickets` (number, account_id, requester email/name, subject, status open/waiting/closed, private access token, last_admin_reply_at, reminder_sent_at, closed_at) and `support_ticket_messages` (ticket_id, author type customer/admin/system, body, internal flag). RLS is on; tenants read their own tickets, admins read all, and visitors access only through server functions checked by token.
- `/api/public/contact` creates a ticket instead of a contact message and sends the auto-reply.
- Inbound email: a signed webhook at `/api/public/support/inbound` matches replies by a `+ticket-<token>` reply-to address and the ticket number in the subject. Replies to closed tickets open a new ticket.
- Reminders and auto-close: one hourly check. A reminder can arrive up to about an hour late, and the check is very small.
- The copilot draft reuses the existing Support copilot account snapshot, draft only.
- The support ticket rules and email copy go into project memory; the structure goes into `AGENTS.md`.
