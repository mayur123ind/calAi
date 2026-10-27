import { Suspense } from "react";
import { AddMeal } from "./AddMeal";

export default function AddPage() {
  return (
    <Suspense>
      <AddMeal />
    </Suspense>
  );
}
