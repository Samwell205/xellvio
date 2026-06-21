1. Create a Google Cloud project named **Xellvio**.
2. Configure the OAuth consent screen as **External**, with app name **Xellvio**, domain **xellvio.com**, and non-sensitive scopes: `userinfo.email`, `userinfo.profile`, `openid`.
3. Create an **OAuth 2.0 Web Client ID**. Add your Lovable Cloud Google callback URL to Authorized redirect URIs.
4. Copy the Client ID and Client Secret into **Lovable Cloud Auth Settings → Google → Use your own credentials**.
5. Test sign-in to confirm the branding now shows **Xellvio** instead of Lovable.

No app code changes are required.