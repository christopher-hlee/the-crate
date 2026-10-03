import Link from "next/link";

export function SignInPrompt({ what }: { what: string }) {
  return (
    <p className="text-ink-2">
      <Link href="/login" className="text-accent underline">
        Sign in
      </Link>{" "}
      to {what}.
    </p>
  );
}
