# OAuth App Registration — A7 (arrowhead7.ai)

Step-by-step runbook for registering OAuth apps with each provider and wiring
them into the Vercel project `bonner-ai-services`. Every step that needs a
browser is called out explicitly; the rest are CLI-only.

After all five providers are configured, run the redeploy step at the bottom.

> **Why this isn't automated**: provider developer consoles (Google Cloud,
> Dropbox, TikTok, Meta, X) are browser-only — there's no public API to create
> an OAuth app from scratch. Once the apps exist, all the secret-management
> steps below are CLI-driven.

---

## Prereqs (one-time)

```bash
vercel login                                    # if not already logged in
vercel link --yes --project bonner-ai-services  # links this repo to the project
```

The Vercel CLI is installed at `/Users/bonnerbolton/.hermes/hermes-agent/venv/bin/vercel`.

`NEXT_PUBLIC_APP_URL` is already set to `https://arrowhead7.ai` in production —
every redirect URI below uses that base.

---

## 1. Google (Drive + YouTube)

Same OAuth client serves both Drive and YouTube. Browser steps:

1. Open <https://console.cloud.google.com/apis/credentials>.
2. **Create OAuth client ID** → application type: **Web application**.
3. **Authorized redirect URIs** — add both:
   - `https://arrowhead7.ai/api/auth/google-drive/callback`
   - `https://arrowhead7.ai/api/auth/youtube/callback`
4. (If the consent screen isn't configured) → **OAuth consent screen** →
   External → publish or add yourself as a test user.
5. **Enable APIs** (APIs & Services → Library):
   - Google Drive API
   - YouTube Data API v3
6. **Scopes** to declare on the consent screen:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
7. Copy the **Client ID** and **Client Secret**.

Set on Vercel (production):

```bash
printf '%s' 'YOUR_GOOGLE_CLIENT_ID'     | vercel env add GOOGLE_CLIENT_ID production
printf '%s' 'YOUR_GOOGLE_CLIENT_SECRET' | vercel env add GOOGLE_CLIENT_SECRET production
```

---

## 2. Dropbox

Browser steps:

1. Open <https://www.dropbox.com/developers/apps>.
2. **Create app** → API: **Scoped access** → Access type: **Full Dropbox**.
3. Name the app (e.g. `Arrowhead 7`).
4. In the app's settings → **OAuth 2** → **Redirect URIs**, add:
   - `https://arrowhead7.ai/api/auth/dropbox/callback`
5. Under **Permissions**, enable at minimum:
   - `files.metadata.read`
   - `files.content.read`
   - `account_info.read`
6. Copy **App key** and **App secret**.

Set on Vercel:

```bash
printf '%s' 'YOUR_DROPBOX_APP_KEY'    | vercel env add DROPBOX_APP_KEY production
printf '%s' 'YOUR_DROPBOX_APP_SECRET' | vercel env add DROPBOX_APP_SECRET production
```

---

## 3. TikTok (Content Posting API)

Browser steps:

1. Open <https://developers.tiktok.com/apps>.
2. **Create app** → request access to **Content Posting API**.
3. **Redirect domain** — add `arrowhead7.ai`.
4. **Redirect URI** — add `https://arrowhead7.ai/api/auth/tiktok/callback`.
5. **Products** → add:
   - Login Kit
   - Content Posting API
6. **Scopes** to request: `user.info.basic`, `video.upload`, `video.publish`.
7. Submit the app for review if production posting is required (sandbox works
   for development without review).
8. Copy **Client key** and **Client secret**.

Set on Vercel:

```bash
printf '%s' 'YOUR_TIKTOK_CLIENT_KEY'    | vercel env add TIKTOK_CLIENT_KEY production
printf '%s' 'YOUR_TIKTOK_CLIENT_SECRET' | vercel env add TIKTOK_CLIENT_SECRET production
```

---

## 4. Instagram (Facebook / Meta — Graph API)

Browser steps:

1. Open <https://developers.facebook.com/apps>.
2. **Create app** → use case: **Other** → app type: **Business**.
3. **Add product** → **Instagram Graph API** (and **Facebook Login for
   Business** if not auto-added).
4. **Facebook Login for Business** → **Settings** → **Valid OAuth Redirect URIs**:
   - `https://arrowhead7.ai/api/auth/instagram/callback`
5. **App settings → Basic** — populate Privacy Policy URL, App Icon, Business
   Verification (required for production).
6. **Permissions** to request on the consent screen:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`
7. Take the app from **Development** to **Live** mode after review.
8. Copy **App ID** and **App secret** from the Basic settings panel.

Set on Vercel:

```bash
printf '%s' 'YOUR_FACEBOOK_APP_ID'     | vercel env add FACEBOOK_APP_ID production
printf '%s' 'YOUR_FACEBOOK_APP_SECRET' | vercel env add FACEBOOK_APP_SECRET production
```

---

## 5. X / Twitter

Browser steps:

1. Open <https://developer.x.com/en/portal/dashboard>.
2. Create a project → create an app inside it.
3. **User authentication settings**:
   - **OAuth 2.0**: **ON**
   - **Type of App**: **Web App, Automated App or Bot** (confidential client)
   - **App permissions**: Read and Write (Tweet write requires elevated access)
   - **Callback URI / Redirect URL**: `https://arrowhead7.ai/api/auth/x/callback`
   - **Website URL**: `https://arrowhead7.ai`
4. **Scopes** to declare: `tweet.read tweet.write users.read offline.access media.write`.
5. **Keys and tokens** tab → generate **OAuth 2.0 Client ID** and **Client Secret**.
   (PKCE is enforced for OAuth 2.0; no extra setting needed — the codebase
   already does PKCE in `lib/distribute/x.ts`.)

Set on Vercel:

```bash
printf '%s' 'YOUR_X_CLIENT_ID'     | vercel env add X_CLIENT_ID production
printf '%s' 'YOUR_X_CLIENT_SECRET' | vercel env add X_CLIENT_SECRET production
```

---

## 6. Redeploy

```bash
vercel --prod
```

Or trigger from the dashboard: <https://vercel.com/bonnerbolton07-debugs-projects/bonner-ai-services>
→ Deployments → "Redeploy" on the latest production deployment (uncheck "use
existing build cache" so the new env vars are baked into the build).

---

## Verification

After the redeploy finishes, each connect URL should redirect to the provider:

| Provider | Test URL |
|----------|----------|
| Google Drive | <https://arrowhead7.ai/api/auth/google-drive/connect> |
| YouTube | <https://arrowhead7.ai/api/auth/youtube/connect> |
| Dropbox | <https://arrowhead7.ai/api/auth/dropbox/connect> |
| TikTok | <https://arrowhead7.ai/api/auth/tiktok/connect> |
| Instagram | <https://arrowhead7.ai/api/auth/instagram/connect> |
| X | <https://arrowhead7.ai/api/auth/x/connect> |

If you hit a `*_not_configured` error string, the env var didn't propagate —
re-run `vercel env ls` and check that all of `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`,
`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `FACEBOOK_APP_ID`,
`FACEBOOK_APP_SECRET`, `X_CLIENT_ID`, and `X_CLIENT_SECRET` are listed under
the Production environment.
