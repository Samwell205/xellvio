Goal: Replace the default Lovable-managed Google OAuth branding with your own Xellvio-branded OAuth consent screen.

Prerequisites
- You are logged into a Google account that owns/manages your project.
- You have access to your Lovable Cloud project backend (Auth Settings → Google).

Plan

1. Create a Google Cloud project
   - In your current Google Auth Platform page, click the visible “Create project” button (or go to https://console.cloud.google.com/projectcreate).
   - Project name: `Xellvio`.
   - Pick the billing account/organization you want, then click Create.
   - Wait for the project selector to switch to your new project.

2. Configure the OAuth consent screen
   - In the left sidebar, click Branding.
   - Click “Get started” / “Configure consent screen”.
   - Choose User Type: **External** (unless your domain is a Google Workspace).
   - Fill in the app details:
     - App name: `Xellvio`
     - User support email: your support email
     - App domain / home page: `https://xellvio.com` (or `https://www.xellvio.com`)
     - Authorized domains: `xellvio.com`, `lovable.app`
     - Developer contact email: your email
   - Scopes: add the non-sensitive scopes
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `openid`
   - Save and continue. You can skip test users for now unless you want to test before publishing.

3. Create OAuth 2.0 credentials
   - In the left sidebar, click Clients.
   - Click **Create Client** → **OAuth client ID** → **Web application**.
   - Name: `Xellvio Web`.
   - Under **Authorized redirect URIs**, you need the callback URL from Lovable Cloud.
   - Open your Lovable Cloud backend, navigate to Users → Authentication Settings → Sign In Methods → Google, and copy the Redirect URL shown there.
   - Paste that URL into Google Cloud’s Authorized redirect URIs field.
   - Click Create.

4. Copy Client ID and Secret into Lovable Cloud
   - Once created, copy the Client ID and Client Secret.
   - Go back to Lovable Cloud Auth Settings → Google.
   - Toggle from “Managed by Lovable” to **“Use your own credentials”**.
   - Paste the Client ID and Client Secret.
   - Save.

5. Test
   - Return to your app preview and sign in with Google.
   - The OAuth consent screen should now show **Xellvio** instead of Lovable.

Expected result
- Google sign-in branding is updated to Xellvio within a few minutes after saving.
- No app code changes are required.