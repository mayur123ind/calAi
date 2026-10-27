import { Suspense } from "react";
import { TodayView } from "./TodayView";

export default function TodayPage() {
  return (
    <Suspense>
      <TodayView />
    </Suspense>
  );
}
