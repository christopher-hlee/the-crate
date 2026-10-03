"use client";

import { APP_NAME } from "@app/core";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AUTH_MODE, supabaseBrowser } from "@/lib/supabase-browser";
import { useViewer } from "@/lib/viewer";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useViewer();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") ? "Sign-in didn't complete. Try again." : null,
  );
  const redirectTo =
    typeof window === "undefined" ? undefined : `${window.location.origin}/auth/callback`;

  if (AUTH_MODE === "dev") {
    return (
      <Card className="space-y-3">
        <p className="text-sm text-ink-2">
          Development sign-in: no Supabase project is configured.
        </p>
        <Button
          variant="primary"
          data-testid="dev-login"
          onClick={async () => {
            await fetch("/api/dev/session", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            });
            await refresh();
            router.push("/");
          }}
        >
          Continue as a test user
        </Button>
      </Card>
    );
  }

  const supabase = supabaseBrowser();
  return (
    <Card className="space-y-4">
      {sent ? (
        <p>Check {email} for a sign-in link.</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const { error: err } = (await supabase?.auth.signInWithOtp({
              email,
              options: { emailRedirectTo: redirectTo },
            })) ?? {
              error: new Error("Auth isn't configured"),
            };
            if (err) setError(err.message);
            else setSent(true);
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>Email</span>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <Button type="submit" variant="primary" className="w-full">
            Email me a sign-in link
          </Button>
        </form>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          onClick={() =>
            supabase?.auth.signInWithOAuth({ provider: "google", options: { redirectTo } })
          }
        >
          Continue with Google
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            supabase?.auth.signInWithOAuth({ provider: "apple", options: { redirectTo } })
          }
        >
          Continue with Apple
        </Button>
      </div>
      {error && <p className="text-sm text-warn">{error}</p>}
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Sign in to {APP_NAME}</h1>
      <p className="text-sm text-ink-2">
        Signing in keeps your crates and history across devices. Listening never needs an account.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
