"use client";

import { APP_NAME } from "@app/core";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useViewer } from "@/lib/viewer";

const NAV = [
  { href: "/", label: "Dig" },
  { href: "/crates", label: "Crates" },
  { href: "/history", label: "History" },
  { href: "/changelog", label: "Changelog" },
];

/** Not sticky: a sticky header would slide over the player when the page scrolls. */
export function SiteHeader() {
  const path = usePathname();
  const { me, loading } = useViewer();
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="inline-block h-6 w-6 rounded-full border-4 border-accent bg-ink"
          />
          {APP_NAME}
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink",
                (n.href === "/" ? path === "/" : path.startsWith(n.href)) &&
                  "bg-surface-2 text-ink",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {loading ? null : me ? (
          <Link
            href="/account"
            className="rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2"
          >
            {me.plan === "pro" ? "Pro · " : ""}Account
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
