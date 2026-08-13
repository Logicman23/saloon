"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandSearch, useCommandShortcut } from "@/components/layout/command-search";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const openSearch = React.useCallback(() => setSearchOpen(true), []);
  useCommandShortcut(openSearch);

  // The drawer closes from the nav links themselves (`onCloseMobile`), so no
  // pathname effect is needed here.

  return (
    <div className="min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-300 ease-[var(--ease-luxury)]",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]",
        )}
      >
        <Topbar onOpenSearch={openSearch} onOpenMobileNav={() => setMobileOpen(true)} />

        <main className="canvas-vignette flex-1 p-4 lg:p-6">{children}</main>
      </div>

      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
