"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmation gate for destructive actions.
 *
 * Two things separate this from a `window.confirm`: it stays open on failure
 * with the server's own message, and it owns the pending state, so a slow
 * archive cannot be double-submitted by an impatient second click. `onConfirm`
 * resolving with a string means "keep the dialog open and show this" — which
 * is exactly the shape a failed `ActionResult` collapses to.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  pendingLabel = "Deleting…",
  cancelLabel = "Cancel",
  variant = "destructive",
  confirmDisabled = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  /**
   * Blocks the action when the caller already knows it cannot succeed — a
   * dependency the user has to clear first. Pair it with `children` saying
   * what, otherwise this is a dead button with no explanation. The server
   * still re-checks; this only saves a pointless round trip.
   */
  confirmDisabled?: boolean;
  /** Resolve with a message to report a failure; resolve empty to close. */
  onConfirm: () => Promise<string | null | void>;
  /** Optional detail panel — what is about to be lost, in concrete terms. */
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  /**
   * Every close routes through here, which is also where the error is
   * cleared — otherwise cancelling a failed attempt and reopening would
   * greet the next person with the previous failure. `busy` needs no reset:
   * the `finally` below is the only thing that sets it, in either direction.
   */
  const close = (next: boolean) => {
    // Escape and the overlay must not pull the dialog out from under an
    // in-flight request — the write would still land, unreported.
    if (busy) return;
    if (!next) setError("");
    onOpenChange(next);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const message = await onConfirm();
      if (message) {
        setError(message);
        return;
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="sm" hideClose={busy}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {variant === "destructive" && (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-danger/12">
                <AlertTriangle className="size-4 text-danger" />
              </span>
            )}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children && <DialogBody className="space-y-3">{children}</DialogBody>}

        <DialogFooter>
          {error && (
            <p className="mr-auto self-center text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="button" variant="ghost" onClick={() => close(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={confirm}
            disabled={busy || confirmDisabled}
          >
            {busy && <Loader2 className="animate-spin" />}
            {busy ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
