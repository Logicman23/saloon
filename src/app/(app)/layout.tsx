import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SalonProvider, type SalonData } from "@/lib/data/store";
import { AuthProvider, type SessionUser } from "@/lib/auth/context";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { DatabaseUnavailable } from "@/components/layout/database-unavailable";
import {
  getAppointments,
  getClients,
  getExpenses,
  getInvoices,
  getOutstandingInvoices,
  getPackages,
  getProducts,
  getPromoCodes,
  getServices,
  getStaff,
  getStockMovements,
} from "@/lib/db/queries";

/** Reads the cookie on every request, so a revoked session dies immediately. */
export const dynamic = "force-dynamic";

/**
 * Every authenticated screen renders inside here.
 *
 * The session is re-verified server-side rather than trusted from middleware
 * headers — this layout is the last place we can fail closed before user data
 * reaches the browser.
 *
 * Salon data is fetched here once per request and handed to the client
 * provider. Reads are windowed rather than unbounded: the calendar and
 * ledgers only ever show a range, so pulling the entire history would be
 * wasted work that grows every month.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);

  if (!session) redirect("/login");

  const user: SessionUser = {
    id: session.sub,
    email: session.email,
    name: session.name,
    role: session.role,
    staffId: session.staffId,
  };

  const now = new Date();
  // Calendar reaches ~2 months back and 3 months forward; ledgers cover the
  // last 6 months, which is what every report period selector can request.
  const calendarFrom = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const calendarTo = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59, 999);
  const ledgerFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  let data: SalonData;
  try {
    const [
      staff,
      clients,
      services,
      packages,
      products,
      appointments,
      invoices,
      outstanding,
      expenses,
      stockMovements,
      promoCodes,
    ] = await Promise.all([
      getStaff(),
      getClients(),
      getServices(),
      getPackages(),
      getProducts(),
      getAppointments(calendarFrom, calendarTo),
      getInvoices(ledgerFrom, now),
      getOutstandingInvoices(),
      getExpenses(ledgerFrom, now),
      getStockMovements(),
      getPromoCodes(),
    ]);

    // Receivables are fetched without a date bound, so merge them in without
    // duplicating anything already inside the ledger window.
    const seen = new Set(invoices.map((i) => i.id));
    const merged = [...invoices, ...outstanding.filter((i) => !seen.has(i.id))];

    data = {
      staff,
      clients,
      services,
      packages,
      products,
      appointments,
      invoices: merged,
      expenses,
      stockMovements,
      promoCodes,
    };
  } catch (error) {
    // An unreachable or unmigrated database should say so plainly rather than
    // crash with a stack trace the salon cannot act on.
    console.error("[layout] failed to load salon data:", error);
    return <DatabaseUnavailable />;
  }

  return (
    <AuthProvider user={user}>
      <SalonProvider data={data}>
        <AppShell>{children}</AppShell>
      </SalonProvider>
    </AuthProvider>
  );
}
