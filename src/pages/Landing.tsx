import { motion } from "framer-motion";
import {
  ArrowRight,
  KeyRound,
  Lock,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router";

const features = [
  {
    icon: Lock,
    title: "End-to-end encryption",
    body: "Every message is sealed on your device with AES-256-GCM. Keys are derived on-device and never leave it — the server stores ciphertext only.",
  },
  {
    icon: KeyRound,
    title: "Wrapped conversation keys",
    body: "Each conversation key is sealed separately for every member via ECDH P-256. Losing one member's key exposes nothing else.",
  },
  {
    icon: ShieldCheck,
    title: "No plaintext on the wire",
    body: "The Convex backend sees encrypted envelopes and wrapped keys. Not the messages, not the keys, not the plaintext.",
  },
  {
    icon: MessageSquare,
    title: "Real-time delivery",
    body: "Convex reactive subscriptions push new messages the moment they land — no polling, no refresh.",
  },
];

export default function Landing() {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const ctaLabel = isLoading
    ? "Loading…"
    : isAuthenticated
      ? "Open GhostChat"
      : "Start chatting";

  const ctaTarget = isAuthenticated ? "/chat" : "/auth?returnTo=%2Fchat";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background text-foreground"
    >
      {/* Thin top framing */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full border border-foreground/20">
              <Lock className="size-3.5 text-foreground/70" />
            </div>
            <span className="text-sm font-medium tracking-tight">
              GhostChat
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(ctaTarget)}
            disabled={isLoading}
          >
            {isAuthenticated ? "Open app" : "Sign in"}
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 sm:pt-32">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground"
          >
            Encrypted Chat System. Powered by No Location.
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
          >
            Messages that stay between{" "}
            <span className="text-muted-foreground">you and them.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground"
          >
            GhostChat seals every message on your device with AES-256-GCM and
            derives keys through ECDH P-256. The server relays ciphertext and
            wrapped keys — it cannot read what you send.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button size="lg" onClick={() => navigate(ctaTarget)} disabled={isLoading}>
              {ctaLabel}
              <ArrowRight className="ml-2 size-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              v1 · text messaging · end-to-end encrypted
            </span>
          </motion.div>
        </section>

        {/* Thin divider */}
        <div className="mx-auto max-w-5xl px-6">
          <div className="border-t border-border/60" />
        </div>

        {/* Features — editorial two-column, generous spacing */}
        <section className="mx-auto max-w-5xl px-6 py-20">
          <div className="grid gap-x-12 gap-y-12 sm:grid-cols-2">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: 0.05 * i, duration: 0.5 }}
                className="max-w-sm"
              >
                <div className="flex size-9 items-center justify-center rounded-full border border-foreground/15">
                  <f.icon className="size-4 text-foreground/70" />
                </div>
                <h3 className="mt-4 text-base font-medium tracking-tight">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Closing CTA — framed panel */}
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="rounded-xl border border-border/60 bg-card px-8 py-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Pick a handle, start talking.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Your chat identity is a ghost handle and an on-device keypair.
              No phone number, no email required for the chat layer.
            </p>
            <Button
              size="lg"
              className="mt-6"
              onClick={() => navigate(ctaTarget)}
              disabled={isLoading}
            >
              {ctaLabel}
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>GhostChat — Encrypted Chat System. Powered by No Location.</span>
          <span>v1</span>
        </div>
      </footer>
    </motion.div>
  );
}
