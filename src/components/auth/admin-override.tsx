"use client";

import * as React from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth/context";
import type { Permission } from "@/lib/auth/permissions";

/**
 * Manager override for actions a cashier may perform only with authorisation
 * — discounting below the standard engine, or voiding a finalised invoice.
 *
 * The PIN is verified by `/api/auth/override` on the server; it is never
 * compared in the browser, and the response carries no hint about which part
 * of a wrong entry was wrong.
 */
export function useAdminOverride() {
  const { can } = useAuth();
  const [request, setRequest] = React.useState<{
    permission: Permission;
    reason: string;
    resolve: (granted: boolean) => void;
  } | null>(null);

  /**
   * Resolves immediately when the signed-in role already holds the
   * permission; otherwise prompts for a manager PIN.
   */
  const authorize = React.useCallback(
    (permission: Permission, reason: string) =>
      new Promise<boolean>((resolve) => {
        if (can(permission)) {
          resolve(true);
          return;
        }
        setRequest({ permission, reason, resolve });
      }),
    [can],
  );

  const dialog = (
    <AdminOverrideDialog
      request={request}
      onSettle={(granted) => {
        request?.resolve(granted);
        setRequest(null);
      }}
    />
  );

  return { authorize, dialog };
}

function AdminOverrideDialog({
  request,
  onSettle,
}: {
  request: { permission: Permission; reason: string } | null;
  onSettle: (granted: boolean) => void;
}) {
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onSettle(false)}>
      <DialogContent size="sm">
        {request && <OverrideForm request={request} onSettle={onSettle} />}
      </DialogContent>
    </Dialog>
  );
}

function OverrideForm({
  request,
  onSettle,
}: {
  request: { permission: Permission; reason: string };
  onSettle: (granted: boolean) => void;
}) {
  const [pin, setPin] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const submit = async () => {
    if (pin.length < 4) return;
    setPending(true);
    try {
      const response = await fetch("/api/auth/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, permission: request.permission }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        toast.error(
          data.error === "too_many_attempts"
            ? "Too many attempts"
            : "Unauthorized access attempt",
          {
            description:
              data.error === "too_many_attempts"
                ? "Override is locked briefly. Ask the owner to sign in directly."
                : "That manager PIN was not accepted. The attempt has been logged.",
          },
        );
        setPending(false);
        return;
      }

      toast.success("Manager override approved", { description: request.reason });
      onSettle(true);
    } catch {
      toast.error("Connection problem", { description: "Couldn't verify the override." });
      setPending(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-gold" />
          Manager authorisation
        </DialogTitle>
        <p className="text-sm text-muted">{request.reason}</p>
      </DialogHeader>

      <DialogBody className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="override-pin">Manager PIN</Label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <Input
              id="override-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={12}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              className="tabular pl-9 tracking-[0.4em]"
            />
          </div>
        </div>

        <p className="rounded-lg border border-warning/20 bg-warning/[0.05] p-2.5 text-[11px] text-warning/90">
          This action is outside your role&apos;s permissions. Every override is recorded against
          your account in the audit log.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onSettle(false)} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={pin.length < 4 || pending}>
          {pending ? (
            <>
              <Loader2 className="animate-spin" /> Verifying…
            </>
          ) : (
            <>
              <ShieldCheck /> Authorise
            </>
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
