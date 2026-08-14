import {
  BarChart3,
  CalendarClock,
  CalendarDays,
  Package,
  Percent,
  Receipt,
  ScrollText,
  Scissors,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Permission, Role } from "@/lib/auth/permissions";
import { roleCanAny } from "@/lib/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Item is shown when the role holds at least one of these. */
  anyOf: Permission[];
  /** Rendered as a keyboard hint in the command palette. */
  shortcut?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "My Work",
    items: [
      {
        href: "/my-schedule",
        label: "My Schedule",
        icon: CalendarClock,
        description: "Your assigned clients for today and this week",
        anyOf: ["appointments.view.own"],
      },
      {
        href: "/my-commissions",
        label: "My Commissions",
        icon: Percent,
        description: "Commission earned per completed service",
        anyOf: ["commissions.view.own"],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: BarChart3,
        description: "Revenue, profit and today at a glance",
        anyOf: ["finance.view"],
        shortcut: "D",
      },
      {
        href: "/pos",
        label: "POS & Billing",
        icon: Receipt,
        description: "Ring up services, products and packages",
        anyOf: ["pos.operate"],
        shortcut: "B",
      },
      {
        href: "/appointments",
        label: "Appointments",
        icon: CalendarDays,
        description: "Calendar, kanban board and bookings",
        anyOf: ["appointments.view.all", "appointments.manage"],
        shortcut: "A",
      },
      {
        href: "/clients",
        label: "Clients",
        icon: Users,
        description: "Profiles, visit history and spend",
        anyOf: ["clients.view"],
        shortcut: "C",
      },
    ],
  },
  {
    title: "Catalogue",
    items: [
      {
        href: "/services",
        label: "Services & Packages",
        icon: Sparkles,
        description: "Pricing, duration and combo deals",
        anyOf: ["services.view"],
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Package,
        description: "Retail stock, back-bar and alerts",
        anyOf: ["inventory.view"],
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        href: "/expenses",
        label: "Expenses",
        icon: Wallet,
        description: "Rent, bills, salaries and daily spend",
        anyOf: ["expenses.view"],
      },
      {
        href: "/invoices",
        label: "Invoices",
        icon: ScrollText,
        description: "Every bill, payment and outstanding balance",
        anyOf: ["invoice.view"],
      },
      {
        href: "/reports",
        label: "Reports",
        icon: BarChart3,
        description: "Sales, expenses and staff commission",
        anyOf: ["reports.view"],
      },
      {
        href: "/staff",
        label: "Staff",
        icon: Scissors,
        description: "Team, performance and commission rates",
        anyOf: ["staff.view"],
      },
    ],
  },
];

/** Every item, unfiltered — used for breadcrumbs and page titles. */
export const ALL_NAV_ITEMS = SECTIONS.flatMap((section) => section.items);

/**
 * Navigation the given role may actually reach. Empty sections are dropped so
 * a beautician never sees a bare "Finance" heading with nothing under it.
 *
 * This mirrors `ROUTE_PERMISSIONS`; middleware is what enforces it.
 */
export function navSectionsFor(role: Role): NavSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => roleCanAny(role, item.anyOf)),
  })).filter((section) => section.items.length > 0);
}

export function navItemsFor(role: Role): NavItem[] {
  return navSectionsFor(role).flatMap((section) => section.items);
}

/**
 * The salon's own details. Printed on every client receipt and PDF invoice,
 * so anything placeholder here goes out to customers — treat a wrong value
 * as a live defect, not cosmetic.
 *
 * `ntn` and `instagram` render only when non-empty, so an unknown value is
 * left blank rather than invented: a receipt with no tax number is a gap, but
 * one carrying a made-up registration is a misstatement.
 */
export const SALON = {
  name: "Sana's Beauty Saloon",
  shortName: "Sana's",
  tagline: "Beauty & Bridal Studio",
  address: "Comercial Market B Block, Nadeem Plaza, Satellite Town, Rawalpindi",
  phone: "0301-0810943",
  instagram: "@sanasbeautysaloon",
  ntn: "",
} as const;
