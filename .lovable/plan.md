## What I found

The uploaded opt-in proof is reaching Twilio:

- The latest verification attempt includes `OptInImageUrls` with the uploaded proof URL.
- The proof URL opens publicly as an image.
- Twilio returned a verification ID and put the submission into review, so the submission did reach Twilio.

The rejection is likely because the screenshot/page content does not match the submitted use case clearly enough. The screenshot shows a generic contact form consent, while the submitted use case says recurring marketing/promotional SMS. Twilio rejected it as: `Opt-In Does Not Match the Use Case`.

## Fix plan

1. **Make the app validate proof quality before resubmission**
   - Require proof of opt-in for toll-free submission.
   - Keep the existing public URL check.
   - Add clearer pre-submit requirements so the user cannot submit a weak screenshot/page that omits the required consent elements.

2. **Improve the Twilio payload for opt-in matching**
   - Make `AdditionalInformation` explicitly describe where the reviewer can see the checkbox and how it matches the marketing use case.
   - Make the submitted opt-in confirmation/help text and sample message consistently include business name, marketing purpose, STOP, HELP, and rates language.
   - Avoid conflicting/weak wording that makes the use case look different from the opt-in proof.

3. **Fix the old Set up SMS path too**
   - The older `/app/setup-sms` flow currently submits `OptInType: VERBAL` even when the user uploads a web-form screenshot. That can cause mismatch rejections.
   - Change it to submit web-form opt-in when a screenshot is uploaded and include the opt-in description in the carrier payload.
   - Include privacy/terms/disclosure details in the payload when available.

4. **Improve the rejected-state UI**
   - Show a clearer explanation that Twilio did receive the proof, but the proof content did not match the submitted use case.
   - Tell the user exactly what the screenshot/page must show before clicking Resubmit.

5. **Verify after implementation**
   - Confirm the proof URL route still opens publicly.
   - Confirm the generated Twilio payload includes the proof URL and matching opt-in/use-case fields.

## Important note

This fix cannot force Twilio/carriers to approve a non-compliant opt-in page. It will make sure the image reaches Twilio, remove mismatch-causing payload issues, and guide the user to submit proof that matches the stated marketing use case.