"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/context";
import { landingFor } from "@/lib/auth/permissions";

export default function DeniedPage() {
  return (
    <React.Suspense fallback={null}>
      <DeniedView />
    </React.Suspense>
  );
}

function DeniedView() {
  const params = useSearchParams();
  const { user, roleLabel, role } = useAuth();
  const from = params.get("from");

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="max-w-md p-7 text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full border border-danger/30 bg-danger/10">
          <ShieldAlert className="size-6 text-danger" />
        </span>

        <h1 className="mt-4 text-lg font-semibold tracking-tight text-ink">
          You don&apos;t have access to this area
        </h1>

        <p className="mt-2 text-sm text-muted">
          {from ? (
            <>
              <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-faint">
                {from}
              </code>{" "}
              requires a permission your role doesn&apos;t hold.
            </>
          ) : (
            "This section requires a permission your role doesn't hold."
          )}
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <Badge variant="neutral">{user.name}</Badge>
          <Badge variant="default">{roleLabel}</Badge>
        </div>

        <p className="mt-4 text-xs text-faint">
          If this is wrong, the salon owner can change your role from the Staff module.
        </p>

        <Button asChild className="mt-5 w-full">
          <Link href={landingFor(role)}>
            <ArrowLeft /> Back to my dashboard
          </Link>
        </Button>
      </Card>
    </div>
  );
}
