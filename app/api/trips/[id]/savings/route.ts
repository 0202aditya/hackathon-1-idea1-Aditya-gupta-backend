// Backend/app/api/trips/[id]/savings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, ApiError } from "@/lib/errors";
import { getOptionalUser } from "@/lib/auth";
import { memoryTrips } from "../../route";
import { getSessionWallet } from "../../../wallet/route";
import { calculateCardSavings } from "@/lib/engine/savings";
import { FlightOffer, UserCard } from "@/lib/api-types";
import { CARDS_CATALOG } from "@/lib/cards-catalog";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      throw new ApiError("VALIDATION", "Trip id is required.", 400);
    }

    const body = await req.json().catch(() => ({}));
    const offerId = body.offerId;

    // 1. Fetch trip and offers from memory or database
    let trip = memoryTrips.get(id)?.trip;
    let offers = memoryTrips.get(id)?.offers;

    const { user, supabase } = await getOptionalUser(req);

    if (!trip && user) {
      const { data: tripRow } = await supabase.from("trips").select("input").eq("id", id).single();
      const { data: resultRow } = await supabase.from("trip_results").select("offers").eq("trip_id", id).single();
      trip = tripRow?.input;
      offers = resultRow?.offers;
    }

    if (!offers || offers.length === 0) {
      throw new ApiError("NOT_FOUND", "Flight offers for this trip were not found.", 404);
    }

    const chosenOffer = offerId ? offers.find((o) => o.offerId === offerId) || offers[0] : offers[0];

    // 2. Fetch user's wallet cards
    let userCards: UserCard[] = [];
    if (user) {
      const { data: dbCards } = await supabase
        .from("user_cards")
        .select("card_id, points_balance, monthly_spend_minor, cards(*)")
        .eq("user_id", user.id);

      if (dbCards && dbCards.length > 0) {
        userCards = dbCards.map((row: any) => {
          const cardMeta =
            row.cards ||
            CARDS_CATALOG.find((c) => c.id === row.card_id) || {
              id: row.card_id,
              name: row.card_id,
              issuer: "Unknown",
            };
          return {
            cardId: row.card_id,
            card: cardMeta,
            pointsBalance: Number(row.points_balance) || 0,
            monthlySpendMinor: row.monthly_spend_minor || {},
          };
        });
      }
    }

    // Fallback to session wallet if DB was empty
    if (userCards.length === 0) {
      const guestKey = user?.id || req.headers.get("x-forwarded-for") || "guest";
      userCards = Array.from(getSessionWallet(guestKey).values());
    }

    // 3. Run the pure math savings engine
    const savings = calculateCardSavings(chosenOffer, userCards, trip);

    // 4. Save to trip_results if authenticated
    if (user) {
      await supabase
        .from("trip_results")
        .update({ savings })
        .eq("trip_id", id);
    }

    const mem = memoryTrips.get(id);
    if (mem) {
      mem.savings = savings;
    }

    return NextResponse.json(savings);
  } catch (error) {
    return errorResponse(error);
  }
}

