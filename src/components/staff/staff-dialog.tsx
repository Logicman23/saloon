"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label, Switch } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSalon } from "@/lib/data/store";
import { SERVICE_CATEGORIES, type ServiceCategory, type Staff, type StaffRole } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";

/**
 * Commission round-trips through a fraction — 12.5% is stored as 0.125 — and
 * the multiplication back out lands on 12.500000000000002 often enough to be
 * worth clamping. Decimal(4,3) gives one decimal place of a percentage.
 */
const round1 = (value: number) => Math.round(value * 1000) / 10;

const STAFF_ROLES: readonly StaffRole[] = [
  "Owner",
  "Senior Stylist",
  "Stylist",
  "Beautician",
  "Nail Technician",
  "Makeup Artist",
  "Receptionist",
];

/** Back-office roles don't take a chair, so specialties don't apply to them. */
const NON_SERVICE_ROLES: readonly StaffRole[] = ["Receptionist"];

export function StaffDialog({
  member = null,
  open,
  onOpenChange,
}: {
  /** Omitted to add a new member; supplied to edit that one. */
  member?: Staff | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Keyed on the member so the form remounts when a different card is
        opened. Without it React reuses the instance and its state, and the
        second person edited would open holding the first one's details.
      */}
      <DialogContent size="lg" className="max-h-[90vh]">
        <StaffForm key={member?.id ?? "new"} member={member} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function StaffForm({ member, onDone }: { member: Staff | null; onDone: () => void }) {
  const { actions } = useSalon();
  const editing = member !== null;

  const [name, setName] = React.useState(member?.name ?? "");
  const [role, setRole] = React.useState<StaffRole>(member?.role ?? "Stylist");
  const [phone, setPhone] = React.useState(member?.phone ?? "");
  const [email, setEmail] = React.useState(member?.email ?? "");
  // Entered as a percentage because that is how commission is discussed;
  // converted to the fraction the schema stores on submit.
  const [commissionPct, setCommissionPct] = React.useState(
    member ? String(round1(member.commissionRate)) : "12",
  );
  const [specialties, setSpecialties] = React.useState<ServiceCategory[]>(
    member?.specialties ?? [],
  );
  const [monthlySalary, setMonthlySalary] = React.useState(
    member && member.monthlySalary > 0 ? String(member.monthlySalary) : "",
  );
  const [active, setActive] = React.useState(member?.active ?? true);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const takesChair = !NON_SERVICE_ROLES.includes(role);
  const pct = Number(commissionPct);
  const salary = Number(monthlySalary);

  const toggleSpecialty = (cat: ServiceCategory) =>
    setSpecialties((current) =>
      current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat],
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (name.trim().length < 2) return setError("Enter the team member's name.");
    if (phone.trim().length < 6) return setError("Enter a contact number.");
    if (commissionPct === "" || Number.isNaN(pct) || pct < 0)
      return setError("Enter a valid commission percentage.");
    // The column would store 999% without complaint, so this is the only
    // thing standing between a misplaced decimal point and the payroll report.
    if (pct >= 100) return setError("Commission must be below 100%.");
    if (monthlySalary !== "" && (Number.isNaN(salary) || salary < 0))
      return setError("Enter a valid monthly salary.");
    if (takesChair && specialties.length === 0)
      return setError("Pick at least one specialty, or set the role to Receptionist.");

    setError("");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        role,
        phone: phone.trim(),
        email: email.trim() || undefined,
        commissionRate: Math.round(pct * 10) / 1000, // 12.5% -> 0.125
        specialties: takesChair ? specialties : [],
        monthlySalary: monthlySalary === "" ? 0 : salary,
        active,
      };

      const result = member
        ? await actions.updateStaff(member.id, payload)
        : await actions.addStaff(payload);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      toast.success(
        member ? `${name.trim()} updated.` : `${name.trim()} added to the team.`,
      );
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    // See service-dialog: without these, DialogBody cannot scroll and the
    // footer is clipped as soon as the commission preview appears.
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${member.name}` : "New team member"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Changes apply from now on — past bookings and commission already earned are unaffected."
            : "Creates the chair they are booked against. A login is issued separately."}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="staff-name">Full name</Label>
            <Input
              id="staff-name"
              autoFocus
              placeholder="Ayesha Khan"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger id="staff-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-phone">Phone</Label>
            <Input
              id="staff-phone"
              inputMode="tel"
              placeholder="0301-2345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="staff-email">
              Email <span className="text-faint">(optional)</span>
            </Label>
            <Input
              id="staff-email"
              type="email"
              placeholder="ayesha@sana.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-commission">Commission %</Label>
            <Input
              id="staff-commission"
              type="number"
              min={0}
              max={99.9}
              step="0.1"
              inputMode="decimal"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              className="tabular"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="staff-salary">
              Monthly salary <span className="text-faint">(optional)</span>
            </Label>
            <Input
              id="staff-salary"
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              placeholder="0"
              value={monthlySalary}
              onChange={(e) => setMonthlySalary(e.target.value)}
              className="tabular"
            />
          </div>
        </div>

        {takesChair && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Specialties</Label>
              <span className="text-xs text-faint">
                Drives which bookings they can be assigned
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_CATEGORIES.map((cat) => {
                const checked = specialties.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleSpecialty(cat)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                      checked
                        ? "border-gold/50 bg-gold/12 text-gold-light"
                        : "border-hairline text-muted hover:border-hairline-strong hover:text-ink",
                    )}
                  >
                    {checked && <Check className="size-3" strokeWidth={3} />}
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-hairline bg-obsidian-elevated p-3">
          <div>
            <p className="text-sm text-ink">Currently working</p>
            <p className="text-xs text-faint">
              Inactive members keep their history but leave the booking rota.
            </p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        {!Number.isNaN(pct) && pct > 0 && (
          <div className="rounded-lg border border-hairline bg-obsidian-elevated p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Commission on a {formatMoney(10000)} service</span>
              <span className="tabular font-semibold text-gold">
                {formatMoney(Math.round(10000 * (pct / 100)))}
              </span>
            </div>
          </div>
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
          {saving ? "Saving…" : editing ? "Save changes" : "Add member"}
        </Button>
      </DialogFooter>
    </form>
  );
}
