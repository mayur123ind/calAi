import { connection } from "next/server";
import { Suspense } from "react";
import { PlanView } from "./PlanView";

export const metadata = { title: "Meal prep · CalAi" };

// Works from today's date, so it renders per request rather than in the prerendered shell.
async function View() {
  await connection();
  return <PlanView />;
}

export default function PlanPage() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
