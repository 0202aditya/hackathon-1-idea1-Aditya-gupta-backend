// Backend/app/api/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CARDS_CATALOG } from "@/lib/cards-catalog";
import { getOptionalUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  // Try fetching from Supabase cards table first
  try {
    const { supabase } = await getOptionalUser(req);
    let query = supabase.from("cards").select("*");
    if (q) {
      query = query.or(`name.ilike.%${q}%,issuer.ilike.%${q}%`);
    }
    const { data: dbCards, error } = await query;
    if (!error && dbCards && dbCards.length > 0) {
      return NextResponse.json(
        dbCards.map((c) => ({
          id: c.id,
          name: c.name,
          issuer: c.issuer,
          network: c.network,
          annualFeeMinor: c.annual_fee_minor,
          ratesVerifiedAt: c.rates_verified_at,
          flightsReturnPct: c.flights_return_pct,
        }))
      );
    }
  } catch {
    // Fall back to built-in catalog
  }

  // Fallback to built-in catalog
  let filtered = CARDS_CATALOG;
  if (q) {
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q)
    );
  }

  return NextResponse.json(filtered);
}

