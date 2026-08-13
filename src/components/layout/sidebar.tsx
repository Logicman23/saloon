"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, LogOut, Settings, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { navSectionsFor } from "@/lib/nav";
import { useAuth } from "@/lib/auth/context";
import { ROLE_META } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const { user, role, roleLabel, signOut } = useAuth();

  // Links the signed-in role cannot reach are never rendered — the matching
  // server-side rule lives in `ROUTE_PERMISSIONS`.
  const sections = React.useMemo(() => navSectionsFor(role), [role]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Mobile scrim */}
      <div
        onClick={onCloseMobile}
        className={cn(
          "fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-hairline bg-obsidian-elevated",
          "transition-[width,transform] duration-300 ease-[var(--ease-luxury)]",
          collapsed ? "w-[76px]" : "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b border-hairline",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          <Link href="/" onClick={onCloseMobile} className="min-w-0">
            <Logo collapsed={collapsed} />
          </Link>
          <button
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-muted hover:bg-white/5 hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-5 last:mb-0">
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                  {section.title}
                </p>
              )}
              {collapsed && <div className="mx-auto mb-3 h-px w-8 bg-hairline" />}

              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onCloseMobile}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ease-[var(--ease-luxury)]",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-gold/12 font-medium text-gold-light"
                            : "text-muted hover:bg-white/5 hover:text-ink",
                        )}
                      >
                        {/* Active rail */}
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-gold transition-opacity",
                            active ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <item.icon
                          className={cn(
                            "size-[18px] shrink-0 transition-colors",
                            active ? "text-gold" : "text-faint group-hover:text-muted",
                          )}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-hairline p-3">
          <div
            className={cn(
              "flex items-center gap-3 rounded-lg p-2",
              collapsed && "justify-center p-0 py-2",
            )}
          >
            <Avatar name={user.name} size="sm" ring />
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                  <p className="truncate text-xs text-faint">{roleLabel}</p>
                </div>
                <div className="flex items-center">
                  <button
                    className="rounded-md p-1.5 text-faint hover:bg-white/5 hover:text-ink"
                    aria-label="Settings"
                  >
                    <Settings className="size-4" />
                  </button>
                  <button
                    onClick={() => void signOut()}
                    className="rounded-md p-1.5 text-faint hover:bg-white/5 hover:text-danger"
                    aria-label="Sign out"
                  >
                    <LogOut className="size-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          {!collapsed && (
            <div className="mt-1 px-2">
              <Badge
                variant="neutral"
                className="w-full justify-center py-1 text-[10px]"
                style={{ color: ROLE_META[role].accent }}
              >
                <span
                  className="size-1.5 rounded-full bg-current"
                  aria-hidden
                />
                {role} ACCESS
              </Badge>
            </div>
          )}

          <button
            onClick={onToggleCollapsed}
            className={cn(
              "mt-1 hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-faint transition-colors hover:bg-white/5 hover:text-muted lg:flex",
              collapsed && "justify-center px-0",
            )}
          >
            <ChevronsLeft
              className={cn("size-4 transition-transform duration-300", collapsed && "rotate-180")}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
