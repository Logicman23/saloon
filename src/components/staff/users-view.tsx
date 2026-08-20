"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserX,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, Label, SectionHeading } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserRoleAction,
} from "@/lib/actions/users";
import {
  ROLES,
  ROLE_META,
  roleForDesignation,
  type Role,
} from "@/lib/auth/permissions";
import type { AppUser, Staff } from "@/lib/types";
import { formatDate } from "@/lib/date";

export function UsersView({
  users,
  staff,
  currentUserId,
}: {
  users: AppUser[];
  staff: Staff[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);
  const [resetting, setResetting] = React.useState<AppUser | null>(null);
  const [suspending, setSuspending] = React.useState<AppUser | null>(null);
  const [deleting, setDeleting] = React.useState<AppUser | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const activeOwners = users.filter((u) => u.active && u.role === "ADMIN").length;

  /**
   * True when removing this account's access would leave nobody able to
   * administer the salon. The server refuses either way; this is so the
   * disabled control can explain itself instead of just failing.
   */
  const isLastOwner = (user: AppUser) =>
    user.role === "ADMIN" && user.active && activeOwners <= 1;

  const changeRole = async (user: AppUser, role: Role) => {
    setBusyId(user.id);
    try {
      const result = await updateUserRoleAction(user.id, role);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.name} is now ${ROLE_META[role].label}. Signed out everywhere.`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Logins & access"
        description="Who can sign in, and what each of them may do."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push("/staff")}>
              <ArrowLeft />
              The team
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus />
              Issue a login
            </Button>
          </div>
        }
      />

      <Card className="border-gold/20 bg-gold/[0.04] p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" />
          <div className="space-y-1 text-sm">
            <p className="text-ink">A role is assigned per person, not per job title.</p>
            <p className="text-muted">
              The job title on their chair sets the <em>starting</em> role — an Owner gets full
              control, a Receptionist gets the front desk, everyone else gets their own schedule
              and commission. Change it here whenever someone needs more or less than their
              title implies.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Job title</TableHead>
              <TableHead>Access role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && <TableEmpty colSpan={6}>No logins yet.</TableEmpty>}
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const locked = isLastOwner(user);
              const busy = busyId === user.id;

              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={user.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {user.name}
                          {isSelf && <span className="ml-1.5 text-xs text-faint">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-faint">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-muted">
                    {user.designation ?? <span className="text-faint">No chair linked</span>}
                  </TableCell>

                  <TableCell>
                    {/* Demoting yourself or the last owner is refused by the
                        server; disabling it here saves a pointless round trip
                        and the title says why. */}
                    <Select
                      value={user.role}
                      disabled={busy || isSelf || locked}
                      onValueChange={(v) => changeRole(user, v as Role)}
                    >
                      <SelectTrigger
                        className="w-44"
                        title={
                          isSelf
                            ? "You cannot change your own role."
                            : locked
                              ? "The only active owner — promote someone else first."
                              : undefined
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_META[role].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell>
                    {!user.active ? (
                      <Badge variant="neutral">Suspended</Badge>
                    ) : user.lockedUntil ? (
                      <Badge variant="warning">Locked out</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-muted">
                    {user.lastLoginAt ? formatDate(user.lastLoginAt) : <span className="text-faint">Never</span>}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      {busy && <Loader2 className="mr-1 size-3.5 animate-spin text-faint" />}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title={`Set a new password for ${user.name}`}
                        onClick={() => setResetting(user)}
                      >
                        <KeyRound />
                        <span className="sr-only">Reset password for {user.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={isSelf || locked}
                        title={
                          isSelf
                            ? "You cannot suspend your own account."
                            : locked
                              ? "The only active owner."
                              : user.active
                                ? `Suspend ${user.name}`
                                : `Restore ${user.name}`
                        }
                        onClick={() => setSuspending(user)}
                      >
                        <UserX />
                        <span className="sr-only">
                          {user.active ? "Suspend" : "Restore"} {user.name}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="hover:bg-danger/10 hover:text-danger"
                        disabled={isSelf || locked}
                        title={
                          isSelf
                            ? "You cannot delete your own account."
                            : locked
                              ? "The only active owner."
                              : `Delete ${user.name}`
                        }
                        onClick={() => setDeleting(user)}
                      >
                        <Trash2 />
                        <span className="sr-only">Delete {user.name}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* What each role actually grants, so the dropdown is not a guess. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((role) => (
          <Card key={role} className="p-4">
            <p className="text-sm font-medium text-ink">{ROLE_META[role].label}</p>
            <p className="mt-1 text-xs text-muted">{ROLE_META[role].blurb}</p>
            <p className="mt-2 text-[11px] text-faint">
              Lands on <span className="font-mono">{ROLE_META[role].landing}</span>
            </p>
          </Card>
        ))}
      </div>

      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} staff={staff} users={users} />

      <ResetPasswordDialog user={resetting} onDone={() => setResetting(null)} />

      <ConfirmDialog
        open={Boolean(suspending)}
        onOpenChange={(open) => !open && setSuspending(null)}
        variant={suspending?.active ? "destructive" : "default"}
        title={suspending?.active ? "Suspend this login?" : "Restore this login?"}
        description={
          suspending
            ? suspending.active
              ? `${suspending.name} will be signed out immediately and cannot sign back in.`
              : `${suspending.name} will be able to sign in again.`
            : undefined
        }
        confirmLabel={suspending?.active ? "Suspend" : "Restore"}
        pendingLabel={suspending?.active ? "Suspending…" : "Restoring…"}
        onConfirm={async () => {
          if (!suspending) return;
          const result = await setUserActiveAction(suspending.id, !suspending.active);
          if (!result.ok) return result.error;
          toast.success(
            result.data.active
              ? `${result.data.name} can sign in again.`
              : `${result.data.name} suspended and signed out.`,
          );
          router.refresh();
        }}
      >
        <p className="text-sm text-muted">
          Their chair, bookings and commission history are untouched — this is the login only,
          and it can be reversed from this page.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this login permanently?"
        description={
          deleting ? `${deleting.name}'s account will be removed for good.` : undefined
        }
        confirmLabel="Delete login"
        pendingLabel="Deleting…"
        onConfirm={async () => {
          if (!deleting) return;
          const result = await deleteUserAction(deleting.id);
          if (!result.ok) return result.error;
          toast.success(`${result.data.name}'s login deleted.`);
          router.refresh();
        }}
      >
        <p className="text-sm text-muted">
          Their team record, bookings and commission history are kept — this removes the ability
          to sign in, not the person. The security log still names them on everything they did.
        </p>
        <p className="rounded-lg border border-hairline bg-obsidian-elevated p-3 text-xs text-faint">
          To take access away without losing the account, suspend it instead — same effect, and
          reversible.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/* -------------------------------------------------------- Issue a login */

function AddUserDialog({
  open,
  onOpenChange,
  staff,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: Staff[];
  users: AppUser[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh]">
        {/* Unmounted while closed, so the fields start empty each time. */}
        {open && <AddUserForm staff={staff} users={users} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

const NO_CHAIR = "__none__";

function AddUserForm({
  staff,
  users,
  onDone,
}: {
  staff: Staff[];
  users: AppUser[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [staffId, setStaffId] = React.useState(NO_CHAIR);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<Role>("STAFF");
  // Set once the owner picks the role by hand, so a later change of chair
  // stops overwriting a deliberate choice.
  const [roleTouched, setRoleTouched] = React.useState(false);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  /** One chair, one login — `staffId` is unique on the users table. */
  const taken = React.useMemo(
    () => new Set(users.map((u) => u.staffId).filter(Boolean)),
    [users],
  );
  const available = React.useMemo(
    () => staff.filter((s) => !taken.has(s.id)),
    [staff, taken],
  );

  const chosen = staff.find((s) => s.id === staffId);
  const suggested = roleForDesignation(chosen?.role);

  /**
   * Picking a chair fills the name and preselects the role its job title
   * implies — the whole point of the feature, and the reason the common case
   * needs no decision at all.
   */
  const pickStaff = (id: string) => {
    setStaffId(id);
    const member = staff.find((s) => s.id === id);
    if (member) {
      if (!name.trim()) setName(member.name);
      if (member.email && !email.trim()) setEmail(member.email);
      if (!roleTouched) setRole(roleForDesignation(member.role));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (name.trim().length < 2) return setError("Enter the person's name.");
    if (!email.trim()) return setError("Enter an email address to sign in with.");
    if (password.length < 10) return setError("The password must be at least 10 characters.");

    setError("");
    setSaving(true);
    try {
      const result = await createUserAction({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        staffId: staffId === NO_CHAIR ? undefined : staffId,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(`${name.trim()} can now sign in as ${ROLE_META[role].label}.`);
      router.refresh();
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>Issue a login</DialogTitle>
        <DialogDescription>
          Pick the team member and their access role is set from their job title. Override it
          below if they need something different.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="user-staff">Team member</Label>
          <Select value={staffId} onValueChange={pickStaff}>
            <SelectTrigger id="user-staff">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CHAIR}>Not linked to a chair</SelectItem>
              {available.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name} · {member.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-faint">
            {available.length === 0
              ? "Everyone on the team already has a login."
              : "Links the account to their chair, so “my schedule” and commission scope to them."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ayesha Khan"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ayesha@sanasbeauty.pk"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="user-password">Temporary password</Label>
          <Input
            id="user-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 10 characters"
          />
          <p className="text-xs text-faint">
            Shown as text so you can read it out once. They should change it after signing in.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="user-role">Access role</Label>
          <Select
            value={role}
            onValueChange={(v) => {
              setRoleTouched(true);
              setRole(v as Role);
            }}
          >
            <SelectTrigger id="user-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_META[r].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted">{ROLE_META[role].blurb}</p>
        </div>

        {chosen && role !== suggested && (
          <p className="rounded-lg border border-warning/25 bg-warning/[0.06] p-3 text-xs text-warning">
            A {chosen.role} would normally be {ROLE_META[suggested].label}. You are giving them{" "}
            {ROLE_META[role].label} instead.
            {role === "ADMIN" && " That is unrestricted access, including the financials."}
          </p>
        )}
      </DialogBody>

      <DialogFooter>
        {error && (
          <p className="mr-auto self-center text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {saving ? "Creating…" : "Create login"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ------------------------------------------------------ Reset a password */

function ResetPasswordDialog({ user, onDone }: { user: AppUser | null; onDone: () => void }) {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Cleared on close rather than held, so the next account opened does not
  // inherit the previous one's typed password.
  const close = () => {
    if (saving) return;
    setPassword("");
    setError("");
    onDone();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !user) return;
    if (password.length < 10) return setError("The password must be at least 10 characters.");

    setError("");
    setSaving(true);
    try {
      const result = await resetUserPasswordAction(user.id, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`New password set for ${result.data.name}. They are signed out everywhere.`);
      router.refresh();
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && close()}>
      <DialogContent size="sm">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>
              {user ? `${user.name} — ${user.email}` : ""}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">New password</Label>
              <Input
                id="reset-password"
                type="text"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
              />
            </div>
            <p className="rounded-lg border border-hairline bg-obsidian-elevated p-3 text-xs text-faint">
              Signs them out of every device, and clears a lockout from repeated failed
              sign-ins.
            </p>
          </DialogBody>

          <DialogFooter>
            {error && (
              <p className="mr-auto self-center text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button type="button" variant="ghost" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
