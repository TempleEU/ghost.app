# Ghost Web AI — Agent Team

Ghost Web AI uses a coordinated team of specialized agents working toward one goal: safely turn a user request into a tested, reviewable and deployable result.

## Team

1. **Orchestrator** — owns the task graph, assigns work, resolves conflicts and enforces gates.
2. **Architect** — converts the request into an implementation plan and acceptance criteria.
3. **Web Agent** — React/TypeScript UI, routes, UX and browser compatibility.
4. **App Agent** — Android now; iOS/macOS/Windows/Linux compatibility work as projects mature.
5. **Git Agent** — branches, diffs, commits, restore points and rollback plans.
6. **GitHub Agent** — repositories, PRs, Actions, releases and artifacts.
7. **Build Agent** — reproducible builds in an isolated workspace.
8. **Test/E2E Agent** — unit, integration, browser and regression tests.
9. **Repair Agent** — diagnoses the first real failure and proposes the smallest safe fix.
10. **API/Provider Agent** — provider registry, BYOK, routing, rate limits and fallbacks.
11. **Security Agent** — secrets, dependency risks, permissions and security checks.
12. **License Agent** — verifies licenses, notices, attribution and redistribution compatibility before external code is integrated.
13. **Release Agent** — verifies green CI, approval gates, release artifacts and deployment readiness.
14. **Documentation Agent** — keeps README, architecture and operational docs synchronized.
15. **Compatibility Agent** — validates macOS Big Sur through current macOS, Windows and Linux web support.

## Collaboration rules

- Agents share one task ID and one project state.
- Agents do not silently overwrite another agent's work.
- Code changes happen on task branches, not directly on protected production branches.
- Every material change produces a diff and a machine-readable result.
- Security and license checks are blocking gates.
- Push, merge, release and destructive operations require explicit approval unless a project policy explicitly allows automation.
- The Repair Agent works from the first actionable failure rather than guessing at multiple unrelated fixes.
- CI must pass before a release is considered verified.
- Failed work is preserved as an audit trail and can be rolled back.

## Standard execution loop

`request → plan → parallel analysis → implementation → build → test → first real error → diagnose → fix → commit → CI → verify → review → release → deploy`

Parallel work is encouraged for independent analysis and tests. Final writes to the same files are serialized by the Orchestrator.

## Definition of done

A task is done only when acceptance criteria are met, relevant tests pass, security/license gates pass, the Git diff is reviewed, CI is green, and required deployment/release verification succeeds.
