import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Ban, Flag, Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * Menu attached to each DM header: Block and Report.
 * Blocked handles are hidden client-side (listBlocked); reports are stored
 * for moderation with a handle snapshot and a free-text reason.
 */
export function MessageActionsMenu({ other }: { other: { handle: string } }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<null | "block" | "report">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const blockHandle = useMutation(api.chat.blockHandle);
  const unblockHandle = useMutation(api.chat.unblockHandle);
  const reportHandle = useMutation(api.chat.reportHandle);
  const blocked = useQuery(api.chat.listBlocked) as { handle: string }[] | undefined;

  const isBlocked = !!blocked?.some((b) => b.handle === other.handle);

  const close = () => {
    setOpen(false);
    setMode(null);
    setDone(null);
    setError(null);
    setReason("");
  };

  const handleBlock = async () => {
    setBusy(true);
    setError(null);
    try {
      if (isBlocked) {
        await unblockHandle({ handle: other.handle });
        setDone("unblocked");
      } else {
        await blockHandle({ handle: other.handle });
        setDone("blocked");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!reason.trim()) throw new Error("Describe the reason for the report.");
      await reportHandle({ handle: other.handle, reason: reason.trim() });
      setDone("reported");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
        title="Conversation actions"
        onClick={() => setOpen(true)}
      >
        ⋯
      </button>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{other.handle}</DialogTitle>
            <DialogDescription>Privacy &amp; safety actions</DialogDescription>
          </DialogHeader>

          {done === "blocked" && (
            <p className="text-sm text-muted-foreground">
              Blocked. Their conversations are hidden from your list.
            </p>
          )}
          {done === "unblocked" && (
            <p className="text-sm text-muted-foreground">Unblocked.</p>
          )}
          {done === "reported" && (
            <p className="text-sm text-muted-foreground">
              Report sent. Thank you.
            </p>
          )}

          {!done && mode === null && (
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="justify-start gap-2" onClick={() => setMode("block")}>
                <Ban className="size-4" />
                {isBlocked ? "Unblock this handle" : "Block this handle"}
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => setMode("report")}>
                <Flag className="size-4" /> Report this handle
              </Button>
            </div>
          )}

          {!done && mode === "block" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {isBlocked
                  ? `Unblock ${other.handle}? Their conversations will appear again.`
                  : `Block ${other.handle}? You will not see their conversations in your list.`}
              </p>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setMode(null)}>Back</Button>
                <Button
                  variant={isBlocked ? "secondary" : "destructive"}
                  onClick={handleBlock}
                  disabled={busy}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {isBlocked ? "Unblock" : "Block"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {!done && mode === "report" && (
            <div className="flex flex-col gap-3">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What happened?"
                rows={3}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setMode(null)}>Back</Button>
                <Button onClick={handleReport} disabled={busy || !reason.trim()}>
                  {busy && <Loader2 className="size-4 animate-spin" />} Send report
                </Button>
              </DialogFooter>
            </div>
          )}

          {error && mode === "block" && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
