# Show sent MMS images in Inbox

## What will change
- Include each campaign’s attached image when loading its sent messages into the Inbox conversation.
- Display that image above the matching outbound message text, with safe sizing and a link to open the full image.
- Keep ordinary SMS messages unchanged when no image was attached.

## Technical details
- Extend the existing campaign-message query to return the campaign `media_url`.
- Add an optional `mediaUrl` field to the merged Inbox message data.
- Render the image only for valid HTTP(S) image URLs and preserve the existing message time, status, and delete controls.
- Verify the Inbox against the existing sent campaign shown in the screenshot and check the latest preview build.
