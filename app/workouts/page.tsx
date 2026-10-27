import { connection } from "next/server";
import { Suspense } from "react";
import { WorkoutsView } from "./WorkoutsView";

// The diary opens on today's date, so it renders per request rather than in the prerendered shell.
async function Diary() {
  await connection();
  return <WorkoutsView />;
}

export default function WorkoutsPage() {
  return (
    <Suspense>
      <Diary />
    </Suspense>
  );
}
