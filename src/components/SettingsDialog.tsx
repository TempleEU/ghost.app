import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { publicKeyFingerprint } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertTriangle,
  Check,
  Copy,
  Fingerprint,
  Ghost,
  Globe,
  HardDriveDownload,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Moon,
  Pencil,
  Plus,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { useAppMode } from "@/hooks/use-app-mode";
import { parseKeyBlob, type ParsedVpnKey } from "@/lib/vpn-keys";
import {
  Server,
  ServerCog,
  MessageSquare,
  Phone,
  LayoutGrid,
  EyeOff,
  BadgeCheck,
  ShieldOff,
  Camera,
  Mic,
  MapPin,
  Users,
  Bell,
} from "lucide-react";

type DeviceInfo = {
  _id: string;
  label: string;
  keyFingerprint: string;
  firstSeenAt: number;
  lastSeenAt: number;
  revoked: boolean;
};

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Menu > Settings — profile & avatar, message storage, security alerts,
 * and key verification for end-to-end encrypted chats.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  handle,
  publicKeyJwk,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handle: string;
  publicKeyJwk: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ghost className="size-4 text-muted-foreground" /> Settings
          </DialogTitle>
          <DialogDescription>
            Signed in as {handle}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="profile">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="flex-1 gap-1.5">
              <UserRound className="size-3.5" /> Profile
            </TabsTrigger>
            <TabsTrigger value="display" className="flex-1 gap-1.5">
              <Sun className="size-3.5" /> Display
            </TabsTrigger>
            <TabsTrigger value="storage" className="flex-1 gap-1.5">
              <HardDriveDownload className="size-3.5" /> Storage
            </TabsTrigger>
            <TabsTrigger value="security" className="flex-1 gap-1.5">
              <ShieldCheck className="size-3.5" /> Security
            </TabsTrigger>
            <TabsTrigger value="keys" className="flex-1 gap-1.5">
              <Fingerprint className="size-3.5" /> Keys
            </TabsTrigger>
            <TabsTrigger value="vpn" className="flex-1 gap-1.5">
              <Globe className="size-3.5" /> GhostVPN
            </TabsTrigger>
            <TabsTrigger value="serverhub" className="flex-1 gap-1.5">
              <ServerCog className="size-3.5" /> Hub
            </TabsTrigger>
            <TabsTrigger value="smsgw" className="flex-1 gap-1.5">
              <MessageSquare className="size-3.5" /> SMS
            </TabsTrigger>
            <TabsTrigger value="phone" className="flex-1 gap-1.5">
              <Phone className="size-3.5" /> Phone
            </TabsTrigger>
            <TabsTrigger value="apps" className="flex-1 gap-1.5">
              <LayoutGrid className="size-3.5" /> Apps
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex-1 gap-1.5">
              <EyeOff className="size-3.5" /> Privacy
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <ProfileTab />
          </TabsContent>
          <TabsContent value="display">
            <DisplayTab />
          </TabsContent>
          <TabsContent value="storage">
            <StorageTab />
          </TabsContent>
          <TabsContent value="security">
            <SecurityTab myPublicKeyJwk={publicKeyJwk} />
          </TabsContent>
          <TabsContent value="keys">
            <VerifyKeysTab myHandle={handle} myPublicKeyJwk={publicKeyJwk} />
          </TabsContent>
          <TabsContent value="vpn">
            <GhostVpnTab />
          </TabsContent>
          <TabsContent value="serverhub">
            <ServerHubTab />
          </TabsContent>
          <TabsContent value="smsgw">
            <SmsGatewayTab />
          </TabsContent>
          <TabsContent value="phone">
            <PhoneTab />
          </TabsContent>
          <TabsContent value="apps">
            <AppsPermissionsTab />
          </TabsContent>
          <TabsContent value="privacy">
            <PrivacyManagerTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Profile — display name + attachable avatar
// ---------------------------------------------------------------------------

