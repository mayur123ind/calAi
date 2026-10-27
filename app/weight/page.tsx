import { redirect } from "next/navigation";

// Weight lives on Progress now; keep old links and bookmarks working.
export default function WeightPage() {
  redirect("/progress");
}
