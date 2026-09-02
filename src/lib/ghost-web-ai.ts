export type AgentTask = "build" | "review" | "test" | "fix" | "explain" | "design";

export type GitHubRepo = {
  owner: string;
  name: string;
  defaultBranch: string;
  htmlUrl: string;
};

export type GitHubFile = {
  path: string;
  type: string;
  size: number;
};

const GITHUB_API = "https://api.github.com";

export function parseGitHubRepo(input: string): { owner: string; name: string } | null {
  const value = input.trim().replace(/\.git$/, "");
  const match = value.match(/github\.com[/:]([^/]+)\/([^/#?]+)(?:[/?#].*)?$/i);
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

export async function inspectGitHubRepo(input: string): Promise<GitHubRepo> {
  const parsed = parseGitHubRepo(input);
  if (!parsed) throw new Error("Enter a valid GitHub repository URL.");
  const response = await fetch(`${GITHUB_API}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`);
  if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
  const repo = await response.json();
  return { owner: repo.owner.login, name: repo.name, defaultBranch: repo.default_branch, htmlUrl: repo.html_url };
}

export async function listGitHubFiles(repo: GitHubRepo, path = ""): Promise<GitHubFile[]> {
  const response = await fetch(`${GITHUB_API}/repos/${repo.owner}/${repo.name}/contents/${path}`);
  if (!response.ok) throw new Error(`Unable to read repository contents (${response.status}).`);
  const items = await response.json();
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({ path: item.path, type: item.type, size: item.size ?? 0 }));
}

/**
 * Provider-neutral AI gateway. The browser never contains a provider secret.
 * Configure VITE_GHOST_AI_ENDPOINT to point at a self-hosted/authorized
 * OpenAI-compatible gateway such as a local OmniRoute deployment.
 */
export async function runGhostAgent(input: {
  task: AgentTask;
  prompt: string;
  context?: string;
}): Promise<string> {
  const endpoint = import.meta.env.VITE_GHOST_AI_ENDPOINT as string | undefined;
  if (!endpoint) {
    return "Ghost Web AI is ready. Configure VITE_GHOST_AI_ENDPOINT for an authorized AI gateway, or connect a local/self-hosted provider. No credit meter is used by this client.";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: input.task,
      messages: [
        { role: "system", content: "You are Ghost Web AI, a privacy-first software agent. Never claim an action was completed unless the tool result confirms it. Prefer open protocols and user-authorized repositories." },
        { role: "user", content: `${input.prompt}\n\nRepository context:\n${input.context ?? "none"}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI gateway returned ${response.status}.`);
  const data = await response.json();
  return data.output ?? data.choices?.[0]?.message?.content ?? data.text ?? "No response returned.";
}
