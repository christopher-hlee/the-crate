"use client";

import { ApiError } from "@app/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { AUTH_MODE, signOut } from "@/lib/supabase-browser";
import { useViewer } from "@/lib/viewer";
import { DisplayNameCard } from "./DisplayNameCard";
import { freeFeatures, limitsSummary, proFeatures } from "./plan-copy";

const FREE_FEATURES = freeFeatures();
const PRO_FEATURES = proFeatures();

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="list-inside list-disc space-y-0.5 text-sm">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

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

  const leave = async () => {
    // The session may already be gone (a deleted account); either way, drop it locally.
    await signOut().catch((err: unknown) => console.error(err));
    await refresh();
    router.push("/");
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
        <p className="text-sm text-ink-2">{limitsSummary(me.limits)}</p>
        {AUTH_MODE === "supabase" && (
          <Link href="/account/password" className="inline-block text-sm text-accent underline">
            Change password
          </Link>
        )}
      </Card>

      <DisplayNameCard key={me.user.id} me={me} onSaved={refresh} />

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Free and Pro</h2>
          <p className="text-sm text-ink-2">
            Listening is free and always will be. Pro sells tools, never playback.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="space-y-2" data-testid="plan-free">
            <h3 className="text-sm font-semibold">
              Free
              {me.plan === "free" && <span className="font-normal text-ink-2"> · your plan</span>}
            </h3>
            <FeatureList items={FREE_FEATURES} />
          </section>
          <section className="space-y-2" data-testid="plan-pro">
            <h3 className="text-sm font-semibold">
              Pro{me.plan === "pro" && <span className="font-normal text-ink-2"> · your plan</span>}
            </h3>
            <p className="text-sm text-ink-2">Everything in Free, plus:</p>
            <FeatureList items={PRO_FEATURES} />
          </section>
        </div>
        {me.plan === "free" ? (
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
      </Card>
      {error && <p className="text-sm text-warn">{error}</p>}

      <Button variant="ghost" onClick={leave}>
        Sign out
      </Button>

      <Card className="space-y-3 border-red-800/50">
        <h2 className="font-semibold">Delete account</h2>
        <p className="text-sm text-ink-2">
          This deletes your display name, crates, favorites, saved filters, notes, comments,
          history, votes and link suggestions right away, and your sign-in within 7 days at most.
          Cancel any App Store or Google Play subscription in the store as well.
        </p>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.deleteAccount();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Couldn't delete the account.");
              setBusy(false);
              return;
            }
            await leave();
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
