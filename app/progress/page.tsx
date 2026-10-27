import { Suspense } from "react";
import { ProgressView } from "./ProgressView";

export default function ProgressPage() {
  return (
    <Suspense>
      <ProgressView />
    </Suspense>
  );
}
