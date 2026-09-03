import { motion } from "framer-motion";
import { ArrowRight, Bot, KeyRound, Lock, MessageSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";

const features = [
  { icon: Lock, title: "End-to-end encryption", body: "Every message is sealed on your device with AES-256-GCM. Keys are derived on-device and never leave it — the server stores ciphertext only." },
  { icon: KeyRound, title: "Wrapped conversation keys", body: "Each conversation key is sealed separately for every member via ECDH P-256." },
  { icon: ShieldCheck, title: "No plaintext on the wire", body: "The backend sees encrypted envelopes and wrapped keys, not message plaintext." },
  { icon: MessageSquare, title: "Real-time delivery", body: "Reactive subscriptions push new messages as they arrive." },
];

export default function Landing() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const ctaLabel = isLoading ? "Loading…" : isAuthenticated ? "Open GhostChat" : "Start chatting";
  const ctaTarget = isAuthenticated ? "/chat" : "/auth?returnTo=%2Fchat";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60"><div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4"><div className="flex items-center gap-2"><div className="flex size-7 items-center justify-center rounded-full border border-foreground/20"><Lock className="size-3.5 text-foreground/70" /></div><span className="text-sm font-medium tracking-tight">Ghost.app</span></div><div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => navigate("/ai")}><Bot className="mr-2 size-4" />Ghost Web AI</Button><Button variant="ghost" size="sm" onClick={() => navigate(ctaTarget)} disabled={isLoading}>{isAuthenticated ? "Open app" : "Sign in"}</Button></div></div></header>
      <main>
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 sm:pt-32"><motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Private communication · Ghost Web AI</motion.p><motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }} className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Private messaging with an intelligent <span className="text-muted-foreground">workspace.</span></motion.h1><motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2 }} className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">Ghost.app combines encrypted communication with a provider-neutral Ghost Web AI workspace for repository inspection, coding workflows and authorized automation.</motion.p><div className="mt-8 flex flex-wrap items-center gap-3"><Button size="lg" onClick={() => navigate(ctaTarget)} disabled={isLoading}>{ctaLabel}<ArrowRight className="ml-2 size-4" /></Button><Button size="lg" variant="outline" onClick={() => navigate("/ai")}><Bot className="mr-2 size-4" />Open Ghost Web AI</Button></div></section>
        <div className="mx-auto max-w-5xl px-6"><div className="border-t border-border/60" /></div>
        <section className="mx-auto max-w-5xl px-6 py-20"><div className="grid gap-x-12 gap-y-12 sm:grid-cols-2">{features.map((f, i) => <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: .05*i }} className="max-w-sm"><div className="flex size-9 items-center justify-center rounded-full border border-foreground/15"><f.icon className="size-4 text-foreground/70" /></div><h3 className="mt-4 text-base font-medium tracking-tight">{f.title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p></motion.div>)}</div></section>
        <section className="mx-auto max-w-5xl px-6 pb-24"><div className="rounded-xl border border-border/60 bg-card px-8 py-12 text-center"><h2 className="text-2xl font-semibold tracking-tight">One workspace for Ghost.app</h2><p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Chat privately, inspect GitHub repositories and route AI work through an authorized gateway without a client-side credit meter.</p><Button size="lg" className="mt-6" onClick={() => navigate("/ai")}>Launch Ghost Web AI<ArrowRight className="ml-2 size-4" /></Button></div></section>
      </main>
      <footer className="border-t border-border/60"><div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row"><span>Ghost.app — Private by design. Secure by default.</span><span className="flex items-center gap-2">Web <span className="text-border">·</span> Android <span className="text-border">·</span> iOS <span className="text-border">·</span> more on the way</span></div></footer>
    </motion.div>
  );
}
