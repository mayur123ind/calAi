import { connection } from "next/server";
import { Suspense } from "react";
import { ReportView } from "./ReportView";

export const metadata = { title: "Report · CalAi" };

// Works from today's date, so it renders per request rather than in the prerendered shell.
async function View() {
  await connection();
  return <ReportView />;
}

export default function ReportPage() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
