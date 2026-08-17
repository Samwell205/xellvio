update public.messages set status='failed', error_code='cancelled_by_user'
where campaign_id='b74aadaf-24b7-4dfa-b448-4c1e9f96528d' and status in ('queued','pending');

update public.campaigns set status='sent', paused_reason='Stopped by user'
where id='b74aadaf-24b7-4dfa-b448-4c1e9f96528d';