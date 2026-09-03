import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  generateIdentity,
  saveIdentity,
  loadIdentity,
  hasStoredIdentity,
  isIdentityUnprotected,
  generateConversationKey,
  wrapConversationKey,
  unwrapConversationKey,
  encryptMessage,
  decryptMessage,
} from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useAppMode } from "@/hooks/use-app-mode";
import { SettingsDialog } from "@/components/SettingsDialog";
import { publicKeyFingerprint } from "@/lib/crypto";
import { ArrowLeft, Ghost, Languages, Lock, Loader2, MoreVertical, ScrollText, Send, Settings, ShieldAlert, Sparkles, Timer, UserPlus, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Identity = { userId: string; handle: string; publicKeyJwk: string };

type Member = { userId: string; handle: string; publicKeyJwk: string };

type Conversation = {
  _id: Id<"conversations">;
  members: Member[];
  keyEnvelopes: { userId: string; iv: string; wrappedKey: string }[];
  lastMessageAt: number;
  latestMessage: { ciphertext: string; iv: string; senderId: string } | null;
};

type ChatMessage = {
  _id: Id<"messages">;
  senderId: string;
  ciphertext: string;
  iv: string;
  createdAt: number;
  expiresAt?: number;
  replyToId?: Id<"messages">;
  reactions?: Record<string, string[]>;
};

const DISAPPEARING_OPTIONS = [
  { value: "off", label: "Off", ms: undefined as number | undefined },
  { value: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
  { value: "24h", label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Chat() {
  const { user, signOut } = useAuth();
  const myIdentity = useQuery(api.chat.myIdentity);
  const conversations = useQuery(api.chat.listConversations) as
    | Conversation[]
    | undefined;

  // Private key lives in memory only — unlocked with the passphrase.
  const [privateKeyJwk, setPrivateKeyJwk] = useState<string | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<Id<"conversations"> | null>(null);

  if (myIdentity === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (myIdentity === null) {
    return (
      <IdentitySetup
        email={user?.email ?? "guest"}
        onDone={() => {
          // myIdentity is a reactive query — it refreshes on its own.
        }}
        onSignOut={signOut}
      />
    );
  }

  if (!privateKeyJwk) {
    return (
      <UnlockScreen
        identity={myIdentity as Identity}
        onUnlocked={setPrivateKeyJwk}
        onSignOut={signOut}
      />
    );
  }

  return (
    <ChatWorkspace
      me={myIdentity as Identity}
      privateKeyJwk={privateKeyJwk}
      conversations={conversations ?? []}
      conversationsLoading={conversations === undefined}
      selectedConvId={selectedConvId}
      onSelectConv={setSelectedConvId}
      onSignOut={signOut}
    />
  );
}

// ---------------------------------------------------------------------------
// Device registration (security alerts) — fingerprint of my public key
// ---------------------------------------------------------------------------

function useDeviceRegistration(privateKeyJwk: string | null, publicKeyJwk: string | null) {
  const touchDevice = useMutation(api.settings.touchDevice);
  useEffect(() => {
    if (!privateKeyJwk || !publicKeyJwk) return;
    (async () => {
      const fp = await publicKeyFingerprint(publicKeyJwk);
      try {
        await touchDevice({ label: deviceLabel(), keyFingerprint: fp });
      } catch {
        // Non-fatal: security-alert log is best-effort.
      }
    })();
  }, [privateKeyJwk, publicKeyJwk, touchDevice]);
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os =
    /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : "Unknown OS";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  return `${os} · ${browser}`;
}

// ---------------------------------------------------------------------------
// Identity setup — one-time: pick a handle, create keypair, wrap private key
// ---------------------------------------------------------------------------

function IdentitySetup({
  email,
  onDone,
  onSignOut,
}: {
  email: string;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const suggestion = useQuery(api.chat.suggestHandle);
  const register = useMutation(api.chat.registerIdentity);
  const [handle, setHandle] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (suggestion && !handle) {
      // Defer so the state update doesn't fire synchronously during the
      // effect pass (React compiler strictness: cascading render).
      const id = requestAnimationFrame(() => setHandle(suggestion))
      return () => cancelAnimationFrame(id)
    }
  }, [suggestion, handle]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const identity = await generateIdentity();
      if (passphrase && passphrase.length < 8) {
        throw new Error("Passphrase must be at least 8 characters if set.");
      }
      // With a passphrase the private key is wrapped and stored ONLY in this
      // browser. Without one (guest mode) it is stored plainly so the app
      // unlocks automatically next time. The server receives the public key
      // and handle — nothing else.
      await saveIdentity(passphrase, identity);
      await register({ handle: handle.trim(), publicKeyJwk: identity.publicKeyJwk });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create identity.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full border border-foreground/15">
            <Ghost className="size-5 text-foreground/70" />
          </div>
          <CardTitle className="text-xl">Create your ghost identity</CardTitle>
          <CardDescription>
            Signed in as {email}. Your handle is public; your private key never
            leaves this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="handle">Ghost handle</Label>
            <Input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="ghost-7f3a9c"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="passphrase">Encryption passphrase (optional)</Label>
            <Input
              id="passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Leave empty for instant guest mode"
            />
            <p className="text-xs text-muted-foreground">
              Skip it to chat instantly — your key stays in this browser and
              unlocks automatically. Add one to protect your key at rest; if you
              lose it, there is no recovery.
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleCreate} disabled={busy || !handle.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            {passphrase ? "Create identity" : "Start chatting"}
          </Button>
          <Button variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Unlock — passphrase unwraps the private key into memory
// ---------------------------------------------------------------------------

function UnlockScreen({
  identity,
  onUnlocked,
  onSignOut,
}: {
  identity: Identity;
  onUnlocked: (privateKeyJwk: string) => void;
  onSignOut: () => void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guest mode: identity stored without a passphrase — unlock automatically.
  useEffect(() => {
    if (!isIdentityUnprotected()) return;
    let cancelled = false;
    (async () => {
      const key = await loadIdentity("");
      if (!cancelled && key) onUnlocked(key);
    })();
    return () => {
      cancelled = true;
    };
  }, [onUnlocked]);

  const handleUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = await loadIdentity(passphrase);
      if (!key) {
        throw new Error("Wrong passphrase, or this browser has no stored key.");
      }
      onUnlocked(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full border border-foreground/15">
            <Lock className="size-5 text-foreground/70" />
          </div>
          <CardTitle className="text-xl">Unlock GhostChat</CardTitle>
          <CardDescription>
            Welcome back, {identity.handle}. Enter your passphrase to decrypt
            your private key for this session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!hasStoredIdentity() && (
            <p className="text-sm text-destructive">
              No local key found in this browser. GhostChat keys are
              device-bound — sign in on the browser where you created your
              identity.
            </p>
          )}
          <Input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Passphrase"
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={handleUnlock} disabled={busy || !passphrase}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Unlock
          </Button>
          <Button variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Workspace — conversation list + chat view
// ---------------------------------------------------------------------------

function ChatWorkspace({
  me,
  privateKeyJwk,
  conversations,
  conversationsLoading,
  selectedConvId,
  onSelectConv,
  onSignOut,
}: {
  me: Identity;
  privateKeyJwk: string;
  conversations: Conversation[];
  conversationsLoading: boolean;
  selectedConvId: Id<"conversations"> | null;
  onSelectConv: (id: Id<"conversations"> | null) => void;
  onSignOut: () => void;
}) {
  // Decrypted conversation keys, cached per conversation.
  const [convKeys, setConvKeys] = useState<Map<string, CryptoKey>>(new Map());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { appMode } = useAppMode();

  // Blocking & reporting: hide conversations whose other member is blocked.
  const blockedHandles = useQuery(api.chat.listBlocked) as
    | { handle: string; blockedId: string }[]
    | undefined;
  const blockedIds = new Set((blockedHandles ?? []).map((b) => b.blockedId));
  const visibleConversations = conversations.filter(
    (c) => !c.members.some((m) => m.userId !== me.userId && blockedIds.has(m.userId)),
  );

  useDeviceRegistration(privateKeyJwk, me.publicKeyJwk);

  const unwrapKey = useCallback(
    async (conv: Conversation): Promise<CryptoKey | null> => {
      const cached = convKeys.get(conv._id);
      if (cached) return cached;
      const envelope = conv.keyEnvelopes.find((e) => e.userId === me.userId);
      if (!envelope) return null;
      // The envelope was wrapped by another member; try each peer key until
      // AES-GCM authentication succeeds (works for DMs and groups alike).
      for (const member of conv.members) {
        if (member.userId === me.userId) continue;
        try {
          const key = await unwrapConversationKey(
            privateKeyJwk,
            member.publicKeyJwk,
            envelope.iv,
            envelope.wrappedKey,
          );
          setConvKeys((prev) => new Map(prev).set(conv._id, key));
          return key;
        } catch {
          // Wrong peer — try the next member.
        }
      }
      return null;
    },
    [convKeys, me.userId, privateKeyJwk],
  );

  // Pre-decrypt keys for all conversations (previews + fast open).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const conv of conversations) {
        if (cancelled) return;
        if (!convKeys.has(conv._id)) await unwrapKey(conv);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversations, convKeys, unwrapKey]);

  const selectedConv = visibleConversations.find((c) => c._id === selectedConvId) ?? null;

  return (
    <main className="flex h-dvh bg-background text-foreground">
      {/* Sidebar — phone-style: full width, hidden while a chat is open.
          Below md the app is always single-pane so it fits any phone screen;
          App Mode extends that behavior to desktop. */}
      <aside
        className={`flex shrink-0 flex-col border-r border-border/60 ${
          selectedConv !== null ? (appMode ? "hidden" : "hidden md:flex") : ""
        } ${appMode ? "w-full" : "w-full md:w-80"}`}
      >
        <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full border border-foreground/20">
              <Ghost className="size-3.5 text-foreground/70" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-tight">GhostChat</span>
              <span className="text-xs text-muted-foreground">{me.handle}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-4" />
            </Button>
            <NewConversationDialog
              me={me}
              privateKeyJwk={privateKeyJwk}
              onCreated={onSelectConv}
            />
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {conversationsLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!conversationsLoading && conversations.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No conversations yet. Start one with a ghost handle.
            </p>
          )}
          {visibleConversations.map((conv) => {
            const other = conv.members.find((m) => m.userId !== me.userId);
            return (
              <button
                key={conv._id}
                onClick={() => onSelectConv(conv._id)}
                className={`flex w-full flex-col gap-0.5 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
                  selectedConvId === conv._id ? "bg-accent" : ""
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Ghost className="size-3.5 text-muted-foreground" />
                  {other?.handle ?? "group"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {conv.latestMessage ? timeAgo(conv.lastMessageAt) : "new"}
                </span>
              </button>
            );
          })}
        </div>
        <footer className="border-t border-border/60 p-3">
          <Button variant="ghost" size="sm" className="w-full" onClick={onSignOut}>
            Sign out
          </Button>
        </footer>
      </aside>

      {/* Chat area — full width once a chat is open; below md it replaces
          the sidebar (single pane). Desktop shows the two-pane layout. */}
      <section
        className={`flex flex-1 flex-col ${
          selectedConv === null ? (appMode ? "hidden" : "hidden md:flex") : ""
        }`}
      >
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          handle={me.handle}
          publicKeyJwk={me.publicKeyJwk}
        />
        {selectedConv ? (
          <ChatView
            key={selectedConv._id}
            me={me}
            conv={selectedConv}
            convKey={convKeys.get(selectedConv._id) ?? null}
            appMode={appMode}
            onBack={() => onSelectConv(null)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Ghost className="size-10 opacity-40" />
            <p className="text-sm">Select a conversation to start chatting</p>
          </div>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Chat view — decrypt history, send sealed messages
// ---------------------------------------------------------------------------

function ChatView({
  me,
  conv,
  convKey,
  appMode,
  onBack,
}: {
  me: Identity;
  conv: Conversation;
  convKey: CryptoKey | null;
  appMode: boolean;
  onBack: () => void;
}) {
  const messages = useQuery(api.chat.listMessages, {
    conversationId: conv._id,
  }) as ChatMessage[] | undefined;
  const send = useMutation(api.chat.sendMessage);
  const sendReply = useMutation(api.chat.sendReply);
  const toggleReaction = useMutation(api.chat.toggleReaction);

  const [text, setText] = useState("");
  const [disappearing, setDisappearing] = useState("off");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [plaintexts, setPlaintexts] = useState<Map<string, string>>(new Map());
  const bottomRef = useRef<HTMLDivElement>(null);
  const other = conv.members.find((m) => m.userId !== me.userId);
  const memberHandle = useCallback(
    (userId: string) => conv.members.find((m) => m.userId === userId)?.handle ?? "ghost",
    [conv.members],
  );

  // --- AI Assistant (feature-gated: must be enabled in Settings → AI) ------
  const aiConfig = useQuery(api.aiProviderData.getConfig) as
    | { configured: boolean; enabled: boolean; validatedAt: number | null }
    | null
    | undefined;
  const aiOn = !!(aiConfig?.configured && aiConfig.enabled && aiConfig.validatedAt);
  const aiSmartReplies = useAction(api.ai.smartReplies);
  const aiTranslate = useAction(api.ai.translateMessage);
  const aiSummarize = useAction(api.ai.summarizeConversation);
  const aiDraft = useAction(api.ai.draftMessage);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiPanel, setAiPanel] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateLang, setTranslateLang] = useState("English");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState("");
  const [draftResult, setDraftResult] = useState<string | null>(null);

  const lastIncoming = [...(messages ?? [])].reverse().find((m) => m.senderId !== me.userId);
  const lastIncomingText = lastIncoming ? plaintexts.get(lastIncoming._id) : undefined;
  const lastMessageAny = messages?.length ? messages[messages.length - 1] : null;
  const lastMessageAnyText = lastMessageAny ? plaintexts.get(lastMessageAny._id) : undefined;

  const genSuggestions = async () => {
    if (!lastIncoming || !lastIncomingText) return;
    setAiBusy("replies");
    setAiError(null);
    setAiPanel(null);
    try {
      const res = (await aiSmartReplies({
        lastMessage: lastIncomingText,
        otherHandle: memberHandle(lastIncoming.senderId),
      })) as { replies: string[] };
      setAiSuggestions(res.replies);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAiBusy(null);
    }
  };

  const doTranslate = async () => {
    if (!lastMessageAny || !lastMessageAnyText) return;
    setAiBusy("translate");
    setAiError(null);
    setAiPanel(null);
    try {
      const res = (await aiTranslate({
        text: lastMessageAnyText,
        targetLanguage: translateLang,
      })) as { translated: string };
      setAiPanel(
        `🌐 ${memberHandle(lastMessageAny.senderId)} → ${translateLang}:\n${res.translated}`,
      );
      setTranslateOpen(false);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAiBusy(null);
    }
  };

  const doSummarize = async () => {
    if (!messages || messages.length === 0) return;
    setAiBusy("summarize");
    setAiError(null);
    setAiPanel(null);
    try {
      const res = (await aiSummarize({
        messages: messages
          .filter((m) => plaintexts.has(m._id))
          .map((m) => ({
            sender: memberHandle(m.senderId),
            body: plaintexts.get(m._id) ?? "",
            mine: m.senderId === me.userId,
          })),
      })) as { summary: string };
      setAiPanel(`📜 Summary:\n${res.summary}`);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAiBusy(null);
    }
  };

  const doDraft = async () => {
    if (!draftInstruction.trim()) return;
    setAiBusy("draft");
    setAiError(null);
    try {
      const context = messages
        ?.slice(-8)
        .map((m) => `${memberHandle(m.senderId)}: ${plaintexts.get(m._id) ?? ""}`)
        .join("\n");
      const res = (await aiDraft({
        instruction: draftInstruction,
        context: context || undefined,
      })) as { draft: string };
      setDraftResult(res.draft);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI request failed");
    } finally {
      setAiBusy(null);
    }
  };

  // Decrypt messages as they arrive.
  useEffect(() => {
    if (!convKey || !messages) return;
    let cancelled = false;
    (async () => {
      const next = new Map(plaintexts);
      for (const m of messages) {
        if (cancelled || next.has(m._id)) continue;
        try {
          next.set(m._id, await decryptMessage(convKey, m.ciphertext, m.iv));
        } catch {
          next.set(m._id, "[unable to decrypt]");
        }
      }
      if (!cancelled) setPlaintexts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [convKey, messages, plaintexts]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [plaintexts.size, messages?.length]);

  // Privacy-focused notifications: only when the tab is hidden, and the
  // notification body never contains plaintext — just a count.
  const lastSeenCount = useRef(0);
  useEffect(() => {
    if (!messages) return;
    const count = messages.length;
    const prev = lastSeenCount.current;
    lastSeenCount.current = count;
    if (
      count > prev &&
      prev > 0 &&
      document.visibilityState === "hidden" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const n = count - prev;
      new Notification("GhostChat", {
        body: `${n} new encrypted message${n > 1 ? "s" : ""}`,
        tag: `ghostchat-${conv._id}`,
      });
    }
  }, [messages?.length, conv._id]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || !convKey || busy) return;
    setBusy(true);
    try {
      const { ciphertext, iv } = await encryptMessage(convKey, body);
      const ms = DISAPPEARING_OPTIONS.find((o) => o.value === disappearing)?.ms;
      const expiresAt = ms ? Date.now() + ms : undefined;
      if (replyTo) {
        await sendReply({
          conversationId: conv._id,
          replyToId: replyTo._id,
          ciphertext,
          iv,
          expiresAt,
        });
        setReplyTo(null);
      } else {
        await send({ conversationId: conv._id, ciphertext, iv, expiresAt });
      }
      setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className={appMode ? "" : "md:hidden"}
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Ghost className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{other?.handle ?? "group"}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3" /> end-to-end encrypted
        </span>
        {other && (
          <MessageActionsMenu other={other} />
        )}
      </header>

      {aiOn && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/40 px-4 py-1.5">
          <span className="mr-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Sparkles className="size-3" /> AI
          </span>
          {lastIncomingText && (
            <button
              type="button"
              onClick={() => void genSuggestions()}
              disabled={aiBusy !== null}
              className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] transition-colors hover:bg-accent/40 disabled:opacity-50"
            >
              {aiBusy === "replies" ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
              Replies
            </button>
          )}
          <button
            type="button"
            onClick={() => setTranslateOpen((v) => !v)}
            disabled={aiBusy !== null || !lastMessageAnyText}
            className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] transition-colors hover:bg-accent/40 disabled:opacity-50"
          >
            <Languages className="size-3" /> Translate
          </button>
          <button
            type="button"
            onClick={() => void doSummarize()}
            disabled={aiBusy !== null || !messages?.length}
            className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] transition-colors hover:bg-accent/40 disabled:opacity-50"
          >
            {aiBusy === "summarize" ? <Loader2 className="size-3 animate-spin" /> : <ScrollText className="size-3" />}
            Summarize
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftOpen(true);
              setDraftResult(null);
            }}
            className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] transition-colors hover:bg-accent/40"
          >
            <Sparkles className="size-3" /> Draft
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!convKey && (
          <p className="text-center text-sm text-muted-foreground">
            Decrypting conversation key…
          </p>
        )}
        {messages?.map((m) => {
          const mine = m.senderId === me.userId;
          const body = plaintexts.get(m._id) ?? "…";
          const parent = m.replyToId
            ? messages.find((p) => p._id === m.replyToId)
            : null;
          return (
            <div key={m._id} className={`mb-2 flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-3.5 py-2 text-sm ${
                  mine
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm bg-muted text-foreground"
                }`}
              >
                {parent && (
                  <div
                    className={`mb-1.5 border-l-2 pl-2 text-[11px] opacity-70 ${
                      mine ? "border-primary-foreground/40" : "border-foreground/30"
                    }`}
                  >
                    <span className="font-medium">{memberHandle(parent.senderId)}</span>
                    <span className="opacity-80">: {plaintexts.get(parent._id) ?? "…"}</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{body}</p>
                {(m.reactions) && Object.keys(m.reactions).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Object.entries(m.reactions).map(([emoji, userIds]) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => toggleReaction({ messageId: m._id, emoji })}
                        className={`rounded-full border px-1.5 py-0.5 text-[11px] transition-colors ${
                          userIds.includes(me.userId)
                            ? "border-primary/60 bg-primary/10"
                            : "border-border/60 hover:bg-accent/40"
                        }`}
                        title={userIds.map((id) => memberHandle(id)).join(", ")}
                      >
                        {emoji} {userIds.length}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  className={`mt-1 flex items-center gap-1 text-[10px] ${
                    mine ? "text-primary-foreground/60" : "text-muted-foreground"
                  }`}
                >
                  {timeAgo(m.createdAt)}
                  {m.expiresAt && <Timer className="size-3" />}
                  <button
                    type="button"
                    className="opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
                    onClick={() => setReplyTo(m)}
                    title="Reply"
                  >
                    ↩
                  </button>
                  {['👍', '❤️', '😂', '😮', '😢'].map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="opacity-0 transition-opacity hover:opacity-100 focus:opacity-100"
                      onClick={() => toggleReaction({ messageId: m._id, emoji: e })}
                      title={`React ${e}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {(aiPanel || aiError || (aiOn && aiSuggestions.length > 0)) && (
        <div className="border-t border-border/40 bg-muted/40 px-4 py-2">
          {aiError && <p className="text-xs text-destructive">⚠ {aiError}</p>}
          {aiPanel && (
            <div className="flex items-start gap-2">
              <p className="flex-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{aiPanel}</p>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setAiPanel(null)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
          {aiSuggestions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {aiSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setText(s);
                    setAiSuggestions([]);
                  }}
                  className="max-w-full truncate rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] transition-colors hover:bg-primary/20"
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setAiSuggestions([])}
                aria-label="Dismiss suggestions"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {aiOn && translateOpen && (
        <div className="flex items-center gap-2 border-t border-border/40 bg-muted/40 px-4 py-2">
          <Select value={translateLang} onValueChange={setTranslateLang}>
            <SelectTrigger className="h-7 w-[150px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {"English,Swedish,Spanish,French,German,Portuguese,Arabic,Chinese,Japanese,Russian"
                .split(",")
                .map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => void doTranslate()} disabled={aiBusy !== null}>
            {aiBusy === "translate" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Translate last message
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setTranslateOpen(false)}>
            ✕
          </Button>
        </div>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 border-t border-border/40 bg-muted/40 px-4 py-1.5 text-xs">
          <span className="text-muted-foreground">
            ↩ Replying to <span className="font-medium">{memberHandle(replyTo.senderId)}</span>
          </span>
          <span className="flex-1 truncate text-muted-foreground/70">
            {plaintexts.get(replyTo._id) ?? "…"}
          </span>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setReplyTo(null)}>
            ✕
          </button>
        </div>
      )}
      {aiOn && (
        <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-muted-foreground" /> AI draft
              </DialogTitle>
              <DialogDescription>
                Describe what you want to say — AI writes it, you review and send.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={draftInstruction}
              onChange={(e) => setDraftInstruction(e.target.value)}
              placeholder="e.g. politely postpone tomorrow's meeting"
            />
            {draftResult && (
              <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-2 text-xs">
                {draftResult}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void doDraft()}
                disabled={aiBusy === "draft" || !draftInstruction.trim()}
              >
                {aiBusy === "draft" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Generate
              </Button>
              <Button
                size="sm"
                disabled={!draftResult}
                onClick={() => {
                  setText(draftResult ?? "");
                  setDraftOpen(false);
                }}
              >
                <Send className="size-4" /> Use draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <footer className="flex items-center gap-2 border-t border-border/60 px-4 py-3">
        <Select value={disappearing} onValueChange={setDisappearing}>
          <SelectTrigger
            className="w-10 shrink-0 md:w-[130px]"
            size="sm"
            title="Disappearing messages"
          >
            <Timer className="size-3.5 shrink-0" />
            <SelectValue className="hidden md:inline" />
          </SelectTrigger>
          <SelectContent>
            {DISAPPEARING_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={convKey ? "Write a sealed message…" : "Decrypting…"}
          disabled={!convKey}
          className="min-w-0 flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!convKey || busy || !text.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// New conversation — find a handle, wrap a fresh key for each member
// ---------------------------------------------------------------------------

function NewConversationDialog({
  me,
  privateKeyJwk,
  onCreated,
}: {
  me: Identity;
  privateKeyJwk: string;
  onCreated: (id: Id<"conversations">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findByHandle = useQuery(
    api.chat.findByHandle,
    open && handle.trim().length > 1 ? { handle: handle.trim() } : "skip",
  );
  const createConversation = useMutation(api.chat.createConversation);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const peer = findByHandle;
      if (!peer || !peer.hasIdentity || !peer.handle) {
        throw new Error("No ghost identity found for that handle.");
      }
      if (peer.userId === me.userId) {
        throw new Error("That's your own handle.");
      }
      const raw = generateConversationKey();
      // Wrap the conversation key for the peer (ECDH my-priv x peer-pub) and
      // for myself (ECDH my-priv x my-pub) so both sides can unwrap it.
      const forPeer = await wrapConversationKey(raw, privateKeyJwk, peer.publicKeyJwk);
      const forMe = await wrapConversationKey(raw, privateKeyJwk, me.publicKeyJwk);
      const members = [
        { userId: me.userId as Id<"users">, handle: me.handle, publicKeyJwk: me.publicKeyJwk },
        { userId: peer.userId as Id<"users">, handle: peer.handle, publicKeyJwk: peer.publicKeyJwk },
      ];
      const convId = await createConversation({
        members,
        keyEnvelopes: [
          { userId: peer.userId as Id<"users">, iv: forPeer.iv, wrappedKey: forPeer.wrappedKey },
          { userId: me.userId as Id<"users">, iv: forMe.iv, wrappedKey: forMe.wrappedKey },
        ],
      });
      setOpen(false);
      setHandle("");
      onCreated(convId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create conversation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="New conversation">
          <UserPlus className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Enter the ghost handle of the person you want to talk to.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="ghost-7f3a9c"
        />
        {findByHandle && (
          <p className="text-sm text-muted-foreground">
            {findByHandle.hasIdentity
              ? `Found: ${findByHandle.handle}`
              : "That handle exists but has no identity yet."}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            onClick={handleCreate}
            disabled={busy || !findByHandle?.hasIdentity}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Start chatting
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Message actions — block & report (privacy & safety)
// ---------------------------------------------------------------------------

function MessageActionsMenu({ other }: { other: Member }) {
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const block = useMutation(api.chat.blockHandle);
  const report = useMutation(api.chat.reportHandle);

  const handleBlock = async () => {
    setBusy(true);
    try {
      await block({ handle: other.handle });
      setDone("blocked");
      setOpen(false);
    } catch (e) {
      setDone(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await report({ handle: other.handle, reason: reason.trim() });
      setDone("reported");
      setReporting(false);
      setReason("");
      setOpen(false);
    } catch (e) {
      setDone(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Block / report">
          <MoreVertical className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        {reporting ? (
          <>
            <DialogHeader>
              <DialogTitle>Report {other.handle}</DialogTitle>
              <DialogDescription>
                Tell us what is wrong. The report is stored server-side; the
                message content stays encrypted.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (spam, harassment…)"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setReporting(false)}>
                Back
              </Button>
              <Button onClick={handleReport} disabled={busy || !reason.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldAlert className="size-4" />}
                Send report
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{other.handle}</DialogTitle>
              <DialogDescription>
                Privacy &amp; safety actions for this contact.
              </DialogDescription>
            </DialogHeader>
            {done && <p className="text-sm text-muted-foreground">{done}.</p>}
            <DialogFooter className="flex-col gap-2">
              <Button variant="destructive" className="w-full" onClick={handleBlock} disabled={busy}>
                <ShieldAlert className="size-4" /> Block {other.handle}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setReporting(true)} disabled={busy}>
                Report {other.handle}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
