# A7 Worktree Inventory — 2026-05-16

Status: READ-ONLY INVENTORY
Owner: Codex 5.5 / Cydon
Purpose: give Guardian, Hermes, Codex, and Claude Code one shared view of the current A7 branch/worktree sprawl before cleanup or further build work.

No worktrees or branches were deleted.

## Summary

- Canonical worktree: `/Users/bonnerbolton/ArrowHead7_Command_Vault/A7-APP`
- Canonical branch: `main`
- Current deployed source commit: `d364cd8 docs: add A7 environment control docs`
- Current app-code baseline: `6881da4 fix(render): harden pipeline status and exports`
- Worktrees reported by `git worktree list`: 42 total including main
- Branch lines containing `claude/`: 51 local/remote branch refs
- Active production project: Vercel `arrowhead7`
- Production source should be treated as `main` only.

## Merge / Keep Signals

These commits are already in the production chain or have been superseded by later main commits:

- `6881da4` — current live source.
- `4cea29a` — founder A7 engine test mode, now behind current live source.
- `cbf9aed` — native A7 engine foundation, now behind current live source.
- `6c43c8d` — full-source deterministic matcher, now behind current live source.
- `36a616d` — color/no-loop matcher fix, now behind current live source.
- `bc226e0` — creative render layer hardening, now behind current live source.
- `78b3da0` — Shotstack title-style validation fix, now behind current live source.
- `0b4726a` — six pipeline blockers, now behind current live source.

## Worktrees Needing Reconciliation Review

Before deletion, each worktree should be classified as one of:

- `MERGED/SUPERSEDED` — can be archived after Guardian approval.
- `ACTIVE CANDIDATE` — still contains useful unmerged work.
- `SECURITY REVIEW` — touched auth, env, credentials, R2, Supabase, OAuth, Stripe, or provider code.
- `UNKNOWN` — inspect diff before deciding.

High-signal candidates from branch labels:

- `claude/charming-wilbur-5bdb91` — dashboard loading skeletons, remote branch exists.
- `claude/elegant-fermi-69ef77` — dashboard delete action, remote branch exists.
- `claude/epic-shannon-7c88f1` — Style DNA hang fix, remote branch exists.
- `claude/focused-almeida-f86223` — Style DNA timeout fix, remote branch exists.
- `claude/laughing-dijkstra-508417` — connectors diagnostics, remote branch exists.
- `claude/magical-morse-087f85` — vault stream-through pull/cloud-import panel, remote branch exists.
- `claude/naughty-poincare-26c368` — OAuth safe error mapping, remote branch exists.
- `claude/nervous-sinoussi-8795c9` — LinkedIn/4K gating, remote branch exists.
- `claude/stoic-bouman-2503fe` — render pipeline/dashboard stubs, remote branch exists.
- `claude/stupefied-bouman-dec0bf` — security and QA hardening, remote branch exists.

## Cleanup Gate

Cleanup is recommended, but not authorized by this inventory.

Required before cleanup:

1. Guardian or Bonner approves worktree/branch cleanup scope.
2. Claude Code or Codex classifies each worktree by diff against `main`.
3. Any active candidate gets merged through `main` with tests.
4. Any security-sensitive worktree is reviewed without printing secrets.
5. Only then remove stale worktrees/branches.

## Operating Rule

Until cleanup completes, agents must not assume a `.claude/worktrees/*` branch is current production truth. The only current live source is:

`/Users/bonnerbolton/ArrowHead7_Command_Vault/A7-APP` on `main`; app-code baseline `6881da4`, deployed control-doc baseline `d364cd8`.
