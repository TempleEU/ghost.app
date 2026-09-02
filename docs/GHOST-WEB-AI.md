# Ghost Web AI

Ghost Web AI is the orchestration layer for Ghost.app's AI-assisted software factory.

## Goal

Turn a user request into a controlled, verifiable development workflow:

`request → plan → workspace → build → test → diagnose → fix → commit → CI → verify → release/deploy`

## Agents

- **Orchestrator** — decomposes tasks and routes work.
- **Git** — branches, diffs, commits and rollback points.
- **GitHub** — repositories, pull requests, Actions, releases and artifacts.
- **Web** — Ghost.app web implementation and browser validation.
- **App** — Android first; future iOS/macOS/Windows/Linux clients.
- **Compatibility** — browser and desktop compatibility checks.
- **Provider** — provider registry, BYOK and controlled fallback routing.
- **Security** — dependency, secret and open-source license gates.
- **CI** — build/test/failure-analysis/retry/verification loop.

## Safety model

AI-generated code must execute in an isolated workspace. Network access should be allowlisted, credentials must remain outside source code and high-risk operations require explicit approval.

No provider, API, repository or external project is trusted merely because it is public. External code must pass license, dependency, security and trademark checks before integration.

## Verification gates

1. Typecheck/lint
2. Unit/integration tests
3. Browser/E2E tests where applicable
4. Build/package verification
5. Security and dependency checks
6. License compliance
7. Git diff review
8. GitHub Actions result
9. Release/deployment verification

A failed gate returns the first actionable failure to the repair loop. Attempts are bounded by policy; the system must not retry indefinitely.

## Provider model

Ghost Web AI is provider-neutral. It should support user-supplied keys (BYOK), approved free/open providers where their terms permit use, and fallback routing with rate-limit and availability protection. Provider credentials are never committed to Git.

## Current foundation

The Ghost.app repository currently uses Vite, React, TypeScript, Tailwind CSS and Convex. Ghost Web AI is being introduced incrementally so the existing application remains buildable while agent capabilities are added behind explicit interfaces.
