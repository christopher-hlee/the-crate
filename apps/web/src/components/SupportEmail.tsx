import { supportContact } from "@app/core";

/** The published contact point (NEXT_PUBLIC_SUPPORT_EMAIL), or a placeholder marked as one. */
export const SUPPORT = supportContact(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);

export function SupportEmail({
  className = "text-accent underline",
  short = false,
}: {
  className?: string;
  short?: boolean;
}) {
  return (
    <>
      <a className={className} href={`mailto:${SUPPORT.email}`}>
        {SUPPORT.email}
      </a>
      {SUPPORT.placeholder &&
        (short ? " (placeholder)" : " (a placeholder: the contact address isn't set yet)")}
    </>
  );
}
