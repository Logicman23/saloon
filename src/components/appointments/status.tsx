import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus, InvoiceStatus } from "@/lib/types";

export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatus,
  { label: string; variant: "default" | "neutral" | "success" | "warning" | "danger" | "info"; dot: string }
> = {
  SCHEDULED: { label: "Scheduled", variant: "info", dot: "#38bdf8" },
  IN_PROGRESS: { label: "In Progress", variant: "warning", dot: "#f59e0b" },
  COMPLETED: { label: "Completed", variant: "success", dot: "#10b981" },
  CANCELLED: { label: "Cancelled", variant: "danger", dot: "#e11d48" },
  NO_SHOW: { label: "No-Show", variant: "danger", dot: "#9f1239" },
};

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; variant: "success" | "warning" | "danger" | "neutral" }
> = {
  PAID: { label: "Paid", variant: "success" },
  PARTIAL: { label: "Partial", variant: "warning" },
  UNPAID: { label: "Unpaid", variant: "danger" },
  VOID: { label: "Void", variant: "neutral" },
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const meta = APPOINTMENT_STATUS_META[status];
  return (
    <Badge variant={meta.variant}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const meta = INVOICE_STATUS_META[status];
  return (
    <Badge variant={meta.variant}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {meta.label}
    </Badge>
  );
}
