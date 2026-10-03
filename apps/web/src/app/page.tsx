import { Suspense } from "react";
import { DigScreen } from "@/components/DigScreen";

export default function DigPage() {
  return (
    <Suspense>
      <DigScreen />
    </Suspense>
  );
}
