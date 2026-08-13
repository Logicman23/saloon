import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { SalonProvider } from "@/lib/data/store";
import { AuthProvider, type SessionUser } from "@/lib/auth/context";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Every authenticated screen renders inside here.
 *
 * The session is re-verified server-side rather than trusted from the
 * middleware headers — this layout is the last place we can fail closed
 * before user data reaches the browser.
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

  return (
    <AuthProvider user={user}>
      <SalonProvider>
        <AppShell>{children}</AppShell>
      </SalonProvider>
    </AuthProvider>
  );
}
