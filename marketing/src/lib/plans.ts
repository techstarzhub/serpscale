// Fetches the public pricing plans from the SerpScale API (super-admin authored).
// Runs server-side; the pricing page renders these with a live keyword dropdown.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface PricingTier {
  keywords: number;
  priceCents: number;
}

export interface Plan {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  currency: string;
  interval: string;
  limits: Record<string, number> | null;
  features: string[] | Record<string, unknown> | null;
  featureLabels?: string[] | null;
  pricingTiers: PricingTier[] | null;
  trialDays?: number | null;
  sortOrder: number;
}

export async function getPlans(): Promise<Plan[]> {
  try {
    const res = await fetch(`${API}/public/plans`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    return (await res.json()) as Plan[];
  } catch {
    return [];
  }
}
