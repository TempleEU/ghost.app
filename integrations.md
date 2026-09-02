# Ghost.app integrations

Ghost.app uses provider-neutral integrations. The web client never embeds AI provider secrets and does not expose a client-side AI credit meter.

## Ghost Web AI

Ghost Web AI is the unified workspace for repository inspection, coding assistance, testing plans, reviews, design tasks and authorized automation.

Configure an authorized AI gateway with:

- `VITE_GHOST_AI_ENDPOINT`

The gateway may be a local or self-hosted OpenAI-compatible service, including an authorized OmniRoute deployment. Provider terms, quotas and API authentication still apply; Ghost.app does not bypass paid limits, access controls or authentication.

## GitHub

The browser can inspect public GitHub repositories through the GitHub REST API without storing credentials. Write operations should use an explicit OAuth/app flow with least-privilege scopes and server-side token handling. Never put a GitHub personal access token in Vite client environment variables.

Supported first workflow:

1. Enter a GitHub repository URL.
2. Inspect repository metadata and root files.
3. Give Ghost Web AI a task such as build, review, test, fix, explain or design.
4. Send the resulting plan/code request to the configured authorized AI gateway.
5. Apply Git changes only through an explicit, authenticated Git/GitHub action.

## Open-source policy

Potential upstream components are reviewed individually. Builder.io's repository is MIT licensed, OmniRoute is MIT licensed, `miuuyy/codex-chatgpt-web` is MIT licensed, and `OuterSpacee/free-ai-apis` is CC0. The Supercharged-AI-Dev-Tools repository itself warns that listed tools may have separate licenses and terms, so its entries are treated as a discovery index rather than automatically reusable code. Ghost.app must retain required notices and must not copy trademarks, proprietary assets or code outside the applicable license.

## Free AI providers

A provider may offer a free tier, but "free" is not treated as unlimited or as permission to bypass authentication, quotas or billing. Ghost.app can support local models and self-hosted gateways where practical, which can avoid per-request vendor billing when the operator supplies the compute.

## Removed integration dependency

The previous VLY/Freebuff integration documentation described automatic usage billing and credit consumption. That path is no longer the product architecture for Ghost Web AI. The Ghost Web AI client is provider-neutral and has no client-side credit counter.
