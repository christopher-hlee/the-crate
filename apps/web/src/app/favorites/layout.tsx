import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Favorites" };

export default function FavoritesLayout({ children }: { children: ReactNode }) {
  return children;
}
