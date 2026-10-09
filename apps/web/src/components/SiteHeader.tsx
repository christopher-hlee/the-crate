"use client";

import { APP_NAME } from "@app/core";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { SignInLink } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { signOut } from "@/lib/supabase-browser";
import { useViewer } from "@/lib/viewer";

const NAV: { href: string; label: string; signedIn?: true }[] = [
  { href: "/", label: "Dig" },
  { href: "/daily", label: "Daily" },
  { href: "/trending", label: "Trending" },
  { href: "/favorites", label: "Favorites", signedIn: true },
  { href: "/for-you", label: "For you", signedIn: true },
  { href: "/crates", label: "Crates" },
  { href: "/history", label: "History" },
  { href: "/comments", label: "Comments", signedIn: true },
  { href: "/changelog", label: "Changelog" },
];

function isActive(path: string, href: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

/**
 * Not sticky or fixed: a header that stays put would slide over the player when the page
 * scrolls (rule 3). On phones the nav takes its own row below the logo and account links.
 */
export function SiteHeader() {
  const path = usePathname();
  const router = useRouter();
  const { me, loading, refresh } = useViewer();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
    await refresh();
    setSigningOut(false);
    router.refresh();
  };

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="inline-block h-6 w-6 rounded-full border-4 border-accent bg-ink"
          />
          {APP_NAME}
        </Link>
        <nav
          aria-label="Main"
          className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto text-sm md:order-none md:mx-0 md:w-auto md:flex-1"
        >
          {NAV.filter((n) => !n.signedIn || me).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink",
                isActive(path, n.href) && "bg-surface-2 text-ink",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          {loading ? null : me ? (
            <>
              <Link
                href="/account"
                aria-current={path.startsWith("/account") ? "page" : undefined}
                className="rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                {me.plan === "pro" ? "Pro · " : ""}Account
              </Link>
              <Button variant="ghost" size="sm" disabled={signingOut} onClick={onSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <SignInLink className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink">
              Sign in
            </SignInLink>
          )}
        </div>
      </div>
    </header>
  );
}
