"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarPlus, Menu, Search, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookingDialog } from "@/components/appointments/booking-dialog";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { lowStockProducts } from "@/lib/data/analytics";
import { useSalon } from "@/lib/data/store";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/lib/utils";

export function Topbar({
  onOpenSearch,
  onOpenMobileNav,
}: {
  onOpenSearch: () => void;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  const { products, invoices } = useSalon();
  const { can } = useAuth();
  const [bookingOpen, setBookingOpen] = React.useState(false);

  const current = ALL_NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );

  const canBook = can("appointments.manage");
  const canCheckout = can("pos.operate");
  const canSeeStockAlerts = can("inventory.view");

  // Beauticians see neither stock nor receivables, so the bell would always
  // read zero for them — hide it rather than show a meaningless badge.
  const lowStock = canSeeStockAlerts ? lowStockProducts(products).length : 0;
  const unpaid = can("invoice.view")
    ? invoices.filter((i) => i.status === "UNPAID" || i.status === "PARTIAL").length
    : 0;
  const alerts = lowStock + unpaid;
  const showAlerts = canSeeStockAlerts || can("invoice.view");

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-hairline bg-obsidian/85 px-4 backdrop-blur-xl lg:px-6">
        <button
          onClick={onOpenMobileNav}
          className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-ink">
            {current?.label ?? "Dashboard"}
          </h1>
          <p className="hidden truncate text-xs text-faint sm:block">
            {current?.description ?? "Revenue, profit and today at a glance"}
          </p>
        </div>

        {/* Search — expands to a real field from md up */}
        <button
          onClick={onOpenSearch}
          className={cn(
            "group flex items-center gap-2 rounded-lg border border-hairline-strong bg-obsidian-elevated text-sm text-faint transition-colors hover:border-gold/35 hover:text-muted",
            "size-10 justify-center md:h-10 md:w-64 md:justify-start md:px-3 lg:w-80",
          )}
          aria-label="Search"
        >
          <Search className="size-4 shrink-0" />
          <span className="hidden md:inline">Search everything…</span>
          <kbd className="ml-auto hidden shrink-0 rounded border border-hairline-strong px-1.5 py-0.5 font-mono text-[10px] md:inline">
            ⌘K
          </kbd>
        </button>

        {/* Alerts */}
        {showAlerts && (
          <Link
            href={canSeeStockAlerts ? "/inventory" : "/invoices"}
            className="relative hidden rounded-lg p-2 text-muted transition-colors hover:bg-white/5 hover:text-ink sm:block"
            aria-label={`${alerts} alerts`}
          >
            <Bell className="size-5" />
            {alerts > 0 && (
              <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
                {alerts > 9 ? "9+" : alerts}
              </span>
            )}
          </Link>
        )}

        {/* Quick actions — permission-gated */}
        {canBook && (
          <Button
            variant="secondary"
            size="default"
            onClick={() => setBookingOpen(true)}
            className="hidden sm:inline-flex"
          >
            <CalendarPlus />
            <span className="hidden lg:inline">Quick Booking</span>
          </Button>
        )}

        {canCheckout && (
          <Button asChild size="default">
            <Link href="/pos">
              <Zap />
              <span className="hidden lg:inline">Quick Checkout</span>
            </Link>
          </Button>
        )}
      </header>

      {canBook && <BookingDialog open={bookingOpen} onOpenChange={setBookingOpen} />}
    </>
  );
}

/** Small pill used across pages to show a live figure next to a heading. */
export function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <Badge variant={tone === "default" ? "neutral" : tone} className="gap-1.5 px-2.5 py-1">
      <span className="text-faint">{label}</span>
      <span className="tabular font-semibold">{value}</span>
    </Badge>
  );
}
