# LOCK — A7 Render + Environment Stabilization

Owner: Codex 5.5 / Cydon
Started: 2026-05-16 20:05 CDT
Expected release: After A7 environment manifest, worktree inventory, pending infra decision, and next owner assignment are recorded.
Files/folders:
- `ENVIRONMENT_MANIFEST.md`
- `LOCK.md`
- `WORKTREE_INVENTORY_2026-05-16.md`
- `supabase/migrations/20260516195644_render_pipeline_hardening.sql`
- Render pipeline files only after explicit next build scope

Reason:
A7 is live but currently deployed from Vercel project `bonner-ai-services` and has a fragmented multi-agent worktree surface. This lock prevents overlapping render/environment stabilization work while the source of truth is tightened.

Safe rollback:
- Revert this lock and manifest documentation only.
- Do not revert code or remove worktrees without Bonner/Guardian approval.

Status: ACTIVE

Rules while active:
- No direct production deploys from `.claude/worktrees`.
- No Vercel/Supabase/provider/env/domain mutation without Bonner/Guardian gate approval.
- No raw secret inspection, printing, copying, or vault mirroring.
- All A7 implementation work starts from canonical repo `main` unless Guardian explicitly assigns a branch.
- Every A7 change must state files touched, tests run, deployment target, and migration status.

Latest output:
- Dedicated Vercel project `arrowhead7` created.
- Production env names migrated from `bonner-ai-services` to `arrowhead7` without printing raw values.
- Git-connected production deployments are READY on `arrowhead7.ai`; use `vercel inspect https://arrowhead7.ai` for the current deployment id.
- `arrowhead7.ai` and `www.arrowhead7.ai` are attached to Vercel project `arrowhead7`.
- Public smoke returned 200 for `/`, `/terms`, `/auth/login`, `/editor?renderProvider=a7_engine`.
- Dedicated Supabase projects `arrowhead7-prod` and `arrowhead7-staging` are created, migrated, and API-smoked.
- Vercel production Supabase envs point to `arrowhead7-prod`; Vercel development and preview Supabase envs point to `arrowhead7-staging`.
- Vercel Git integration is connected to `bonnerbolton07-debug/arrowhead7`, production branch `main`.
- npm audit is clean for production and full dependency trees after aligning `eslint-config-next` with Next 15.5.18 and overriding PostCSS to the patched 8.5.x line.
