"use client";

import { isAuthError } from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  authCallbackUrl,
  authErrorMessage,
  authErrorText,
  isAuthErrorCode,
  MIN_PASSWORD_LENGTH,
  OAUTH_PROVIDER_LABELS,
  type OAuthProvider,
  passwordProblem,
  safeNextPath,
} from "@/lib/sign-in";
import { AUTH_MODE, AUTH_PROVIDERS, supabaseBrowser } from "@/lib/supabase-browser";
import { useViewer } from "@/lib/viewer";

type Mode = "signin" | "signup" | "magic" | "reset";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "signin", label: "Sign in" },
  { mode: "signup", label: "Create account" },
  { mode: "magic", label: "Email link" },
];

const SUBMIT_LABEL: Record<Mode, string> = {
  signin: "Sign in",
  signup: "Create account",
  magic: "Email me a sign-in link",
  reset: "Email me a reset link",
};

/** Our own words for Supabase's known error codes; otherwise its message (from its API, not a URL). */
function messageOf(err: unknown): string {
  if (isAuthError(err) && isAuthErrorCode(err.code)) return authErrorMessage(err.code);
  return err instanceof Error && err.message ? err.message : "Something went wrong. Try again.";
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-warn">
      {error}
    </p>
  ) : null;
}

export function LoginForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const { me, loading } = useViewer();
  // A failed link or provider sign-in comes back with error codes on the redirect. Only fixed
  // words are shown for them, never the redirect's error_description.
  const [error, setError] = useState<string | null>(() => authErrorText(params));
  useEffect(() => {
    // Implicit-flow redirects carry them in the fragment instead.
    const text = authErrorText(new URLSearchParams(window.location.hash.slice(1)));
    if (text) setError(text);
  }, []);

  if (!loading && me) {
    return (
      <Card className="space-y-3">
        <p className="text-sm">You're signed in as {me.user.email ?? "a test user"}.</p>
        <Link href={next} className="text-accent underline">
          Continue
        </Link>
      </Card>
    );
  }
  if (AUTH_MODE === "dev") return <DevSignIn next={next} error={error} />;
  return <SupabaseSignIn next={next} error={error} setError={setError} />;
}

/** AUTH_MODE=dev: no Supabase, sign in as a made-up user (local work and end-to-end tests). */
function DevSignIn({ next, error }: { next: string; error: string | null }) {
  const router = useRouter();
  const { refresh } = useViewer();
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-3">
      <p className="text-sm text-ink-2">Development sign-in: no Supabase project is configured.</p>
      <Button
        variant="primary"
        data-testid="dev-login"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await fetch("/api/dev/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          });
          await refresh();
          router.push(next);
        }}
      >
        Continue as a test user
      </Button>
      <ErrorText error={error} />
    </Card>
  );
}

function SupabaseSignIn({
  next,
  error,
  setError,
}: {
  next: string;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const router = useRouter();
  const { refresh } = useViewer();
  const supabase = supabaseBrowser();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const signedIn = async () => {
    await refresh();
    router.replace(next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!supabase) {
      setError(authErrorMessage("not_configured"));
      return;
    }
    if (mode === "signup") {
      const problem = passwordProblem(password);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    const origin = window.location.origin;
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        await signedIn();
      } else if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authCallbackUrl(origin, next) },
        });
        if (err) throw err;
        // With email confirmation off, Supabase signs the new account straight in.
        if (data.session) await signedIn();
        else setNotice(`Check ${email} for a link to confirm your account.`);
      } else if (mode === "magic") {
        const { error: err } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: authCallbackUrl(origin, next) },
        });
        if (err) throw err;
        setNotice(`Check ${email} for a sign-in link.`);
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: authCallbackUrl(origin, "/account/password"),
        });
        if (err) throw err;
        setNotice(`If ${email} has an account, a link to set a new password is on its way.`);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const onOAuth = async (provider: OAuthProvider) => {
    setError(null);
    setNotice(null);
    if (!supabase) {
      setError(authErrorMessage("not_configured"));
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: authCallbackUrl(window.location.origin, next) },
      });
      if (err) throw err;
      // Supabase now sends the browser to the provider; stay busy until the page unloads.
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  const usesPassword = mode === "signin" || mode === "signup";

  return (
    <Card className="space-y-4">
      {mode === "reset" ? (
        <div className="space-y-1">
          <h2 className="font-semibold">Reset your password</h2>
          <p className="text-sm text-ink-2">
            We'll email you a link. It brings you back here signed in, to choose a new password.
          </p>
        </div>
      ) : (
        <fieldset className="grid grid-cols-3 gap-1 rounded-md bg-surface-2 p-1 text-sm">
          <legend className="sr-only">How to sign in</legend>
          {TABS.map((t) => (
            <button
              key={t.mode}
              type="button"
              aria-pressed={mode === t.mode}
              onClick={() => switchTo(t.mode)}
              className={cn(
                "rounded px-2 py-1.5 text-ink-2 hover:text-ink",
                mode === t.mode && "bg-surface text-ink shadow-sm",
              )}
            >
              {t.label}
            </button>
          ))}
        </fieldset>
      )}

      <form className="space-y-3" onSubmit={onSubmit}>
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
        {usesPassword && (
          <label className="block space-y-1 text-sm">
            <span>Password</span>
            <Input
              type="password"
              required
              minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {mode === "signup" && (
              <span className="block text-xs text-ink-2">
                At least {MIN_PASSWORD_LENGTH} characters.
              </span>
            )}
          </label>
        )}
        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {SUBMIT_LABEL[mode]}
        </Button>
        {mode === "signin" && (
          <button
            type="button"
            className="text-sm text-ink-2 underline hover:text-ink"
            onClick={() => switchTo("reset")}
          >
            Forgot password?
          </button>
        )}
        {mode === "reset" && (
          <button
            type="button"
            className="text-sm text-ink-2 underline hover:text-ink"
            onClick={() => switchTo("signin")}
          >
            Back to sign in
          </button>
        )}
      </form>

      {notice && (
        <p role="status" className="text-sm text-good">
          {notice}
        </p>
      )}
      <ErrorText error={error} />

      {AUTH_PROVIDERS.length > 0 && mode !== "reset" && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-center text-xs text-ink-2">Or continue with</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {AUTH_PROVIDERS.map((p) => (
              <Button key={p} variant="outline" disabled={busy} onClick={() => onOAuth(p)}>
                {OAUTH_PROVIDER_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
