import {
  BarChart3,
  CalendarDays,
  Package,
  Receipt,
  ScrollText,
  Scissors,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Rendered as a keyboard hint in the command palette. */
  shortcut?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Operations",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: BarChart3,
        description: "Revenue, profit and today at a glance",
        shortcut: "D",
      },
      {
        href: "/pos",
        label: "POS & Billing",
        icon: Receipt,
        description: "Ring up services, products and packages",
        shortcut: "B",
      },
      {
        href: "/appointments",
        label: "Appointments",
        icon: CalendarDays,
        description: "Calendar, kanban board and bookings",
        shortcut: "A",
      },
      {
        href: "/clients",
        label: "Clients",
        icon: Users,
        description: "Profiles, visit history and spend",
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
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Package,
        description: "Retail stock, back-bar and alerts",
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
      },
      {
        href: "/invoices",
        label: "Invoices",
        icon: ScrollText,
        description: "Every bill, payment and outstanding balance",
      },
      {
        href: "/reports",
        label: "Reports",
        icon: BarChart3,
        description: "Sales, expenses and staff commission",
      },
      {
        href: "/staff",
        label: "Staff",
        icon: Scissors,
        description: "Team, performance and commission rates",
      },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

export const SALON = {
  name: "Sana's Beauty Saloon",
  shortName: "Sana's",
  tagline: "Beauty & Bridal Studio",
  address: "12-C Main Boulevard, Gulberg III, Lahore",
  phone: "042-3577 1234",
  mobile: "0300-1234567",
  instagram: "@sanasbeautysaloon",
  ntn: "SBS-4410927",
} as const;
