import { useState } from "react";
import { Bot, GitBranch, Github, Hammer, Play, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inspectGitHubRepo, listGitHubFiles, runGhostAgent, type AgentTask, type GitHubRepo } from "@/lib/ghost-web-ai";

const tasks: { id: AgentTask; label: string; icon: typeof Bot }[] = [
  { id: "build", label: "Build", icon: Hammer },
  { id: "review", label: "Review", icon: Search },
  { id: "test", label: "Test", icon: Play },
  { id: "fix", label: "Fix", icon: Sparkles },
  { id: "explain", label: "Explain", icon: Bot },
  { id: "design", label: "Design", icon: Sparkles },
];

export default function GhostWebAI() {
  const [repoInput, setRepoInput] = useState("https://github.com/TempleEU/ghost.app");
  const [repo, setRepo] = useState<GitHubRepo | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [task, setTask] = useState<AgentTask>("review");
  const [prompt, setPrompt] = useState("Review this repository and identify the safest next engineering gate.");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function inspect() {
    setBusy(true); setError("");
    try {
      const found = await inspectGitHubRepo(repoInput);
      const root = await listGitHubFiles(found);
      setRepo(found);
      setFiles(root.map((item) => item.path));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to inspect repository."); }
    finally { setBusy(false); }
  }

  async function run() {
    setBusy(true); setError("");
    try {
      const context = repo ? `${repo.owner}/${repo.name} (${repo.defaultBranch})\nRoot: ${files.join(", ")}` : "No repository inspected yet.";
      setOutput(await runGhostAgent({ task, prompt, context }));
    } catch (e) { setError(e instanceof Error ? e.message : "Agent request failed."); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-full border border-foreground/20"><Bot className="size-4" /></div><div><div className="font-semibold tracking-tight">Ghost Web AI</div><div className="text-xs text-muted-foreground">One agent for code, Git and AI workflows</div></div></div>
          <a href="https://github.com/TempleEU/ghost.app" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground"><Github className="size-5" /></a>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="max-w-3xl"><p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Ghost.app intelligence layer</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Build with one agent.</h1><p className="mt-5 text-base leading-relaxed text-muted-foreground">Inspect repositories, reason about code, plan changes and route authorized AI work through a provider-neutral gateway. GitHub access stays explicit and user-authorized.</p></div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-2xl border border-border/60 bg-card p-6">
            <div className="flex items-center gap-2 text-sm font-medium"><GitBranch className="size-4" /> Repository</div>
            <div className="mt-4 flex gap-2"><input value={repoInput} onChange={(e) => setRepoInput(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="https://github.com/owner/repo"/><Button onClick={inspect} disabled={busy}>Inspect</Button></div>
            {repo && <div className="mt-4 rounded-xl border border-border/60 p-4 text-sm"><div className="font-medium">{repo.owner}/{repo.name}</div><div className="mt-1 text-xs text-muted-foreground">Default branch: {repo.defaultBranch}</div><div className="mt-3 max-h-32 overflow-auto text-xs text-muted-foreground">{files.map((file) => <div key={file}>{file}</div>)}</div></div>}
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-6">
            <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4" /> Agent task</div>
            <div className="mt-4 grid grid-cols-3 gap-2">{tasks.map(({ id, label, icon: Icon }) => <Button key={id} variant={task === id ? "default" : "outline"} size="sm" onClick={() => setTask(id)}><Icon className="mr-1.5 size-3.5" />{label}</Button>)}</div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="mt-4 min-h-28 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <Button className="mt-3 w-full" onClick={run} disabled={busy}>{busy ? "Working…" : "Run Ghost Web AI"}<Play className="ml-2 size-4" /></Button>
          </section>
        </div>

        {(output || error) && <section className="mt-5 rounded-2xl border border-border/60 bg-card p-6"><div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4" /> Result</div>{error ? <p className="mt-3 text-sm text-destructive">{error}</p> : <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{output}</pre>}</section>}

        <section className="mt-8 rounded-2xl border border-border/60 p-6"><h2 className="text-lg font-semibold">Open-source integration policy</h2><p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">Ghost Web AI may use compatible open-source components, but each dependency must pass a license and attribution review. MIT-licensed Builder and OmniRoute components can be evaluated for integration; the free-API directory is CC0, while individual listed services retain their own terms. No proprietary branding, credentials or paid-service limits are bypassed.</p></section>
      </section>
    </main>
  );
}