function ProfileTab() {
  const user = useQuery(api.users.currentUser);
  const update = useMutation(api.settings.updateProfile);
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (user && !loaded.current) {
      loaded.current = true;
      setDisplayName(user.displayName ?? user.handle ?? "");
      setAvatar(user.avatar ?? null);
    }
  }, [user]);

  // Attach avatar: downscale to 96x96 and store as a small data URL.
  const handleAvatarFile = (file: File) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const side = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          96,
          96,
        );
        setAvatar(canvas.toDataURL("image/jpeg", 0.8));
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const handleSave = async () => {
    setBusy(true);
    setSaved(false);
    try {
      await update({
        displayName: displayName.trim() || undefined,
        avatar: avatar ?? undefined,
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border/60 hover:opacity-80"
          onClick={() => fileRef.current?.click()}
          title="Attach avatar"
        >
          {avatar ? (
            <img src={avatar} alt="avatar" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center bg-muted">
              <Upload className="size-5 text-muted-foreground" />
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleAvatarFile(f);
          }}
        />
        <div className="flex-1">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others see you"
          />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {saved ? "Saved." : "Avatar is stored as a small 96×96 image."}
        </p>
        <Button size="sm" onClick={handleSave} disabled={busy}>
          {busy && <Loader2 className="size-3.5 animate-spin" />} Save
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display & Brightness — Dark Mode on/off + App Mode switch
// ---------------------------------------------------------------------------

function DisplayTab() {
  const { theme, setTheme } = useTheme();
  const { appMode, setAppMode } = useAppMode();
  const update = useMutation(api.settings.setDisplaySettings);

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "Auto", icon: Smartphone },
  ];

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Dark Mode — Settings > Display & Brightness */}
      <div className="rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Appearance</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Enable Dark Mode in GhostChat, or follow your system setting.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTheme(value);
                void update({ theme: value });
              }}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors ${
                theme === value
                  ? "border-foreground/40 bg-accent font-medium"
                  : "border-border/60 hover:bg-accent/50"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* App Mode — on/off switch (not desktop-view-only) */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">App Mode</p>
          <p className="text-xs leading-5 text-muted-foreground">
            When on, GhostChat runs in a compact phone-style app frame. When
            off, you get the full desktop layout.
          </p>
        </div>
        <Switch
          checked={appMode}
          onCheckedChange={(v) => {
            setAppMode(v);
            void update({ appMode: v });
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message storage — Secure storage toggle
// ---------------------------------------------------------------------------

function StorageTab() {
  const user = useQuery(api.users.currentUser);
  const setToggle = useMutation(api.settings.setSecureStorage);
  const enabled = user?.secureStorage ?? true;
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">Secure storage</p>
          <p className="text-xs leading-5 text-muted-foreground">
            When on, your end-to-end encrypted chats are backed up to the
            cloud (ciphertext only). When off, history is stored locally on
            this device only.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy || user === undefined}
          onCheckedChange={async (v) => {
            setBusy(true);
            try {
              await setToggle({ enabled: v });
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Encryption is always on — this toggle only controls whether encrypted
        history is backed up or kept local.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security alerts — device log + logout, and key verification
// ---------------------------------------------------------------------------

function SecurityTab({ myPublicKeyJwk }: { myPublicKeyJwk: string }) {
  const devices = useQuery(api.settings.listDevices) as DeviceInfo[] | undefined;
  const revoke = useMutation(api.settings.revokeDevice);
  const [myFp, setMyFp] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    publicKeyFingerprint(myPublicKeyJwk).then(setMyFp);
  }, [myPublicKeyJwk]);

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Verify keys */}
      <div className="rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Verify keys</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Compare your key fingerprint with your contact out-of-band (in
          person or another channel). Matching values confirm nobody swapped
          the keys in transit.
        </p>
        <code className="mt-2 block rounded bg-muted px-2 py-1.5 font-mono text-xs tracking-wider">
          {myFp || "…"}
        </code>
      </div>

      {/* Security alerts — logged-in devices */}
      <div className="rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Security alerts</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Devices currently logged into your end-to-end encrypted chats. Log
          out anything unfamiliar.
        </p>
        <div className="mt-2 flex flex-col gap-1.5">
          {devices === undefined && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          {devices?.length === 0 && (
            <p className="text-xs text-muted-foreground">No devices yet.</p>
          )}
          {devices?.map((d) => (
            <div
              key={d._id}
              className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate text-xs font-medium">
                  {d.revoked && (
                    <AlertTriangle className="size-3 text-destructive" />
                  )}
                  {d.label}
                  {d.keyFingerprint === myFp && (
                    <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                      this device
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  active {timeAgo(d.lastSeenAt)} · key {d.keyFingerprint.slice(0, 5)}…
                </p>
              </div>
              {!d.revoked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 text-xs"
                  disabled={busyId === d._id}
                  onClick={async () => {
                    setBusyId(d._id);
                    try {
                      await revoke({ deviceId: d._id as never });
                    } finally {
                      setBusyId(null);
                    }
                  }}
                >
                  <LogOut className="size-3" /> Log out
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verify keys — per-contact encryption fingerprint check
// ---------------------------------------------------------------------------

function VerifyKeysTab({
  myHandle,
  myPublicKeyJwk,
}: {
  myHandle: string;
  myPublicKeyJwk: string;
}) {
  const conversations = useQuery(api.chat.listConversations) as
    | { members: { userId: string; handle: string; publicKeyJwk: string }[] }[]
    | undefined;
  const [myFp, setMyFp] = useState("");
  const [rows, setRows] = useState<{ handle: string; fp: string; mine: boolean }[]>([]);

  useEffect(() => {
    let cancelled = false;
    publicKeyFingerprint(myPublicKeyJwk).then((fp) => {
      if (!cancelled) setMyFp(fp);
    });
    return () => {
      cancelled = true;
    };
  }, [myPublicKeyJwk]);

  useEffect(() => {
    if (!conversations) return;
    let cancelled = false;
    (async () => {
      const seen = new Set<string>();
      const next: { handle: string; fp: string; mine: boolean }[] = [];
      for (const conv of conversations) {
        for (const m of conv.members) {
          if (seen.has(m.userId)) continue;
          seen.add(m.userId);
          const fp = await publicKeyFingerprint(m.publicKeyJwk);
          if (!cancelled) {
            next.push({ handle: m.handle, fp, mine: m.publicKeyJwk === myPublicKeyJwk });
          }
        }
      }
      if (!cancelled) setRows(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversations, myPublicKeyJwk]);

  return (
    <div className="flex flex-col gap-2 py-2">
      <p className="text-xs leading-5 text-muted-foreground">
        Encryption keys used in your chats. Compare fingerprints with your
        contacts out-of-band (in person or another channel) to confirm nobody
        swapped the keys in transit.
      </p>
      <div className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Fingerprint className="size-3 text-muted-foreground" /> {myHandle}
          <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">you</span>
        </span>
        <code className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground">
          {myFp || "…"}
        </code>
      </div>
      {rows.map((r) => (
        <div
          key={r.handle + r.fp}
          className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5"
        >
          <span className="flex items-center gap-1.5 truncate text-xs font-medium">
            <Ghost className="size-3 text-muted-foreground" /> {r.handle}
          </span>
          <code className="shrink-0 font-mono text-[10px] tracking-wider text-muted-foreground">
            {r.fp}
          </code>
        </div>
      ))}
      {conversations?.length === 0 && (
        <p className="text-xs text-muted-foreground">No conversations yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GhostVPN — connection management UI
//
// NOTE: This is a settings/connection-management UI, not a real VPN tunnel.
// A browser app cannot open a system-level WireGuard/OpenVPN tunnel — that
// requires a native client (Android/iOS/Windows). The toggle, server list,
// kill switch, protocol and API settings below manage the *configuration*
// that a native GhostVPN client would consume via the private API endpoint.
// ---------------------------------------------------------------------------

const VPN_SERVERS = [
  { id: "auto", label: "Fastest available (auto)", country: "Auto" },
  { id: "us-east", label: "US East · Ashburn", country: "US" },
  { id: "us-west", label: "US West · Los Angeles", country: "US" },
  { id: "eu-de", label: "Europe · Frankfurt", country: "DE" },
  { id: "eu-nl", label: "Europe · Amsterdam", country: "NL" },
  { id: "eu-uk", label: "Europe · London", country: "UK" },
  { id: "sa-br", label: "South America · São Paulo", country: "BR" },
  { id: "ap-jp", label: "Asia Pacific · Tokyo", country: "JP" },
  { id: "ap-sg", label: "Asia Pacific · Singapore", country: "SG" },
];

const VPN_PROTOCOLS = [
  { id: "wireguard", label: "WireGuard (recommended)" },
  { id: "openvpn", label: "OpenVPN (UDP)" },
  { id: "ikev2", label: "IKEv2/IPsec" },
];

type VpnConnState = "disconnected" | "connecting" | "connected";

function GhostVpnTab() {
  const user = useQuery(api.users.currentUser);
  const setVpn = useMutation(api.settings.setVpnSettings);
  const [busy, setBusy] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [apiSaved, setApiSaved] = useState(false);
  const loaded = useRef(false);

  // Connection lifecycle — simulates the handshake a native client performs
  // against the configured endpoint (no real tunnel in a browser app).
  const [connState, setConnState] = useState<VpnConnState>("disconnected");
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (user && !loaded.current) {
      loaded.current = true;
      setApiUrl(user.vpnPrivateApiUrl ?? "");
    }
  }, [user]);

  useEffect(() => {
    if (connState !== "connected" || connectedAt === null) return;
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - connectedAt) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [connState, connectedAt]);

  const enabled = user?.vpnEnabled ?? false;
  const killSwitch = user?.vpnKillSwitch ?? false;
  const autoConnect = user?.vpnAutoConnect ?? false;
  const protocol = user?.vpnProtocol ?? "wireguard";
  const mode = user?.vpnMode ?? "fastest";
  const server = user?.vpnServer ?? "auto";

  const patch = async (p: Record<string, unknown>) => {
    setBusy(true);
    try {
      await setVpn(p);
    } finally {
      setBusy(false);
    }
  };

  const connect = () => {
    setConnState("connecting");
    // Simulated handshake — a native client would negotiate the tunnel here.
    setTimeout(() => {
      setConnState("connected");
      setConnectedAt(Date.now());
      setElapsed(0);
    }, 1200);
  };

  const disconnect = () => {
    setConnState("disconnected");
    setConnectedAt(null);
    setElapsed(0);
  };

  const toggleService = (v: boolean) => {
    void patch({ enabled: v });
    if (!v && connState !== "disconnected") disconnect();
  };

  const serverLabel =
    mode === "fastest"
      ? "Fastest available"
      : VPN_SERVERS.find((s) => s.id === server)?.label ?? server;

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* Connection status card */}
      <div className="rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span
                className={`inline-block size-2 rounded-full ${
                  connState === "connected"
                    ? "bg-emerald-500"
                    : connState === "connecting"
                      ? "animate-pulse bg-amber-500"
                      : "bg-muted-foreground/40"
                }`}
              />
              {connState === "connected"
                ? `Connected · ${serverLabel}`
                : connState === "connecting"
                  ? "Connecting…"
                  : "Disconnected"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {connState === "connected"
                ? `Session ${Math.floor(elapsed / 60)}m ${elapsed % 60}s · ${protocol}`
                : "Settings/connection management — a native client performs the actual tunnel."}
            </p>
          </div>
          {connState === "connected" ? (
            <Button size="sm" variant="outline" onClick={disconnect}>
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={connState === "connecting" || !enabled || busy}
              onClick={connect}
            >
              {connState === "connecting" && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* Service toggle */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
        <div>
          <p className="text-sm font-medium">GhostVPN Service</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Route GhostChat traffic through an encrypted tunnel. No time,
            traffic or bandwidth limits.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy || user === undefined}
          onCheckedChange={toggleService}
        />
      </div>

      {/* Server selection */}
      <div className="flex flex-col gap-2">
        <Label>Server selection</Label>
        <Select
          value={mode === "fastest" ? "fastest" : server}
          onValueChange={(v) =>
            patch(v === "fastest" ? { mode: "fastest", server: "auto" } : { mode: "manual", server: v })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a server" />
          </SelectTrigger>
          <SelectContent>
            {VPN_SERVERS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {enabled && mode === "fastest" && (
          <p className="text-xs text-muted-foreground">
            ⚡ Fastest-server mode: connects to the lowest-latency server.
          </p>
        )}
      </div>

      {/* Protocol */}
      <div className="flex flex-col gap-2">
        <Label>Tunnel protocol</Label>
        <Select
          value={protocol}
          onValueChange={(v) => patch({ protocol: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VPN_PROTOCOLS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Kill switch & auto-connect */}
      <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Kill switch</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Block all traffic if the tunnel drops, so your real IP never
              leaks.
            </p>
          </div>
          <Switch
            checked={killSwitch}
            disabled={busy || user === undefined}
            onCheckedChange={(v) => patch({ killSwitch: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Auto-connect</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Connect automatically when GhostChat starts.
            </p>
          </div>
          <Switch
            checked={autoConnect}
            disabled={busy || user === undefined}
            onCheckedChange={(v) => patch({ autoConnect: v })}
          />
        </div>
      </div>

      {/* Access keys — real Outline/VLESS/VMess keys */}
      <VpnAccessKeys />

      {/* Private VPN API */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Private VPN API (optional)</p>
        <p className="text-xs leading-5 text-muted-foreground">
          Point GhostVPN at your own VPN provider's API endpoint (e.g. a
          self-hosted WireGuard/OpenVPN manager). Leave empty to use the
          built-in server list.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={apiUrl}
            onChange={(e) => {
              setApiUrl(e.target.value);
              setApiSaved(false);
            }}
            placeholder="https://vpn.example.com/api"
          />
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              await patch({ privateApiUrl: apiUrl.trim() || undefined });
              setApiSaved(true);
            }}
          >
            Apply
          </Button>
        </div>
        {apiSaved && <p className="text-xs text-muted-foreground">Saved.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deployment guide — from zero to a live Outline server
// ---------------------------------------------------------------------------

const OUTLINE_INSTALL_CMD = "sudo bash -c \"$(wget -qO- https://raw.githubusercontent.com/Jigsaw-Code/outline-releases/master/server/install.sh)\"";

function DeploymentGuide() {
  const [copied, setCopied] = useState(false);

  return (
    <details className="rounded-lg border border-border/60 p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Don't have a server yet? Deploy one (~10 min)
      </summary>
      <ol className="mt-2 flex list-decimal flex-col gap-2 pl-4 text-xs leading-5 text-muted-foreground">
        <li>
          Get any Linux box: a free-tier VPS (Oracle Cloud always-free, Google
          Cloud free tier) or a ~$5 droplet (DigitalOcean, Hetzner).
        </li>
        <li>
          SSH in and run the official Outline install script:
          <div className="mt-1 flex items-start gap-1.5">
            <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 font-mono text-[10px]">
              {OUTLINE_INSTALL_CMD}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              title="Copy install command"
              onClick={async () => {
                await navigator.clipboard.writeText(OUTLINE_INSTALL_CMD);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
            </Button>
          </div>
        </li>
        <li>
          The script prints a JSON block with{' '}
          <code className="rounded bg-muted px-1 font-mono text-[10px]">apiUrl</code> and{' '}
          <code className="rounded bg-muted px-1 font-mono text-[10px]">certSha256</code>{' '}
          — paste both into the form below, then Test &amp; save.
        </li>
        <li>
          Install the Outline client on the device that will tunnel
          (getoutline.org/get-started) — GhostChat creates the keys, the
          client opens the tunnel.
        </li>
      </ol>
    </details>
  );
}

// ---------------------------------------------------------------------------
// GhostVPN Access Keys — import, validate, store and launch real Outline /
// Shadowsocks / VLESS / VMess keys. The OS client (Outline, v2rayNG,
// v2rayN, Shadowrocket) opens the tunnel; GhostChat manages the keys.
// ---------------------------------------------------------------------------

type VpnKeyRow = {
  _id: string;
  kind: string;
  name: string;
  host: string;
  port: number;
  method?: string;
  raw: string;
  source?: string;
  createdAt: number;
};

function VpnAccessKeys() {
  const keys = useQuery(api.vpn.listKeys) as VpnKeyRow[] | undefined;
  const addKey = useMutation(api.vpn.addKey);
  const removeKey = useMutation(api.vpn.removeKey);
  const fetchSub = useAction(api.vpn.fetchSubscription);

  const [importOpen, setImportOpen] = useState(false);
  const [subUrl, setSubUrl] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const importKeys = async (parsed: ParsedVpnKey[], source: string) => {
    if (parsed.length === 0) {
      setError("No valid keys found. Supported: ss://, vless://, vmess:// (one per line or a base64 subscription body).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const k of parsed) {
        await addKey({
          kind: k.kind,
          name: k.name,
          host: k.host,
          port: k.port,
          method: k.method,
          raw: k.raw,
          source,
        });
      }
      setPasteText("");
      setSubUrl("");
      setImportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const handlePasteImport = () => importKeys(parseKeyBlob(pasteText), "paste");

  const handleSubImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = await fetchSub({ url: subUrl.trim() });
      await importKeys(parseKeyBlob(body), subUrl.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Subscription fetch failed");
      setBusy(false);
    }
  };

  const handleCopy = async (k: VpnKeyRow) => {
    await navigator.clipboard.writeText(k.raw);
    setCopiedId(k._id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Access keys</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Outline / Shadowsocks / VLESS / VMess keys. Tap a key to open it in
            the Outline or v2ray client — the client establishes the tunnel.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setImportOpen(true)}>
          <Plus className="size-3.5" /> Import
        </Button>
      </div>

      {keys === undefined && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      )}
      {keys?.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No keys yet. Paste ss:// / vless:// / vmess:// keys or a subscription
          URL (e.g. a GitHub vpn-keys list raw URL).
        </p>
      )}
      {keys?.map((k) => (
        <div
          key={k._id}
          className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-xs font-medium">
              <KeyRound className="size-3 shrink-0 text-muted-foreground" />
              {k.name}
              <span className="rounded bg-muted px-1 text-[10px] uppercase text-muted-foreground">
                {k.kind}
              </span>
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {k.host}:{k.port}
              {k.method ? ` · ${k.method}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Copy key URI"
              onClick={() => handleCopy(k)}
            >
              {copiedId === k._id ? (
                <Check className="size-3 text-emerald-600" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
            <a href={k.raw} title="Open in client">
              <Button variant="ghost" size="icon" className="size-7">
                <Link2 className="size-3" />
              </Button>
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Delete key"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await removeKey({ keyId: k._id as never });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
      ))}

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import access keys</DialogTitle>
            <DialogDescription>
              Paste keys (one per line) or a subscription URL. Base64
              subscription bodies are decoded automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vpnSubUrl">Subscription URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="vpnSubUrl"
                  value={subUrl}
                  onChange={(e) => setSubUrl(e.target.value)}
                  placeholder="https://raw.githubusercontent.com/…/keys.txt"
                />
                <Button
                  size="sm"
                  disabled={busy || !subUrl.trim()}
                  onClick={handleSubImport}
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                  Fetch
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vpnPaste">Or paste keys</Label>
              <textarea
                id="vpnPaste"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"ss://…\nvless://…\nvmess://…"}
                className="min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={handlePasteImport} disabled={busy || !pasteText.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Import keys
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GhostVPN Server Hub — connect your own Outline server, then create, list,
// rename and delete real access keys straight from GhostChat. Keys land in
// the Access Keys list and tunnel via the Outline client.
// ---------------------------------------------------------------------------

type OutlineServerKey = {
  id: string;
  name: string;
  port: number;
  method: string;
  accessUrl: string;
};

function ServerHubTab() {
  const server = useQuery(api.vpnServerSettings.getServer) as
    | { apiUrl: string; certSha256: string; name: string; verified: boolean }
    | null
    | undefined;
  const saveServer = useMutation(api.vpnServerSettings.saveServer);
  const clearServer = useMutation(api.vpnServerSettings.clearServer);
  const testConn = useAction(api.vpnServer.testConnection);
  const listKeys = useAction(api.vpnServer.listServerKeys);
  const createKey = useAction(api.vpnServer.createServerKey);
  const renameKey = useAction(api.vpnServer.renameServerKey);
  const deleteKey = useAction(api.vpnServer.deleteServerKey);

  const [apiUrl, setApiUrl] = useState("");
  const [certSha256, setCertSha256] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [serverKeys, setServerKeys] = useState<OutlineServerKey[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (server && !loaded.current) {
      loaded.current = true;
      setApiUrl(server.apiUrl);
      setCertSha256(server.certSha256);
    }
  }, [server]);

  const handleTest = async () => {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await testConn({ apiUrl: apiUrl.trim(), certSha256: certSha256.trim() });
      setTestResult(`Connected to "${res.name}" · ${res.keyCount} key(s)`);
      await saveServer({
        apiUrl: apiUrl.trim(),
        certSha256: certSha256.trim(),
        name: res.name,
        verified: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setBusy(false);
    }
  };

  const handleListKeys = async () => {
    if (!server) return;
    setBusy(true);
    setError(null);
    try {
      setServerKeys(await listKeys({ apiUrl: server.apiUrl, certSha256: server.certSha256 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to list keys");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateKey = async () => {
    if (!server) return;
    setBusy(true);
    setError(null);
    try {
      await createKey({
        apiUrl: server.apiUrl,
        certSha256: server.certSha256,
        name: newKeyName.trim() || "GhostChat key",
      });
      setNewKeyName("");
      setServerKeys(await listKeys({ apiUrl: server.apiUrl, certSha256: server.certSha256 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteKey = async (k: OutlineServerKey) => {
    if (!server) return;
    setBusy(true);
    setError(null);
    try {
      await deleteKey({ apiUrl: server.apiUrl, certSha256: server.certSha256, keyId: k.id });
      setServerKeys(await listKeys({ apiUrl: server.apiUrl, certSha256: server.certSha256 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete key");
    } finally {
      setBusy(false);
    }
  };

  const handleRenameKey = async (k: OutlineServerKey) => {
    if (!server) return;
    const name = window.prompt("New name", k.name);
    if (!name || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await renameKey({
        apiUrl: server.apiUrl,
        certSha256: server.certSha256,
        keyId: k.id,
        name: name.trim(),
      });
      setServerKeys(await listKeys({ apiUrl: server.apiUrl, certSha256: server.certSha256 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-xs leading-5 text-muted-foreground">
        Connect your own Outline (Shadowsocks) server — deployed via
        vpnserverhub.com or self-hosted. GhostChat becomes your management
        hub: create, rename and revoke real VPN access keys. Keys tunnel via
        the Outline client.
      </p>

      <DeploymentGuide />

      {/* Connection form */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Outline server connection</p>
          {server?.verified && (
            <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
              <Check className="size-3" /> connected
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="outlineApiUrl">Management API URL</Label>
          <Input
            id="outlineApiUrl"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://1.2.3.4:1234/xxxxxxxx"
            className="font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="outlineCert">API certificate SHA-256</Label>
          <Input
            id="outlineCert"
            value={certSha256}
            onChange={(e) => setCertSha256(e.target.value)}
            placeholder="64-char hex fingerprint from Outline Manager"
            className="font-mono text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy || !apiUrl.trim() || !certSha256.trim()} onClick={handleTest}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            Test &amp; save
          </Button>
          {server && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                await clearServer();
                setServerKeys(null);
                setTestResult(null);
              }}
            >
              Disconnect
            </Button>
          )}
        </div>
        {testResult && <p className="text-xs text-emerald-600">{testResult}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs leading-5 text-muted-foreground">
          Both values come from Outline Manager ("Set up Outline Manager" →
          copy the API URL and cert fingerprint). The cert fingerprint pins
          the server's self-signed TLS certificate.
        </p>
      </div>

      {/* Key management — only when connected */}
      {server?.verified && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Access keys on {server.name}</p>
            <Button size="sm" variant="outline" className="gap-1" onClick={handleListKeys} disabled={busy}>
              <Globe className="size-3.5" /> Refresh
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="New key name (e.g. Phone, Laptop)"
            />
            <Button
              size="sm"
              disabled={busy}
              onClick={handleCreateKey}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Create
            </Button>
          </div>
          {serverKeys === null && (
            <p className="text-xs text-muted-foreground">Press Refresh to list keys on the server.</p>
          )}
          {serverKeys?.length === 0 && (
            <p className="text-xs text-muted-foreground">No keys on this server yet.</p>
          )}
          {serverKeys?.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{k.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  port {k.port} · {k.method}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Copy ss:// key"
                  onClick={async () => {
                    await navigator.clipboard.writeText(k.accessUrl);
                    setCopiedId(k.id);
                    setTimeout(() => setCopiedId(null), 1500);
                  }}
                >
                  {copiedId === k.id ? (
                    <Check className="size-3 text-emerald-600" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Rename"
                  disabled={busy}
                  onClick={() => handleRenameKey(k)}
                >
                  <Pencil className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Revoke key (deletes VPN access)"
                  disabled={busy}
                  onClick={() => handleDeleteKey(k)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            </div>
          ))}
          {serverKeys && serverKeys.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Created keys are imported into Access Keys automatically — open
              them in the Outline client to tunnel.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SMS Gateway — receive SMS from Android phones running
// react-native-sms-gateway (or any app POSTing the same JSON payload).
// Each device gets an API key; the phone POSTs to the GhostChat webhook.
// ---------------------------------------------------------------------------

type SmsDevice = {
  _id: string;
  label: string;
  apiKey: string;
  createdAt: number;
  lastSeenAt?: number;
  revoked?: boolean;
};

type SmsMsg = {
  _id: string;
  sender: string;
  body: string;
  phoneNumber?: string;
  deviceTimestamp?: number;
  receivedAt: number;
};

function SmsGatewayTab() {
  const devices = useQuery(api.smsGateway.listDevices) as SmsDevice[] | undefined;
  const messages = useQuery(api.smsGateway.listMessages) as SmsMsg[] | undefined;
  const createDevice = useMutation(api.smsGateway.createDevice);
  const revokeDevice = useMutation(api.smsGateway.revokeDevice);
  const deleteMessage = useMutation(api.smsGateway.deleteMessage);

  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/api/sms-gateway`;
  // Convex deployments serve HTTP actions on the .convex.site domain.
  const convexSite = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;
  const effectiveWebhook = convexSite
    ? `${convexSite}/api/sms-gateway`
    : webhookUrl;

  const handleCreate = async () => {
    setBusy(true);
    try {
      const res = await createDevice({ label });
      if (res) setShowKey(res.apiKey);
      setLabel("");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-xs leading-5 text-muted-foreground">
        Turn an Android phone into an SMS gateway with{' '}
        <a
          href="https://github.com/MahmoudY3c/react-native-sms-gateway"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          react-native-sms-gateway
        </a>
        . The phone forwards incoming SMS to GhostChat over HTTPS — read your
        OTPs and texts from anywhere, on any device. iOS is not supported
        (Apple exposes no SMS API).
      </p>

      {/* Webhook URL */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Webhook URL</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono text-[10px]">
            {effectiveWebhook}
          </code>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            title="Copy webhook URL"
            onClick={() => copy(effectiveWebhook, "webhook")}
          >
            {copied === "webhook" ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
          </Button>
        </div>
      </div>

      {/* Devices */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Gateway devices</p>
        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Device label (e.g. Pixel 8 — spare phone)"
          />
          <Button size="sm" disabled={busy} onClick={handleCreate}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Add
          </Button>
        </div>
        {devices === undefined && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {devices?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No devices yet. Add one, then set the webhook URL + API key in the
            gateway app's HTTP config.
          </p>
        )}
        {devices?.map((d) => (
          <div
            key={d._id}
            className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-xs font-medium">
                <Smartphone className="size-3 shrink-0 text-muted-foreground" />
                {d.label}
                {d.revoked && (
                  <span className="rounded bg-destructive/10 px-1 text-[10px] text-destructive">revoked</span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {d.lastSeenAt ? `last seen ${timeAgo(d.lastSeenAt)}` : "never connected"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Show/copy API key"
                onClick={() => copy(d.apiKey, d._id)}
              >
                {copied === d._id ? <Check className="size-3 text-emerald-600" /> : <KeyRound className="size-3" />}
              </Button>
              {!d.revoked && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Revoke device"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await revokeDevice({ deviceId: d._id as never });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              )}
            </div>
          </div>
        ))}
        {showKey && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
            <p className="text-xs font-medium text-emerald-600">New device API key — copy now, shown once:</p>
            <code className="mt-1 block break-all font-mono text-[10px]">{showKey}</code>
            <Button size="sm" variant="outline" className="mt-1.5 gap-1" onClick={() => copy(showKey, "newkey")}>
              {copied === "newkey" ? <Check className="size-3" /> : <Copy className="size-3" />} Copy key
            </Button>
          </div>
        )}
      </div>

      {/* Inbox */}
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Inbox ({messages?.length ?? 0})</p>
        {messages === undefined && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {messages?.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No SMS received yet. On the gateway phone, set the webhook URL and
            API key (HTTP config), enable the listener, then text that phone.
          </p>
        )}
        {messages?.map((m) => (
          <div
            key={m._id}
            className="flex items-start justify-between gap-2 rounded border border-border/40 px-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{m.sender}</p>
              <p className="break-words text-xs text-muted-foreground">{m.body}</p>
              <p className="text-[10px] text-muted-foreground">{timeAgo(m.receivedAt)}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              title="Delete"
              onClick={async () => {
                await deleteMessage({ messageId: m._id as never });
              }}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      {/* Setup steps */}
      <details className="rounded-lg border border-border/60 p-3">
        <summary className="cursor-pointer text-sm font-medium">Gateway app setup steps</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-xs leading-5 text-muted-foreground">
          <li>Install the gateway app on a spare Android phone and grant SMS permissions.</li>
          <li>Add a device above and copy its API key.</li>
          <li>In the app's HTTP config, set URL to the webhook above and add header{' '}<code className="rounded bg-muted px-1 font-mono text-[10px]">x-ghostchat-key: &lt;API key&gt;</code></li>
          <li>Set delivery type to HTTP, enable the background listener.</li>
          <li>Text the phone — the message appears in the inbox below within seconds.</li>
        </ol>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone tab — GhostChat phone verification (Twilio Verify)
// ---------------------------------------------------------------------------

type PhoneStatus = { phoneE164: string | null; phoneVerifiedAt: number | null };

function PhoneTab() {
  const status = useQuery(api.phoneVerifyData.getStatus) as PhoneStatus | undefined;
  const unlink = useMutation(api.phoneVerifyData.unlinkPhone);
  const start = useAction(api.phoneVerify.startVerification);
  const check = useAction(api.phoneVerify.checkVerification);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "awaiting-code" | "dev-fallback">("idle");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const verified = (status?.phoneVerifiedAt ?? null) !== null;

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await start({ phone: phone.trim() });
      if (res.mode === "dev-fallback") {
        setDevCode(res.devCode);
        setMode("dev-fallback");
      } else {
        setMode("awaiting-code");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const handleCheck = async () => {
    setBusy(true);
    setError(null);
    try {
      await check({ phone: phone.trim(), code });
      setDone(true);
      setMode("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* Status */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Phone number</p>
          <p className="text-xs text-muted-foreground">
            {status === undefined
              ? "Loading…"
              : verified
                ? status!.phoneE164
                : "Not verified"}
          </p>
        </div>
        {verified ? (
          <>
            <span className="flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
              <BadgeCheck className="size-3" /> verified
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await unlink();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Unlink
            </Button>
          </>
        ) : (
          <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <ShieldOff className="size-3" /> unverified
          </span>
        )}
      </div>

      {!verified && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
          <p className="text-sm font-medium">Verify your number</p>
          <p className="text-xs leading-5 text-muted-foreground">
            One-time code via SMS. Standard rates may apply. Used for account
            recovery and contact discovery — never shared or sold.
          </p>
          {mode === "idle" && (
            <>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+46 70 123 45 67"
                inputMode="tel"
              />
              <Button
                onClick={handleStart}
                disabled={busy || phone.trim().length < 7}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Phone className="size-4" />}
                Send code
              </Button>
            </>
          )}
          {(mode === "awaiting-code" || mode === "dev-fallback") && (
            <>
              {mode === "dev-fallback" && devCode && (
                <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2">
                  <p className="text-xs font-medium text-amber-600">
                    DEV MODE — no Twilio keys configured. Code shown here
                    instead of SMS:
                  </p>
                  <code className="mt-1 block font-mono text-lg font-bold tracking-widest">{devCode}</code>
                </div>
              )}
              {mode === "awaiting-code" && (
                <p className="text-xs text-muted-foreground">
                  Code sent to {phone}. Check your messages.
                </p>
              )}
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                inputMode="numeric"
                maxLength={8}
              />
              <div className="flex items-center gap-2">
                <Button onClick={handleCheck} disabled={busy || code.length < 4}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
                  Verify
                </Button>
                <Button variant="ghost" onClick={() => { setMode("idle"); setCode(""); }}>
                  Back
                </Button>
              </div>
            </>
          )}
          {done && <p className="text-xs text-emerald-600">Phone verified.</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {/* Twilio setup (paste-keys pattern) */}
      {!verified && (
        <details className="rounded-lg border border-border/60 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Enable real SMS delivery (Twilio keys)
          </summary>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-xs leading-5 text-muted-foreground">
            <li>
              Create a Twilio account{' '}
              <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                twilio.com/try-twilio
              </a>{' '}
              (trial includes free credit).
            </li>
            <li>Console → Verify → Services → create one, copy its SID.</li>
            <li>
              Add these three keys in the project's Keys/API keys panel:
              <code className="mt-1 block rounded bg-muted px-2 py-1 font-mono text-[10px]">
                TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_VERIFY_SERVICE_SID
              </code>
            </li>
            <li>Restart — verification switches from dev mode to real SMS automatically.</li>
          </ol>
        </details>
      )}

      {/* Second number guidance */}
      <div className="rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Need a second number?</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          GhostChat verifies your existing number — it does not mint new ones.
          For a free personal second number, these are the legitimate options:
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs leading-5 text-muted-foreground">
          <li><span className="font-medium text-foreground">Google Voice</span> — free US number (requires a US number to set up).</li>
          <li><span className="font-medium text-foreground">TextNow / TextFree</span> — free US/CA numbers over Wi-Fi, ad-supported.</li>
          <li><span className="font-medium text-foreground">MySudo / Hushed</span> — paid, but real persistent numbers with strong privacy posture.</li>
        </ul>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Disposable OTP-rental services ("receive codes for WhatsApp/Revolut")
          are not supported — they violate platform terms and often enable fraud.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apps > Permissions — per-feature access toggles for GhostChat itself.
// These control what the app can use on THIS device (camera, mic, location,
// contacts). Browser permissions are requested lazily only when a toggle is
// on; toggles persist locally and gate the relevant feature code paths.
// ---------------------------------------------------------------------------

type AppPermission = {
  id: string;
  label: string;
  description: string;
  icon: typeof Camera;
};

const APP_PERMISSIONS: AppPermission[] = [
  { id: "camera", label: "Camera", description: "Scan contact QR codes, attach photos", icon: Camera },
  { id: "microphone", label: "Microphone", description: "Voice messages and encrypted calls", icon: Mic },
  { id: "location", label: "Location", description: "Optional: share live location in chats", icon: MapPin },
  { id: "contacts", label: "Contacts", description: "Find friends by phone number (hashed, never uploaded)", icon: Users },
  { id: "notifications", label: "Notifications", description: "Privacy-focused message alerts", icon: Bell },
];

const PERMS_KEY = "ghostchat-permissions";

function readPerms(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(PERMS_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function AppsPermissionsTab() {
  const [perms, setPerms] = useState<Record<string, boolean>>(readPerms);
  const [status, setStatus] = useState<Record<string, string>>({});

  const toggle = async (p: AppPermission, on: boolean) => {
    const next = { ...perms, [p.id]: on };
    setPerms(next);
    localStorage.setItem(PERMS_KEY, JSON.stringify(next));

    // Request the underlying browser permission when enabling (except
    // notifications, which uses its own API).
    if (on && "permissions" in navigator) {
      try {
        const nameMap: Record<string, PermissionName> = {
          camera: "camera",
          microphone: "microphone",
          location: "geolocation",
        };
        const name = nameMap[p.id];
        if (name === "geolocation") {
          navigator.geolocation.getCurrentPosition(() => setStatus((s) => ({ ...s, [p.id]: "granted" })), () => setStatus((s) => ({ ...s, [p.id]: "denied" })));
          return;
        }
        if (p.id === "notifications") {
          const res = await Notification.requestPermission();
          setStatus((s) => ({ ...s, [p.id]: res }));
          return;
        }
        if (name) {
          const res = await navigator.permissions.query({ name });
          setStatus((s) => ({ ...s, [p.id]: res.state }));
        }
      } catch {
        // Some browsers restrict querying certain permissions — fine.
        setStatus((s) => ({ ...s, [p.id]: "prompt" }));
      }
    }
  };

  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-xs leading-5 text-muted-foreground">
        GhostChat requests access to your device's features only when a feature
        needs it. Toggle access on or off here — turning something off makes
        the app skip it entirely (no background collection).
      </p>
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">GhostChat · device access</p>
        {APP_PERMISSIONS.map((p) => {
          const Icon = p.icon;
          return (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded border border-border/40 px-2 py-2">
              <div className="flex min-w-0 items-start gap-2">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    {p.label}
                    {status[p.id] && (
                      <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">{status[p.id]}</span>
                    )}
                  </p>
                  <p className="text-[10px] leading-4 text-muted-foreground">{p.description}</p>
                </div>
              </div>
              <Switch
                checked={perms[p.id] ?? false}
                onCheckedChange={(v) => void toggle(p, v)}
              />
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Toggles are device-local (stored in this browser) and sync nothing.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy > Permission manager — cross-feature overview of everything
// GhostChat can touch on this device, with one-click disable-all.
// ---------------------------------------------------------------------------

function PrivacyManagerTab() {
  const [perms, setPerms] = useState<Record<string, boolean>>(readPerms);
  const [open, setOpen] = useState<string | null>(null);

  const active = APP_PERMISSIONS.filter((p) => perms[p.id]);
  const inactive = APP_PERMISSIONS.filter((p) => !perms[p.id]);

  const disableAll = () => {
    const allOff: Record<string, boolean> = {};
    for (const p of APP_PERMISSIONS) allOff[p.id] = false;
    setPerms(allOff);
    localStorage.setItem(PERMS_KEY, JSON.stringify(allOff));
  };

  return (
    <div className="flex flex-col gap-3 py-2">
      <p className="text-xs leading-5 text-muted-foreground">
        Everything GhostChat can access on this device, at a glance. Click a
        permission to jump to its toggle in Apps.
      </p>

      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Access overview</p>
          <Button size="sm" variant="outline" onClick={disableAll}>
            <ShieldOff className="size-3.5" /> Disable all
          </Button>
        </div>

        {active.length === 0 && inactive.length === APP_PERMISSIONS.length && (
          <p className="text-xs text-muted-foreground">
            All device access is off. GhostChat works with messaging only.
          </p>
        )}

        {active.length > 0 && (
          <>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allowed</p>
            {active.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded border border-emerald-500/30 px-2 py-1.5 text-left hover:bg-accent/50"
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                >
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <Icon className="size-3.5" /> {p.label}
                  </span>
                  <span className="text-[10px] text-emerald-600">on</span>
                </button>
              );
            })}
          </>
        )}

        {inactive.length > 0 && (
          <>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Blocked</p>
            {inactive.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1.5 text-left hover:bg-accent/50"
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Icon className="size-3.5" /> {p.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">off</span>
                </button>
              );
            })}
          </>
        )}

        {open && (
          <div className="rounded border border-border/40 bg-muted/40 p-2">
            {(() => {
              const p = APP_PERMISSIONS.find((x) => x.id === open)!;
              return (
                <>
                  <p className="text-xs font-medium">{p.label}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{p.description}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Manage: Settings → Apps → {p.label}
                  </p>
                </>
              );
            })()}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/60 p-3">
        <p className="text-sm font-medium">Data collection policy</p>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-xs leading-5 text-muted-foreground">
          <li>Message content: end-to-end encrypted; the server stores ciphertext only.</li>
          <li>Contacts: hashed on-device for discovery; never uploaded in plaintext.</li>
          <li>Location: only shared when you attach it to a message; never in background.</li>
          <li>No analytics SDKs, no ad trackers, no third-party data sharing.</li>
        </ul>
      </div>
    </div>
  );
}

