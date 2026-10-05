"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { loginHref } from "@/lib/sign-in";

type LinkProps = { className?: string; children: ReactNode };

function WithQuery({ pathname, ...props }: LinkProps & { pathname: string }) {
  const params = useSearchParams();
  return <Link href={loginHref(pathname, params)} {...props} />;
}

/** A link to /login?next=<this page>, so signing in comes back here (query included). */
export function SignInLink(props: LinkProps) {
  const pathname = usePathname();
  // useSearchParams needs a Suspense boundary on prerendered pages; the path alone stands in.
  return (
    <Suspense fallback={<Link href={loginHref(pathname)} {...props} />}>
      <WithQuery pathname={pathname} {...props} />
    </Suspense>
  );
}

export function SignInPrompt({ what }: { what: string }) {
  return (
    <p className="text-ink-2">
      <SignInLink className="text-accent underline">Sign in</SignInLink> to {what}.
    </p>
  );
}
