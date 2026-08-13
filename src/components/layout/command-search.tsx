"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CornerDownLeft,
  Package,
  Search,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useSalon } from "@/lib/data/store";
import { ALL_NAV_ITEMS } from "@/lib/nav";
import { cn, formatMoney } from "@/lib/utils";

interface Result {
  id: string;
  label: string;
  hint: string;
  group: "Navigate" | "Clients" | "Services" | "Products";
  icon: LucideIcon;
  href: string;
  /** True when this row starts a new group, so the header renders above it. */
  startsGroup: boolean;
}

/**
 * Ctrl/Cmd-K palette searching clients, catalogue and navigation at once.
 * Deliberately dependency-free — the whole dataset is already in memory.
 */
export function CommandSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" hideClose className="top-[12%] translate-y-0 p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        {/* Radix unmounts Content on close, so the panel's state resets
            naturally on every open — no reset effect required. */}
        <SearchPanel onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { clients, services, products } = useSalon();
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const results = React.useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const collected: Omit<Result, "startsGroup">[] = [];

    const nav = ALL_NAV_ITEMS.map((item) => ({
      id: `nav:${item.href}`,
      label: item.label,
      hint: item.description,
      group: "Navigate" as const,
      icon: item.icon,
      href: item.href,
    }));

    if (!q) {
      collected.push(...nav);
    } else {
      collected.push(
        ...nav.filter(
          (n) => n.label.toLowerCase().includes(q) || n.hint.toLowerCase().includes(q),
        ),
      );

      for (const client of clients) {
        if (
          client.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && client.phone.replace(/\D/g, "").includes(digits))
        ) {
          collected.push({
            id: `cli:${client.id}`,
            label: client.name,
            hint: client.phone,
            group: "Clients",
            icon: User,
            href: `/clients?focus=${client.id}`,
          });
        }
      }

      for (const service of services) {
        if (service.name.toLowerCase().includes(q) || service.category.toLowerCase().includes(q)) {
          collected.push({
            id: `svc:${service.id}`,
            label: service.name,
            hint: `${service.category} · ${formatMoney(service.price)}`,
            group: "Services",
            icon: Sparkles,
            href: `/services?focus=${service.id}`,
          });
        }
      }

      for (const product of products) {
        if (product.name.toLowerCase().includes(q) || product.sku.toLowerCase().includes(q)) {
          collected.push({
            id: `prd:${product.id}`,
            label: product.name,
            hint: `${product.sku} · ${product.stock} in stock`,
            group: "Products",
            icon: Package,
            href: `/inventory?focus=${product.id}`,
          });
        }
      }
    }

    // Group headers are computed here rather than mutating a variable
    // mid-render, which would misbehave across re-renders.
    return collected.slice(0, 24).map((item, index, all) => ({
      ...item,
      startsGroup: index === 0 || all[index - 1].group !== item.group,
    }));
  }, [query, clients, services, products]);

  const commit = React.useCallback(
    (result: Result | undefined) => {
      if (!result) return;
      onClose();
      router.push(result.href);
    },
    [onClose, router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(results[cursor]);
    }
  };

  // Keep the highlighted row in view during keyboard navigation.
  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Guard against a stale cursor if the result list shrank.
  const activeIndex = Math.min(cursor, Math.max(0, results.length - 1));

  return (
    <>
      <div className="flex items-center gap-3 border-b border-hairline px-4 py-3.5">
        <Search className="size-4 shrink-0 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search clients, services, products or jump to a page…"
          className="w-full bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-hairline-strong px-1.5 py-0.5 text-[10px] text-faint sm:block">
          ESC
        </kbd>
      </div>

      <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
        {results.length === 0 && (
          <p className="px-3 py-10 text-center text-sm text-faint">No matches for “{query}”.</p>
        )}

        {results.map((result, index) => {
          const active = index === activeIndex;
          return (
            <React.Fragment key={result.id}>
              {result.startsGroup && (
                <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                  {result.group}
                </p>
              )}
              <button
                data-index={index}
                onClick={() => commit(result)}
                onMouseEnter={() => setCursor(index)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  active ? "bg-gold/12" : "hover:bg-white/5",
                )}
              >
                <result.icon className={cn("size-4 shrink-0", active ? "text-gold" : "text-faint")} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn("block truncate text-sm", active ? "text-gold-light" : "text-ink")}
                  >
                    {result.label}
                  </span>
                  <span className="block truncate text-xs text-faint">{result.hint}</span>
                </span>
                {active && <CornerDownLeft className="size-3.5 shrink-0 text-gold/70" />}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5 text-[11px] text-faint">
        <span className="flex items-center gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
        </span>
        <Badge variant="neutral" className="text-[10px]">
          {results.length} result{results.length === 1 ? "" : "s"}
        </Badge>
      </div>
    </>
  );
}

/** Registers the global Ctrl/Cmd-K shortcut. */
export function useCommandShortcut(onOpen: () => void) {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
