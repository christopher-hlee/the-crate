import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "For you" };

export default function ForYouLayout({ children }: { children: ReactNode }) {
  return children;
}
