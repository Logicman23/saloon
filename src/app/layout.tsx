import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { Toaster } from "sonner";
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
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  // The management console must never be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout holds only document chrome. Session-aware providers live in
 * `(app)/layout.tsx` so the login screen can render without them.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body className="antialiased">
        {children}

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
