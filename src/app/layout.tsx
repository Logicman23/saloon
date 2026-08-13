import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { SalonProvider } from "@/lib/data/store";
import { SALON } from "@/lib/nav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${SALON.name} — Management System`,
    template: `%s · ${SALON.shortName}`,
  },
  description:
    "Point of sale, appointments, inventory, expenses and analytics for Sana's Beauty Saloon.",
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="antialiased">
        <SalonProvider>
          <AppShell>{children}</AppShell>
        </SalonProvider>

        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#1a1a1a",
              border: "1px solid #333333",
              color: "#ffffff",
            },
          }}
        />
      </body>
    </html>
  );
}
