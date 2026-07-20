I checked the current email setup and invite logs. The sender domain is now verified, so DNS is no longer the blocker. The new delivery failure is because the team invite email is being sent without the required unsubscribe token.

Plan:
1. Update the team invite email sender so it includes the required unsubscribe token when sending through the verified email domain.
2. Keep team invite emails marked as transactional, but remove the incorrect `includeUnsubscribe: false` override that causes the sender to reject the message.
3. Improve the user-facing warning for this specific failure so it does not say “try again” when the app needs a code fix.
4. After the code change, verify the latest invite send path no longer produces `missing_unsubscribe` in the email logs.
5. Once fixed, use the existing **Resend email** button for the pending invite so the person receives the invitation.