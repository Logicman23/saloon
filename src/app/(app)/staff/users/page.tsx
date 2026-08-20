import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { roleCan } from "@/lib/auth/permissions";
import { getStaff, getUsers } from "@/lib/db/queries";
import { UsersView } from "@/components/staff/users-view";

/**
 * Login administration.
 *
 * A server component rather than a client page reading the salon store, and
 * deliberately so: account status, lockouts and last-sign-in are meaningful to
 * the owner alone, and routing them through the shared provider would ship
 * them to every cashier's browser. Nothing reaches the client until the
 * permission check below has passed.
 */
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");

  // Middleware guards this path too. Repeating it here is the fail-closed
  // layer: this is the last point before user records are serialised.
  if (!roleCan(session.role, "users.manage")) redirect("/denied");

  const [users, staff] = await Promise.all([getUsers(), getStaff()]);

  return <UsersView users={users} staff={staff} currentUserId={session.sub} />;
}
