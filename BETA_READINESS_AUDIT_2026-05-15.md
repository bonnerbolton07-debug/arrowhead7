# Arrowhead 7 Beta Readiness Audit - 2026-05-15

## Launch Call

- Founder-ready: not yet. The app builds and the main surfaces are present, but the authenticated editor upload -> Style DNA -> render -> completed edit flow still needs a real Bonner-session smoke test with production media.
- Private-beta ready: not yet. Upload and navigation hardening improved in this pass, but provider-backed render/OAuth/storage acceptance is still gated.
- Public-beta ready: no. Public beta needs security rotation, authenticated QA, error-state polish, and payments posture locked.

## Critical Blockers

- Authenticated production editor/render smoke remains unverified in this audit session. Owner: Bonner/Guardian approval for exact provider-backed test scope.
- Local `.env.local` and ignored `.claude` worktree/build artifacts contain sensitive-looking provider material. Values were not read or printed. Rotate before broader beta and clean ignored artifacts intentionally.
- Supabase production schema changes and provider-side tests remain gated. Do not apply migrations or mutate shared provider state without Bonner/Guardian approval.

## High Priority Bugs / Gaps

- Upload UX and backend validation were inconsistent. Vault and onboarding now accept audio/music/SFX and send real file sizes; `/api/vault/upload` now enforces file type, per-kind size caps, filename safety, folder validity, and plan storage quota before presigning R2 uploads.
- Strategy Brain used legacy dashboard chrome and was missing from the main dashboard nav. It now uses `DashboardShell`, gets the mobile nav, and appears in the dashboard sidebar/mobile strip.
- Onboarding still carried ARENAXOS branding and wrong "up to 2GB" upload copy. It now uses Arrowhead 7/A7 language and accurate media limits.
- Multipart upload ownership checks used substring matching. They now require the R2 key to start with the caller-owned `sources/{userId}/` or `references/{userId}/` prefix.

## Medium Priority Work

- Replace browser `alert()` copy confirmations with in-app toast/status messages.
- Add first-class variation grouping in the database (`parent_edit_id` or variation collection) instead of URL-only workflow linkage.
- Add authenticated E2E tests for onboarding, vault upload, editor render submit, render status completion, and variation regeneration.
- Harden Supabase `SECURITY DEFINER` functions with explicit `search_path` migrations after Guardian approves DB migration scope.
- Decide whether `/api/account/connections` should return 401 unauthenticated instead of false provider booleans.

## Low Priority / Nice To Have

- Add richer empty states for strategy/channel data once private beta users connect accounts.
- Add toast feedback for share-link copy and delete actions.
- Add a founder QA checklist page or admin panel for daily smoke status.

## Payments Recommendation

Keep payments controlled for beta. Pricing can stay visible, but checkout should remain sandbox/verified-founder-only until Stripe live-mode, webhook, upgrade/downgrade, and failure-path testing are complete.

## Required Rollout Gates

1. Founder-only: Bonner runs authenticated `/editor` smoke with video + image + audio references, source video, direction prompt, render, completed edit, and variation regenerate.
2. Private beta, 5-10 users: enable only after provider-backed upload/render/OAuth smoke passes and sensitive local/provider material is rotated.
3. Limited beta, 25-50 users: add E2E coverage, beta support/error logging workflow, and payment posture lock.
4. Public waitlist: okay before full public beta if waitlist/signup copy does not promise unrestricted working render capacity.
5. Monetization: after render reliability and credit accounting are proven under private beta load.

## Verification Completed

- `npm run typecheck` passed.
- `npm test` passed: 56 passed, 8 skipped.
- `npm run build` passed.
- `git diff --check` passed before report write.
- Live unauthenticated production guards confirmed: `/dashboard`, `/editor`, `/vault`, and `/onboarding` redirect to `/auth/login`.

