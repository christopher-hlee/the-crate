"use client";

import { ApiError } from "@app/api-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { signOut } from "@/lib/supabase-browser";
import { useViewer } from "@/lib/viewer";

const PRO_TOOLS = [
  "Tempo, key, views, deep-cut, format-note, label and artist filters",
  "Timestamped notes",
  "Unlimited crates, seeded crates and share links",
  "CSV and JSON crate sheets",
  "1,000-play history",
  "No ads",
];

export default function AccountPage() {
  const router = useRouter();
  const { me, loading, refresh } = useViewer();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!me) return <SignInPrompt what="manage your account" />;

  const go = async (fn: () => Promise<{ url: string }>) => {
    setError(null);
    setBusy(true);
    try {
      window.location.href = (await fn()).url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Billing isn't available right now.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <Card className="space-y-2">
        <p className="text-sm text-ink-2">Signed in as {me.user.email ?? me.user.id}</p>
        <p>
          Plan: <span className="font-semibold">{me.plan === "pro" ? "Pro" : "Free"}</span>
          {me.planSource && (
            <span className="text-sm text-ink-2">
              {" "}
              · billed through {me.planSource.replace("_", " ")}
            </span>
          )}
          {me.expiresAt && (
            <span className="text-sm text-ink-2">
              {" "}
              · renews or ends {new Date(me.expiresAt).toLocaleDateString()}
            </span>
          )}
        </p>
        <p className="text-sm text-ink-2">
          {me.limits.maxCrates === null
            ? "Unlimited crates"
            : `${me.limits.maxCrates} crates of up to ${me.limits.maxItemsPerCrate} records`}{" "}
          · history keeps your last {me.limits.historyWindow.toLocaleString("en-US")} plays
        </p>
      </Card>

      {me.plan === "free" ? (
        <Card className="space-y-3">
          <h2 className="font-semibold">Pro: tools for diggers</h2>
          <p className="text-sm text-ink-2">
            Listening is free and always will be. Pro adds tools:
          </p>
          <ul className="list-inside list-disc text-sm">
            {PRO_TOOLS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => go(() => api.checkout("month"))}
            >
              Go Pro monthly
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => go(() => api.checkout("year"))}
            >
              Yearly
            </Button>
          </div>
        </Card>
      ) : (
        me.planSource === "stripe" && (
          <Button variant="outline" disabled={busy} onClick={() => go(() => api.portal())}>
            Manage billing
          </Button>
        )
      )}
      {me.plan === "pro" && me.planSource && me.planSource !== "stripe" && (
        <p className="text-sm text-ink-2">
          Your subscription is managed in the{" "}
          {me.planSource === "app_store" ? "App Store" : "Google Play"}.
        </p>
      )}
      {error && <p className="text-sm text-warn">{error}</p>}

      <Button
        variant="ghost"
        onClick={async () => {
          await signOut();
          await refresh();
          router.push("/");
        }}
      >
        Sign out
      </Button>

      <Card className="space-y-3 border-red-800/50">
        <h2 className="font-semibold">Delete account</h2>
        <p className="text-sm text-ink-2">
          This deletes your crates, notes, history, votes and link suggestions right away, and your
          sign-in within 7 days at most. Cancel any App Store or Google Play subscription in the
          store as well.
        </p>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.deleteAccount();
              await signOut();
              await refresh();
              router.push("/");
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Couldn't delete the account.");
              setBusy(false);
            }
          }}
        >
          <Input
            placeholder='Type "delete" to confirm'
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-label="Confirm deletion"
          />
          <Button type="submit" variant="danger" disabled={confirm !== "delete" || busy}>
            Delete
          </Button>
        </form>
      </Card>
    </div>
  );
}
