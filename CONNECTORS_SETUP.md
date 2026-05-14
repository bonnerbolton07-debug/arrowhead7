# A7 Connectors — Setup & Troubleshooting

This is the consolidated runbook for every storage / publishing connector A7
supports. It supersedes nothing — `OAUTH_SETUP.md` has the same provider steps
in slightly different shape and is still accurate. Use whichever you prefer.

## TL;DR

1. Set `NEXT_PUBLIC_APP_URL=https://arrowhead7.ai` on Vercel (production env).
   Without this the app falls back to the request origin, which works on
   stable domains but drifts on previews — the most common cause of `Error
   400: redirect_uri_mismatch`.
2. After every env change, redeploy with the build cache disabled.
3. Curl the public diagnostic to see exactly what the app is sending:
   ```bash
   curl https://arrowhead7.ai/api/auth/diagnostic | jq
   ```
   For each provider it shows the **exact redirect URI** to register and
   whether the env vars are present. That URI must match the provider's
   developer console verbatim — no trailing slash, exact protocol,
   exact hostname.
4. The Channels page (`/dashboard/channels`) renders these URIs inline
   whenever a connection fails, so the next time you see the error you can
   copy-paste from the page itself.

---

## Provider matrix

| Connector | Auth model | Developer account needed? | Env vars |
|-----------|-----------|---------------------------|----------|
| Google Drive | OAuth 2.0 | Google Cloud (free) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| YouTube | OAuth 2.0 (same client as Drive) | Google Cloud (free) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Dropbox | OAuth 2.0 | Dropbox Developers (free) | `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` |
| iCloud Drive | Public share link | **None** | none |
| TikTok | OAuth 2.0 | TikTok Developers (free) | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| Instagram | OAuth 2.0 (Meta) | Meta Developers (free) | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| X (Twitter) | OAuth 2.0 + PKCE | X Developer Portal (free) | `X_CLIENT_ID`, `X_CLIENT_SECRET` |

Apple Developer account ($99/year) is **not required** for iCloud Drive in
A7 — see the iCloud section.

---

## Debugging `Error 400: redirect_uri_mismatch`

This is the single most common setup error and almost always means one of:

| Cause | Fix |
|-------|-----|
| `NEXT_PUBLIC_APP_URL` not set on Vercel | Add it (e.g. `https://arrowhead7.ai`), redeploy. |
| `NEXT_PUBLIC_APP_URL` set but with a trailing slash | Remove the trailing slash. We strip it at runtime, but Google's strict matcher cares about the literal URI sent at `/authorize`. |
| Redirect URI not yet registered in the provider console | `curl /api/auth/diagnostic`, copy the URI, paste into Google Cloud Console → OAuth client → Authorized redirect URIs. |
| Mismatched protocol/hostname between connect and console | The cookie-persisted redirect URI now keeps the connect step and the token-exchange step in sync. If you still see drift, hit the diagnostic to see what the request origin is resolving to. |

The connect routes log the URI they emit:

```
[oauth][google-drive] redirect_uri= https://arrowhead7.ai/api/auth/google-drive/callback
```

Find the line in Vercel logs and compare it character-for-character to your
Google Cloud Console entry.

---

## 1. Google (Drive + YouTube)

A single OAuth client serves both. Browser steps:

1. <https://console.cloud.google.com/apis/credentials> → **Create Credentials**
   → **OAuth client ID** → **Web application**.
2. **Authorized JavaScript origins**: `https://arrowhead7.ai`.
3. **Authorized redirect URIs** — add **both**:
   - `https://arrowhead7.ai/api/auth/google-drive/callback`
   - `https://arrowhead7.ai/api/auth/youtube/callback`
4. **OAuth consent screen** → External. Add yourself as a test user.
5. **APIs & Services → Library** — enable **Google Drive API** and **YouTube
   Data API v3**.
6. **Scopes** to declare:
   - `.../auth/drive.readonly`
   - `.../auth/youtube.upload`
   - `.../auth/youtube.readonly`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
7. Copy **Client ID** and **Client Secret**.

```bash
printf '%s' 'YOUR_GOOGLE_CLIENT_ID'     | vercel env add GOOGLE_CLIENT_ID production
printf '%s' 'YOUR_GOOGLE_CLIENT_SECRET' | vercel env add GOOGLE_CLIENT_SECRET production
```

YouTube uses the same client — once Google works, YouTube works.

---

## 2. Dropbox

1. <https://www.dropbox.com/developers/apps> → **Create app** → **Scoped
   access** → **Full Dropbox**.
2. **OAuth 2** → **Redirect URIs**: `https://arrowhead7.ai/api/auth/dropbox/callback`.
3. **Permissions**: enable `account_info.read`, `files.metadata.read`,
   `files.content.read`. Click **Submit** at the bottom of the page or the
   scopes won't take effect.
4. Copy **App key** and **App secret** from Settings.

```bash
printf '%s' 'YOUR_DROPBOX_APP_KEY'    | vercel env add DROPBOX_APP_KEY production
printf '%s' 'YOUR_DROPBOX_APP_SECRET' | vercel env add DROPBOX_APP_SECRET production
```

---

## 3. iCloud Drive (no developer account required)

**Honest scope note.** Apple ended WebDAV for iCloud in 2014. CloudKit JS —
the only official remote-access API — requires a paid Apple Developer
account (`$99/year`) and only exposes data your app itself wrote, not the
user's existing iCloud Drive files. There is **no public Apple API** for
reading a user's iCloud Drive footage.

What does work without any Apple credentials: iCloud Drive's public
share-link feature, which is exactly what A7 uses.

### How it works in the UI

1. On macOS / iOS, open the Files app, find the video you want to import.
2. Share → Copy iCloud Link → "Anyone with the link can view".
3. Paste the link on the Smart Vault page.
4. A7 resolves the link via Apple's public-records API, downloads the file,
   and stores it under your vault. Done.

Each share-link import flips the iCloud tile to "Connected" so the rest of
A7 (editor, distribution) treats it like any other source.

### Limitations

- One file per share. Folder shares work but A7 only ingests the first file
  inside (folder iteration is a follow-up).
- The presigned download URL Apple returns expires in ~5 minutes — A7
  streams immediately so this is invisible to the user, but if the import
  takes longer than 5 minutes the user retries with a fresh link.

### Optional: full Apple Developer setup

If you'd like proper Sign-in-with-Apple identity in A7 in the future, the
$99/year program is what's required. We're not blocked on it today — the
share-link flow is good enough for the use case (importing footage).

---

## 4. TikTok, Instagram, X

Same pattern. Hit `/api/auth/diagnostic` for the exact redirect URI to
register, then follow `OAUTH_SETUP.md` sections 3–5 for the per-provider
console steps.

---

## After setting env vars

Vercel only reads new env vars on a fresh build:

```bash
vercel --prod
# or in the dashboard: Deployments → ⋯ → Redeploy → uncheck "use build cache"
```

Verify:

```bash
curl https://arrowhead7.ai/api/auth/diagnostic | jq
```

Each provider should report `configured: true`. If the redirect URI looks
wrong (localhost, wrong domain), `NEXT_PUBLIC_APP_URL` is the lever.
