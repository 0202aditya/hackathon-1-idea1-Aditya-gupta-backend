// Backend/lib/cards-catalog.ts
import { Card } from "@/lib/api-types";

export const CARDS_CATALOG: Card[] = [
  { id: "infinia", name: "HDFC Infinia", issuer: "HDFC Bank", flightsReturnPct: 16.6 },
  { id: "regalia", name: "HDFC Regalia Gold", issuer: "HDFC Bank", flightsReturnPct: 6.6 },
  { id: "millennia", name: "HDFC Millennia", issuer: "HDFC Bank", flightsReturnPct: 5.0 },
  { id: "magnus", name: "Axis Magnus", issuer: "Axis Bank", flightsReturnPct: 6.0 },
  { id: "atlas", name: "Axis Atlas", issuer: "Axis Bank", flightsReturnPct: 10.0 },
  { id: "ace", name: "Axis Ace", issuer: "Axis Bank", flightsReturnPct: 1.5 },
  { id: "elite", name: "SBI Elite", issuer: "SBI Card", flightsReturnPct: 2.5 },
  { id: "cashback", name: "SBI Cashback", issuer: "SBI Card", flightsReturnPct: 5.0 },
  { id: "emeralde", name: "ICICI Emeralde", issuer: "ICICI Bank", flightsReturnPct: 2.5 },
  { id: "amex", name: "Amex Platinum Travel", issuer: "American Express", flightsReturnPct: 8.5 },
  { id: "amazon", name: "Amazon Pay ICICI", issuer: "ICICI Bank", flightsReturnPct: 5.0 },
  { id: "kotak", name: "Kotak White", issuer: "Kotak", flightsReturnPct: 2.5 },
];

export async function ensureCardsInDatabase(supabase: any) {
  try {
    const { error } = await supabase.from("cards").upsert(
      CARDS_CATALOG.map((c) => ({
        id: c.id,
        name: c.name,
        issuer: c.issuer,
        source: "cardadvisor.in",
      })),
      { onConflict: "id" }
    );
    if (error) {
      console.error("ensureCardsInDatabase error:", error);
    }
  } catch (err) {
    console.error("ensureCardsInDatabase caught:", err);
  }
}
