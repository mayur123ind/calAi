import type { NextRequest } from "next/server";
import { currentUser, unauthorized } from "@/lib/auth";
import type { MicroKey } from "@/lib/nutrients";

type Nutriments = Record<string, number | string | undefined>;
type OffProduct = {
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  nutriments?: Nutriments;
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v)) || 0;

// Open Food Facts stores every nutrient per 100 g in grams; scale to each micro's unit.
const OFF_MICROS: [MicroKey, string, number][] = [
  ["sat_fat_g", "saturated-fat_100g", 1],
  ["trans_fat_g", "trans-fat_100g", 1],
  ["mono_fat_g", "monounsaturated-fat_100g", 1],
  ["poly_fat_g", "polyunsaturated-fat_100g", 1],
  ["omega3_g", "omega-3-fat_100g", 1],
  ["cholesterol_mg", "cholesterol_100g", 1000],
  ["potassium_mg", "potassium_100g", 1000],
  ["calcium_mg", "calcium_100g", 1000],
  ["iron_mg", "iron_100g", 1000],
  ["magnesium_mg", "magnesium_100g", 1000],
  ["zinc_mg", "zinc_100g", 1000],
  ["vitamin_a_mcg", "vitamin-a_100g", 1_000_000],
  ["vitamin_c_mg", "vitamin-c_100g", 1000],
  ["vitamin_d_mcg", "vitamin-d_100g", 1_000_000],
  ["vitamin_e_mg", "vitamin-e_100g", 1000],
  ["vitamin_k_mcg", "vitamin-k_100g", 1_000_000],
  ["vitamin_b6_mg", "vitamin-b6_100g", 1000],
  ["vitamin_b12_mcg", "vitamin-b12_100g", 1_000_000],
  ["folate_mcg", "folates_100g", 1_000_000],
];

/** Looks a packaged food up in Open Food Facts and returns its nutrition per 100 g. */
export async function GET(request: NextRequest) {
  if (!(await currentUser())) return unauthorized();
  const code = request.nextUrl.searchParams.get("code") ?? "";
  if (!/^\d{6,14}$/.test(code)) return Response.json({ error: "That doesn't look like a barcode." }, { status: 400 });

  let product: OffProduct | undefined;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,serving_quantity,nutriments`,
      { headers: { "User-Agent": "CalAi/0.1 (personal calorie tracker)" }, signal: AbortSignal.timeout(8000) },
    );
    if (res.status === 404) product = undefined;
    else if (!res.ok) throw new Error(String(res.status));
    else product = ((await res.json()) as { status: number; product?: OffProduct }).product;
  } catch {
    return Response.json({ error: "Couldn't reach the food database. Check your internet and try again." }, { status: 502 });
  }

  const nm = product?.nutriments;
  const kcal = n(nm?.["energy-kcal_100g"]) || n(nm?.["energy-kj_100g"]) / 4.184;
  if (!product || !nm || !kcal) {
    return Response.json(
      { error: "This product isn't in the food database yet. Enter it by hand from the label." },
      { status: 404 },
    );
  }

  return Response.json({
    name: [product.product_name, product.brands?.split(",")[0]].filter(Boolean).join(" · ") || `Product ${code}`,
    servingGrams: n(product.serving_quantity) || null,
    per100g: {
      calories: kcal,
      protein_g: n(nm.proteins_100g),
      carbs_g: n(nm.carbohydrates_100g),
      fat_g: n(nm.fat_100g),
      fiber_g: n(nm.fiber_100g),
      sugar_g: n(nm.sugars_100g),
      sodium_mg: n(nm.sodium_100g) * 1000,
    },
    // Only what the label actually lists; a missing value stays unknown rather than zero.
    micros100g: Object.fromEntries(
      OFF_MICROS.filter(([, field]) => nm[field] !== undefined && nm[field] !== "").map(([key, field, scale]) => [key, n(nm[field]) * scale]),
    ),
  });
}
