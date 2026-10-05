import { APP_NAME } from "@app/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Sign in to {APP_NAME}</h1>
      <p className="text-sm text-ink-2">
        Signing in keeps your favorites, notes and history across devices. Listening never needs an
        account.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
