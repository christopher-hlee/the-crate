import { APP_NAME } from "@app/core";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type AuthErrorCode,
  authErrorMessage,
  type EmailLinkType,
  emailLinkNext,
  emailLinkToken,
  emailLinkType,
  loginHref,
} from "@/lib/sign-in";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Finish signing in", robots: { index: false } };

const BUTTON: Record<EmailLinkType, string> = {
  magiclink: "Sign in",
  email: "Sign in",
  signup: "Confirm my email and sign in",
  invite: "Accept the invite and sign in",
  recovery: "Sign in to choose a new password",
  email_change: "Confirm my new email",
};

type Param = string | string[] | undefined;
type Props = { searchParams: Promise<{ token_hash?: Param; type?: Param; next?: Param }> };

const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

function Problem({ code, next }: { code: AuthErrorCode; next: string }) {
  return (
    <Card className="space-y-3">
      <p role="alert" className="text-sm text-warn">
        {authErrorMessage(code)}
      </p>
      <Link
        href={loginHref("/login", new URLSearchParams({ next }))}
        className="text-sm text-accent underline"
      >
        Go to sign in
      </Link>
    </Card>
  );
}

/**
 * Where an email link with a token_hash lands (by way of /auth/callback). Opening it signs
 * nobody in: the button POSTs the token to /auth/verify, which checks the request came from
 * this site. Mail scanners that open links don't use the token up, either.
 */
export default async function ConfirmPage({ searchParams }: Props) {
  const q = await searchParams;
  const type = emailLinkType(first(q.type));
  const tokenHash = emailLinkToken(first(q.token_hash));
  const next = emailLinkNext(type, first(q.next));
  const { supabaseUrl, anonKey } = env();

  let body: ReactNode;
  if (!type || !tokenHash) {
    body = <Problem code="incomplete_link" next={next} />;
  } else if (!supabaseUrl || !anonKey) {
    body = <Problem code="not_configured" next={next} />;
  } else {
    body = (
      <Card className="space-y-3">
        <p className="text-sm">
          You opened a sign-in link for {APP_NAME}. Press the button to finish.
        </p>
        <p className="text-sm text-ink-2">
          Only continue if you asked for this email yourself. A link someone else sent you could
          sign you into their account instead of yours.
        </p>
        <form method="post" action="/auth/verify">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="primary" className="w-full">
            {BUTTON[type]}
          </Button>
        </form>
        <Link href="/" className="block text-sm text-ink-2 underline hover:text-ink">
          Not now
        </Link>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Finish signing in</h1>
      {body}
    </div>
  );
}
