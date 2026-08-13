"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/misc";
import { Monogram } from "@/components/brand/logo";
import { ROLE_META, type Role } from "@/lib/auth/permissions";
import { SALON } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Server error codes mapped to copy the front desk can act on. */
const ERROR_COPY: Record<string, { title: string; description: string }> = {
  invalid_credentials: {
    title: "Invalid credentials",
    description: "That email and password combination doesn't match an account.",
  },
  account_deactivated: {
    title: "Account deactivated",
    description: "This account has been disabled. Ask the owner to reactivate it.",
  },
  too_many_attempts: {
    title: "Too many attempts",
    description: "Sign-in is locked briefly after repeated failures. Try again shortly.",
  },
  invalid_request: {
    title: "Check your details",
    description: "Enter both an email address and a password.",
  },
  server_misconfigured: {
    title: "Server not configured",
    description:
      "AUTH_SECRET is missing or too short on the server, so sessions can't be signed. This is a deployment setting, not your password.",
  },
  server_error: {
    title: "Server error",
    description: "The sign-in service failed. Check the server logs — your credentials are fine.",
  },
  network: {
    title: "Connection problem",
    description: "Couldn't reach the server. Check your connection and retry.",
  },
};

/**
 * Maps a failed response to copy.
 *
 * Falls back on the *status code* rather than assuming bad credentials: a 5xx
 * with an empty body used to surface as "wrong password", which points the
 * user at entirely the wrong problem.
 */
function errorFor(status: number, code?: string) {
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];
  if (status >= 500) return ERROR_COPY.server_error;
  if (status === 429) return ERROR_COPY.too_many_attempts;
  if (status === 400) return ERROR_COPY.invalid_request;
  return ERROR_COPY.invalid_credentials;
}

const DEMO_LOGINS: Array<{
  role: Role;
  email: string;
  password: string;
  icon: LucideIcon;
}> = [
  { role: "ADMIN", email: "owner@sanasbeauty.pk", password: "Owner@2026", icon: ShieldCheck },
  { role: "CASHIER", email: "reception@sanasbeauty.pk", password: "Front@2026", icon: Wallet },
  { role: "STAFF", email: "ayesha@sanasbeauty.pk", password: "Studio@2026", icon: Sparkles },
];

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginView />
    </React.Suspense>
  );
}

function LoginView() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const [showPassword, setShowPassword] = React.useState(false);
  const [pending, setPending] = React.useState<Role | "form" | null>(null);

  // Set by middleware when it bounced an unauthenticated request.
  const nextPath = params.get("next");

  const submit = React.useCallback(
    async (credentials: { email: string; password: string }, marker: Role | "form") => {
      if (!credentials.email.trim() || !credentials.password) {
        const copy = ERROR_COPY.invalid_request;
        toast.error(copy.title, { description: copy.description });
        return;
      }

      setPending(marker);
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...credentials, remember }),
        });

        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          redirectTo?: string;
          user?: { name: string; role: Role };
        };

        if (!response.ok) {
          const copy = errorFor(response.status, data.error);
          toast.error(copy.title, { description: copy.description, duration: 8000 });
          setPending(null);
          return;
        }

        toast.success(`Welcome back, ${data.user?.name.split(" ")[0] ?? "there"}`, {
          description: data.user ? ROLE_META[data.user.role].label : undefined,
        });

        // Only ever follow a relative path — an absolute URL here would be an
        // open redirect straight out of the login form.
        const safeNext = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : null;

        router.replace(safeNext ?? data.redirectTo ?? "/");
        router.refresh();
      } catch {
        const copy = ERROR_COPY.network;
        toast.error(copy.title, { description: copy.description });
        setPending(null);
      }
    },
    [nextPath, remember, router],
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-obsidian px-4 py-10">
      {/* Ambient gold wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(900px 460px at 50% -12%, rgba(212,175,55,0.13), transparent 62%)," +
            "radial-gradient(680px 420px at 88% 108%, rgba(212,175,55,0.07), transparent 58%)",
        }}
      />
      {/* Faint vertical sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 opacity-40"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(212,175,55,0.35), transparent)",
        }}
      />

      <div className="relative w-full max-w-[420px]">
        {/* ------------------------------------------------------ Brand */}
        <div className="mb-7 flex flex-col items-center text-center">
          <Monogram className="size-14 rounded-2xl" />
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-wide text-gilded">
            {SALON.name}
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.32em] text-faint">
            {SALON.tagline}
          </p>
          <div className="rule-gold mt-5 h-px w-24" />
        </div>

        {/* ------------------------------------------------------- Card */}
        <div className="rounded-2xl border border-hairline-strong bg-charcoal/85 p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-7">
          <div className="mb-5">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Sign in</h2>
            <p className="mt-0.5 text-sm text-muted">
              Management console access is restricted to salon staff.
            </p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit({ email, password }, "form");
            }}
            className="space-y-4"
          >
            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email or username</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  className="pl-9"
                  placeholder="you@sanasbeauty.pk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="px-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-faint transition-colors hover:bg-white/5 hover:text-gold"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted">
                <span className="relative flex size-4 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="peer size-4 cursor-pointer appearance-none rounded border border-hairline-strong bg-obsidian-elevated transition-colors checked:border-gold checked:bg-gold"
                  />
                  <svg
                    viewBox="0 0 12 12"
                    className="pointer-events-none absolute size-3 opacity-0 peer-checked:opacity-100"
                    aria-hidden
                  >
                    <path
                      d="M2.5 6.2 4.8 8.5 9.5 3.8"
                      fill="none"
                      stroke="#0d0d0d"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                Remember me
              </label>

              <span className="text-xs text-faint">
                {remember ? "30 days" : "8-hour shift"}
              </span>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={pending !== null}>
              {pending === "form" ? (
                <>
                  <Loader2 className="animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <LogIn /> Sign in
                </>
              )}
            </Button>
          </form>

          {/* --------------------------------------------- Demo switcher */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-hairline" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-faint">
                Demo sign-in
              </span>
              <span className="h-px flex-1 bg-hairline" />
            </div>

            <div className="space-y-1.5">
              {DEMO_LOGINS.map((demo) => {
                const meta = ROLE_META[demo.role];
                const busy = pending === demo.role;
                return (
                  <button
                    key={demo.role}
                    type="button"
                    disabled={pending !== null}
                    onClick={() =>
                      void submit({ email: demo.email, password: demo.password }, demo.role)
                    }
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg border border-hairline bg-obsidian-elevated px-3 py-2.5 text-left transition-all",
                      "hover:border-gold/40 hover:bg-white/[0.03] disabled:opacity-50",
                    )}
                  >
                    <span
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg ring-1"
                      style={{
                        backgroundColor: `${meta.accent}1a`,
                        color: meta.accent,
                        boxShadow: `inset 0 0 0 1px ${meta.accent}33`,
                      }}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <demo.icon className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        Login as {meta.label}
                      </span>
                      <span className="block truncate text-[11px] text-faint">{meta.blurb}</span>
                    </span>
                    <UserCog className="size-3.5 shrink-0 text-faint transition-colors group-hover:text-gold" />
                  </button>
                );
              })}
            </div>

            <p className="mt-3 rounded-lg border border-warning/20 bg-warning/[0.05] p-2.5 text-[11px] leading-relaxed text-warning/90">
              Demo accounts with seeded passwords. Remove{" "}
              <code className="font-mono">DEMO_CREDENTIALS</code> and this switcher before the
              salon goes live.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-faint">
          {SALON.address} · {SALON.phone}
        </p>
      </div>
    </main>
  );
}
