# DryErase Agent Guide

## Purpose

DryErase is a self-hosted whiteboard application. Keep changes focused on a reliable, fast board editor and preserve the existing React, Express, and shared-contract boundaries.

## Development Workflow

1. Inspect the relevant code, planning context, existing tracked work, and any supplied visual references before choosing an approach.
2. State material assumptions or trade-offs, then implement the smallest complete vertical slice that addresses the request.
3. Reuse local patterns and avoid unrelated refactors. Do not overwrite user changes or expose secrets from `.env.local`.
4. Verify the affected behavior. Run `npm run verify`; add browser smoke coverage when the change affects an interactive workflow.
5. Keep configured task tracking current with a clear description and acceptance criteria. Move verified work to its completed state only after verification succeeds.
6. Review the diff, commit with a clear message, and push only after verification succeeds.

## Local Task Tracking

Task-tracker configuration is local-only. Never commit tracker URLs, board or list identifiers, credentials, runner scripts outside this repository, or other personal operational details. Prefer an epic for cohesive feature areas and linked tasks for independently testable work.

## Local Services and Browser QA

- Start the app with `npm run dev`. The frontend is available at `http://localhost:5173`; the API health endpoint is `http://127.0.0.1:5050/health`.
- `npm run verify` is the shared local and CI quality gate. `npm run ship` requires a clean worktree, runs verification, then pushes the current branch.
- For interactive changes, use the Playwright CLI wrapper supplied by the Playwright skill. Check `npx` first and capture a browser snapshot before interacting with element references.
- Playwright uses a local Chrome runtime for visual smoke checks. If it is missing, run `npx playwright install chrome` before retrying; do not treat a missing runtime as an application failure.

## Repository Boundaries

- `apps/frontend`: Vite + React whiteboard UI.
- `apps/backend`: Express API, validation, persistence, asset handling, and role enforcement.
- `packages/shared`: API and board model contracts used by frontend and backend.
- `data/boards.json`: MVP board persistence. Treat it as user data, not source code.
- `data/assets`: uploaded board assets. Treat it as user data, not source code.

## License

DryErase is licensed as `AGPL-3.0-only`. Preserve the full [LICENSE](LICENSE) text and matching package metadata. Do not relicense project code, add license exceptions, or remove required source-offer notices without explicit maintainer authorization.

## Public Distribution

Keep the tracked repository free of personal infrastructure, private hostnames, local network details, credentials, and operational workflow references. See [PUBLIC_RELEASE.md](PUBLIC_RELEASE.md) before publishing to a public code host.

## Working Conventions

- Use `apply_patch` for manual file edits.
- Keep public contracts in `packages/shared` aligned with server validation and persistence.
- Preserve role checks for owner, editor, and viewer access.
- Use Lucide for interface and curated board icons unless a feature requires a different asset system.
- Do not use destructive Git commands or revert unrelated work.
- Leave local dev servers running unless the task requires a restart.
