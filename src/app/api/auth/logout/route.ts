import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions } from "@/lib/auth/session";

export const runtime = "nodejs";

/**
 * POST-only by design: a GET logout can be triggered by any third-party
 * `<img src>` and would let an attacker sign users out at will.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return response;
}
