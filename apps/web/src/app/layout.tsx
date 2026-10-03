import { APP_NAME } from "@app/core";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ViewerProvider } from "@/lib/viewer";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME}: dig through records at random`, template: `%s · ${APP_NAME}` },
  description:
    "Shuffle through Discogs records with YouTube links. Filter by style, year, country and format, and save what you find to crates.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <ViewerProvider>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <SiteFooter />
        </ViewerProvider>
      </body>
    </html>
  );
}
