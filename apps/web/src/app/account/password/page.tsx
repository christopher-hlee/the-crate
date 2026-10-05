import type { Metadata } from "next";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: "Set a new password", robots: { index: false } };

export default function PasswordPage() {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <PasswordForm />
    </div>
  );
}
