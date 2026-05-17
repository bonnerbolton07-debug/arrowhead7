# A7 Environment Manifest

Status: ACTIVE CONTROL DOCUMENT
Last verified: 2026-05-16 21:25 CDT
Owner: Guardian approves infrastructure; Codex/Claude Code implement only with Bonner/Guardian gate approval; Hermes verifies and mirrors status.

This file is intentionally non-secret. Do not add API keys, tokens, passwords, webhook secrets, service-role values, OAuth secrets, or raw provider values.

## Production Source

- Product: Arrowhead 7 / A7
- Canonical repo path: `/Users/bonnerbolton/ArrowHead7_Command_Vault/A7-APP`
- Git remote: `https://github.com/bonnerbolton07-debug/arrowhead7.git`
- Branch: `main`
- Last verified runtime source commit: `86ae884 chore: close A7 environment hardening gaps`
- Current app-code baseline: `6881da4 fix(render): harden pipeline status and exports`
- Current live domain: `https://arrowhead7.ai`
- Current `www` domain: `https://www.arrowhead7.ai`

## Current Vercel State

- Current Vercel team/scope: `bonnerbolton07-debugs-projects`
- Current Vercel project: `arrowhead7`
- Current Vercel project id: `prj_0e4McTccad8sEv2U6fVUkiXcoCgg`
- Previous Vercel container: `bonner-ai-services`
- Current production deployment is intentionally not hardcoded here because
  Git-connected `main` pushes create new Vercel deployments. Use
  `vercel inspect https://arrowhead7.ai` for the current deployment id.
- Current aliases:
  - `https://arrowhead7.ai`
  - `https://www.arrowhead7.ai`
  - `https://arrowhead7.vercel.app`
  - `https://arrowhead7-bonnerbolton07-debugs-projects.vercel.app`

### Current Vercel Env Names

Values are encrypted in Vercel and must not be pulled into files unless explicitly approved for a rotation/migration window.

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN`
- `SHOTSTACK_API_URL`
- `SHOTSTACK_STAGE_API_KEY`
- `SHOTSTACK_PROD_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_STUDIO_MONTHLY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`

## Current Supabase State

- App code reads Supabase from `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Production Supabase project: `arrowhead7-prod` (`daprnsgeljtismownouf`) — created, migrated, and API-smoked.
- Staging Supabase project: `arrowhead7-staging` (`xhqtiytnxefsoocluqrq`) — created, migrated, and API-smoked.
- Local Supabase CLI is linked to `arrowhead7-staging` after staging migration; relink to production before production-only DB operations.
- Vercel production env points to `arrowhead7-prod`.
- Vercel development env points to `arrowhead7-staging`.
- Vercel preview env points to `arrowhead7-staging`.
- Vercel Git integration is connected to `bonnerbolton07-debug/arrowhead7`, production branch `main`.
- Applied migrations:
  - `20260516190000_initial_a7_schema.sql`
  - `20260516193000_user_vault.sql`
  - `20260516194000_strategy_brain.sql`
  - `20260516195000_icloud_provider.sql`
  - `20260516195644_render_pipeline_hardening.sql`
  - `20260517014954_data_api_grants.sql`

## Target A7 Environment Model

A7 should move to dedicated, clearly named infrastructure before private beta.

### Vercel

- Production project: `arrowhead7` — created and live
- Preview/staging project or branch environment: `arrowhead7-staging`
- Domains should point only to the project that owns the live A7 release.
- Git integration points to `bonnerbolton07-debug/arrowhead7`.

### Supabase

- Production project: `arrowhead7-prod` — created and migrated
- Staging project: `arrowhead7-staging` — created and migrated
- Migration history must match tracked repo migrations.
- No staging/dev/preview env may point at production Supabase.

### Storage / Providers

- R2 prod buckets should use an A7 prod prefix/name.
- R2 staging buckets should use an A7 staging prefix/name.
- Shotstack, Stripe, OAuth, OpenAI/Anthropic, Cloudflare Stream, and token encryption values should be separated by production/staging.

## Human Gates

Bonner/Guardian approval required before any of the following:

- Create, rename, or migrate Vercel projects.
- Move `arrowhead7.ai` or `www.arrowhead7.ai` aliases.
- Pull, replace, rotate, or copy env/provider/credential values.
- Create or migrate additional Supabase projects.
- Apply future Supabase migrations to production or staging.
- Mutate R2 buckets, Cloudflare Stream, Stripe, OAuth, Shotstack, DNS, payment, or provider settings.
- Delete or prune `.claude/worktrees` or git branches.
- Push/merge/deploy production changes.

## Current Build Gate

A7 is not ready for broad beta until:

- Dedicated A7 Vercel ownership is migrated.
- Dedicated A7 Supabase prod/staging ownership is migrated.
- Captions R2-key ownership validation is patched.
- Generic URL import SSRF controls are patched.
- Render worker/queue architecture replaces synchronous long-running native renders.
- Provider/render diagnostics are persisted without exposing raw provider errors or secrets.
- Bonner completes authenticated founder E2E on live app.
