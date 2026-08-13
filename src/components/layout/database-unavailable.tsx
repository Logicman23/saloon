import { Database, TerminalSquare } from "lucide-react";
import { Logo } from "@/components/brand/logo";

/**
 * Shown when the salon data cannot be read.
 *
 * Almost always one of three things on a fresh deploy: DATABASE_URL unset,
 * the migration not applied, or the seed not run — so the page names all
 * three rather than making the reader guess from a stack trace.
 */
export function DatabaseUnavailable() {
  const steps = [
    { label: "Set the connection string", cmd: "DATABASE_URL / DIRECT_URL in .env" },
    { label: "Create the tables", cmd: "npx prisma migrate deploy" },
    { label: "Seed roles, staff and catalogue", cmd: "npm run db:seed" },
  ];

  return (
    <main className="flex min-h-screen items-center justify-center bg-obsidian px-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>

        <div className="rounded-2xl border border-danger/25 bg-charcoal p-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-danger/30 bg-danger/10">
              <Database className="size-5 text-danger" />
            </span>
            <div>
              <h1 className="text-base font-semibold text-ink">Can&apos;t reach the database</h1>
              <p className="mt-1 text-sm text-muted">
                The app is running, but the salon data could not be loaded. Nothing has been lost —
                this is a configuration step, not a fault in your records.
              </p>
            </div>
          </div>

          <ol className="mt-5 space-y-3">
            {steps.map((step, index) => (
              <li key={step.cmd} className="flex gap-3">
                <span className="tabular mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[11px] text-faint">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-ink">{step.label}</p>
                  <code className="mt-0.5 block truncate font-mono text-xs text-gold">
                    {step.cmd}
                  </code>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-5 flex items-start gap-2 rounded-lg border border-hairline bg-obsidian-elevated p-3 text-xs text-faint">
            <TerminalSquare className="mt-0.5 size-3.5 shrink-0" />
            The exact error is in the server logs — on Vercel, under the deployment&apos;s
            Functions tab.
          </p>
        </div>
      </div>
    </main>
  );
}
