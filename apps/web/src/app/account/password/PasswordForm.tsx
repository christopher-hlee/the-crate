"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/sign-in";
import { AUTH_MODE, supabaseBrowser } from "@/lib/supabase-browser";
import { useViewer } from "@/lib/viewer";

/** Sets a new password for the signed-in user, e.g. after a password-reset link. */
export function PasswordForm() {
  const { me, loading } = useViewer();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (AUTH_MODE === "dev") {
    return (
      <Card>
        <p className="text-sm text-ink-2">
          Passwords need Supabase. The development sign-in has no password to change.
        </p>
      </Card>
    );
  }
  if (loading) return null;
  if (!me) return <SignInPrompt what="set a new password" />;
  if (done) {
    return (
      <Card className="space-y-2">
        <p role="status">Your password is updated.</p>
        <Link href="/account" className="text-sm text-accent underline">
          Back to your account
        </Link>
      </Card>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem =
      passwordProblem(password) ?? (password !== confirm ? "The passwords don't match." : null);
    setError(problem);
    if (problem) return;
    const supabase = supabaseBrowser();
    if (!supabase) {
      setError("Sign-in isn't configured on this server.");
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't update the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form className="space-y-3" onSubmit={onSubmit}>
        <p className="text-sm text-ink-2">Signed in as {me.user.email ?? me.user.id}.</p>
        <label className="block space-y-1 text-sm">
          <span>New password</span>
          <Input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="block text-xs text-ink-2">
            At least {MIN_PASSWORD_LENGTH} characters.
          </span>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Confirm new password</span>
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          Save password
        </Button>
      </form>
    </Card>
  );
}
