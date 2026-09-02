/**
 * Ghost Web AI — provider-neutral orchestration contracts.
 *
 * This module intentionally contains no provider SDKs or secret handling.
 * Execution adapters must enforce sandboxing, permissions and approval gates.
 */

export type AgentKind =
  | "orchestrator"
  | "git"
  | "github"
  | "web"
  | "app"
  | "compatibility"
  | "provider"
  | "security"
  | "ci";

export type TaskRisk = "low" | "medium" | "high" | "critical";
export type TaskStatus = "queued" | "running" | "blocked" | "passed" | "failed";

export interface GhostTask {
  id: string;
  instruction: string;
  repository?: string;
  branch?: string;
  risk: TaskRisk;
  status: TaskStatus;
  createdAt: string;
}

export interface AgentContext {
  task: GhostTask;
  workspace: string;
  permissions: readonly string[];
  attempt: number;
}

export interface AgentResult {
  status: "success" | "failure" | "needs_approval";
  summary: string;
  artifacts?: readonly string[];
  nextAgent?: AgentKind;
}

export interface GhostAgent {
  readonly kind: AgentKind;
  run(context: AgentContext): Promise<AgentResult>;
}

export interface ExecutionPolicy {
  maxAttempts: number;
  requireApprovalFor: readonly TaskRisk[];
  networkAccess: "none" | "allowlisted" | "full";
}

/**
 * Deterministic gate used by the future orchestrator before an agent runs.
 * It is deliberately side-effect free so it can also be used in tests.
 */
export function requiresApproval(
  risk: TaskRisk,
  policy: ExecutionPolicy,
): boolean {
  return policy.requireApprovalFor.includes(risk);
}

export const defaultExecutionPolicy: ExecutionPolicy = {
  maxAttempts: 3,
  requireApprovalFor: ["high", "critical"],
  networkAccess: "allowlisted",
};
