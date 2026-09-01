import { useMutation, useQuery } from "convex/react";
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
  Fingerprint,
  Ghost,
  Globe,
  HardDriveDownload,
  Loader2,
  LogOut,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
          </TabsList>
          <TabsContent value="profile">
            <ProfileTab />
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
// GhostVPN — connection preferences (no external VPN API in catalog yet)
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

function GhostVpnTab() {
  const user = useQuery(api.users.currentUser);
  const setVpn = useMutation(api.settings.setVpnSettings);
  const [busy, setBusy] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [apiSaved, setApiSaved] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (user && !loaded.current) {
      loaded.current = true;
      setApiUrl(user.vpnPrivateApiUrl ?? "");
    }
  }, [user]);

  const enabled = user?.vpnEnabled ?? false;
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

  return (
    <div className="flex flex-col gap-3 py-2">
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
          onCheckedChange={(v) => patch({ enabled: v })}
        />
      </div>

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
